/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import Connection from "./Connection";
import Log from "../../Logger";
import Project from "../project/Project";
import CodewindEventListener from "./CodewindEventListener";
import ConnectionMemento from "./ConnectionMemento";
import MCUtil from "../../MCUtil";
import RemoteConnection, { IRemoteCodewindInfo } from "./RemoteConnection";

export default class ConnectionManager implements vscode.Disposable {
    private static _instance: ConnectionManager;

    private readonly _connections: Connection[] = [];

    public static get instance(): ConnectionManager {
        return ConnectionManager._instance || (ConnectionManager._instance = new ConnectionManager());
    }

    public async activate(): Promise<void> {
        await Promise.all(
            ConnectionMemento.loadSavedConnections().map(async (connectionInfo) => {
                let connectionUrl: vscode.Uri;
                try {
                    if (!connectionInfo.ingressHost) {
                        throw new Error(`Cannot load connection ${connectionInfo.label} due to missing ingress host`);
                    }
                    connectionUrl = vscode.Uri.parse(RemoteConnection.REMOTE_CODEWIND_PROTOCOL + "://" + connectionInfo.ingressHost);
                }
                catch (err) {
                    // should never happen
                    Log.e("Bad connectionInfo", connectionInfo, err);
                    vscode.window.showErrorMessage(`Error reading connection info ${JSON.stringify(connectionInfo)}`);
                    return;
                }

                try {
                    await this.connectRemote(connectionUrl, { label: connectionInfo.label });
                }
                catch (err) {
                    const errMsg = `Error loading connection ${connectionInfo.label}. ${MCUtil.errToString(err)}`;
                    Log.e(errMsg, err);
                    const retryBtn = "Retry";
                    vscode.window.showErrorMessage(errMsg, retryBtn)
                    .then((res) => {
                        if (res === retryBtn) {
                            this.connectRemote(connectionUrl, { label: connectionInfo.label });
                        }
                    });
                }
            })
        );
    }

    public async dispose(): Promise<void> {
        await Promise.all([
            this.connections.map((conn) => conn.dispose()),
        ]);
    }

    public get connections(): Connection[] {
        return this._connections;
    }

    public get remoteConnections(): Connection[] {
        return this.connections.filter((conn) => conn.isRemote);
    }

    public async connectRemote(ingressUrl: vscode.Uri, remoteInfo: IRemoteCodewindInfo): Promise<RemoteConnection> {
        const existing = this.getExisting(ingressUrl);
        if (existing) {
            const alreadyExistsMsg = "Connection already exists at " + ingressUrl.toString();
            Log.i(alreadyExistsMsg);
            vscode.window.showWarningMessage(alreadyExistsMsg);
            return existing as RemoteConnection;
        }

        Log.i("Creating connection to " + ingressUrl);
        const newConnection = new RemoteConnection(ingressUrl, remoteInfo.label,
            remoteInfo.username, remoteInfo.registryUrl, remoteInfo.registryUsername);

        await this.saveNewConnection(newConnection);
        return newConnection;
    }

    public async connectLocal(url: vscode.Uri): Promise<Connection> {
        if (this.connections[0] && !this.connections[0].isRemote) {
            return this.connections[0];
        }
        Log.i("Creating connection to " + url);
        const newConnection = new Connection(url, "Local Codewind", false);
        await this.saveNewConnection(newConnection);
        return newConnection;
    }

    private async saveNewConnection(newConnection: Connection): Promise<void> {
        if (newConnection.isRemote) {
            this.connections.push(newConnection);
        }
        else {
            // the local connection should always be first.
            this.connections.unshift(newConnection);
        }
        ConnectionMemento.saveConnections(this.remoteConnections);
        Log.i("New Connection @ " + newConnection.url);

        await newConnection.initPromise;
        // pass undefined here to refresh the tree from its root
        CodewindEventListener.onChange(undefined);
    }

    private getExisting(url: vscode.Uri): Connection | undefined {
        return this._connections.find((conn) => {
            return conn.url.toString() === url.toString();
        });
    }

    public async removeConnection(connection: Connection): Promise<boolean> {
        const indexToRemove = this.connections.indexOf(connection);
        if (indexToRemove === -1) {
            Log.e(`Request to remove connection ${connection} but it doesn't exist!`);
            return false;
        }
        connection.dispose();
        this.connections.splice(indexToRemove, 1);
        Log.i("Removed connection", connection);
        await ConnectionMemento.saveConnections(this.remoteConnections);
        CodewindEventListener.onChange(undefined);
        return true;
    }

    /**
     * To be called on connection reconnect. Hits the environment endpoint at the given existing Connection's URI,
     * and returns if the response data matches the existing Connection.
     *
     * The given Connection will be destroyed if the data does not match (ie, this function returns `false`),
     * and thus must not do anything further.
     *
     */
    // public async verifyReconnect(connection: Connection): Promise<boolean> {
    //     Log.d("Verifying reconnect at " + connection.mcUri);

    //     let tries = 0;
    //     let newEnvData: CWEnvironment.IMCEnvData | undefined;
    //     // Sometimes this can execute before Portal is ready, resulting in a 404.
    //     while (newEnvData == null && tries < 10) {
    //         tries++;
    //         try {
    //             newEnvData = await CWEnvironment.getEnvData(connection.mcUri);
    //         }
    //         catch (err) {
    //             // wait briefly before trying again
    //             await new Promise( (resolve) => setTimeout(resolve, 250));
    //         }
    //     }

    //     if (newEnvData == null) {
    //         // I don't think this will ever happen
    //         Log.e("Couldn't get a good response from environment endpoint " + connection.mcUri);
    //         vscode.window.showErrorMessage(Translator.t(StringNamespaces.DEFAULT, "failedToReconnect", { uri: connection.mcUri }));

    //         await this.removeConnection(connection);
    //         return false;
    //     }

    //     if (CWEnvironment.envMatches(connection, newEnvData)) {
    //         // it's the same instance, so we don't have to do anything
    //         return true;
    //     }
    //     else {
    //         Log.d("Instance changed on reconnect!");
    //         await this.removeConnection(connection);

    //         // will also add the new Connection to this ConnectionManager
    //         // const newConnection = await activateConnectionCmd(MCUtil.getConnInfoFrom(connection.mcUri));
    //         const newConnection = await activateConnectionCmd();
    //         if (newConnection == null) {
    //             // should never happen
    //             Log.e("Failed to create new connection after verifyReconnect failure");
    //             return false;
    //         }

    //         const msg = Translator.t(StringNamespaces.DEFAULT, "versionChanged",
    //             { uri: connection.mcUri, oldVersion: connection.versionStr, newVersion: newConnection.versionStr }
    //         );
    //         vscode.window.showInformationMessage(msg);
    //         return false;
    //     }
    // }

    public get allProjects(): Promise<Project[]> {
        return this.connections.reduce(async (allProjects: Promise<Project[]>, connection: Connection): Promise<Project[]> => {
            return (await allProjects).concat(connection.projects);
        }, Promise.resolve([]));
    }
}
