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
import { CLILifecycleCommand } from "./local/CLILifecycleCommands";
import { CLICommand } from "./CLICommandRunner";
import Constants from "../../constants/Constants";

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
    let _cwctlPath: string;

    /**
     * Copies the CLI to somewhere writeable if not already done, and sets exectablePath.
     * @returns The path to the CLI executable after moving it to a writeable directory.
     */
    export async function initialize(): Promise<string> {
        if (_cwctlPath) {
            return _cwctlPath;
        }

        // The executable is copied out to eg ~/.codewind/0.7.0/cwctl

        const cwctlSourcePath = getInternalExecutable();
        const binarySourceDir = path.dirname(cwctlSourcePath);
        const cwctlBasename = path.basename(cwctlSourcePath);

        const binaryTargetDir = path.join(os.homedir(), Constants.DOT_CODEWIND_DIR, global.extVersion);
        await promisify(fs.mkdir)(binaryTargetDir, { recursive: true });

        const cwctlTargetPath = path.join(binaryTargetDir, cwctlBasename);
        await copyIfDestNotExist(cwctlSourcePath, cwctlTargetPath);
        _cwctlPath = cwctlTargetPath;

        Log.d("Copying CLI prerequisites");
        for (const prereq of CLI_PREREQS[cwctlBasename]) {
            const source = path.join(binarySourceDir, prereq);
            const target = path.join(binaryTargetDir, prereq);
            await copyIfDestNotExist(source, target);
        }
        Log.i("Binary copy-out succeeded to " + _cwctlPath);
        cliOutputChannel.appendLine(`cwctl is available at ${_cwctlPath}`);
        return _cwctlPath;
    }

    async function copyIfDestNotExist(sourcePath: string, destPath: string): Promise<void> {
        try {
            await promisify(fs.access)(destPath);
            Log.d(`${_cwctlPath} already exists`);
        }
        catch (err) {
            Log.d(`Copying ${sourcePath} to ${destPath}`);
            await promisify(fs.copyFile)(sourcePath, destPath);
        }
    }

    export async function getExecutablePath(): Promise<string> {
        if (_cwctlPath) {
            return _cwctlPath;
        }
        return initialize();
    }

    const PASSWORD_ARG = "--password";

    export async function cliExec(cmd: CLICommand, args: string[] = [], progressPrefix?: string): Promise<any> {
        const executablePath = await initialize();

        args = cmd.command.concat(args);
        if (!(cmd instanceof CLILifecycleCommand)) {
            args.unshift("--insecure");
        }
        args.unshift("--json");

        // cmdStr will be the full command, eg `cwctl --insecure project create <path> --url <url>`
        // is generally only used for debugging
        let cmdStr = [ path.basename(executablePath), ...args ].join(" ");
        if (cmdStr.includes(PASSWORD_ARG)) {
            const words = cmdStr.split(" ");
            const pwIndex = words.findIndex((word) => word === PASSWORD_ARG) + 1;
            words[pwIndex] = "*********";
            cmdStr = words.join(" ");
        }
        Log.i(`Running CLI command: ${cmdStr}`);

        // CLI output and err are echoed to a user-visible outputchannel.
        // We hide install output because it's thousands of lines of a progress bar, and sectoken because the token should not be exposed.
        cliOutputChannel.appendLine(`==> Run ${cmdStr}`);
        const echoOutput = !cmd.censorOutput;
        if (!echoOutput) {
            cliOutputChannel.appendLine(`<Output hidden>`);
        }

        const executableDir = path.dirname(executablePath);

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
                    // this happens in SIGTERM case, not sure what else may cause it
                    Log.d(`CLI command ${cmdStr} did not exit normally, likely was cancelled`);
                }
                else if (code !== 0) {
                    Log.e(`Error running ${cmdStr}`);
                    Log.e("Stdout:", outStr.trim());
                    if (errStr) {
                        Log.e("Stderr:", errStr.trim());
                    }

                    let errMsg = `Error running ${path.basename(_cwctlPath)} ${cmd.command.join(" ")}`;
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
