/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";
import * as path from "path";
import * as child_process from "child_process";
import * as fs from "fs";
import * as os from "os";
import { promisify } from "util";

import MCUtil from "../../MCUtil";
import Log from "../../Logger";
import { IInitializationResponse } from "./UserProjectCreator";
import { CLILifecycleWrapper } from "./local/CLILifecycleWrapper";
import Commands from "../../constants/Commands";
import { CLICommand, CLICommands } from "./CLICommands";
import { CLILifecycleCommands, CLILifecycleCommand } from "./local/CLILifecycleCommands";

const BIN_DIR = "bin";
const INSTALLER_EXECUTABLE = "cwctl";
const INSTALLER_EXECUTABLE_WIN = "cwctl.exe";
const INSTALLER_PREREQS: { [s: string]: string[]; } = {
    [INSTALLER_EXECUTABLE]: ["appsody"],
    [INSTALLER_EXECUTABLE_WIN]: ["appsody.exe"]
};

namespace CLIWrapper {
    // check error against this to see if it's a real error or just a user cancellation
    export const INSTALLCMD_CANCELLED = "Cancelled";

    /**
     * Returns the location of the executable as within the extension. It cannot be run from this location - see prepare()
     */
    function getInternalExecutable(): string {
        const platform = MCUtil.getOS();
        const executable = platform === "windows" ? INSTALLER_EXECUTABLE_WIN : INSTALLER_EXECUTABLE;
        return path.join(global.__extRoot, BIN_DIR, platform, executable);
    }

    // abs path to copied-out executable. Set and returned by initialize()
    let _executablePath: string;

    /**
     * Copies the installer to somewhere writeable, and sets executableDir and exectablePath.
     * If these are already set, do nothing.
     */
    export async function initialize(): Promise<string> {
        if (_executablePath) {
            return _executablePath;
        }
        const executableDir = os.tmpdir();
        const executable = getInternalExecutable();
        const executableDirname = path.dirname(executable);
        const executableBasename = path.basename(executable);
        _executablePath = path.join(executableDir, executableBasename);
        Log.d(`Copying ${executable} to ${_executablePath}`);
        await promisify(fs.copyFile)(executable, path.join(executableDir, executableBasename));
        Log.d("Copying installer prerequisites");
        for (const prereq of INSTALLER_PREREQS[executableBasename]) {
            const source = path.join(executableDirname, prereq);
            const target = path.join(executableDir, prereq);
            Log.d(`Copying ${source} to ${target}`);
            await promisify(fs.copyFile)(source, target);
        }
        Log.i("Installer copy-out succeeded, to " + _executablePath);
        return _executablePath;
    }

    // serves as a lock, only one operation at a time.
    let currentOperation: CLICommand | undefined;

    export function isInstallerRunning(): boolean {
        return currentOperation !== undefined;
    }

    const ALREADY_RUNNING_WARNING = "Please wait for the current operation to finish.";

    /**
     * @param tagOverride - If the command should be run against a tag other than the one determined by getTag
     */
    export async function installerExec(cmd: CLICommand, args: string[], progressPrefix?: string): Promise<void | IInitializationResponse> {
        const executablePath = await initialize();
        if (isInstallerRunning()) {
            vscode.window.showWarningMessage(ALREADY_RUNNING_WARNING);
            throw new Error(CLIWrapper.INSTALLCMD_CANCELLED);
        }
        // const timeout = isInstallCmd ? undefined : 60000;

        args.unshift(cmd.command);

        Log.i(`Running installer command: ${args.join(" ")}`);

        const executableDir = path.dirname(executablePath);

        return vscode.window.withProgress({
            cancellable: cmd.cancellable,
            location: vscode.ProgressLocation.Notification,
            title: progressPrefix,
        }, (progress, token) => {
            return new Promise<any>((resolve, reject) => {
                currentOperation = cmd;

                const child = child_process.spawn(executablePath, args, {
                    cwd: executableDir
                });

                // only lifecycle commands show progress, for now
                if (cmd instanceof CLILifecycleCommand) {
                    CLILifecycleWrapper.updateProgress(cmd, child.stdout, progress);
                }

                child.on("error", (err) => {
                    return reject(err);
                });

                let outStr = "";
                let errStr = "";
                child.stdout.on("data", (chunk) => { outStr += chunk.toString(); });
                child.stderr.on("data", (chunk) => { errStr += chunk.toString(); });

                token.onCancellationRequested((_e) => {
                    child.kill();
                    return reject(INSTALLCMD_CANCELLED);
                });

                child.on("close", (code: number | null) => {
                    if (code == null) {
                        // this happens in SIGTERM case, not sure what else may cause it
                        Log.d(`Installer command ${cmd.command} did not exit normally, likely was cancelled`);
                    }
                    else if (code !== 0) {
                        Log.e(`Error running installer command ${cmd.command}`, errStr);
                        outStr = outStr || "No output";
                        errStr = errStr || `Unknown error running command ${cmd.command}`;
                        writeOutError(cmd, outStr, errStr);
                        Log.e("Stdout:", outStr);
                        Log.e("Stderr:", errStr);
                        reject(errStr);
                    }
                    else {
                        Log.i(`Successfully ran installer command ${cmd.command}`);
                        if (cmd.hasJSONOutput) {
                            Log.d("Installer object output:", outStr);
                            const obj = JSON.parse(outStr);
                            return resolve(obj);
                        }
                        return resolve(outStr);
                    }
                });
            })
            .finally(() => currentOperation = undefined);
        });
    }

    export function isCancellation(err: any): boolean {
        return MCUtil.errToString(err) === INSTALLCMD_CANCELLED;
    }

    async function writeOutError(cmd: CLICommand, outStr: string, errStr: string): Promise<void> {
        const logDir = path.join(Log.getLogDir, `installer-error-${cmd.command}-${Date.now()}`);
        await promisify(fs.mkdir)(logDir, { recursive: true });

        const stdoutLog = path.join(logDir, "installer-output.log");
        const stderrLog = path.join(logDir, "installer-error-output.log");
        await promisify(fs.writeFile)(stdoutLog, outStr);
        await promisify(fs.writeFile)(stderrLog, errStr);
        if (cmd === CLILifecycleCommands.INSTALL) {
            // show user the output in this case because they can't recover
            // I do not like having this, but I don't see an easier way to present the user with the reason for failure
            // until the installer 'expects' more errors.
            vscode.commands.executeCommand(Commands.VSC_OPEN, vscode.Uri.file(stdoutLog));
            vscode.commands.executeCommand(Commands.VSC_OPEN, vscode.Uri.file(stderrLog));
        }
        Log.e("Wrote failed command output to " + logDir);
    }

    export async function createProject(projectPath: string, url: string): Promise<IInitializationResponse> {
        return installerExec(CLICommands.PROJECT, [ projectPath, "--url", url ]) as Promise<IInitializationResponse>;
    }

    export async function validateProjectDirectory(projectPath: string): Promise<IInitializationResponse> {
        return installerExec(CLICommands.PROJECT, [ projectPath ]) as Promise<IInitializationResponse>;
    }
}

export default CLIWrapper;
