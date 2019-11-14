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
import { CLILifecycleWrapper } from "./local/CLILifecycleWrapper";
import { CLILifecycleCommand, CLILifecycleCommands } from "./local/CLILifecycleCommands";
import { CLICommand } from "./CLICommands";

const BIN_DIR = "bin";
const CLI_EXECUTABLE = "cwctl";
const CLI_EXECUTABLE_WIN = "cwctl.exe";
const CLI_PREREQS: { [s: string]: string[]; } = {
    [CLI_EXECUTABLE]: ["appsody"],
    [CLI_EXECUTABLE_WIN]: ["appsody.exe"]
};

const cliOutputChannel = vscode.window.createOutputChannel("Codewind");

namespace CLIWrapper {

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
        // cliOutputChannel.appendLine(`cwctl is available at ${_executablePath}`);
        return _executablePath;
    }

    export async function getExecutablePath(): Promise<string> {
        if (_executablePath) {
            return _executablePath;
        }
        return initialize();
    }

    export async function cliExec(cmd: CLICommand, args: string[] = [], progressPrefix?: string): Promise<any> {
        const executablePath = await initialize();

        args = cmd.command.concat(args);
        if (!(cmd instanceof CLILifecycleCommand)) {
            args.unshift("--insecure");
        }
        args.unshift("--json");

        // cmdStr will be the full command, eg `cwctl --insecure project create <path> --url <url>`
        // is generally only used for debugging
        const cmdStr = [ path.basename(executablePath), ...args ].join(" ");
        Log.i(`Running CLI command: ${cmdStr}`);

        // CLI output and err are echoed to a user-visible outputchannel. We hide install output because it's thousands of lines of a progress bar.
        const echoOutput = cmd !== CLILifecycleCommands.INSTALL;
        if (!echoOutput) {
            cliOutputChannel.appendLine(`<Output hidden>`);
        }
        cliOutputChannel.appendLine(`==> Run ${cmdStr}`);

        const executableDir = path.dirname(executablePath);

        // See this commit for a rather sad restructuring to work around https://github.com/eclipse-theia/theia/issues/6506
        const cwctlProcess = child_process.spawn(executablePath, args, {
            cwd: executableDir
        });

        const cwctlExecPromise = new Promise<any>((resolve, reject) => {
            cwctlProcess.on("error", (err) => {
                return reject(err);
            });

            let outStr = "";
            let errStr = "";
            cwctlProcess.stdout.on("data", (chunk) => {
                const str = chunk.toString();
                if (echoOutput) {
                    cliOutputChannel.append(str);
                }
                outStr += str;
            });
            cwctlProcess.stderr.on("data", (chunk) => {
                const str = chunk.toString();
                cliOutputChannel.append(str);
                errStr += str;
            });

            cwctlProcess.on("close", (code: number | null) => {
                if (code == null) {
                    Log.d(`CLI command ${cmdStr} did not exit normally, assuming cancellation`);
                    cliOutputChannel.appendLine(`==> Cancelled ${cmdStr}`);
                    return reject(CLI_CMD_CANCELLED);
                }
                else if (code !== 0) {
                    Log.e(`Error running "${cmdStr}"`);
                    Log.e("Stdout:", outStr);
                    Log.e("Stderr:", errStr);

                    let errMsg = `Error running ${path.basename(_executablePath)} "${cmd.command.join(" ")}"`;
                    if (cmd.hasJSONOutput && isProbablyJSON(outStr)) {
                        const asObj = JSON.parse(outStr);
                        if (asObj.error_description) {
                            errMsg += `: ${asObj.error_description}`;
                        }
                    }
                    if (errStr) {
                        errMsg += `: ${errStr}`;
                    }
                    return reject(errMsg);
                }
                else {
                    let successMsg = `Successfully ran CLI command ${cmdStr}`;
                    if (echoOutput) {
                        successMsg += `, Output was:\n` + outStr.trimRight();
                    }
                    Log.d(successMsg);

                    if (!cmd.hasJSONOutput) {
                        return resolve(outStr);
                    }

                    if (!outStr || !isProbablyJSON(outStr)) {
                        Log.e(`Missing expected JSON output from CLI command, output was "${outStr}"`);
                        return resolve({});
                    }
                    // Log.d("CLI object output:", outStr);

                    const obj = JSON.parse(outStr);
                    if (obj.error_description) {
                        return reject(obj.error_description);
                    }
                    return resolve(obj);
                }
            });
        }).finally(() => {
            cliOutputChannel.appendLine(`==> End ${cmdStr}`);
        });

        const hasProgress = cmd instanceof CLILifecycleCommand || progressPrefix;
        if (hasProgress) {
            return vscode.window.withProgress({
                cancellable: cmd.cancellable,
                location: vscode.ProgressLocation.Notification,
                title: progressPrefix,
            }, (progress, token) => {
                // only lifecycle commands show updating progress, for now
                if (cmd instanceof CLILifecycleCommand) {
                    CLILifecycleWrapper.updateProgress(cmd, cwctlProcess.stdout, progress);
                }

                token.onCancellationRequested((_e) => {
                    cwctlProcess.kill();
                });

                return cwctlExecPromise;
            });
        }
        else {
            return cwctlExecPromise;
        }
    }

    function isProbablyJSON(str: string): boolean {
        return str.startsWith("{") || str.startsWith("[");
    }

    export function isCancellation(err: any): boolean {
        return MCUtil.errToString(err) === CLI_CMD_CANCELLED;
    }

    export function showCLIError(errMsg: string): void {
        const viewErrBtn = "View Output";
        vscode.window.showErrorMessage(errMsg, viewErrBtn)
        .then((res) => {
            if (res === viewErrBtn) {
                cliOutputChannel.show();
            }
        });
    }
}

export default CLIWrapper;
