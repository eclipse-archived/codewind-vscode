/*******************************************************************************
 * Copyright (c) 2019, 2020 IBM Corporation and others.
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

import MCUtil from "../../MCUtil";
import Log from "../../Logger";
import { CLILifecycleWrapper } from "./CLILifecycleWrapper";
import { CLILifecycleCommand } from "./CLILifecycleCommands";
import { CLICommand } from "./CLICommands";
import CLISetup from "./CLISetup";

const cliOutputChannel = vscode.window.createOutputChannel("Codewind");

let _hasInitialized = false;

namespace CLIWrapper {

    export function hasInitialized(): boolean {
        return _hasInitialized;
    }

    /**
     * Check if cwctl and appsody are installed and the correct version. If not, download them.
     * Should not throw, but if this fails the extension will malfunction, so it shows obvious errors.
     */
    export async function initialize(): Promise<void> {
        const binariesInitStartTime = Date.now();
        Log.i(`Initializing CLI binaries`);

        let isCwctlSetup = false;
        let isAppsodySetup = false;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            cancellable: false,
            title: `Initializing Codewind...`,
        }, async () => {
            if (await CLISetup.doesBinariesTargetDirExist()) {
                [ isCwctlSetup, isAppsodySetup ] = await Promise.all([ CLISetup.isCwctlSetup(), CLISetup.isAppsodySetup() ]);
            }
        });
        Log.d(`Finished determining if binaries are installed, took ${Date.now() - binariesInitStartTime}ms`);

        const downloadPromises: Promise<void>[] = [];

        if (isCwctlSetup) {
            cliOutputChannel.appendLine(`cwctl is available at ${CLISetup.getCwctlPath()}`);
        }
        else {
            cliOutputChannel.appendLine(`Downloading cwctl from ${CLISetup.getCwctlArchiveDownloadUrl()}...`);
            downloadPromises.push(
                CLISetup.downloadCwctl()
                .then((cwctlPath) => {
                    cliOutputChannel.appendLine(`cwctl is now available at ${cwctlPath}`);
                })
                .catch((err) => {
                    onSetupFailed(err, CLISetup.CWCTL_DOWNLOAD_NAME, CLISetup.getCwctlArchiveDownloadUrl(), CLISetup.getCwctlPath());
                })
            );
        }

        if (isAppsodySetup) {
            cliOutputChannel.appendLine(`appsody ${global.APPSODY_VERSION} is available at ${CLISetup.getAppsodyPath()}`);
        }
        else {
            cliOutputChannel.appendLine(`Downloading appsody ${global.APPSODY_VERSION} from ${CLISetup.getAppsodyDownloadUrl()}...`);
            downloadPromises.push(CLISetup.downloadAppsody()
                .then((appsodyPath) => {
                    cliOutputChannel.appendLine(`appsody ${global.APPSODY_VERSION} is now available at ${appsodyPath}`);
                })
                .catch((err) => {
                    onSetupFailed(err, CLISetup.APPSODY_DOWNLOAD_NAME, CLISetup.getAppsodyDownloadUrl(), CLISetup.getAppsodyPath());
                })
            );
        }

        // download promises don't throw
        await Promise.all(downloadPromises);
        _hasInitialized = true;
        Log.i(`Finished initializing the CLI binaries, took ${Date.now() - binariesInitStartTime}ms`);
        CLISetup.lsBinariesTargetDir();
    }

    function onSetupFailed(err: any, binaryName: string, downloadUrl: string, targetPath: string): void {
        Log.e(`Failed to initialize ${binaryName}`, err);
        const errMsg = `Error initalizing ${binaryName}`;

        cliOutputChannel.appendLine(`***** ${errMsg}: ${MCUtil.errToString(err)}\n` +
            `Restart the extension to try again.\nIf the error persists, download the ${binaryName} binary from ` +
            `${downloadUrl} and place it in ${targetPath}.`);

        showCLIError(errMsg);
    }

    // check error against this to see if it's a real error or just a user cancellation
    export const CLI_CMD_CANCELLED = "Cancelled";

    const PASSWORD_ARG = "--password";

    export async function cwctlExec(cmd: CLICommand, args: string[] = [], progressPrefix?: string): Promise<any> {
        if (!hasInitialized()) {
            Log.d(`Trying to run CLI command before initialization finished`);
            vscode.window.showWarningMessage(`Please wait for the extension to finish setting up.`);
            throw new Error(CLI_CMD_CANCELLED);
        }

        const cwctlPath = CLISetup.getCwctlPath();

        args = cmd.command.concat(args);
        if (!(cmd instanceof CLILifecycleCommand)) {
            args.unshift("--insecure");
        }
        args.unshift("--json");

        // cmdStr will be the full command, eg `cwctl --insecure project create <path> --url <url>`
        // is generally only used for debugging
        let cmdStr = [ path.basename(cwctlPath), ...args ].join(" ");
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

        const executableDir = path.dirname(cwctlPath);

        const cwctlProcess = child_process.spawn(cwctlPath, args, {
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
                    Log.w(`CLI command ${cmdStr} did not exit normally`);
                    Log.w(`Stdout:`, outStr);
                    if (errStr) {
                        Log.e(`Stderr:`, errStr);
                    }
                    resolve(outStr);
                }
                else if (code !== 0) {
                    Log.e(`Error running ${cmdStr}`);
                    if (outStr.trim()) {
                        Log.e("Stdout:", outStr.trim());
                    }
                    else {
                        Log.e("<No std output>");
                    }
                    if (errStr) {
                        Log.e("Stderr:", errStr.trim());
                    }

                    let errMsg = `Error running ${path.basename(cwctlPath)} ${cmd.command.join(" ")}`;
                    if (isProbablyJSON(outStr)) {
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
                        const output = outStr.trimRight();
                        if (output) {
                            successMsg += `, Output was:\n` + output;
                        }
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

                    try {
                        const obj = JSON.parse(outStr);
                        if (obj.error_description) {
                            return reject(obj.error_description);
                        }
                        return resolve(obj);
                    }
                    catch (err) {
                        return reject(err);
                    }
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
