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

import Connection, { LOCAL_CONNECTION_ID } from "./Connection";
import Log from "../../Logger";
import Project from "../project/Project";
import CodewindEventListener from "./CodewindEventListener";
import MCUtil from "../../MCUtil";
import RemoteConnection from "./RemoteConnection";
import { CLICommandRunner } from "./CLICommandRunner";
import { ConnectionMemento } from "./ConnectionMemento";

export default class ConnectionManager implements vscode.Disposable {
    private static _instance: ConnectionManager;

    private readonly _connections: Connection[] = [];

    public static get instance(): ConnectionManager {
        return ConnectionManager._instance || (ConnectionManager._instance = new ConnectionManager());
    }

    public async activate(): Promise<void> {
        try {
            await vscode.window.withProgress({
                cancellable: false,
                location: vscode.ProgressLocation.Window,
                title: "Loading Codewind connections...",
            }, () => {
                return ConnectionMemento.loadSavedConnections();
            });
        }
        catch (err) {
            Log.e(`Error loading remote connections`, err);
            vscode.window.showErrorMessage(`Error loading remote connections: ${MCUtil.errToString(err)}`);
            return;
        }
        CodewindEventListener.onChange(undefined);
    }

    public async dispose(): Promise<void> {
        await Promise.all([
            this.connections.map((conn) => conn.dispose()),
        ]);
    }

    public get connections(): Connection[] {
        return this._connections;
    }

    public get remoteConnections(): RemoteConnection[] {
        return this.connections.filter((conn) => conn instanceof RemoteConnection) as RemoteConnection[];
    }

    public async createRemoteConnection(ingressUrl: vscode.Uri, label: string, username: string, password: string): Promise<RemoteConnection> {
        Log.i("Recreating new connection to " + ingressUrl);
        const existing = this.remoteConnections.find((conn) => {
            return conn.url.toString() === ingressUrl.toString();
        });

        if (existing) {
            const alreadyExistsMsg = "Connection already exists at " + ingressUrl.toString();
            Log.i(alreadyExistsMsg);
            vscode.window.showWarningMessage(alreadyExistsMsg);
            return existing;
        }

        const newConnID = await ConnectionMemento.addConnection(label, ingressUrl, username);

        const newMemento: ConnectionMemento = {
            id: newConnID,
            ingressUrl: ingressUrl.toString(),
            label: label,
            username: username,
        };
        const newConnection = new RemoteConnection(ingressUrl, newMemento, password);
        await this.onNewConnection(newConnection);
        return newConnection;
    }

    /**
     * Set up a remote connection that was loaded from `cwctl connections`
     */
    public async loadRemoteConnection(memento: ConnectionMemento): Promise<RemoteConnection> {
        Log.i("Recreating connection to " + memento.ingressUrl);

        const ingressUrl = vscode.Uri.parse(memento.ingressUrl);
        const loadedConnection = new RemoteConnection(ingressUrl, memento);
        await this.onNewConnection(loadedConnection);
        return loadedConnection;
    }

    public async connectLocal(url: vscode.Uri): Promise<Connection> {
        if (this.connections[0] && !this.connections[0].isRemote) {
            return this.connections[0];
        }
        Log.i("Creating connection to " + url);
        const newConnection = new Connection(LOCAL_CONNECTION_ID, url, "Local Codewind", false);
        this.onNewConnection(newConnection);
        return newConnection;
    }

    private async onNewConnection(newConnection: Connection): Promise<void> {
        if (newConnection.isRemote) {
            this.connections.push(newConnection);
        }
        else {
            // the local connection should always be first.
            this.connections.unshift(newConnection);
        }
        Log.i("New Connection @ " + newConnection.url);

        await newConnection.initPromise;
        // pass undefined here to refresh the tree from its root
        CodewindEventListener.onChange(undefined);
    }

    public async removeConnection(connection: Connection): Promise<boolean> {
        const indexToRemove = this.connections.indexOf(connection);
        if (indexToRemove === -1) {
            Log.e(`Request to remove connection ${connection} but it doesn't exist!`);
            return false;
        }
        if (connection.isRemote) {
            await CLICommandRunner.removeConnection(connection.id);
        }
        connection.dispose();
        this.connections.splice(indexToRemove, 1);
        Log.i("Removed connection", connection);
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
