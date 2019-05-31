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
import * as readline from "readline";

import * as MCUtil from "../../MCUtil";
import Log from "../../Logger";
import Commands from "../../constants/Commands";
import { Readable } from "stream";

const BIN_DIR = "bin";
const INSTALLER_DIR = "installer";
const INSTALLER_EXECUTABLE = "codewind-installer";
const INSTALLER_EXECUTABLE_WIN = "codewind-installer.exe";

export enum InstallerCommands {
    INSTALL = "install",
    START = "start",
    STOP = "stop",
    STOP_ALL = "stop-all"
    // "status" is treated differently, see getInstallerState()
}

// const INSTALLER_COMMANDS: { [key in InstallerCommands]: { action: string, userActionName: string } } = {
const INSTALLER_COMMANDS: { [key: string]: { action: string, userActionName?: string } } = {
    install:    { action: "install",    userActionName: "Installing Codewind" },
    start:      { action: "start",      userActionName: "Starting Codewind" },
    stop:       { action: "stop",       /*userActionName: "Deactivating Codewind"*/ },
    "stop-all": { action: "stop-all",   /*userActionName: "Deactivating Codewind"*/ },
    // status:     { action: "status",     userActionName: "Checking if Codewind is running" },
};

// check error against this to see if it's a real error or just a user cancellation
const INSTALLCMD_CANCELLED = "Cancelled";

namespace InstallerWrapper {
    enum InstallerStates {
        NOT_INSTALLED,
        STOPPED,
        STARTED,
    }

    /**
     * `installer status` command.
     * This is a separate function because it exits quickly so the progress is not useful, and we expect non-zero exit codes
     */
    async function getInstallerStatus(): Promise<InstallerStates> {
        const executablePath = await initialize();

        return new Promise<InstallerStates>((resolve, reject) => {
            const child = child_process.execFile(executablePath, [ "status" ], {
                timeout: 10000,
            }, async (_err, stdout, stderr) => {
                // err (non-zero exit) is expected
                if (stderr) {
                    Log.e("Stderr checking status:", stderr.toString());
                    Log.e("Stdout checking status:", stdout.toString());
                }
            });

            // from https://github.ibm.com/dev-ex/portal/issues/945
            // 0 - not installed, 1 - installed but stopped, 2 - installed and running
            child.on("exit", (code, _signal) => {
                if (code === 0) {
                    return resolve(InstallerStates.NOT_INSTALLED);
                }
                else if (code === 1) {
                    return resolve(InstallerStates.STOPPED);
                }
                else if (code === 2) {
                    return resolve(InstallerStates.STARTED);
                }
                return reject(`Unexpected exit code ${code} from status check`);
            });

            child.on("error", (err) => {
                return reject(err);
            });
        });
    }

    export async function isInstallRequired(): Promise<boolean> {
        return (await getInstallerStatus()) === InstallerStates.NOT_INSTALLED;
    }

    /**
     * Returns the location of the executable as within the extension. It cannot be run from this location - see prepare()
     */
    function getInternalExecutable(): string {
        const platform = MCUtil.getOS();
        const executable = platform === "windows" ? INSTALLER_EXECUTABLE_WIN : INSTALLER_EXECUTABLE;
        return path.join(global.__extRoot, BIN_DIR, INSTALLER_DIR, platform, executable);
    }

    // abs path to copied-out executable. Set and returned by initialize()
    let _executablePath: string;

    /**
     * Copies the installer to somewhere writeable, and sets executableDir and exectablePath.
     * If these are already set, do nothing.
     */
    async function initialize(): Promise<string> {
        if (_executablePath) {
            return _executablePath;
        }
        const executableDir = os.tmpdir();
        const executable = getInternalExecutable();
        const executableBasename = path.basename(executable);
        _executablePath = path.join(executableDir, executableBasename);
        Log.d(`Copying ${executable} to ${_executablePath}`);
        fs.copyFileSync(executable, path.join(executableDir, executableBasename));
        Log.i("Installer copy succeeded");
        return _executablePath;
    }

    function getUserActionName(cmd: InstallerCommands): string | undefined {
        return INSTALLER_COMMANDS[cmd].userActionName;
    }

    // serves as a lock, only one operation at a time.
    let currentOperation: InstallerCommands | undefined;

    export async function installerExec(cmd: InstallerCommands): Promise<void> {
        const executablePath = await initialize();
        if (currentOperation != null) {
            vscode.window.showWarningMessage(`Already ${getUserActionName(cmd)}`);
            return;
        }

        Log.i(`Running installer command: ${cmd}`);

        const userMsg = getUserActionName(cmd);
        currentOperation = cmd;

        const executableDir = path.dirname(executablePath);
        const isInstallCmd = cmd === InstallerCommands.INSTALL;
        if (isInstallCmd) {
            if (process.env.AF_USER) {
                process.env.USER = process.env.AF_USER;
            }
            if (process.env.AF_PASS) {
                process.env.PASS = process.env.AF_PASS;
            }
            if (!process.env.USER || !process.env.PASS) {
                // Remove this in prod, obviously
                throw new Error("No Artifactory credentials; install will fail");
            }
        }
        // const timeout = isInstallCmd ? undefined : 60000;

        await vscode.window.withProgress({
            cancellable: true,
            location: vscode.ProgressLocation.Notification,
            title: userMsg,
        }, (progress, token) => {
            return new Promise<void>((resolve, reject) => {
                const child = child_process.spawn(executablePath, [ cmd ], {
                    cwd: executableDir
                });

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

                updateProgress(isInstallCmd, child.stdout, progress);

                child.on("close", (code: number | null) => {
                    if (code == null) {
                        // this happens in SIGTERM case, not sure what else may cause it
                        Log.d(`Installer command ${cmd} did not exit normally`);
                    }
                    else if (code !== 0) {
                        Log.e("Error running with installer", errStr);
                        if (isInstallCmd) {
                            const stdoutLog = path.join(executableDir, "install-error-stdout.log");
                            fs.writeFileSync(stdoutLog, outStr);
                            const stderrLog = path.join(executableDir, "install-error-stderr.log");
                            Log.e("Stderr", errStr || "<no stderr>");
                            fs.writeFileSync(stderrLog, errStr);
                            Log.e("Error installing, wrote output to " + executableDir);
                            vscode.commands.executeCommand(Commands.VSC_OPEN, vscode.Uri.file(stdoutLog));
                            vscode.commands.executeCommand(Commands.VSC_OPEN, vscode.Uri.file(stderrLog));
                            reject(`Installing Codewind failed. ` +
                                `The installer logs have been opened; please examine them for the potential cause.`);
                        }
                        else {
                            Log.e("Stdout:", outStr || "<no output>");
                            Log.e("Stderr:", errStr || "<no error output>");
                            reject(errStr);
                        }
                    }
                    else {
                        Log.i(`Successfully ran installer command: ${cmd}`);
                        resolve();
                    }
                });
            })
            .finally(() => currentOperation = undefined);
        });
    }

    export function isCancellation(err: any): boolean {
        return err.toString() === INSTALLCMD_CANCELLED;
    }

    function updateProgress(isInstall: boolean, stdout: Readable, progress: vscode.Progress<{ message?: string, increment?: number }>): void {
        const reader = readline.createInterface(stdout);
        reader.on("line", (line) => {
            if (!line) {
                return;
            }
            if (!isInstall) {
                // simple case for non-install, just update with the output
                progress.report({ message: line });
                return;
            }
            if (line === "Image Tagging Successful") {
                return;
            }

            // install output is JSON, see bin/installer/install.log for example
            let lineObj: { status: string; id: string; };
            try {
                lineObj = JSON.parse(line);
            }
            catch (err) {
                Log.e(`Error parsing JSON from installer output, line was "${line}"`);
                return;
            }

            // we're interested in lines like:
            // {"status":"Pulling from codewind-pfe-amd64","id":"latest"}
            const pullingFrom = "Pulling from";
            if (lineObj.status.startsWith(pullingFrom)) {
                // const imageName = lineObj.status.substring(pullingFrom.length);
                const imageTag = lineObj.id;
                const message = lineObj.status + ":" + imageTag;
                progress.report({ message });
            }
        });
    }
}

export default InstallerWrapper;
