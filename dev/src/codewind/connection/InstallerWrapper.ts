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
import { Readable } from "stream";
import { promisify } from "util";

import MCUtil from "../../MCUtil";
import Log from "../../Logger";
import Commands from "../../constants/Commands";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Constants from "../../constants/Constants";
import { INSTALLER_COMMANDS, InstallerCommands } from "./InstallerCommands";
import CodewindManager from "./CodewindManager";
import { CodewindStates } from "./CodewindStates";

const STRING_NS = StringNamespaces.STARTUP;

const BIN_DIR = "bin";
const INSTALLER_DIR = "installer";
const INSTALLER_EXECUTABLE = "codewind-installer";
const INSTALLER_EXECUTABLE_WIN = "codewind-installer.exe";

// Codewind tag to install if no env vars set
const DEFAULT_CW_TAG = "0.2";
const TAG_LATEST = "latest";

namespace InstallerWrapper {
    // check error against this to see if it's a real error or just a user cancellation
    export const INSTALLCMD_CANCELLED = "Cancelled";

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

            // https://github.com/eclipse/codewind-installer/blob/master/actions/status.go
            child.on("exit", (code, _signal) => {
                if (code === 200) {
                    return resolve(InstallerStates.NOT_INSTALLED);
                }
                else if (code === 201) {
                    return resolve(InstallerStates.STOPPED);
                }
                else if (code === 202) {
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

    function isDevEnv(): boolean {
        const env = process.env[Constants.CW_ENV_VAR];
        return env === Constants.CW_ENV_DEV || env === Constants.CW_ENV_TEST;
    }

    function getUserActionName(cmd: InstallerCommands): string {
        return INSTALLER_COMMANDS[cmd].userActionName;
    }

    function doesUseTag(cmd: InstallerCommands): boolean {
        return INSTALLER_COMMANDS[cmd].usesTag;
    }

    function getTag(): string {
        let tag = DEFAULT_CW_TAG;
        const versionVarValue = process.env[Constants.CW_ENV_TAG_VAR];
        if (versionVarValue) {
            tag = versionVarValue;
        }
        else if (isDevEnv()) {
            tag = TAG_LATEST;
        }
        return tag;
    }

    // serves as a lock, only one operation at a time.
    let currentOperation: InstallerCommands | undefined;

    export function isInstallerRunning(): boolean {
        return currentOperation !== undefined;
    }

    export async function installerExec(cmd: InstallerCommands): Promise<void> {
        const transitionStates = INSTALLER_COMMANDS[cmd].states;
        if (transitionStates && transitionStates.during) {
            CodewindManager.instance.changeState(transitionStates.during);
        }
        try {
            await installerExecInner(cmd);
        }
        catch (err) {
            if (transitionStates && transitionStates.onError) {
                CodewindManager.instance.changeState(transitionStates.onError);
            }
            throw err;
        }
        if (transitionStates && transitionStates.after) {
            CodewindManager.instance.changeState(transitionStates.after);
        }
    }

    async function installerExecInner(cmd: InstallerCommands): Promise<void> {
        const executablePath = await initialize();
        if (isInstallerRunning()) {
            vscode.window.showWarningMessage(`Already ${getUserActionName(cmd)}`);
            throw new Error(InstallerWrapper.INSTALLCMD_CANCELLED);
        }
        // const timeout = isInstallCmd ? undefined : 60000;

        const args: string[] = [ cmd ];
        let tag: string | undefined;
        if (doesUseTag(cmd)) {
            tag = getTag();
            args.push("-t", tag);
        }
        const isInstallCmd = cmd === InstallerCommands.INSTALL;
        if (isInstallCmd) {
            // request JSON output
            args.push("-j");
        }
        Log.i(`Running installer command: ${args.join(" ")}`);

        let progressTitle;
        // For STOP the installer output looks better by itself, so we don't display any extra title
        // if (![InstallerCommands.STOP, InstallerCommands.STOP_ALL].includes(cmd)) {
        if (cmd !== InstallerCommands.STOP_ALL) {
            progressTitle = getUserActionName(cmd);
            // if (tag) {
            //     progressTitle += ` - ${tag}`;
            // }
        }

        const executableDir = path.dirname(executablePath);

        await vscode.window.withProgress({
            cancellable: INSTALLER_COMMANDS[cmd].cancellable,
            location: vscode.ProgressLocation.Notification,
            title: progressTitle,
        }, (progress, token) => {
            return new Promise<void>((resolve, reject) => {
                currentOperation = cmd;

                const child = child_process.spawn(executablePath, args, {
                    cwd: executableDir
                });

                updateProgress(isInstallCmd, child.stdout, progress);

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
                        Log.d(`Installer command ${cmd} did not exit normally, likely was cancelled`);
                    }
                    else if (code !== 0) {
                        Log.e(`Error running installer command ${cmd}`, errStr);
                        outStr = outStr || "No output";
                        errStr = errStr || "Unknown error " + INSTALLER_COMMANDS[cmd].userActionName;
                        writeOutError(cmd, outStr, errStr);
                        Log.e("Stdout:", outStr);
                        Log.e("Stderr:", errStr);
                        reject(errStr);
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
        return MCUtil.errToString(err) === INSTALLCMD_CANCELLED;
    }

    const ALREADY_RUNNING_WARNING = "Please wait for the current operation to finish.";

    /**
     * Confirm install with user, then download the CW backend docker images.
     * Does nothing if already installed.
     *
     */
    export async function install(): Promise<void> {
        if (!(await InstallerWrapper.isInstallRequired())) {
            Log.i("Codewind is already installed");
            return;
        }

        if (InstallerWrapper.isInstallerRunning()) {
            vscode.window.showWarningMessage(ALREADY_RUNNING_WARNING);
            throw new Error(InstallerWrapper.INSTALLCMD_CANCELLED);
        }

        Log.i("Codewind is not installed");

        const installAffirmBtn = Translator.t(STRING_NS, "installAffirmBtn");
        const moreInfoBtn = Translator.t(STRING_NS, "moreInfoBtn");

        let response;
        if (process.env[Constants.CW_ENV_VAR] === Constants.CW_ENV_TEST) {
            response = installAffirmBtn;
        }
        else {
            Log.d("Prompting for install confirm");
            response = await vscode.window.showInformationMessage(Translator.t(STRING_NS, "installPrompt"),
                { modal: true }, installAffirmBtn, moreInfoBtn,
            );
        }

        if (response === installAffirmBtn) {
            try {
                await InstallerWrapper.installerExec(InstallerCommands.INSTALL);
                // success
                vscode.window.showInformationMessage(
                    Translator.t(StringNamespaces.STARTUP, "installCompleted"),
                    Translator.t(StringNamespaces.STARTUP, "okBtn")
                );
                Log.i("Codewind installed successfully");
            }
            catch (err) {
                if (isCancellation(err)) {
                    throw err;
                }
                Log.e("Install failed", err);
                CodewindManager.instance.changeState(CodewindStates.ERR_INSTALLING);
                vscode.window.showErrorMessage(MCUtil.errToString(err));
                return onInstallFailOrReject(false);
            }
        }
        else if (response === moreInfoBtn) {
            onMoreInfo();
            throw new Error(InstallerWrapper.INSTALLCMD_CANCELLED);
        }
        else {
            Log.i("User rejected installation");
            // they pressed Cancel
            return onInstallFailOrReject(true);
        }
    }

    async function onInstallFailOrReject(rejected: boolean): Promise<void> {
        let msg: string;
        if (rejected) {
            msg = Translator.t(STRING_NS, "installRejected");
        }
        else {
            msg = Translator.t(STRING_NS, "installFailed");
        }
        const moreInfoBtn = Translator.t(STRING_NS, "moreInfoBtn");
        const tryAgainBtn = Translator.t(StringNamespaces.STARTUP, "tryAgainBtn");

        return vscode.window.showWarningMessage(msg, moreInfoBtn, tryAgainBtn, Translator.t(STRING_NS, "okBtn"))
        .then((res): Promise<void> => {
            if (res === tryAgainBtn) {
                return install();
            }
            else if (res === moreInfoBtn) {
                onMoreInfo();
            }
            return Promise.reject(InstallerWrapper.INSTALLCMD_CANCELLED);
        });
    }

    async function writeOutError(cmd: InstallerCommands, outStr: string, errStr: string): Promise<void> {
        const logDir = path.join(Log.getLogDir, `installer-error-${cmd}-${Date.now()}`);
        await promisify(fs.mkdir)(logDir, { recursive: true });

        const stdoutLog = path.join(logDir, "installer-output.log");
        const stderrLog = path.join(logDir, "installer-error-output.log");
        await promisify(fs.writeFile)(stdoutLog, outStr);
        await promisify(fs.writeFile)(stderrLog, errStr);
        if (cmd === InstallerCommands.INSTALL) {
            // show user the output in this case because they can't recover
            // I do not like having this, but I don't see an easier way to present the user with the reason for failure
            // until the installer 'expects' more errors.
            vscode.commands.executeCommand(Commands.VSC_OPEN, vscode.Uri.file(stdoutLog));
            vscode.commands.executeCommand(Commands.VSC_OPEN, vscode.Uri.file(stderrLog));
        }
        Log.e("Wrote failed command output to " + logDir);
    }

    function onMoreInfo(): void {
        const moreInfoUrl = vscode.Uri.parse(`${Constants.CW_SITE_BASEURL}installlocally.html`);
        vscode.commands.executeCommand(Commands.VSC_OPEN, moreInfoUrl);
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

            // With JSON flag, `install` output is JSON we can parse to give good output
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
            if (line.includes(pullingFrom)) {
                const imageTag = lineObj.id;
                const message = lineObj.status + ":" + imageTag;
                progress.report({ message });
            }
        });
    }
}

export default InstallerWrapper;
