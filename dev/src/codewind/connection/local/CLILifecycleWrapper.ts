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
import { Readable } from "stream";
import * as child_process from "child_process";
import * as readline from "readline";

import Log from "../../../Logger";
import StringNamespaces from "../../../constants/strings/StringNamespaces";
import Translator from "../../../constants/strings/translator";
import { CodewindStates } from "./CodewindStates";
import MCUtil from "../../../MCUtil";
import Constants, { CWDocs } from "../../../constants/Constants";
import CLIWrapper from "../CLIWrapper";
import Commands from "../../../constants/Commands";
import LocalCodewindManager from "./LocalCodewindManager";
import { CLILifecycleCommand, CLILifecycleCommands } from "./CLILifecycleCommands";

const STRING_NS = StringNamespaces.STARTUP;

const TAG_OPTION = "-t";
const JSON_OPTION = "-j";

// Codewind tag to install if no env vars set
const DEFAULT_CW_TAG = "0.5.0";
const TAG_LATEST = "latest";

interface CLIStatus {
    // status: "uninstalled" | "stopped" | "started";
    "installed-versions": string[];
    started: string[];
    url?: string;   // only set when started
}

export namespace CLILifecycleWrapper {

    /**
     * `installer status` command.
     * This is a separate function because it exits quickly so the progress is not useful, and we have to parse its structured output.
     */
    async function getLocalCodewindStatus(): Promise<CLIStatus> {
        const executablePath = await CLIWrapper.initialize();

        const status = await new Promise<CLIStatus>((resolve, reject) => {
            const child = child_process.execFile(executablePath, [ "--insecure", "status", JSON_OPTION ], {
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

    async function runLifecycleCmd(cmd: CLILifecycleCommand, tagOverride?: string): Promise<void> {
        const args = [];
        const tag = tagOverride || getTag();
        if (tagOverride || cmd.usesTag) {
            args.push(TAG_OPTION, tag);
        }

        const isInstallCmd = cmd === CLILifecycleCommands.INSTALL;
        if (isInstallCmd) {
            // request JSON output
            args.push(JSON_OPTION);
        }

        const beforeCmdState = LocalCodewindManager.instance.state;
        const transitionStates = cmd.transitionStates;
        if (transitionStates && transitionStates.during) {
            LocalCodewindManager.instance.changeState(transitionStates.during);
        }

        let progressTitle;
        // For STOP the installer output looks better by itself, so we don't display any extra title
        if (cmd !== CLILifecycleCommands.STOP) {
            progressTitle = cmd.getUserActionName(tag);
        }

        try {
            await CLIWrapper.installerExec(cmd, args, progressTitle);
        }
        catch (err) {
            if (CLIWrapper.isCancellation(err)) {
                // restore original state
                LocalCodewindManager.instance.changeState(beforeCmdState);
            }
            else if (transitionStates && transitionStates.onError) {
                LocalCodewindManager.instance.changeState(transitionStates.onError);
            }
            throw err;
        }
        if (transitionStates && transitionStates.after) {
            LocalCodewindManager.instance.changeState(transitionStates.after);
        }
    }

    export async function getCodewindUrl(): Promise<vscode.Uri | undefined> {
        const url = (await getLocalCodewindStatus()).url;
        if (!url) {
            return undefined;
        }
        return vscode.Uri.parse(url);
    }

    export async function getCodewindStartedStatus(status?: CLIStatus): Promise<"stopped" | "started-wrong-version" | "started-correct-version"> {
        if (!status) {
            status = await getLocalCodewindStatus();
        }
        if (status.started.length > 0) {
            if (status.started.includes(getTag())) {
                Log.i("The correct version of Codewind is already started");
                return "started-correct-version";
            }
            return "started-wrong-version";
        }
        return "stopped";
    }

    export async function installAndStart(): Promise<void> {
        const status = await getLocalCodewindStatus();
        const tag = getTag();
        let hadOldVersionRunning = false;
        Log.i(`Ready to install and start Codewind ${tag}`);

        const startedStatus = await getCodewindStartedStatus(status);
        if (startedStatus === "stopped") {
            Log.i("Codewind is not running");
        }
        else if (startedStatus === "started-wrong-version") {
            Log.i(`The wrong version of Codewind ${status.started[0]} is currently started`);

            const okBtn = "OK";
            const resp = await vscode.window.showWarningMessage(
                `The locally running version of the Codewind backend (${status.started[0]}) is out-of-date, ` +
                `and not compatible with this version of the extension. Codewind will now stop and upgrade to the new version.`,
                { modal: true }, okBtn,
            );
            if (resp !== okBtn) {
                throw new Error(Translator.t(STRING_NS, "backendUpgradeRequired", { tag }));
            }
            await stop();
            hadOldVersionRunning = true;
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
                if (CLIWrapper.isCancellation(err)) {
                    throw err;
                }
                LocalCodewindManager.instance.changeState(CodewindStates.ERR_INSTALLING);
                Log.e("Error installing codewind", err);
                throw new Error("Error installing Codewind: " + MCUtil.errToString(err));
            }
        }
        else {
            Log.i(`Codewind ${tag} is already installed`);
        }

        try {
            await runLifecycleCmd(CLILifecycleCommands.START);
        }
        catch (err) {
            if (CLIWrapper.isCancellation(err)) {
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
                await runLifecycleCmd(CLILifecycleCommands.INSTALL);
                // success
                vscode.window.showInformationMessage(
                    Translator.t(StringNamespaces.STARTUP, "installCompleted", { version: getTag() }),
                    Translator.t(StringNamespaces.STARTUP, "okBtn")
                );
                Log.i("Codewind installed successfully");
            }
            catch (err) {
                if (CLIWrapper.isCancellation(err)) {
                    throw err;
                }
                Log.e("Install failed", err);
                LocalCodewindManager.instance.changeState(CodewindStates.ERR_INSTALLING);
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
        return runLifecycleCmd(CLILifecycleCommands.STOP);
    }

    export async function removeAllImages(): Promise<void> {
        const installedVersions = (await getLocalCodewindStatus())["installed-versions"];
        for (const unwantedVersion of installedVersions) {
            await runLifecycleCmd(CLILifecycleCommands.REMOVE, unwantedVersion);
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
            return Promise.reject(CLIWrapper.INSTALLCMD_CANCELLED);
        });
    }

    function onMoreInfo(): void {
        const moreInfoUrl = CWDocs.getDocLink(CWDocs.INSTALL_INFO);
        vscode.commands.executeCommand(Commands.VSC_OPEN, moreInfoUrl);
    }

    export function updateProgress(
        cmd: CLILifecycleCommand, stdout: Readable, progress: vscode.Progress<{ message?: string, increment?: number }>): void {

        const isInstallCmd = cmd === CLILifecycleCommands.INSTALL;
        const reader = readline.createInterface(stdout);
        reader.on("line", (line) => {
            if (!line) {
                return;
            }
            if (!isInstallCmd) {
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
}

export default CLILifecycleWrapper;
