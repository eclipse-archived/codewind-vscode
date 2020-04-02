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
import { Readable } from "stream";
import * as readline from "readline";
import * as fs from "fs-extra";

import Log from "../../Logger";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Translator from "../../constants/strings/Translator";
import { CodewindStates } from "../connection/local/CodewindStates";
import MCUtil from "../../MCUtil";
import Constants from "../../constants/Constants";
import CLIWrapper from "./CLIWrapper";
import Commands from "../../constants/Commands";
import LocalCodewindManager from "../connection/local/LocalCodewindManager";
import { CLILifecycleCommand, CLILifecycleCommands } from "./CLILifecycleCommands";
import { CLICommandRunner } from "./CLICommandRunner";
import CWDocs from "../../constants/CWDocs";
import { CLIStatus, ProgressUpdate } from "../Types";

const STRING_NS = StringNamespaces.STARTUP;

const TAG_OPTION = "-t";

export namespace CLILifecycleWrapper {

    // serves as a lock, only one operation at a time.
    let currentOperation: CLILifecycleCommand | undefined;

    export function isRunning(): boolean {
        return currentOperation !== undefined;
    }

    const ALREADY_RUNNING_WARNING = "Please wait for the current operation to finish.";

    async function runLifecycleCmd(cmd: CLILifecycleCommand, tagOverride?: string): Promise<void> {
        if (currentOperation) {
            vscode.window.showWarningMessage(ALREADY_RUNNING_WARNING);
            throw new Error(CLIWrapper.CLI_CMD_CANCELLED);
        }

        const args = [];
        const tag = tagOverride || getTag();
        if (tagOverride || cmd.usesTag) {
            args.push(TAG_OPTION, tag);
        }

        const beforeCmdState = LocalCodewindManager.instance.state;
        const transitionStates = cmd.transitionStates;
        if (transitionStates && transitionStates.during) {
            LocalCodewindManager.instance.setState(transitionStates.during);
        }

        let progressTitle;
        // For STOP the CLI output looks better by itself, so we don't display any extra title
        if (cmd !== CLILifecycleCommands.STOP) {
            progressTitle = cmd.getUserActionName(tag);
        }

        try {
            currentOperation = cmd;
            await CLIWrapper.cwctlExec(cmd, args, progressTitle);
        }
        catch (err) {
            if (CLIWrapper.isCancellation(err)) {
                // restore original state
                LocalCodewindManager.instance.setState(beforeCmdState);
            }
            else if (transitionStates && transitionStates.onError) {
                LocalCodewindManager.instance.setState(transitionStates.onError);
            }
            currentOperation = undefined;
            throw err;
        }
        if (transitionStates && transitionStates.after) {
            LocalCodewindManager.instance.setState(transitionStates.after);
        }
        currentOperation = undefined;
    }

    export async function getCodewindUrl(): Promise<vscode.Uri | undefined> {
        const url = (await CLICommandRunner.status()).url;
        if (!url) {
            return undefined;
        }
        return vscode.Uri.parse(url);
    }

    export type LocalCWInstallStatus = "no-docker" | "stopped" | "started-wrong-version" | "started-correct-version";

    /**
     * Inspects the current cwctl status to map it to one of the states the extension can deal with.
     */
    export async function getCodewindStartedStatus(status?: CLIStatus): Promise<LocalCWInstallStatus> {
        if (!status) {
            if (!CLIWrapper.hasInitialized()) {
                return "stopped";
            }

            try {
                status = await CLICommandRunner.status();
            }
            catch (err) {
                if (CLIWrapper.isCancellation(err)) {
                    return "stopped";
                }
                // else throw unexpected
                throw err;
            }
        }

        if (!status.isDockerRunning) {
            return "no-docker";
        }

        if (status.started.length > 0) {
            if (status.started.includes(getTag())) {
                Log.i("The correct version of Codewind is already started");
                return "started-correct-version";
            }
            Log.i(`Codewind is started but it is the wrong version`);
            return "started-wrong-version";
        }
        Log.i(`Docker is running but Codewind is not`);
        return "stopped";
    }

    export async function installAndStart(): Promise<void> {
        const status = await CLICommandRunner.status();
        const tag = getTag();
        let hadOldVersionRunning = false;
        Log.i(`Ready to install and start Codewind ${tag}`);

        const startedStatus = await getCodewindStartedStatus(status);
        if (startedStatus === "no-docker") {
            vscode.window.showWarningMessage(`Docker does not appear to be running on this computer. ` +
                `Start the Docker daemon before you try to start Local Codewind.`);

            throw new Error(CLIWrapper.CLI_CMD_CANCELLED);
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
                Log.i("User rejected backend upgrade with CW started");
                vscode.window.showWarningMessage(Translator.t(STRING_NS, "backendUpgradeRequired", { tag }));
                throw new Error(CLIWrapper.CLI_CMD_CANCELLED);
            }
            await stop();
            hadOldVersionRunning = true;
        }

        if (!status["installed-versions"].includes(tag)) {
            Log.i(`Codewind ${tag} is NOT installed, installed versions are ${status["installed-versions"].join(", ")}`);

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
                LocalCodewindManager.instance.setState(CodewindStates.ERR_INSTALLING);
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

        if (await isWorkspaceMigrationReqd(status.started, status["installed-versions"])) {
            await doWorkspaceUpgrade();
        }
    }

    async function onWrongVersionInstalled(installedVersions: string[], requiredTag: string): Promise<void> {
        const installedVersionsStr = MCUtil.joinWithAnd(installedVersions);

        const yesBtn = "OK";
        const resp = await vscode.window.showWarningMessage(
            `You currently have Codewind ${installedVersionsStr} installed, ` +
            `but ${requiredTag} is required to use this version of the extension. Install Codewind ${requiredTag} now?`,
            { modal: true }, yesBtn
        );
        if (resp !== yesBtn) {
            Log.i("User rejected backend upgrade");
            vscode.window.showWarningMessage(Translator.t(STRING_NS, "backendUpgradeRequired", { tag: requiredTag }));
            throw new Error(CLIWrapper.CLI_CMD_CANCELLED);
        }

        // Remove unwanted versions (ie all versions that are installed, since none of them are the required version)
        await removeAllImages();
    }

    async function install(promptForInstall: boolean): Promise<void> {
        Log.i("Installing Codewind");

        const installAffirmBtn = Translator.t(STRING_NS, "installAffirmBtn");
        const moreInfoBtn = Translator.t(STRING_NS, "moreInfoBtn");

        let response;
        if (!promptForInstall || MCUtil.isTestEnv()) {
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
                LocalCodewindManager.instance.setState(CodewindStates.ERR_INSTALLING);
                CLIWrapper.showCLIError(MCUtil.errToString(err));
                return onInstallFailOrReject(false);
            }
        }
        else if (response === moreInfoBtn) {
            onMoreInfo();
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
        const installedVersions = (await CLICommandRunner.status())["installed-versions"];
        for (const unwantedVersion of installedVersions) {
            Log.i(`Removing images for installed version ${unwantedVersion}`);
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
            return Promise.reject(CLIWrapper.CLI_CMD_CANCELLED);
        });
    }

    function onMoreInfo(): void {
        const moreInfoUrl = CWDocs.INSTALL_INFO;
        vscode.commands.executeCommand(Commands.VSC_OPEN, moreInfoUrl);
    }

    export function updateProgress(
        cmd: CLILifecycleCommand, stdout: Readable, progress: vscode.Progress<ProgressUpdate>): void {

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

    function getTag(): string {
        let tag = Constants.getCodewindImageVersion();
        const versionVarValue = process.env[Constants.CW_ENV_TAG_VAR];
        if (versionVarValue) {
            tag = versionVarValue;
        }
        return tag;
    }

    /**
     * We have to do a cwctl upgrade (workspace migration) if the old version was older than 0.6, and the workspace was created at some point.
     */
    async function isWorkspaceMigrationReqd(startedVersions: string[], installedVersions: string[]): Promise<boolean> {
        try {
            await fs.access(MCUtil.getCWWorkspacePath());
        }
        catch (err) {
            // no workspace -> no upgrade required
            return false;
        }

        const versions = startedVersions.length > 0 ? startedVersions : installedVersions;

        if (versions.length === 0) {
            // if they have a workspace but no installed verisons, we have to assume it was created by an old version
            return true;
        }

        const newestInstalledVersion = versions.sort()[versions.length - 1];
        const upgradeReqd = [
            "0.1", "0.2", "0.3", "0.4", "0.5"
        ].some((oldVersion) => newestInstalledVersion.startsWith(oldVersion));

        Log.i(`The newest installed version ${newestInstalledVersion} requires workspace migration ? ${upgradeReqd}`);
        return upgradeReqd;
    }

    async function doWorkspaceUpgrade(): Promise<void> {
        let upgradeResult;
        try {
            const learnMoreBtn = "Learn More";
            vscode.window.showInformationMessage(`Performing codewind-workspace migration...`, learnMoreBtn)
            .then((res) => {
                if (res === learnMoreBtn) {
                    vscode.commands.executeCommand(Commands.VSC_OPEN, CWDocs.WORKSPACE_NEWS.uri);
                }
            });

            upgradeResult = await CLICommandRunner.upgrade();
        }
        catch (err) {
            Log.e("Upgrade errored out", err);
            CLIWrapper.showCLIError(`Failed to migrate projects from the codewind-workspace.
                Use the Add Existing Project command to add your projects back to Codewind.`);
            return;
        }

        if (upgradeResult.migrated.length === 0 && upgradeResult.failed.length === 0) {
            Log.i("No projects were available to be migrated");
        }
        else if (upgradeResult.failed.length === 0) {
            Log.i(`Upgrade totally succeeded`);
            vscode.window.showInformationMessage(`Successfully migrated ${upgradeResult.migrated.length} projects: ` +
                `${MCUtil.joinWithAnd(upgradeResult.migrated)}.`);
        }
        else if (upgradeResult.migrated.length === 0) {
            Log.i(`Upgrade totally failed`);
            CLIWrapper.showCLIError(`Failed to migrate any projects from the codewind-workspace. ` +
                `Use the Add Existing Project command to add your projects back to Codewind.`);
        }
        else {
            Log.i(`Upgrade partially succeeded`);
            const projectsSucceeded = MCUtil.joinWithAnd(upgradeResult.migrated);
            const projectsFailed = MCUtil.joinWithAnd(upgradeResult.failed.map((failed) => failed.projectName));
            CLIWrapper.showCLIError(`Successfully migrated ${projectsSucceeded}, but failed to migrate ${projectsFailed}. ` +
                `Use the Add Existing project command to add the failed projects back to Codewind.`);
        }
    }
}

export default CLILifecycleWrapper;
