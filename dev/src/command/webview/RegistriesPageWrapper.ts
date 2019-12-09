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

import Connection from "../../codewind/connection/Connection";
import Resources from "../../constants/Resources";
import WebviewUtil from "./WebviewUtil";
import Log from "../../Logger";
import getManageRegistriesHtml from "./pages/RegistriesPage";
import Requester from "../../codewind/project/Requester";
import MCUtil from "../../MCUtil";
import RegistryUtils, { ContainerRegistry } from "../../codewind/connection/RegistryUtils";

export enum ManageRegistriesWVMessages {
    ADD_NEW = "add-new",
    DELETE = "delete",
    // EDIT = "edit",
    CHANGE_PUSH = "change-push",
    HELP = "help",
    REFRESH = "refresh",
}

interface ManageRegistriesMsgData {
    readonly fullAddress: string;
}

const REGISTRIES_PAGE_TITLE = "Image Registries";

export class ManageRegistriesPageWrapper {

    private readonly registriesPage: vscode.WebviewPanel;

    private registries: ContainerRegistry[] = [];

    constructor(
        private readonly connection: Connection
    ) {
        const wvOptions: vscode.WebviewOptions & vscode.WebviewPanelOptions = {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.file(Resources.getBaseResourcePath())]
        };

        let title = REGISTRIES_PAGE_TITLE;
        if (!global.isTheia) {
            title += ` (${connection.label})`;
        }

        this.registriesPage = vscode.window.createWebviewPanel(
            title,
            title,
            vscode.ViewColumn.Active,
            wvOptions
        );

        this.registriesPage.reveal();
        this.registriesPage.onDidDispose(() => {
            connection.onDidCloseRegistriesPage();
        });

        const icons = Resources.getIconPaths(Resources.Icons.Logo);
        this.registriesPage.iconPath = {
            light: vscode.Uri.file(icons.light),
            dark:  vscode.Uri.file(icons.dark)
        };

        this.registriesPage.webview.onDidReceiveMessage((msg: WebviewUtil.IWVMessage) => {
            try {
                this.handleWebviewMessage(msg);
            }
            catch (err) {
                vscode.window.showErrorMessage(`Error running action ${msg.type}: ${MCUtil.errToString(err)}`);
                Log.e("Error processing message from registries webview", err);
                Log.e("Message was", msg);
            }
        });

        this.refresh();
    }

    public async refresh(): Promise<void> {
        try {
            this.registries = await Requester.getImageRegistries(this.connection);
        }
        catch (err) {
            const errMsg = `Error getting image registries for ${this.connection.label}`;
            Log.e(errMsg, err);
            vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
        }

        const html = getManageRegistriesHtml(this.connection.label, this.registries, this.connection.isKubeConnection);
        WebviewUtil.debugWriteOutWebview(html, "manage-registries");
        // Setting the html to "" seems to clear the page state, otherwise there is some caching done
        // which causes eg. the selected radiobutton to not be updated https://github.com/eclipse/codewind/issues/1413
        this.registriesPage.webview.html = "";
        this.registriesPage.webview.html = html;
    }

    public reveal(): void {
        this.registriesPage.reveal();
    }

    private lookupRegistry(fullAddress: string): ContainerRegistry {
        const matchingRegistry = this.registries.find((registry) => registry.fullAddress === fullAddress);
        if (!matchingRegistry) {
            Log.e(`No matching registry found, expected to find fullAddress ${fullAddress}, registries are:`, this.registries);
            throw new Error(`No registry was found with full address "${fullAddress}"`);
        }
        return matchingRegistry;
    }

    private readonly handleWebviewMessage = async (msg: WebviewUtil.IWVMessage): Promise<void> => {
        switch (msg.type as ManageRegistriesWVMessages) {
            case ManageRegistriesWVMessages.ADD_NEW: {
                try {
                    await RegistryUtils.addNewRegistry(this.connection, this.registries);
                }
                catch (err) {
                    const errMsg = `Failed to add new image registry`;
                    Log.e(errMsg, err);
                    vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
                }

                await this.refresh();
                break;
            }
            case ManageRegistriesWVMessages.CHANGE_PUSH: {
                const data = msg.data as ManageRegistriesMsgData;
                const pushRegistryToSet = this.lookupRegistry(data.fullAddress);
                if (pushRegistryToSet.isPushRegistry) {
                    // shouldn't happen, but nothing to do in this case
                    return;
                }

                try {
                    const updatedPushRegistry = await RegistryUtils.setPushRegistry(this.connection, pushRegistryToSet, true);
                    if (updatedPushRegistry) {
                        vscode.window.showInformationMessage(`Successfully changed push registry to ${updatedPushRegistry.fullAddress}`);
                    }
                }
                catch (err) {
                    const errMsg = `Failed to update push registry to ${pushRegistryToSet.fullAddress}`;
                    Log.e(errMsg, err);
                    vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
                }

                await this.refresh();
                // this.registriesPage.webview.postMessage({ command: ManageRegistriesWVMessages.CHANGE_PUSH, fullAddress: );
                break;
            }
            case ManageRegistriesWVMessages.DELETE: {
                const data = msg.data as ManageRegistriesMsgData;
                const registry = this.lookupRegistry(data.fullAddress);

                if (registry.isPushRegistry) {
                    const continueBtn = "Remove Anyway";
                    const confirm = await vscode.window.showWarningMessage(
                        `${registry.fullAddress} is currently set as your image push registry. \n` +
                        `Removing it will cause Codewind-style project builds to fail until a new image push registry is selected.`,
                        { modal: true },
                        continueBtn
                    );
                    if (confirm !== continueBtn) {
                        return;
                    }
                }

                try {
                    await Requester.removeRegistrySecret(this.connection, registry);
                }
                catch (err) {
                    const errMsg = `Failed to remove registry ${registry.fullAddress}`;
                    Log.e(errMsg, err);
                    vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
                }

                await this.refresh();
                break;
            }
            case ManageRegistriesWVMessages.HELP: {
                vscode.window.showInformationMessage("Help");
                break;
            }
            case ManageRegistriesWVMessages.REFRESH: {
                await this.refresh();
                vscode.window.showInformationMessage(`Refreshed Image Registries`);
                break;
            }
            default: {
                Log.e("Received unknown event from manage templates webview:", msg);
            }
        }
    }
}
