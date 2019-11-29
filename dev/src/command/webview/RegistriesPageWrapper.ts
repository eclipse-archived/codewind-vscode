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

const REGISTRIES_PAGE_TITLE = "Container Registries";

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

        const title = REGISTRIES_PAGE_TITLE + ` (${connection.label})`;

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
                Log.e("Error processing message from registries webview", err);
                Log.e("Message was", msg);
            }
        });

        this.refresh();
    }

    public async refresh(): Promise<void> {
        this.registries = await Requester.getContainerRegistries(this.connection);

        const html = getManageRegistriesHtml(this.connection.label, this.registries, this.connection.isKubeConnection);
        WebviewUtil.debugWriteOutWebview(html, "manage-registries");
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
        try {
            switch (msg.type as ManageRegistriesWVMessages) {
                case ManageRegistriesWVMessages.ADD_NEW: {
                    vscode.window.showInformationMessage("Add New");
                    break;
                }
                case ManageRegistriesWVMessages.CHANGE_PUSH: {
                    const data = msg.data as ManageRegistriesMsgData;
                    const registry = this.lookupRegistry(data.fullAddress);
                    if (registry.isPushRegistry) {
                        // nothing to do
                        return;
                    }
                    vscode.window.showInformationMessage(`Change push registry to ${registry}`);
                    break;
                }
                case ManageRegistriesWVMessages.DELETE: {
                    const data = msg.data as ManageRegistriesMsgData;
                    const registry = this.lookupRegistry(data.fullAddress);
                    vscode.window.showInformationMessage(`Delete ${registry}`);
                    break;
                }
                case ManageRegistriesWVMessages.HELP: {
                    vscode.window.showInformationMessage("Help");
                    break;
                }
                case ManageRegistriesWVMessages.REFRESH: {
                    await this.refresh();
                    break;
                }
                default: {
                    Log.e("Received unknown event from manage templates webview:", msg);
                }
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Error performing action ${msg.type}: ${MCUtil.errToString(err)}`);
            Log.e("Error processing message from manage registries webview", err);
            Log.e("Message was", msg);
        }
    }
}

// tslint:disable-next-line: max-classes-per-file
export class ContainerRegistry {
    public readonly fullAddress: string;
    public readonly namespace: string;

    constructor(
        public readonly address: string,
        namespace: string | undefined,
        public readonly username: string,
        public readonly isPushRegistry: boolean,
    ) {
        if (isPushRegistry && !namespace) {
            Log.e(`${this} is a push registry without a namespace`);
        }

        this.namespace = namespace || "";
        this.fullAddress = `${address}/${this.namespace}`;
    }

    public toString(): string {
        return `${this.username}@${this.fullAddress}`;
    }
}
