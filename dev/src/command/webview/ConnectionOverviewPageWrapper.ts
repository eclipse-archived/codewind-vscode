

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

import Log from "../../Logger";
import MCUtil from "../../MCUtil";
import RemoteConnection from "../../codewind/connection/RemoteConnection";
import { ThemelessImages } from "../../constants/CWImages";
import getConnectionInfoHtml from "./pages/ConnectionOverviewPage";
import WebviewUtil from "./WebviewUtil";
import ConnectionManager from "../../codewind/connection/ConnectionManager";
import removeConnectionCmd from "../connection/RemoveConnectionCmd";
import toggleConnectionEnablementCmd from "../connection/ToggleConnectionEnablement";
import manageRegistriesCmd from "../connection/ManageRegistriesCmd";
import manageSourcesCmd from "../connection/ManageSourcesCmd";
import { WebviewWrapper, WebviewResourceProvider } from "./WebviewWrapper";
import Requester from "../../codewind/Requester";

export enum ConnectionOverviewWVMessages {
    HELP = "help",
    SAVE_CONNECTION_INFO = "save-connection",
    TOGGLE_CONNECTED = "toggleConnected",
    TOGGLE_STARTED = "toggleStarted",
    TOGGLE_FINISHED = "toggleFinished",
    DELETE = "delete",
    CANCEL = "cancel",
    REGISTRY = "registry",
    SOURCES = "sources"
}

/**
 * The editable textfields in the Connection (left half) part of the overview
 */
interface ConnectionInfoFields {
    readonly url?: string;
    readonly username?: string;
    readonly password?: string;
}

export default class ConnectionOverviewWrapper extends WebviewWrapper {
    /**
     * The Connection we are showing the info for. If it's undefined, we are creating a new connection.
     */
    private connection: RemoteConnection | undefined;

    public static showForNewConnection(label: string, openToSide: boolean): ConnectionOverviewWrapper {
        return new ConnectionOverviewWrapper(label, openToSide);
    }

    public static showForExistingConnection(connection: RemoteConnection): ConnectionOverviewWrapper {
        if (connection.overviewPage) {
            connection.overviewPage.reveal();
            return connection.overviewPage;
        }
        return new ConnectionOverviewWrapper(connection.label, false, connection);
    }

    /////

    private constructor(
        private readonly label: string,
        openToSide: boolean,
        connection?: RemoteConnection,
    ) {
        super(label, ThemelessImages.Logo, true, openToSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active);
        this.connection = connection;
        if (connection) {
            connection.onDidOpenOverview(this);
        }
        this.refresh();
    }

    protected getTitle(): string {
        return this.label;
    }

    protected async generateHtml(resourceProvider: WebviewResourceProvider): Promise<string> {
        return getConnectionInfoHtml(resourceProvider, this.label, this.connection);
    }

    protected onDidDispose(): void {
        this.connection?.onDidCloseOverview();
    }

    protected readonly handleWebviewMessage = async (msg: WebviewUtil.IWVMessage): Promise<void> => {
        switch (msg.type) {
            case ConnectionOverviewWVMessages.HELP: {
                vscode.window.showInformationMessage("Help about this page");
                break;
            }
            case ConnectionOverviewWVMessages.SAVE_CONNECTION_INFO: {
                const newInfo: ConnectionInfoFields = msg.data;
                if (this.connection) {
                    if (!newInfo.username) {
                        vscode.window.showErrorMessage(`Enter a username`);
                    }
                    else if (!newInfo.password) {
                        vscode.window.showErrorMessage(`Enter a password`);
                    }
                    else {
                        try {
                            await this.connection.updateCredentials(newInfo.username, newInfo.password);
                        }
                        catch (err) {
                            const errMsg = `Error updating ${this.connection.label}:`;
                            vscode.window.showErrorMessage(`${errMsg} ${MCUtil.errToString(err)}`);
                            Log.e(errMsg, err);
                        }
                        this.refresh();
                    }
                }
                else {
                    try {
                        const newConnection = await this.createNewConnection(newInfo, this.label);
                        this.connection = newConnection;
                        this.connection.onDidOpenOverview(this);
                        vscode.window.showInformationMessage(`Successfully created new connection ${this.label} to ${newConnection.url}`);
                        this.refresh();
                    }
                    catch (err) {
                        // the err from createNewConnection is user-friendly
                        Log.w(`Error creating new connection to ${newInfo.url}`, err);
                        vscode.window.showErrorMessage(`${MCUtil.errToString(err)}`);
                    }
                }
                break;
            }
            case ConnectionOverviewWVMessages.TOGGLE_CONNECTED: {
                if (this.connection) {
                    await toggleConnectionEnablementCmd(this.connection, !this.connection.enabled);
                }
                else {
                    Log.e("Received Toggle Connected event but there is no connection");
                }
                break;
            }
            case ConnectionOverviewWVMessages.CANCEL: {
                if (this.connection) {
                    this.refresh();
                } else {
                    this.dispose();
                }
                break;
            }
            case ConnectionOverviewWVMessages.DELETE: {
                if (this.connection) {
                    const didRemove = await removeConnectionCmd(this.connection);
                    if (didRemove) {
                        this.dispose();
                    }
                }
                else {
                    vscode.window.showInformationMessage(`Creating new connection cancelled`);
                }
                break;
            }

            case ConnectionOverviewWVMessages.REGISTRY: {
                if (this.connection) {
                    manageRegistriesCmd(this.connection);
                } else {
                    vscode.window.showInformationMessage("Create your new connection by pressing Save before proceeding to the next step.");
                }
                break;
            }

            case ConnectionOverviewWVMessages.SOURCES: {
                if (this.connection) {
                    manageSourcesCmd(this.connection);
                } else {
                    vscode.window.showInformationMessage("Create your new connection by pressing Save before proceeding to the next step.");
                }
                break;
            }
            default:
                Log.e("Received unexpected WebView message in Connection Overview page", msg);
        }
    }

    /**
     * Tries to create a new connection from the given info.
     * Returns the new Connection if it succeeds. Returns undefined if user cancels. Throws errors.
     */
    private async createNewConnection(newConnectionInfo: ConnectionInfoFields, label: string): Promise<RemoteConnection> {
        if (!newConnectionInfo.url) {
            throw new Error("Enter a Codewind Gatekeeper ingress host");
        }
        Log.d("Ingress host is", newConnectionInfo.url);

        let ingressUrlStr = newConnectionInfo.url.trim();
        if (!ingressUrlStr.includes("://")) {
            Log.d(`No protocol; assuming https`);
            ingressUrlStr = `https://${ingressUrlStr}`;
        }

        const ingressAsUrl = new URL(ingressUrlStr);
        if (!ingressAsUrl.protocol.startsWith("https")) {
            throw new Error(`Protocol must be https, or omitted.`);
        }

        if (!newConnectionInfo.username) {
            throw new Error(`Enter a username for ${ingressUrlStr}`);
        }
        else if (!newConnectionInfo.password) {
            throw new Error(`Enter a password for ${ingressUrlStr}`);
        }

        const ingressUrl = vscode.Uri.parse(ingressUrlStr);

        const username = newConnectionInfo.username;
        const password = newConnectionInfo.password;

        return vscode.window.withProgress({
            cancellable: false,
            location: vscode.ProgressLocation.Notification,
            title: `Creating ${label}...`,
        }, async () => {
            const canPing = await Requester.pingKube(ingressUrl, 5000);

            if (!canPing) {
                throw new Error(`Failed to contact ${ingressUrl}. Make sure this URL is reachable.`);
            }

            const newConnection = await ConnectionManager.instance.createRemoteConnection(ingressUrl, this.label, username, password);
            return newConnection;
        });
    }

    public onToggleStatusChanged(): void {
        const msg = this.connection?.isTogglingEnablement() ?
            ConnectionOverviewWVMessages.TOGGLE_STARTED :
            ConnectionOverviewWVMessages.TOGGLE_FINISHED;

        this.webPanel.webview.postMessage(msg);
    }
}
