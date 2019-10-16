

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

import RemoteConnection, { IRemoteCodewindInfo } from "../../codewind/connection/RemoteConnection";
import Resources from "../../constants/Resources";
import getConnectionInfoPage from "./ConnectionOverviewPage";
import Constants from "../../constants/Constants";
import Log from "../../Logger";
import WebviewUtil from "./WebviewUtil";
import ConnectionManager from "../../codewind/connection/ConnectionManager";
import MCUtil from "../../MCUtil";
import { URL } from "url";
import Requester from "../../codewind/project/Requester";
import CWEnvironment, { CWEnvData } from "../../codewind/connection/CWEnvironment";
import { StatusCodeError } from "request-promise-native/errors";
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
interface IConnectionInfoFields {
    readonly ingressHost: string;
    readonly username?: string;
    readonly password?: string;
}

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
        return new ConnectionOverview(connection.getRemoteInfo(), connection);
    }

    private constructor(
        connectionInfo: IRemoteCodewindInfo,
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

    public refresh(connectionInfo: IRemoteCodewindInfo): void {
        const html = getConnectionInfoPage(connectionInfo);
        if (process.env[Constants.CW_ENV_VAR] === Constants.CW_ENV_DEV) {
            const htmlWithFileProto = html.replace(/vscode-resource:\//g, "file:///");
            fs.writeFile("/Users/tim/Desktop/connectionOverview.html", htmlWithFileProto,
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
                    const newInfo: IConnectionInfoFields = msg.data;
                    if (this.connection) {
                        vscode.window.showInformationMessage(`Updating info for ${this.connection.label} to ${JSON.stringify(newInfo)}`);
                        if (newInfo.ingressHost !== this.connection.getRemoteInfo().ingressHost) {
                            vscode.window.showWarningMessage("Changing ingress is not implemented, yet");
                        }
                        this.connection.username = newInfo.username;
                        // test auth w/ password
                        this.refresh(this.connection.getRemoteInfo());
                    }
                    else {
                        try {
                            const newConnection = await this.createNewConnection(newInfo);
                            this.connection = newConnection;
                            this.connection.onOverviewOpened(this);
                            vscode.window.showInformationMessage(`Successfully created new connection "${this.label}" to ${newInfo.ingressHost}`);
                            this.refresh(this.connection.getRemoteInfo());
                        }
                        catch (err) {
                            // the err from createNewConnection is user-friendly
                            Log.e(`Error creating new connection from info: ${JSON.stringify(newInfo)}`);
                            vscode.window.showErrorMessage(`Error creating new connection: ${MCUtil.errToString(err)}`);
                        }
                    }
                    break;
                }
                case ConnectionOverviewWVMessages.SAVE_REGISTRY: {
                    if (this.connection) {
                        const newRegistryInfo: { registryUrl: string; registryUsername: string; registryPassword: string } = msg.data;
                        vscode.window.showInformationMessage(
                            `Updating registry info for ${this.connection.label} to ${JSON.stringify(newRegistryInfo)}`
                        );
                        this.connection.registryUrl = newRegistryInfo.registryUrl;
                        this.connection.registryUsername = newRegistryInfo.registryUsername;
                        // test registry auth w/ password
                        this.refresh(this.connection.getRemoteInfo());
                    }
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
     * Throws user-friendly error message if it fails, or returns the new Connection if it succeeds.
     */
    private async createNewConnection(info: IConnectionInfoFields): Promise<RemoteConnection> {
        // TODO change to https
        const withProtocol = `http://${info.ingressHost}`;
        try {
            // tslint:disable-next-line: no-unused-expression
            new URL(withProtocol);
        }
        catch (err) {
            throw new Error(`"${info.ingressHost}" is not a valid host.`);
        }

        const ingressUrl = vscode.Uri.parse(withProtocol);
        const canPing = await Requester.ping(ingressUrl);
        if (!canPing) {
            throw new Error(`Failed to contact ${ingressUrl}. Make sure the URL is reachable.`);
        }

        let envData: CWEnvData | undefined;
        try {
            envData = await CWEnvironment.getEnvData(ingressUrl);
        }
        catch (err) {
            if (err instanceof StatusCodeError) {
                if (err.statusCode === 404) {
                    throw new Error(`Received 404 error; ${ingressUrl} does not appear to point to a Codewind instance.`);
                }
            }
            // Other errors to anticipate?
        }

        // Version check?

        return await ConnectionManager.instance.connectRemote(ingressUrl, { label: this.label, ...info }, envData);
    }

}
