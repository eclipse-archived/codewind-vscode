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

import { WebviewWrapper, WebviewResourceProvider } from "./WebviewWrapper";
import WebviewUtil from "./WebviewUtil";
import Project from "../../codewind/project/Project";
import toggleInjectMetricsCmd from "../project/ToggleAutoInjectMetrics";
import Log from "../../Logger";
import toggleAutoBuildCmd from "../project/ToggleAutoBuildCmd";
import toggleEnablementCmd from "../project/ToggleEnablementCmd";
import requestBuildCmd from "../project/RequestBuildCmd";
import { removeProject } from "../project/RemoveProjectCmd";
import { getProjectOverviewHtml } from "./pages/ProjectOverviewPage";

export enum ProjectOverviewWVMessages {
    BUILD = "build",
    TOGGLE_AUTOBUILD = "toggleAutoBuild",
    OPEN = "open",
    UNBIND = "unbind",
    TOGGLE_ENABLEMENT = "toggleEnablement",
    EDIT = "edit",
    TOGGLE_INJECT_METRICS = "toggleInjectMetrics",
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
        switch (msg.type as ProjectOverviewWVMessages) {
            case ProjectOverviewWVMessages.OPEN: {
                WebviewUtil.onRequestOpen(msg);
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
                removeProject(this.project);
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
            default: {
                Log.e("Received unknown event from project info webview:", msg);
            }
        }
    }
}
