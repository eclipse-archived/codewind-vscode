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
import { HAS_SELECTED_SOURCE_KEY } from "../connection/CreateUserProjectCmd";
import TemplateSourceWizard from "../../codewind/connection/TemplateSourceWizard";

export enum ManageSourcesWVMessages {
    ENABLE_DISABLE = "enableOrDisable",
    // EDIT = "edit",
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

        const extState = CWExtensionContext.get().globalState;
        const hasSelectedSource = extState.get(HAS_SELECTED_SOURCE_KEY) as boolean;
        if (!hasSelectedSource) {
            extState.update(HAS_SELECTED_SOURCE_KEY, true);
        }

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
        Log.d("Adding new source to " + this.connection);
        const newSource = await TemplateSourceWizard.startWizard();
        if (!newSource) {
            // cancelled
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: `Adding ${newSource.name}...`
        }, async () => {
            try {
                await this.connection.templateSourcesList.add(newSource);
                await this.refresh();
            }
            catch (err) {
                vscode.window.showErrorMessage(`Error adding ${newSource.name}: ${MCUtil.errToString(err)}`);
                Log.e(`Error adding new template repo ${newSource.url}`, err);
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
