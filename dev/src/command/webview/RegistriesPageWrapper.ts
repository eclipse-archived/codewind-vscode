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
import WebviewUtil, { CommonWVMessages } from "./WebviewUtil";
import Log from "../../Logger";
import getManageRegistriesHtml from "./pages/RegistriesPage";
import Requester from "../../codewind/project/Requester";
import MCUtil from "../../MCUtil";
import RegistryUtils, { ContainerRegistry } from "../../codewind/connection/RegistryUtils";
import CWDocs from "../../constants/CWDocs";
import Commands from "../../constants/Commands";
import { WebviewWrapper, WebviewResourceProvider } from "./WebviewWrapper";
import remoteConnectionOverviewCmd from "../connection/ConnectionOverviewCmd";

export enum ManageRegistriesWVMessages {
    // EDIT = "edit",
    CHANGE_PUSH = "change-push",
}

interface ManageRegistriesMsgData {
    readonly fullAddress: string;
}

function getTitle(connectionLabel: string): string {
    let title = "Image Registries";
    if (!global.isTheia) {
        title += ` (${connectionLabel})`;
    }
    return title;
}

export class RegistriesPageWrapper extends WebviewWrapper {

    private registries: ContainerRegistry[] = [];

    constructor(
        private readonly connection: Connection
    ) {
        super(getTitle(connection.label), Resources.Icons.Logo);
        connection.onDidOpenRegistriesPage(this);
        this.refresh();
    }

    protected async generateHtml(resourceProvider: WebviewResourceProvider): Promise<string> {
        this.registries = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: `Fetching image registries...`,
        }, async () => {
            return Requester.getImageRegistries(this.connection);
        });

        const html = getManageRegistriesHtml(resourceProvider, this.connection.label, this.registries, this.connection.isKubeConnection);
        return html;
    }

    protected onDidDispose(): void {
        this.connection.onDidCloseRegistriesPage();
    }

    protected readonly handleWebviewMessage = async (msg: WebviewUtil.IWVMessage): Promise<void> => {
        switch (msg.type as (ManageRegistriesWVMessages | CommonWVMessages)) {
            case ManageRegistriesWVMessages.CHANGE_PUSH: {
                const data = msg.data as ManageRegistriesMsgData;
                const pushRegistryToSet = this.lookupRegistry(data.fullAddress);
                if (pushRegistryToSet.isPushRegistry) {
                    // shouldn't happen, but nothing to do in this case
                    return;
                }

                try {
                    const currentPushRegistry = this.registries.find((reg) => reg.isPushRegistry);
                    const updatedPushRegistry = await RegistryUtils.setPushRegistry(this.connection, currentPushRegistry, pushRegistryToSet, true);
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
            case CommonWVMessages.ADD_NEW: {
                try {
                    const added = await RegistryUtils.addNewRegistry(this.connection, this.registries);
                    if (!added) {
                        Log.d(`User cancelled added new image registry`);
                        return;
                    }
                }
                catch (err) {
                    const errMsg = `Failed to add new image registry`;
                    Log.e(errMsg, err);
                    vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
                }

                await this.refresh();
                break;
            }
            case CommonWVMessages.DELETE: {
                const data = msg.data as ManageRegistriesMsgData;
                const registry = this.lookupRegistry(data.fullAddress);

                if (registry.isPushRegistry) {
                    const confirmBtn = "Remove Anyway";
                    const confirmRes = await vscode.window.showWarningMessage(
                        `${registry.fullAddress} is currently set as your image push registry. \n` +
                        `Removing it will cause Codewind-style project builds to fail until a new image push registry is selected.`,
                        { modal: true },
                        confirmBtn
                    );
                    if (confirmRes !== confirmBtn) {
                        return;
                    }
                }
                else {
                    const confirmBtn = "Remove";
                    const confirmRes = await vscode.window.showWarningMessage(
                        `Are you sure you want to remove ${registry.fullAddress}?`,
                        { modal: true },
                        confirmBtn
                    );
                    if (confirmRes !== confirmBtn) {
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
            case CommonWVMessages.HELP: {
                vscode.commands.executeCommand(Commands.VSC_OPEN, CWDocs.getDocLink(CWDocs.REGISTRIES));
                break;
            }
            case CommonWVMessages.REFRESH: {
                await this.refresh();
                break;
            }
            case CommonWVMessages.OPEN_CONNECTION: {
                remoteConnectionOverviewCmd(this.connection);
                break;
            }
            default: {
                Log.e("Received unknown event from manage templates webview:", msg);
            }
        }
    }

    private lookupRegistry(fullAddress: string): ContainerRegistry {
        const matchingRegistry = this.registries.find((registry) => registry.fullAddress === fullAddress);
        if (!matchingRegistry) {
            Log.e(`No matching registry found, expected to find fullAddress ${fullAddress}, registries are:`, this.registries);
            throw new Error(`No registry was found with full address "${fullAddress}"`);
        }
        return matchingRegistry;
    }
}
