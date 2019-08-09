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

import Connection from "../../codewind/connection/Connection";
import Resources from "../../constants/Resources";
import generateManageReposHtml, { ManageReposWVMessages } from "../webview/ManageTemplateReposPage";
import WebviewUtil from "../webview/WebviewUtil";
import Log from "../../Logger";
import Requester from "../../codewind/project/Requester";
import MCUtil from "../../MCUtil";

/**
 * Template repository data as provided by the backend
 */
export interface IRawTemplateRepo {
    readonly url: string;
    readonly name: string;
    readonly description: string;
    readonly enabled: boolean;
}

// Only allow one of these for now - This should be moved to be per-connection like how overview is per-project.
let manageReposPage: vscode.WebviewPanel | undefined;

export default async function manageTemplateReposCmd(connection: Connection): Promise<void> {
    if (manageReposPage) {
        // Show existing page
        manageReposPage.reveal();
        return;
    }

    const wvOptions: vscode.WebviewOptions & vscode.WebviewPanelOptions = {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(Resources.getBaseResourcePath())]
    };

    const title = "Template Repository Preferences";

    manageReposPage = vscode.window.createWebviewPanel(
        title,
        title,
        vscode.ViewColumn.Active,
        wvOptions
    );

    manageReposPage.reveal();
    manageReposPage.onDidDispose(() => {
        manageReposPage = undefined;
    });

    const icons = Resources.getIconPaths(Resources.Icons.Logo);
    manageReposPage.iconPath = {
        light: vscode.Uri.file(icons.light),
        dark:  vscode.Uri.file(icons.dark)
    };

    refreshPage(connection);
    manageReposPage.webview.onDidReceiveMessage(handleWebviewMessage.bind(connection));
}

async function refreshPage(connection: Connection): Promise<void> {
    if (!manageReposPage) {
        Log.e("Refreshing manage repos page but it doesn't exist");
        return;
    }
    manageReposPage.webview.html = generateManageReposHtml(await fetchRepositoryList(connection));
}

async function handleWebviewMessage(this: Connection, msg: WebviewUtil.IWVMessage): Promise<void> {
    const connection = this;

    try {
        switch (msg.type) {
            case ManageReposWVMessages.ADD_NEW: {
                // connection.addNewRepo
                Log.d("Adding new repo to " + connection.url);
                const repoUrl = await promptForNewRepo();
                if (repoUrl == null) {
                    // cancelled
                    return;
                }

                try {
                    await Requester.manageTemplateRepos(connection, repoUrl, "add");
                    await refreshPage(connection);
                }
                catch (err) {
                    vscode.window.showErrorMessage(`Error adding new template repository ${repoUrl}: ${MCUtil.errToString(err)}`, err);
                    Log.e(`Error adding new template repo ${repoUrl}`, err);
                }
                break;
            }
            case ManageReposWVMessages.DELETE: {
                // connection.deleteRepo
                const repoUrl = msg.data.value;
                Log.d(`Delete repo ${repoUrl} from ${connection.url}`);
                try {
                    await Requester.manageTemplateRepos(connection, repoUrl, "delete");
                    await refreshPage(connection);
                }
                catch (err) {
                    vscode.window.showErrorMessage(`Error deleting template repository ${repoUrl}: ${MCUtil.errToString(err)}`, err);
                    Log.e(`Error removing template repo ${repoUrl}`, err);
                }
                break;
            }
            case ManageReposWVMessages.HELP: {
                vscode.window.showInformationMessage("More information about this page, or open a webpage, probably");
                break;
            }
            case ManageReposWVMessages.REFRESH: {
                vscode.window.showInformationMessage("Refreshed repository list");
                refreshPage(connection);
                break;
            }
            default: {
                Log.e("Received unknown event from manage templates webview:", msg);
            }
        }
    }
    catch (err) {
        Log.e("Error processing message from manage templates webview", err);
        Log.e("Message was", msg);
    }
}

async function fetchRepositoryList(_connection: Connection): Promise<IRawTemplateRepo[]> {
    // return Requester.get(EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.TEMPLATE_REPOS), { json: true });
    return [
        {
          url: "https://raw.githubusercontent.com/kabanero-io/codewind-templates/master/devfiles/index.json",
          name: "Standard Codewind",
          description: "Description of Codewind templates",
          enabled: true,
        },
        {
          url: "https://raw.githubusercontent.com/kabanero-io/codewind-appsody-templates/master/devfiles/index.json",
          name: "Standard Appsody",
          description: "Description of Appsody templates",
          enabled: false,
        },
        {
            url: "https://raw.githubusercontent.com/kabanero-io/codewind-appsody-templates/master/devfiles/index.json",
            name: "Custom Appsody with a really really really really long name",
            // tslint:disable-next-line: max-line-length
            description: "Architect's Appsody templates with a really really really really really really really really really really long description",
            enabled: true,
        }
    ];
}

async function promptForNewRepo(): Promise<string | undefined> {
    const input = vscode.window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: "https://raw.githubusercontent.com/kabanero-io/codewind-templates/master/devfiles/index.json",
        prompt: "Enter the URL to your template repository's index file.",
        validateInput: validateRepoInput,
    });

    return input;
}

function validateRepoInput(input: string): OptionalString {
    let asUri: vscode.Uri | undefined;
    try {
        asUri = vscode.Uri.parse(input);
    }
    catch (err) {
        // not a uri
    }
    if (!asUri || !asUri.authority || !(asUri.scheme === "http" || asUri.scheme === "https")) {
        return "The repository URL must be a valid http(s) URL.";
    }
    return undefined;
}
