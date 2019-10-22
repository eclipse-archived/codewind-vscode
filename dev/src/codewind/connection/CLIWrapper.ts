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
import Project from "../project/Project";

const BIN_DIR = "bin";
const CLI_EXECUTABLE = "cwctl";
const CLI_EXECUTABLE_WIN = "cwctl.exe";
const CLI_PREREQS: { [s: string]: string[]; } = {
    [CLI_EXECUTABLE]: ["appsody"],
    [CLI_EXECUTABLE_WIN]: ["appsody.exe"]
};

namespace CLIWrapper {

    export async function createProject(projectPath: string, projectName: string, url: string): Promise<IInitializationResponse> {
        return cliExec(CLICommands.CREATE, [ projectPath, "--url", url ], `Creating ${projectName}...`) as Promise<IInitializationResponse>;
    }

    export async function detectProjectType(projectPath: string, desiredType?: string): Promise<IInitializationResponse> {
        const args = [ projectPath ];
        if (desiredType) {
            args.push("--type", desiredType);
        }
        return cliExec(CLICommands.CREATE, args, `Processing ${projectPath}...`) as Promise<IInitializationResponse>;
    }

    export async function sync(project: Project): Promise<void> {
        await cliExec(CLICommands.SYNC, [
            "--path", project.localPath.fsPath,
            "--id", project.id,
            "--time", project.lastSync.toString()
        ]);
    }

    /*
    export async function bind(projectName: string, projectPath: string, detectedType: IDetectedProjectType): Promise<string> {
        const bindRes = await cliExec(CLICommands.BIND, [
            "--name", projectName,
            "--language", detectedType.language,
            "--type", detectedType.projectType,
            "--path", projectPath,
        ]);

        return bindRes.projectID;
    }
    */


    // check error against this to see if it's a real error or just a user cancellation
    export const CLI_CMD_CANCELLED = "Cancelled";

    /**
     * Returns the location of the executable as within the extension. It cannot be run from this location - see initialize()
     */
    function getInternalExecutable(): string {
        const platform = MCUtil.getOS();
        const executable = platform === "windows" ? CLI_EXECUTABLE_WIN : CLI_EXECUTABLE;
        return path.join(global.__extRoot, BIN_DIR, platform, executable);
    }

    // abs path to copied-out executable. Set and returned by initialize()
    let _executablePath: string;

    /**
     * Copies the CLI to somewhere writeable if not already done, and sets exectablePath.
     * @returns The path to the CLI executable after moving it to a writeable directory.
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
        Log.d("Copying CLI prerequisites");
        for (const prereq of CLI_PREREQS[executableBasename]) {
            const source = path.join(executableDirname, prereq);
            const target = path.join(executableDir, prereq);
            Log.d(`Copying ${source} to ${target}`);
            await promisify(fs.copyFile)(source, target);
        }
        Log.i("CLI copy-out succeeded, to " + _executablePath);
        return _executablePath;
    }

    export async function getExecutablePath(): Promise<string> {
        if (_executablePath) {
            return _executablePath;
        }
        return initialize();
    }

    export async function cliExec(cmd: CLICommand, args: string[], progressPrefix?: string): Promise<any> {
        const executablePath = await initialize();

        args = cmd.command.concat(args);

        Log.i(`Running CLI command: ${args.join(" ")}`);

        const executableDir = path.dirname(executablePath);

        return vscode.window.withProgress({
            cancellable: cmd.cancellable,
            location: vscode.ProgressLocation.Notification,
            title: progressPrefix,
        }, (progress, token) => {
            return new Promise<any>((resolve, reject) => {
                const child = child_process.spawn(executablePath, args, {
                    cwd: executableDir
                });

                // only lifecycle commands show updating progress, for now
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
                    return reject(CLI_CMD_CANCELLED);
                });

                child.on("close", (code: number | null) => {
                    if (code == null) {
                        // this happens in SIGTERM case, not sure what else may cause it
                        Log.d(`CLI command ${cmd.command} did not exit normally, likely was cancelled`);
                    }
                    else if (code !== 0) {
                        Log.e(`Error running CLI command ${cmd.command}`, errStr);
                        outStr = outStr || "No output";
                        errStr = errStr || `Unknown error running command ${cmd.command}`;
                        writeOutError(cmd, outStr, errStr);
                        Log.e("Stdout:", outStr);
                        Log.e("Stderr:", errStr);
                        reject(errStr);
                    }
                    else {
                        Log.i(`Successfully ran CLI command ${cmd.command.join(" ")}`);
                        if (cmd.hasJSONOutput) {
                            if (!outStr) {
                                Log.e(`Missing expected output from CLI command, output was "${outStr}"`);
                                return resolve({});
                            }
                            Log.d("CLI object output:", outStr);
                            const obj = JSON.parse(outStr);
                            return resolve(obj);
                        }
                        return resolve(outStr);
                    }
                });
            });
        });
    }

    export function isCancellation(err: any): boolean {
        return MCUtil.errToString(err) === CLI_CMD_CANCELLED;
    }

    async function writeOutError(cmd: CLICommand, outStr: string, errStr: string): Promise<void> {
        const logDir = path.join(Log.getLogDir, `cli-error-${cmd.command}-${Date.now()}`);
        await promisify(fs.mkdir)(logDir, { recursive: true });

        const stdoutLog = path.join(logDir, "cli-output.log");
        const stderrLog = path.join(logDir, "cli-error-output.log");
        await promisify(fs.writeFile)(stdoutLog, outStr);
        await promisify(fs.writeFile)(stderrLog, errStr);
        if (cmd === CLILifecycleCommands.INSTALL) {
            // show user the output in this case because they can't recover
            // I do not like having this, but I don't see an easier way to present the user with the reason for failure
            // until the cli 'expects' more errors.
            vscode.commands.executeCommand(Commands.VSC_OPEN, vscode.Uri.file(stdoutLog));
            vscode.commands.executeCommand(Commands.VSC_OPEN, vscode.Uri.file(stderrLog));
        }
        Log.e("Wrote failed command output to " + logDir);
    }
}

export default CLIWrapper;
