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
// import * as fs from "fs";
import { URL } from "url";

import Connection from "../../codewind/connection/Connection";
import Resources from "../../constants/Resources";
import generateManageReposHtml from "../webview/ManageTemplateReposPage";
import WebviewUtil from "../webview/WebviewUtil";
import Log from "../../Logger";
import Requester from "../../codewind/project/Requester";
import MCUtil from "../../MCUtil";
import Commands from "../../constants/Commands";
import { CWDocs } from "../../constants/Constants";

/**
 * Template repository/source data as provided by the backend
 */
export interface ITemplateRepo {
    readonly url: string;
    readonly name?: string;
    readonly description?: string;
    readonly enabled: boolean;
    readonly projectStyles: string[];
    readonly protected: boolean;
}

export enum ManageReposWVMessages {
    ADD_NEW = "add-new",
    DELETE = "delete",
    HELP = "help",
    REFRESH = "refresh",
    ENABLE_DISABLE = "enableOrDisable",
}

/**
 * 'data' field of ENABLE_DISABLE event, which can be converted to an enablement request.
 */
export interface IRepoEnablement {
    readonly repos: Array<{
        readonly repoID: string;
        readonly enable: boolean;
    }>;
}

const REPOS_PAGE_TITLE = "Template Sources";

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

    const title = REPOS_PAGE_TITLE;

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

    refreshManageReposPage(connection);
    manageReposPage.webview.onDidReceiveMessage(handleWebviewMessage.bind(connection));
}

export async function refreshManageReposPage(connection: Connection): Promise<void> {
    if (!manageReposPage) {
        return;
    }
    const html = generateManageReposHtml(await Requester.getTemplateSources(connection));

    // For debugging in the browser, write out the html to an html file on disk and point to the resources on disk
    // if (process.env[Constants.CW_ENV_VAR] === Constants.CW_ENV_DEV) {
    //     const htmlWithFileProto = html.replace(/vscode-resource:\//g, "file:///");
    //     fs.writeFile("/Users/tim/Desktop/manage.html", htmlWithFileProto,
    //         (err) => { if (err) { throw err; } }
    //     );
    // }
    manageReposPage.webview.html = html;
}

async function handleWebviewMessage(this: Connection, msg: WebviewUtil.IWVMessage): Promise<void> {
    const connection = this;

    try {
        switch (msg.type) {
            case ManageReposWVMessages.ENABLE_DISABLE: {
                const enablement = msg.data as IRepoEnablement;
                Log.i("Enable/Disable repos:", enablement);
                try {
                    await Requester.enableTemplateRepos(connection, enablement);
                }
                catch (err) {
                    // If any of the enablements fail, the checkboxes will be out of sync with the backend state, so refresh the page to reset
                    await refreshManageReposPage(connection);
                }
                break;
            }
            case ManageReposWVMessages.ADD_NEW: {
                // connection.addNewRepo
                Log.d("Adding new repo to " + connection.url);
                const repoInfo = await promptForNewRepo();
                if (!repoInfo) {
                    // cancelled
                    return;
                }

                try {
                    await Requester.addTemplateRepo(connection, repoInfo.repoUrl, repoInfo.repoName, repoInfo.repoDescr);
                    await refreshManageReposPage(connection);
                }
                catch (err) {
                    vscode.window.showErrorMessage(`Error adding new template source: ${MCUtil.errToString(err)}`, err);
                    Log.e(`Error adding new template repo ${JSON.stringify(repoInfo)}`, err);
                }
                break;
            }
            case ManageReposWVMessages.DELETE: {
                // connection.deleteRepo
                const repoUrl = msg.data as string;
                Log.d(`Delete repo ${repoUrl} from ${connection.url}`);

                const yesBtn = "Yes";
                // TODO add name?
                const res = await vscode.window.showWarningMessage(
                    `Are you sure you wish to delete this template repository?`,
                    { modal: true }, yesBtn
                );

                if (res !== yesBtn) {
                    return;
                }

                try {
                    await Requester.removeTemplateRepo(connection, repoUrl);
                    await refreshManageReposPage(connection);
                }
                catch (err) {
                    vscode.window.showErrorMessage(`Error deleting template source ${repoUrl}: ${MCUtil.errToString(err)}`, err);
                    Log.e(`Error removing template repo ${repoUrl}`, err);
                }
                break;
            }
            case ManageReposWVMessages.HELP: {
                vscode.commands.executeCommand(Commands.VSC_OPEN, CWDocs.getDocLink(CWDocs.TEMPLATE_MANAGEMENT));
                break;
            }
            case ManageReposWVMessages.REFRESH: {
                // vscode.window.showInformationMessage("Refreshed repository list");
                await refreshManageReposPage(connection);
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

async function promptForNewRepo(): Promise<{ repoUrl: string, repoName: string, repoDescr?: string } | undefined> {
    const repoUrl = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: `https://raw.githubusercontent.com/kabanero-io/codewind-templates/master/devfiles/index.json`,
        prompt: "Enter the URL to your template source's index file.",
        validateInput: validateRepoInput,
    });

    if (!repoUrl) {
        return undefined;
    }

    let repoName = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: "My Templates",
        prompt: `Enter a name for ${repoUrl}`,
    });
    if (!repoName) {
        return undefined;
    }
    repoName = repoName.trim();

    let repoDescr = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: "Description of My Templates",
        prompt: `(Optional) Enter a description for ${repoName}`,
    });
    if (repoDescr) {
        repoDescr = repoDescr.trim();
    }

    return { repoUrl, repoName, repoDescr };
}

function validateRepoInput(input: string): string | undefined {
    let asUrl: URL | undefined;
    try {
        // We use URL instead of vscode.Uri because the latter appears to throw errors irregularly.
        asUrl = new URL(input);
    }
    catch (err) {
        // not a url
    }

    if (!asUrl) {
        return "The repository URL must be a valid URL.";
    }
    else if (!(asUrl.protocol.startsWith("http") || asUrl.protocol.startsWith("file"))) {
        return "The repository URL must be a valid http(s) or file URL.";
    }
    return undefined;
}
