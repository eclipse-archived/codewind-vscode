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
import Constants, { CWDocs } from "../../constants/Constants";
import { INSTALLER_COMMANDS, InstallerCommands, getUserActionName, doesUseTag } from "./InstallerCommands";
import CodewindManager from "./CodewindManager";
import { CodewindStates } from "./CodewindStates";
import { IInitializationResponse } from "./UserProjectCreator";

const STRING_NS = StringNamespaces.STARTUP;

const BIN_DIR = "bin";
const INSTALLER_EXECUTABLE = "cwctl";
const INSTALLER_EXECUTABLE_WIN = "cwctl.exe";
const INSTALLER_PREREQS: { [s: string]: string[]; } = {
    [INSTALLER_EXECUTABLE]: ["appsody"],
    [INSTALLER_EXECUTABLE_WIN]: ["appsody.exe"]
};

const TAG_OPTION = "-t";
const JSON_OPTION = "-j";

// Codewind tag to install if no env vars set
const DEFAULT_CW_TAG = "0.4.0";
const TAG_LATEST = "latest";

interface InstallerStatus {
    // status: "uninstalled" | "stopped" | "started";
    "installed-versions": string[];
    started: string[];
    url?: string;   // only set when started
}

namespace InstallerWrapper {
    // check error against this to see if it's a real error or just a user cancellation
    export const INSTALLCMD_CANCELLED = "Cancelled";

    /**
     * `installer status` command.
     * This is a separate function because it exits quickly so the progress is not useful, and we have to parse its structured output.
     */
    async function getInstallerStatus(): Promise<InstallerStatus> {
        const executablePath = await initialize();

        const status = await new Promise<InstallerStatus>((resolve, reject) => {
            const child = child_process.execFile(executablePath, [ "status", JSON_OPTION ], {
                timeout: 10000,
            }, (err, stdout_, stderr_) => {
                const stdout = stdout_.toString();
                const stderr = stderr_.toString();

                if (err) {
                    Log.e("Error checking status", err);
                    Log.e("Error checking status, stdout:", stderr);
                    Log.e("Error checking status, stderr:", stdout);
                    if (stderr) {
                        return reject(stderr);
                    }
                    else {
                        return reject(stdout);
                    }
                }

                const statusObj = JSON.parse(stdout);
                Log.d("Installer status", statusObj);
                // The installer will leave out these fields if they are empty, but an empty array is easier to deal with.
                if (statusObj["installed-versions"] == null) {
                    statusObj["installed-versions"] = [];
                }
                if (statusObj.started == null) {
                    statusObj.started = [];
                }
                return resolve(statusObj);
            });

            child.on("error", (err) => {
                return reject(err);
            });
        })
        .catch((err) => { throw err; });
        return status;
    }

    export async function getCodewindUrl(): Promise<vscode.Uri | undefined> {
        const url = (await getInstallerStatus()).url;
        if (!url) {
            return undefined;
        }
        return vscode.Uri.parse(url);
    }

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
    async function initialize(): Promise<string> {
        if (_executablePath) {
            return _executablePath;
        }
        const executableDir = os.tmpdir();
        const executable = getInternalExecutable();
        const executableDirname = path.dirname(executable);
        const executableBasename = path.basename(executable);
        _executablePath = path.join(executableDir, executableBasename);
        Log.d(`Copying ${executable} to ${_executablePath}`);
        fs.copyFileSync(executable, path.join(executableDir, executableBasename));
        Log.d("Copying installer prerequisites");
        for (const prereq of INSTALLER_PREREQS[executableBasename]) {
            const source = path.join(executableDirname, prereq);
            const target = path.join(executableDir, prereq);
            Log.d(`Copying ${source} to ${target}`);
            fs.copyFileSync(source, target);
        }
        Log.i("Installer copy succeeded");
        return _executablePath;
    }

    function isDevEnv(): boolean {
        const env = process.env[Constants.CW_ENV_VAR];
        return env === Constants.CW_ENV_DEV || env === Constants.CW_ENV_TEST;
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

    async function installerExec(cmd: InstallerCommands, tagOverride?: string): Promise<void> {
        const beforeCmdState = CodewindManager.instance.state;
        const transitionStates = INSTALLER_COMMANDS[cmd].states;
        if (transitionStates && transitionStates.during) {
            CodewindManager.instance.changeState(transitionStates.during);
        }
        try {
            await installerExecInner(cmd, tagOverride);
        }
        catch (err) {
            if (isCancellation(err)) {
                // restore original state
                CodewindManager.instance.changeState(beforeCmdState);
            }
            else if (transitionStates && transitionStates.onError) {
                CodewindManager.instance.changeState(transitionStates.onError);
            }
            throw err;
        }
        if (transitionStates && transitionStates.after) {
            CodewindManager.instance.changeState(transitionStates.after);
        }
    }

    const ALREADY_RUNNING_WARNING = "Please wait for the current operation to finish.";

    /**
     * @param tagOverride - If the command should be run against a tag other than the one determined by getTag
     */
    async function installerExecInner(cmd: InstallerCommands, tagOverride?: string): Promise<void> {
        const executablePath = await initialize();
        if (isInstallerRunning()) {
            vscode.window.showWarningMessage(ALREADY_RUNNING_WARNING);
            throw new Error(InstallerWrapper.INSTALLCMD_CANCELLED);
        }
        // const timeout = isInstallCmd ? undefined : 60000;

        const args: string[] = [ cmd ];
        const tag = tagOverride || getTag();
        if (tagOverride || doesUseTag(cmd)) {
            args.push(TAG_OPTION, tag);
        }

        const isInstallCmd = cmd === InstallerCommands.INSTALL;
        if (isInstallCmd) {
            // request JSON output
            args.push(JSON_OPTION);
        }
        Log.i(`Running installer command: ${args.join(" ")}`);

        let progressTitle;
        // For STOP the installer output looks better by itself, so we don't display any extra title
        if (cmd !== InstallerCommands.STOP_ALL) {
            progressTitle = getUserActionName(cmd, tag);
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
                        errStr = errStr || "Unknown error " + getUserActionName(cmd, tag);
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

    export async function installAndStart(): Promise<void> {
        const status = await getInstallerStatus();

        const tag = getTag();
        let hadOldVersionRunning = false;
        Log.i(`Ready to install and start Codewind ${tag}`);
        if (status.started.length > 0) {
            if (status.started.includes(tag)) {
                Log.i("The correct version of Codewind is already started");
                return;
            }
            Log.i(`The wrong version of Codewind ${status.started[0]} is currently started`);

            const okBtn = "OK";
            const resp = await vscode.window.showWarningMessage(
                `The running version of the Codewind backend (${status.started[0]}) is out-of-date, ` +
                `and not compatible with this version of the extension. Codewind will now stop and upgrade to the new version.`,
                { modal: true }, okBtn,
            );
            if (resp !== okBtn) {
                throw new Error(Translator.t(STRING_NS, "backendUpgradeRequired", { tag }));
            }
            await stop();
            hadOldVersionRunning = true;
        }
        else {
            Log.i("Codewind is not running");
        }

        if (!status["installed-versions"].includes(tag)) {
            Log.i(`Codewind ${tag} is NOT installed`);

            // If they had an old version running, they have already agreed to update to the new version
            let promptForInstall = !hadOldVersionRunning;
            if (promptForInstall) {
                const wrongVersionInstalled = status["installed-versions"].length > 0;
                if (wrongVersionInstalled) {
                    await onWrongVersionInstalled(status["installed-versions"], tag);
                    promptForInstall = false;
                }
            }

            try {
                await install(promptForInstall);
            }
            catch (err) {
                if (isCancellation(err)) {
                    throw err;
                }
                CodewindManager.instance.changeState(CodewindStates.ERR_INSTALLING);
                Log.e("Error installing codewind", err);
                throw new Error("Error installing Codewind: " + MCUtil.errToString(err));
            }
        }
        else {
            Log.i(`Codewind ${tag} is already installed`);
        }

        try {
            await installerExec(InstallerCommands.START);
        }
        catch (err) {
            if (isCancellation(err)) {
                throw err;
            }
            Log.e("Error starting codewind", err);
            throw new Error("Error starting Codewind: " + MCUtil.errToString(err));
        }
    }

    async function onWrongVersionInstalled(installedVersions: string[], requiredTag: string): Promise<void> {
        // Generate a user-friendly string like "0.2, 0.3, and 0.4"
        let installedVersionsStr = installedVersions.join(", ");
        if (installedVersions.length > 1) {
            const lastInstalledVersion = installedVersionsStr[installedVersions.length - 1];
            installedVersionsStr = installedVersionsStr.replace(lastInstalledVersion, "and " + lastInstalledVersion);
        }

        const yesBtn = "OK";
        const resp = await vscode.window.showWarningMessage(
            `You currently have Codewind ${installedVersionsStr} installed, ` +
            `but ${requiredTag} is required to use this version of the extension. Install Codewind ${requiredTag} now?`,
            { modal: true }, yesBtn
        );
        if (resp !== yesBtn) {
            throw new Error(Translator.t(STRING_NS, "backendUpgradeRequired", { tag: requiredTag }));
        }
        // Remove unwanted versions (ie all versions that are installed, since none of them are the required version)
        await removeAllImages();
    }

    async function install(promptForInstall: boolean): Promise<void> {
        Log.i("Installing Codewind");

        const installAffirmBtn = Translator.t(STRING_NS, "installAffirmBtn");
        const moreInfoBtn = Translator.t(STRING_NS, "moreInfoBtn");

        let response;
        if (!promptForInstall || process.env[Constants.CW_ENV_VAR] === Constants.CW_ENV_TEST) {
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
                await installerExec(InstallerCommands.INSTALL);
                // success
                vscode.window.showInformationMessage(
                    Translator.t(StringNamespaces.STARTUP, "installCompleted", { version: getTag() }),
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
            // throw new Error(InstallerWrapper.INSTALLCMD_CANCELLED);
            return onInstallFailOrReject(true);
        }
        else {
            Log.i("User rejected installation");
            // they pressed Cancel
            return onInstallFailOrReject(true);
        }
    }

    export async function stop(): Promise<void> {
        return installerExec(InstallerCommands.STOP_ALL);
    }

    export async function removeAllImages(): Promise<void> {
        const installedVersions = (await getInstallerStatus())["installed-versions"];
        for (const unwantedVersion of installedVersions) {
            await installerExec(InstallerCommands.REMOVE, unwantedVersion);
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
                return install(false);
            }
            else if (res === moreInfoBtn) {
                onMoreInfo();
                return onInstallFailOrReject(true);
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
        const moreInfoUrl = CWDocs.getDocLink(CWDocs.INSTALL_INFO);
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

    export async function createProject(projectPath: string, url: string) : Promise<IInitializationResponse> {
        return runProjectCommand(projectPath, url);
    }

    export async function validateProjectDirectory(projectPath: string, desiredType?: string): Promise<IInitializationResponse> {
        return runProjectCommand(projectPath, undefined, desiredType);
    }

    async function runProjectCommand(projectPath: string, url?: string, desiredType?: string): Promise<IInitializationResponse> {
        const executablePath = await initialize();
        const executableDir = path.dirname(executablePath);

        const cmd = "project";
        const args = [cmd, projectPath];
        if (url !== undefined) {
            args.push("--url", url);
        }
        else if (desiredType !== undefined) {
            args.push("--type", desiredType);
        }

        return new Promise<any>((resolve, reject) => {

            const child = child_process.spawn(executablePath, args, {
                cwd: executableDir
            });

            child.on("error", (err) => {
                return reject(err);
            });

            let outStr = "";
            let errStr = "";
            child.stdout.on("data", (chunk) => { outStr += chunk.toString(); });
            child.stderr.on("data", (chunk) => { errStr += chunk.toString(); });

            child.on("close", (code: number | null) => {
                if (code == null) {
                    // this happens in SIGTERM case, not sure what else may cause it
                    Log.d(`Installer command ${cmd} did not exit normally, likely was cancelled`);
                }
                else if (code !== 0) {
                    Log.e(`Error running installer command ${cmd}`, errStr);
                    outStr = outStr || "No output";
                    errStr = errStr || "Unknown error " + args.join(" ");
                    Log.e("Stdout:", outStr);
                    Log.e("Stderr:", errStr);
                    reject(errStr);
                }
                else {
                    Log.i(`Successfully ran installer command: ${cmd}`);
                    const validationResponse = JSON.parse(outStr);
                    resolve(validationResponse);
                }
            });
        });
    }
}

export default InstallerWrapper;
