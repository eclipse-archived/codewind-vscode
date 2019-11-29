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
import generateManageReposHtml from "./pages/SourcesPage";
import WebviewUtil from "./WebviewUtil";
import Log from "../../Logger";
import Requester from "../../codewind/project/Requester";
import MCUtil from "../../MCUtil";
import Commands from "../../constants/Commands";
import { CLICommandRunner } from "../../codewind/connection/CLICommandRunner";
import CWDocs from "../../constants/CWDocs";

/**
 * Template repository/source data as provided by the backend
 */
export interface ITemplateSource {
    readonly url: string;
    readonly name?: string;
    readonly description?: string;
    readonly enabled: boolean;
    readonly projectStyles: string[];
    readonly protected: boolean;
}

export enum ManageSourcesWVMessages {
    ADD_NEW = "add-new",
    DELETE = "delete",
    HELP = "help",
    REFRESH = "refresh",
    ENABLE_DISABLE = "enableOrDisable",
}

/**
 * 'data' field of ENABLE_DISABLE event, which can be converted to an enablement request.
 */
export interface ISourceEnablement {
    readonly repos: Array<{
        readonly repoID: string;
        readonly enable: boolean;
    }>;
}

const SOURCES_PAGE_TITLE = "Template Sources";

export class ManageSourcesPage {

    private readonly sourcesPage: vscode.WebviewPanel;

    constructor(
        private readonly connection: Connection,
    ) {
        const wvOptions: vscode.WebviewOptions & vscode.WebviewPanelOptions = {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.file(Resources.getBaseResourcePath())]
        };

        const title = SOURCES_PAGE_TITLE + ` (${connection.label})`;

        this.sourcesPage = vscode.window.createWebviewPanel(
            title,
            title,
            vscode.ViewColumn.Active,
            wvOptions
        );

        this.sourcesPage.reveal();
        this.sourcesPage.onDidDispose(() => {
            connection.onDidCloseSourcesPage();
        });

        const icons = Resources.getIconPaths(Resources.Icons.Logo);
        this.sourcesPage.iconPath = {
            light: vscode.Uri.file(icons.light),
            dark:  vscode.Uri.file(icons.dark)
        };

        this.sourcesPage.webview.onDidReceiveMessage((msg: WebviewUtil.IWVMessage) => {
            try {
                this.handleWebviewMessage(msg);
            }
            catch (err) {
                Log.e("Error processing message from manage templates webview", err);
                Log.e("Message was", msg);
            }
        });

        this.refresh();
    }

    public async refresh(): Promise<void> {
        const html = generateManageReposHtml(this.connection.label, await this.connection.getSources());
        WebviewUtil.debugWriteOutWebview(html, "sources-page");
        this.sourcesPage.webview.html = html;
    }

    public reveal(): void {
        this.sourcesPage.reveal();
    }

    private readonly handleWebviewMessage = async (msg: WebviewUtil.IWVMessage): Promise<void> => {
        switch (msg.type as ManageSourcesWVMessages) {
            case ManageSourcesWVMessages.ENABLE_DISABLE: {
                const enablement = msg.data as ISourceEnablement;
                await this.enableDisable(enablement);
                break;
            }
            case ManageSourcesWVMessages.ADD_NEW: {
                await this.addNew();
                break;
            }
            case ManageSourcesWVMessages.DELETE: {
                const sourceUrl = msg.data as string;
                await this.removeSource(sourceUrl);
                break;
            }
            case ManageSourcesWVMessages.HELP: {
                vscode.commands.executeCommand(Commands.VSC_OPEN, CWDocs.getDocLink(CWDocs.TEMPLATE_MANAGEMENT));
                break;
            }
            case ManageSourcesWVMessages.REFRESH: {
                // vscode.window.showInformationMessage("Refreshed repository list");
                await this.refresh();
                break;
            }
            default: {
                Log.e("Received unknown event from manage templates webview:", msg);
            }
        }
    }

    private async enableDisable(enablement: ISourceEnablement): Promise<void> {
        Log.i("Enable/Disable repos:", enablement);
        try {
            await Requester.enableTemplateRepos(this.connection, enablement);
        }
        catch (err) {
            // If any of the enablements fail, the checkboxes will be out of sync with the backend state, so refresh the page to reset
            await this.refresh();
        }
    }

    private async addNew(): Promise<void> {
        Log.d("Adding new repo to " + this.connection.url);
        const repoInfo = await promptForNewRepo();
        if (!repoInfo) {
            // cancelled
            return;
        }

        try {
            await CLICommandRunner.addTemplateSource(this.connection.id, repoInfo.repoUrl, repoInfo.repoName, repoInfo.repoDescr);
            await this.refresh();
        }
        catch (err) {
            vscode.window.showErrorMessage(`Error adding new template source: ${MCUtil.errToString(err)}`, err);
            Log.e(`Error adding new template repo ${JSON.stringify(repoInfo)}`, err);
        }
    }

    private async removeSource(sourceUrl: string): Promise<void> {
        Log.d(`Delete source ${sourceUrl} from ${this.connection.url}`);

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
            await CLICommandRunner.removeTemplateSource(this.connection.id, sourceUrl);
            await this.refresh();
        }
        catch (err) {
            vscode.window.showErrorMessage(`Error deleting template source ${sourceUrl}: ${MCUtil.errToString(err)}`, err);
            Log.e(`Error removing template repo ${sourceUrl}`, err);
        }
    }
}

async function promptForNewRepo(): Promise<{ repoUrl: string, repoName: string, repoDescr?: string } | undefined> {
    const repoUrl = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: `https://raw.githubusercontent.com/codewind-resources/codewind-templates/master/devfiles/index.json`,
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
    else if (!asUrl.protocol.startsWith("http")) {
        return "The repository URL must be a valid http(s) URL.";
    }
    return undefined;
}
