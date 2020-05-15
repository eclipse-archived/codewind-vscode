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
import Commands from "../../constants/Commands";
import { manageLogs } from "../project/ManageLogsCmd";

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
}

export default class ProjectOverviewPageWrapper extends WebviewWrapper {

    constructor(
        private readonly project: Project,
    ) {
        super(project.name, project.type.icon);
        project.onDidOpenOverviewPage(this);
        this.refresh();
    }

    protected async generateHtml(resourceProvider: WebviewResourceProvider): Promise<string> {
        return getProjectOverviewHtml(resourceProvider, this.project);
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
                const uri = vscode.Uri.file(targetPath);
                vscode.commands.executeCommand(Commands.VSC_REVEAL_IN_OS, uri);
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
            case CommonWVMessages.OPEN_CONNECTION:
                remoteConnectionOverviewCmd(this.project.connection);
                break;
            default: {
                Log.e("Received unknown event from project info webview:", msg);
            }
        }
    }
}
