

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
import * as fs from "fs";

import RemoteConnection from "../../codewind/connection/RemoteConnection";
import Resources from "../../constants/Resources";
import getConnectionInfoPage from "./ConnectionOverviewPage";
import Constants from "../../constants/Constants";
import Log from "../../Logger";
import WebviewUtil from "./WebviewUtil";
import ConnectionManager from "../../codewind/connection/ConnectionManager";
import MCUtil from "../../MCUtil";
import { URL } from "url";
import Requester from "../../codewind/project/Requester";
import removeConnectionCmd from "../connection/RemoveConnectionCmd";

export enum ConnectionOverviewWVMessages {
    HELP = "help",
    SAVE_CONNECTION_INFO = "save-connection",
    SAVE_REGISTRY = "save-registry",
    DELETE = "delete",
}

/**
 * The editable textfields in the Connection (left half) part of the overview
 */
interface ConnectionInfoFields {
    readonly url?: string;
    readonly username?: string;
    readonly password?: string;
}

/**
 * The editable textfields in the Container Registry (right half) part of the overview
 */
interface RegistryInfoFields {
    readonly registryUrl?: string;
    readonly registryUsername?: string;
    readonly registryPassword?: string;
}

export type ConnectionOverviewFields = { label: string } & ConnectionInfoFields & RegistryInfoFields;

export default class ConnectionOverview {

    private readonly label: string;
    /**
     * The Connection we are showing the info for. If it's undefined, we are creating a new connection.
     */
    private connection: RemoteConnection | undefined;
    private readonly webPanel: vscode.WebviewPanel;

    public static showForNewConnection(label: string): ConnectionOverview {
        return new ConnectionOverview({ label });
    }

    public static showForExistingConnection(connection: RemoteConnection): ConnectionOverview {
        if (connection.activeOverviewPage) {
            return connection.activeOverviewPage;
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
            this.connection.onOverviewOpened(this);
        }

        this.webPanel = vscode.window.createWebviewPanel(connectionInfo.label, connectionInfo.label, vscode.ViewColumn.Active, wvOptions);

        this.webPanel.reveal();
        this.webPanel.onDidDispose(() => {
            if (this.connection) {
                this.connection.onOverviewClosed();
            }
        });

        const icons = Resources.getIconPaths(Resources.Icons.Logo);
        this.webPanel.iconPath = {
            light: vscode.Uri.file(icons.light),
            dark:  vscode.Uri.file(icons.dark)
        };

        this.refresh(connectionInfo);
        this.webPanel.webview.onDidReceiveMessage(this.handleWebviewMessage);
    }

    public refresh(connectionInfo: ConnectionOverviewFields): void {
        const html = getConnectionInfoPage(connectionInfo);
        if (process.env[Constants.CW_ENV_VAR] === Constants.CW_ENV_DEV) {
            const htmlWithFileProto = html.replace(/vscode-resource:\//g, "file:///");
            fs.writeFile("/Users/laven.s@ibm.com/desktop/connectionOverview.html", htmlWithFileProto,
                (err) => { if (err) { Log.e("Error writing out test connection overview", err); } }
            );
        }
        this.webPanel.webview.html = html;
    }

    public dispose(): void {
        if (this.webPanel) {
            this.webPanel.dispose();
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
                        vscode.window.showInformationMessage(`Updating info for ${this.connection.label} to ${JSON.stringify(newInfo)}`);
                        if (newInfo.url !== this.connection.memento.ingressUrl) {
                            vscode.window.showErrorMessage("Changing ingress is not allowed");
                        }
                        else if (!newInfo.username) {
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
                            const newConnection = await this.createNewConnection(newInfo);
                            this.connection = newConnection;
                            this.connection.onOverviewOpened(this);
                            vscode.window.showInformationMessage(`Successfully created new connection "${this.label}" to ${newInfo.url}`);
                            if (newInfo.registryUrl) {
                                await this.updateRegistry(newInfo, false);
                            }
                            this.refresh(this.connection.memento);
                        }
                        catch (err) {
                            // the err from createNewConnection is user-friendly
                            Log.w(`Error creating new connection to ${newInfo.url}`, err);
                            vscode.window.showErrorMessage(`${MCUtil.errToString(err)}`);
                        }
                    }
                    break;
                }
                case ConnectionOverviewWVMessages.SAVE_REGISTRY: {
                    const registryData = msg.data;
                    await this.updateRegistry(registryData, true);
                    break;
                }
                case ConnectionOverviewWVMessages.DELETE: {
                    if (this.connection) {
                        vscode.window.showInformationMessage(`Deleting connection ${this.connection.label}`);
                        removeConnectionCmd(this.connection);
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
    private async createNewConnection(newConnectionInfo: ConnectionInfoFields): Promise<RemoteConnection> {
        if (!newConnectionInfo.url) {
            throw new Error("Enter a Codewind Gatekeeper ingress host");
        }
        Log.d("Ingress host is", newConnectionInfo.url);

        let ingressUrlStr = newConnectionInfo.url.trim();
        try {
            // tslint:disable-next-line: no-unused-expression
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

        await vscode.window.withProgress(({
            cancellable: true,
            location: vscode.ProgressLocation.Notification,
            title: `Connecting to ${ingressUrl}...`
        }), async (): Promise<void> => {

            const canPing = await Requester.ping(ingressUrl, 10000);

            if (!canPing) {
                throw new Error(`Failed to contact ${ingressUrl}. Make sure this URL is reachable.`);
            }

            // Auth check? Version check?
        });

        const username = newConnectionInfo.username;
        const password = newConnectionInfo.password;

        return vscode.window.withProgress({
            cancellable: false,
            location: vscode.ProgressLocation.Notification,
            title: `Creating new connection...`,
        }, async () => {
            const newConnection = await ConnectionManager.instance.createRemoteConnection(ingressUrl, this.label, username, password);
            return newConnection;
        });
    }

    private async updateRegistry(registryInfo: RegistryInfoFields, isUpdate: boolean): Promise<void> {
        if (!this.connection) {
            Log.e("Requested to update registry but connection is undefined");
            return;
        }

        if (!registryInfo.registryUrl) {
            vscode.window.showErrorMessage(`Enter a container registry URL`);
            return;
        }
        else if (!registryInfo.registryUsername) {
            vscode.window.showErrorMessage(`Enter a container registry username`);
            return;
        }
        else if (!registryInfo.registryPassword) {
            vscode.window.showErrorMessage(`Enter a container registry password`);
            return;
        }
        await this.connection.updateRegistry(
            registryInfo.registryUrl, registryInfo.registryUsername, registryInfo.registryPassword
        );
        this.refresh(this.connection.memento);

        if (isUpdate) {
            vscode.window.showInformationMessage(
                `Updating registry info for ${this.connection.label} to ${JSON.stringify(registryInfo)}`
            );
        }
    }

}
