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
import { URL } from "url";

import Connection from "../../codewind/connection/Connection";
import { ThemelessImages } from "../../constants/CWImages";
import WebviewUtil, { CommonWVMessages } from "./WebviewUtil";
import Log from "../../Logger";
import MCUtil from "../../MCUtil";
import CWDocs from "../../constants/CWDocs";
import { WebviewWrapper, WebviewResourceProvider } from "./WebviewWrapper";
import getManageSourcesPage from "./pages/SourcesPage";
import remoteConnectionOverviewCmd from "../connection/ConnectionOverviewCmd";
import { SourceEnablement, TemplateSource } from "../../codewind/Types";
import CWExtensionContext from "../../CWExtensionContext";

export enum ManageSourcesWVMessages {
    ENABLE_DISABLE = "enableOrDisable",
}

const SOURCES_PAGE_TITLE = "Template Source Manager";

function getTitle(connection: Connection): string {
    let title = SOURCES_PAGE_TITLE;
    if (!CWExtensionContext.get().isChe) {
        title += ` (${connection.label})`;
    }
    return title;
}

export class SourcesPageWrapper extends WebviewWrapper {

    constructor(
        private readonly connection: Connection,
    ) {
        super(getTitle(connection), ThemelessImages.Logo);
        connection.onDidOpenSourcesPage(this);
        this.refresh();
    }

    protected async generateHtml(resourceProvider: WebviewResourceProvider): Promise<string> {
        const sources = await this.connection.templateSourcesList.get(true);
        return getManageSourcesPage(resourceProvider, this.connection.label, this.connection.isRemote, sources);
    }

    protected onDidDispose(): void {
        this.connection.onDidCloseSourcesPage();
    }

    protected readonly handleWebviewMessage = async (msg: WebviewUtil.IWVMessage): Promise<void> => {
        switch (msg.type as (ManageSourcesWVMessages | CommonWVMessages)) {
            case ManageSourcesWVMessages.ENABLE_DISABLE: {
                const enablement = msg.data as SourceEnablement;
                await this.enableDisable(enablement);
                break;
            }
            case CommonWVMessages.ADD_NEW: {
                await this.addNew();
                break;
            }
            case CommonWVMessages.DELETE: {
                const sourceUrl = msg.data as string;
                const sourceToDelete = (await this.connection.templateSourcesList.get()).find((source) => source.url === sourceUrl);
                if (sourceToDelete == null) {
                    Log.e(`Requested to delete source with url "${sourceUrl}" that was not found`);
                    vscode.window.showErrorMessage(`Could not find source at ${sourceUrl}`);
                    this.refresh();
                    return;
                }
                await this.removeSource(sourceToDelete);
                break;
            }
            case CommonWVMessages.HELP: {
                CWDocs.TEMPLATE_MANAGEMENT.open();
                break;
            }
            case CommonWVMessages.REFRESH: {
                // vscode.window.showInformationMessage("Refreshed repository list");
                await this.refresh();
                break;
            }
            case CommonWVMessages.OPEN_CONNECTION: {
                remoteConnectionOverviewCmd(this.connection);
                break;
            }
            case CommonWVMessages.OPEN_WEBLINK: {
                WebviewUtil.openWeblink(msg.data);
                break;
            }
            default: {
                Log.e("Received unknown event from manage templates webview:", msg);
            }
        }
    }

    private async enableDisable(enablement: SourceEnablement): Promise<void> {
        Log.i("Enable/Disable repos:", enablement);
        try {
            await this.connection.templateSourcesList.toggleEnablement(enablement);
        }
        catch (err) {
            // If any of the enablements fail, the checkboxes will be out of sync with the backend state, so refresh the page to reset
        }
        await this.refresh();
    }

    private async addNew(): Promise<void> {
        Log.d("Adding new repo to " + this.connection.url);
        const repoInfo = await promptForNewRepo();
        if (!repoInfo) {
            // cancelled
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: `Adding ${repoInfo.repoName}...`
        }, async () => {
            try {
                await this.connection.templateSourcesList.add(repoInfo.repoUrl, repoInfo.repoName, repoInfo.repoDescr);
                await this.refresh();
            }
            catch (err) {
                vscode.window.showErrorMessage(`Error adding ${repoInfo.repoName}: ${MCUtil.errToString(err)}`);
                Log.e(`Error adding new template repo ${JSON.stringify(repoInfo)}`, err);
            }
        });
    }

    private async removeSource(sourceToRemove: TemplateSource): Promise<void> {
        Log.d(`Delete source ${sourceToRemove.name} from ${this.connection.url}`);

        const yesBtn = "Yes";
        const res = await vscode.window.showWarningMessage(
            `Are you sure you wish to remove ${sourceToRemove.name}?`,
            { modal: true }, yesBtn
        );

        if (res !== yesBtn) {
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: `Removing ${sourceToRemove.name}...`
        }, async () => {
            try {
                await this.connection.templateSourcesList.remove(sourceToRemove.url);
                await this.refresh();
            }
            catch (err) {
                vscode.window.showErrorMessage(`Error deleting template source ${sourceToRemove.name}: ${MCUtil.errToString(err)}`, err);
                Log.e(`Error removing template repo ${sourceToRemove.name}`, err);
            }
        });
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
