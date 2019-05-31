/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import * as ProjectOverview from "../microclimate/project/ProjectOverviewPage";
import Log from "../Logger";
import Commands from "../constants/Commands";
import toggleAutoBuildCmd from "./ToggleAutoBuildCmd";
import toggleEnablementCmd from "./ToggleEnablementCmd";
import requestBuildCmd from "./RequestBuildCmd";
import Resources from "../constants/Resources";
import MiscProjectActions from "../microclimate/project/MiscProjectActions";

export default async function projectOverviewCmd(project: Project): Promise<void> {
    // Log.d("projectOverviewCmd invoked");
    if (project == null) {
        const selected = await promptForProject();
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    const wvOptions: vscode.WebviewOptions & vscode.WebviewPanelOptions = {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(Resources.getBaseResourcePath())]
    };

    const webPanel = vscode.window.createWebviewPanel(project.name, project.name, vscode.ViewColumn.Active, wvOptions);

    const existingPI = project.onOpenProjectInfo(webPanel);
    if (existingPI != null) {
        // Just focus them on the existing one, and do nothing more.
        existingPI.reveal();
        webPanel.dispose();
        return;
    }

    webPanel.reveal();
    webPanel.onDidDispose( () => {
        // this will dispose the webview a second time, but that seems to be fine
        project.closeProjectInfo();
    });

    const icons = project.type.icon;
    webPanel.iconPath = {
        light: vscode.Uri.file(icons.light),
        dark:  vscode.Uri.file(icons.dark)
    };

    // const ed = vscode.window.activeTextEditor;
    webPanel.webview.html = ProjectOverview.generateHtml(project);
    webPanel.webview.onDidReceiveMessage(handleWebviewMessage.bind(project));
}

interface IWebViewMsg {
    type: string;
    data: {
        type: string;
        value: string;
    };
}

function handleWebviewMessage(this: Project, msg: IWebViewMsg): void {
    const project = this;
    // Log.d(`Got message from ProjectInfo for project ${project.name}: ${msg.type} data ${JSON.stringify(msg.data)}`);
    try {
        switch (msg.type) {
            case ProjectOverview.Messages.OPEN: {
                onRequestOpen(msg);
                break;
            }
            case ProjectOverview.Messages.TOGGLE_AUTOBUILD: {
                toggleAutoBuildCmd(project);
                break;
            }
            case ProjectOverview.Messages.TOGGLE_ENABLEMENT: {
                toggleEnablementCmd(project, !project.state.isEnabled);
                break;
            }
            case ProjectOverview.Messages.BUILD: {
                requestBuildCmd(project);
                break;
            }
            case ProjectOverview.Messages.UNBIND: {
                MiscProjectActions.unbind(project);
                break;
            }
            case ProjectOverview.Messages.EDIT: {
                MiscProjectActions.editSetting(msg.data.type as ProjectOverview.Editable, project);
                break;
            }
            default: {
                Log.e("Received unknown event from project info webview:", msg);
            }
        }
    }
    catch (err) {
        Log.e("Error processing msg from WebView", err);
    }
}

async function onRequestOpen(msg: IWebViewMsg): Promise<void> {
    Log.d("Got msg to open, data is ", msg.data);
    let uri: vscode.Uri;
    if (msg.data.type === ProjectOverview.Openable.FILE || msg.data.type === ProjectOverview.Openable.FOLDER) {
        uri = vscode.Uri.file(msg.data.value);
    }
    else {
        // default to web
        uri = vscode.Uri.parse(msg.data.value);
    }

    Log.i("The uri is:", uri);
    const cmd: string = msg.data.type === ProjectOverview.Openable.FOLDER ? Commands.VSC_REVEAL_IN_OS : Commands.VSC_OPEN;
    vscode.commands.executeCommand(cmd, uri);
}
