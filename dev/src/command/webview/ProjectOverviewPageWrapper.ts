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

import { WebviewWrapper, WebviewResourceProvider } from "./WebviewWrapper";
import WebviewUtil, { CommonWVMessages } from "./WebviewUtil";
import Project from "../../codewind/project/Project";
import toggleInjectMetricsCmd from "../project/ToggleInjectMetricsCmd";
import Log from "../../Logger";
import toggleAutoBuildCmd from "../project/ToggleAutoBuildCmd";
import toggleEnablementCmd from "../project/ToggleEnablementCmd";
import requestBuildCmd from "../project/RequestBuildCmd";
import removeProjectCmd from "../project/RemoveProjectCmd";
import { getProjectOverviewHtml } from "./pages/ProjectOverviewPage";
import remoteConnectionOverviewCmd from "../connection/ConnectionOverviewCmd";
import { manageLogs } from "../project/ManageLogsCmd";
import MCUtil from "../../MCUtil";
import projectOverviewCmd from "../project/ProjectOverviewCmd";
import linkProjectCmd, { renameProjectLink, removeProjectLink } from "../project/LinkProjectCmd";

export enum ProjectOverviewWVMessages {
    BUILD = "build",
    TOGGLE_AUTOBUILD = "toggleAutoBuild",
    OPEN_FOLDER = "openFolder",
    UNBIND = "unbind",
    TOGGLE_ENABLEMENT = "toggleEnablement",
    EDIT = "edit",
    TOGGLE_INJECT_METRICS = "toggleInjectMetrics",
    MANAGE_LOGS = "manageLogs",
    OPEN_LOG = "openLog",
    OPEN_PROJECT = "openProject",
    CREATE_LINK = "createLink",
    EDIT_LINK = "editLink",
    REMOVE_LINK = "removeLink",
}

interface EditLinkMsgData {
    envName: string;
    targetProjectName: string;
}

export default class ProjectOverviewPageWrapper extends WebviewWrapper {

    constructor(
        private readonly project: Project,
        private readonly startAtLinkTab: boolean,
    ) {
        super(project.name, project.type.icon);
        project.onDidOpenOverviewPage(this);
        this.refresh();
    }

    protected async generateHtml(resourceProvider: WebviewResourceProvider): Promise<string> {
        return getProjectOverviewHtml(resourceProvider, this.project, this.startAtLinkTab);
    }

    protected onDidDispose(): void {
        this.project.onDidCloseOverviewPage();
    }

    protected handleWebviewMessage = async (msg: WebviewUtil.IWVMessage): Promise<void> => {
        switch (msg.type as ProjectOverviewWVMessages | CommonWVMessages) {
            case CommonWVMessages.OPEN_WEBLINK: {
                WebviewUtil.openWeblink(msg.data);
                break;
            }
            case ProjectOverviewWVMessages.OPEN_FOLDER: {
                const targetPath: string = msg.data;
                await MCUtil.revealDirInOS(targetPath);
                break;
            }
            case ProjectOverviewWVMessages.TOGGLE_AUTOBUILD: {
                toggleAutoBuildCmd(this.project);
                break;
            }
            case ProjectOverviewWVMessages.TOGGLE_ENABLEMENT: {
                toggleEnablementCmd(this.project);
                break;
            }
            case ProjectOverviewWVMessages.BUILD: {
                requestBuildCmd(this.project);
                break;
            }
            case ProjectOverviewWVMessages.UNBIND: {
                removeProjectCmd(this.project);
                break;
            }
            case ProjectOverviewWVMessages.EDIT: {
                this.project.tryOpenSettingsFile();
                break;
            }
            case ProjectOverviewWVMessages.TOGGLE_INJECT_METRICS: {
                toggleInjectMetricsCmd(this.project);
                break;
            }
            case ProjectOverviewWVMessages.MANAGE_LOGS: {
                manageLogs(this.project);
                break;
            }
            case ProjectOverviewWVMessages.OPEN_LOG: {
                const logName = msg.data as string;
                const matchingLog = this.project.logManager.logs.find((log) => log.logName === logName);
                if (!matchingLog) {
                    const errMsg = `Error: Could not find log ${logName} for project ${this.project.name}`;
                    Log.e(errMsg);
                    vscode.window.showErrorMessage(errMsg);
                    return;
                }
                if (matchingLog.isOpen) {
                    matchingLog.show();
                }
                else {
                    // this also starts the streaming of the log
                    await this.project.logManager.showSome([ matchingLog ], false);
                }
                break;
            }
            case ProjectOverviewWVMessages.OPEN_PROJECT: {
                const projectID = msg.data as string;
                const project = await this.project.connection.getProjectByID(projectID);
                if (project == null) {
                    const errMsg = `Error: Could not find project with ID ${projectID}`;
                    Log.e(errMsg);
                    vscode.window.showErrorMessage(errMsg);
                    return;
                }
                await projectOverviewCmd(project);
                break;
            }
            case ProjectOverviewWVMessages.CREATE_LINK: {
                await linkProjectCmd(this.project, true);
                break;
            }
            case ProjectOverviewWVMessages.EDIT_LINK: {
                const renameLinkData = msg.data as EditLinkMsgData;
                try {
                    await renameProjectLink(this.project, renameLinkData.targetProjectName, renameLinkData.envName);
                }
                catch (err) {
                    const errMsg = `Error renaming ${renameLinkData.envName}`;
                    Log.e(errMsg, err);
                    vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
                }
                break;
            }
            case ProjectOverviewWVMessages.REMOVE_LINK: {
                const removeLinkData = msg.data as EditLinkMsgData;

                const yesBtn = "Remove Link";
                const res = await vscode.window.showWarningMessage(
                    `Are you sure you want to remove ${removeLinkData.envName} from ${this.project.name}?`,
                    { modal: true },
                    yesBtn
                );

                if (res !== yesBtn) {
                    return;
                }

                try {
                    removeProjectLink(this.project, removeLinkData.envName);
                }
                catch (err) {
                    const errMsg = `Error removing ${removeLinkData.envName}`;
                    Log.e(errMsg, err);
                    vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
                }
                break;
            }
            case CommonWVMessages.OPEN_CONNECTION: {
                remoteConnectionOverviewCmd(this.project.connection);
                break;
            }
            default: {
                Log.e("Received unknown event from project info webview:", msg);
            }
        }
    }
}
