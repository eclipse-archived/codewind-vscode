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
import { Readable } from "stream";
import * as readline from "readline";

import MCUtil from "../../MCUtil";
import Log from "../../Logger";
import { CLILifecycleCommand, CLILifecycleCommands } from "./CLILifecycleCommands";
import { CLICommand, CLICommands } from "./CLICommands";
import CLISetup from "./CLISetup";
import CWExtensionContext from "../../CWExtensionContext";
import { ProgressUpdate } from "../Types";

let _hasInitialized = false;

namespace CLIWrapper {

    export const cliOutputChannel = vscode.window.createOutputChannel("Codewind");

    export function hasInitialized(): boolean {
        return _hasInitialized;
    }

    /**
     * Check if cwctl and appsody are installed and the correct version. If not, download them.
     * Should not throw, but if this fails the extension will malfunction, so it shows obvious errors.
     */
    export async function initialize(): Promise<void> {
        cliOutputChannel.appendLine(`Full Codewind log is at "${Log.getLogFilePath}"\n`);

        const binariesInitStartTime = Date.now();
        Log.i(`Initializing CLI binaries`);

        let isCwctlSetup = false;
        let isAppsodySetup = false;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            cancellable: false,
            title: `Setting up Codewind...`,
        }, async () => {
            if (await CLISetup.doesBinariesTargetDirExist()) {
                cliOutputChannel.appendLine(`${CLISetup.getBinariesTargetDir()} exists`);

                // we do not await this since it only deletes files we aren't interested in anymore.
                CLISetup.deleteOldBinaryDirs()
                .catch((err) => {
                    Log.e(`Error deleting old binary dirs`, err);
                });

                [ isCwctlSetup, isAppsodySetup ] = await Promise.all([
                    CLISetup.isCwctlSetup(),
                    CLISetup.isAppsodySetup()
                ]);
            }
            else {
                cliOutputChannel.appendLine(`${CLISetup.getBinariesTargetDir()} was created`);
            }
        });
        Log.d(`Finished determining if binaries are installed, took ${Date.now() - binariesInitStartTime}ms`);

        const downloadPromises: Promise<boolean>[] = [];

        if (isCwctlSetup) {
            cliOutputChannel.appendLine(`cwctl is available at ${CLISetup.getCwctlPath()}`);
        }
        else {
            cliOutputChannel.appendLine(`Downloading cwctl from ${CLISetup.getCwctlArchiveDownloadUrl()}...`);
            downloadPromises.push(
                CLISetup.downloadCwctl()
                .then((cwctlPath) => {
                    cliOutputChannel.appendLine(`cwctl is now available at ${cwctlPath}`);
                    return true;
                })
                .catch((err) => {
                    onSetupFailed(err, CLISetup.CWCTL_DOWNLOAD_NAME, CLISetup.getCwctlArchiveDownloadUrl(), CLISetup.getCwctlPath());
                    return false;
                })
            );
        }

        if (isAppsodySetup) {
            cliOutputChannel.appendLine(`appsody ${CWExtensionContext.get().appsodyVersion} is available at ${CLISetup.getAppsodyPath()}`);
        }
        else {
            cliOutputChannel.appendLine(`Downloading appsody ${CWExtensionContext.get().appsodyVersion} from ${CLISetup.getAppsodyDownloadUrl()}...`);
            downloadPromises.push(CLISetup.downloadAppsody()
                .then((appsodyPath) => {
                    cliOutputChannel.appendLine(`appsody ${CWExtensionContext.get().appsodyVersion} is now available at ${appsodyPath}`);
                    return true;
                })
                .catch((err) => {
                    onSetupFailed(err, CLISetup.APPSODY_DOWNLOAD_NAME, CLISetup.getAppsodyDownloadUrl(), CLISetup.getAppsodyPath());
                    return false;
                })
            );
        }

        // download promises don't throw
        const success = (await Promise.all(downloadPromises)).every((result) => result);
        if (!success) {
            Log.e(`At least one binary failed to download; see above`);
        }
        _hasInitialized = true;
        Log.i(`Finished initializing the CLI binaries, took ${Date.now() - binariesInitStartTime}ms`);
        CLISetup.lsBinariesTargetDir();
    }

    function onSetupFailed(err: any, binaryName: string, downloadUrl: string, targetPath: string): void {
        Log.e(`Failed to initialize ${binaryName}:`, err);
        const errMsg = `Error initalizing ${binaryName}`;

        cliOutputChannel.appendLine(`***** ${errMsg}: ${MCUtil.errToString(err)}\n` +
            `Restart the extension to try again.\nIf the error persists, download the ${binaryName} binary from ` +
            `${downloadUrl} and place it in ${targetPath}.`);

        showCLIError(errMsg);
    }

    /**
     * Throw an error with this as the message to indicate an action was cancelled.
     */
    export const CLI_CMD_CANCELLED = "Cancelled";

    /**
     * Run the given CLICommand with the given arguments.
     * @returns
     *  In the success case, if cmd.hasJSONOutput, a parsed JS object. This should be cast to the expected return type.
     *  If !cmd.hasJSONOutput, returns the entire stdout as a string.
     *
     *  In the failure case (cwctl exits with non-zero code), throws an error.
     */
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

        // Build the 'cmdStr' which is the full command printed for debugging.
        // If the command contains a user password we have to censor it.
        const argsCopy = Array.from(args);
        const pwIndex = args.findIndex((arg) => arg === CLICommands.PASSWORD_ARG);
        if (pwIndex >= 0) {
            argsCopy[pwIndex + 1] = "********";
        }
        const cmdStr = [ path.basename(cwctlPath), ...argsCopy ].join(" ");

        Log.i(`Running CLI command: ${cmdStr}`);

        // CLI output and err are echoed to a user-visible outputchannel.
        // We hide install output because it's thousands of lines of a progress bar, and sectoken because the token should not be exposed.
        const startTime = Date.now();
        cliOutputChannel.appendLine(`==> Run ${cmdStr}  |  ${Log.getFriendlyTime()}`);
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
                    cliOutputChannel.appendLine("Cancelled");
                    reject(CLI_CMD_CANCELLED);
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
            cliOutputChannel.appendLine(`==> End ${cmdStr}  |  ${Log.getFriendlyTime()} (Took ${Date.now() - startTime}ms)`);
        });

        const hasProgress = cmd.updateProgress || progressPrefix;
        if (hasProgress) {
            return vscode.window.withProgress({
                cancellable: cmd.cancellable,
                location: vscode.ProgressLocation.Notification,
                title: progressPrefix,
            }, (progress, token) => {
                // If updateProgress is not set, just leave the progress as the 'progressPrefix'
                if (cmd.updateProgress) {
                    updateProgress(cmd, cwctlProcess.stdout, progress);
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

    function updateProgress(cmd: CLICommand, stdout: Readable, progress: vscode.Progress<ProgressUpdate>): void {

        const isInstallCmd = cmd === CLILifecycleCommands.INSTALL;
        const reader = readline.createInterface(stdout);
        reader.on("line", (line) => {
            if (!line) {
                return;
            }
            if (!isInstallCmd) {
                // simple case for non-install, just update with the output, removing (some) terminal escapes
                const message = line.replace(/\u001b\[\d+./g, "").trim();
                progress.report({ message });
                return;
            }
            if (line === "Image Tagging Successful") {
                return;
            }

            // With JSON flag, `install` output is JSON we can parse to give good output
            let lineObj: { status: string; id: string; };
            try {
                lineObj = JSON.parse(line);
            }
            catch (err) {
                Log.e(`Error parsing JSON from CLI output, line was "${line}"`);
                return;
            }

            // we're interested in lines like:
            // {"status":"Pulling from codewind-pfe-amd64","id":"latest"}
            const pullingFrom = "Pulling from";
            if (line.includes(pullingFrom)) {
                const imageTag = lineObj.id;
                const message = lineObj.status + ":" + imageTag;
                progress.report({ message });
            }
        });
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
