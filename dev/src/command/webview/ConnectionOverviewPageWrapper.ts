

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

import RemoteConnection from "../../codewind/connection/RemoteConnection";
import Resources from "../../constants/Resources";
import getConnectionInfoHtml from "./pages/ConnectionOverviewPage";
import Log from "../../Logger";
import WebviewUtil from "./WebviewUtil";
import ConnectionManager from "../../codewind/connection/ConnectionManager";
import MCUtil from "../../MCUtil";
import { URL } from "url";
import Requester from "../../codewind/project/Requester";
import removeConnectionCmd from "../connection/RemoveConnectionCmd";
import toggleConnectionEnablementCmd from "../connection/ToggleConnectionEnablement";

export enum ConnectionOverviewWVMessages {
    HELP = "help",
    SAVE_CONNECTION_INFO = "save-connection",
    TOGGLE_CONNECTED = "toggleConnected",
    DELETE = "delete",
    CANCEL = "cancel"
}

/**
 * The editable textfields in the Connection (left half) part of the overview
 */
interface ConnectionInfoFields {
    readonly ingressUrl?: string;
    readonly username?: string;
    readonly password?: string;
}

export type ConnectionOverviewFields = { label: string } & ConnectionInfoFields;

export default class ConnectionOverview {

    private readonly label: string;
    /**
     * The Connection we are showing the info for. If it's undefined, we are creating a new connection.
     */
    private connection: RemoteConnection | undefined;
    private readonly connectionOverviewPage: vscode.WebviewPanel;

    public static showForNewConnection(label: string): ConnectionOverview {
        return new ConnectionOverview({ label });
    }

    public static showForExistingConnection(connection: RemoteConnection): ConnectionOverview {
        if (connection.overviewPage) {
            return connection.overviewPage;
        }
        return new ConnectionOverview(connection.memento, connection);
    }

    private constructor(
        connectionInfo: ConnectionOverviewFields,
        connection?: RemoteConnection,
    ) {
        this.label = connectionInfo.label;
        this.connection = connection;

        const wvOptions: vscode.WebviewOptions & vscode.WebviewPanelOptions = {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.file(Resources.getBaseResourcePath())]
        };

        if (this.connection) {
            this.connection.onDidOpenOverview(this);
        }

        this.connectionOverviewPage = vscode.window.createWebviewPanel(
            connectionInfo.label, connectionInfo.label, vscode.ViewColumn.Active, wvOptions
        );

        this.connectionOverviewPage.reveal();
        this.connectionOverviewPage.onDidDispose(() => {
            if (this.connection) {
                this.connection.onDidCloseOverview();
            }
        });

        const icons = Resources.getIconPaths(Resources.Icons.Logo);
        this.connectionOverviewPage.iconPath = {
            light: vscode.Uri.file(icons.light),
            dark:  vscode.Uri.file(icons.dark)
        };

        this.refresh(connectionInfo);
        this.connectionOverviewPage.webview.onDidReceiveMessage(this.handleWebviewMessage);
    }

    public refresh(connectionInfo: ConnectionOverviewFields): void {
        let isConnnected = false;
        if (this.connection) {
            isConnnected = this.connection.isConnected;
        }
        const html = getConnectionInfoHtml(connectionInfo, isConnnected);
        // MCUtil.debugWriteOutWebview(html, "connection-overview");
        this.connectionOverviewPage.webview.html = html;
    }

    public dispose(): void {
        if (this.connectionOverviewPage) {
            this.connectionOverviewPage.dispose();
        }
    }

    private readonly handleWebviewMessage = async (msg: WebviewUtil.IWVMessage): Promise<void> => {
        try {
            switch (msg.type) {
                case ConnectionOverviewWVMessages.HELP: {
                    vscode.window.showInformationMessage("Help about this page");
                    break;
                }
                case ConnectionOverviewWVMessages.SAVE_CONNECTION_INFO: {
                    const newInfo: ConnectionOverviewFields = msg.data;
                    if (this.connection) {
                        if (!newInfo.username) {
                            vscode.window.showErrorMessage(`Enter a username`);
                        }
                        else if (!newInfo.password) {
                            vscode.window.showErrorMessage(`Enter a password`);
                        }
                        else {
                            this.connection.updateCredentials(newInfo.username, newInfo.password);
                            this.refresh(this.connection.memento);
                        }
                    }
                    else {
                        try {
                            const newConnection = await this.createNewConnection(newInfo, this.label);
                            this.connection = newConnection;
                            this.connection.onDidOpenOverview(this);
                            vscode.window.showInformationMessage(`Successfully created new connection ${this.label} to ${newConnection.url}`);
                            this.refresh(this.connection.memento);
                        }
                        catch (err) {
                            // the err from createNewConnection is user-friendly
                            Log.w(`Error creating new connection to ${newInfo.ingressUrl}`, err);
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
                }
                case ConnectionOverviewWVMessages.CANCEL: {
                    if (this.connection) {
                        this.refresh(this.connection.memento);
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
                default:
                    Log.e("Received unexpected WebView message in Connection Overview page", msg);
            }
        }
        catch (err) {
            const errMsg = `Connection Overview error: ${MCUtil.errToString(err)}`;
            vscode.window.showErrorMessage(errMsg);
            Log.e(errMsg, err);
        }
    }

    /**
     * Tries to create a new connection from the given info.
     * Returns the new Connection if it succeeds. Returns undefined if user cancels. Throws errors.
     */
    private async createNewConnection(newConnectionInfo: ConnectionInfoFields, label: string): Promise<RemoteConnection> {
        if (!newConnectionInfo.ingressUrl) {
            throw new Error("Enter a Codewind Gatekeeper ingress host");
        }
        Log.d("Ingress host is", newConnectionInfo.ingressUrl);

        let ingressUrlStr = newConnectionInfo.ingressUrl.trim();
        try {
            if (!ingressUrlStr.includes("://")) {
                Log.d(`No protocol; assuming https`);
                ingressUrlStr = `https://${ingressUrlStr}`;
            }

            const ingressAsUrl = new URL(ingressUrlStr);
            if (!ingressAsUrl.protocol.startsWith("https")) {
                throw new Error(`Protocol must be https, or omitted.`);
            }
        }
        catch (err) {
            throw new Error(`"${ingressUrlStr}" is not a valid URL: ${MCUtil.errToString(err)}`);
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
            const canPing = await Requester.ping(ingressUrl);

            if (!canPing) {
                throw new Error(`Failed to contact ${ingressUrl}. Make sure this URL is reachable.`);
            }

            const newConnection = await ConnectionManager.instance.createRemoteConnection(ingressUrl, this.label, username, password);
            return newConnection;
        });
    }

}
