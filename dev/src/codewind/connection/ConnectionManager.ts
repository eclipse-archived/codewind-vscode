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
import { CWEnvData } from "./CWEnvironment";
import CodewindEventListener from "./CodewindEventListener";
// import StringNamespaces from "../../constants/strings/StringNamespaces";
// import Translator from "../../constants/strings/translator";

// interface IConnectionInfo {
//     readonly cwIngressUrl: vscode.Uri;
//     readonly userLabel: string;
//     // readonly username: string;
// }

export default class ConnectionManager implements vscode.Disposable {
    private static _instance: ConnectionManager;

    private readonly _connections: Connection[] = [];

    public static get instance(): ConnectionManager {
        return ConnectionManager._instance || (ConnectionManager._instance = new this());
    }

    public async dispose(): Promise<void> {
        await Promise.all([
            this.connections.map((conn) => conn.dispose()),
        ]);
    }

    public get connections(): Connection[] {
        return this._connections;
    }

    public async connect(uri: vscode.Uri, cwEnv: CWEnvData, isLocalConnection: boolean, userLabel: string): Promise<Connection> {
        const existing = this.getExisting(uri);
        if (existing != null) {
            Log.e("Connection already exists at " + uri.toString());
            // const alreadyExists = Translator.t(StringNamespaces.DEFAULT, "connectionAlreadyExists", { uri });
            return existing;
        }

        const newConnection: Connection = new Connection(uri, cwEnv, userLabel, isLocalConnection);
        this._connections.push(newConnection);
        Log.i("New Connection @ " + uri);

        // pass undefined here to refresh the tree from its root
        CodewindEventListener.onChange(undefined);
        return newConnection;
    }

    private getExisting(uri: vscode.Uri): Connection | undefined {
        return this._connections.find((conn) => {
            return conn.url.toString() === uri.toString();
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
        // ConnectionManager.saveConnections();
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

    // private static loadConnections(): MCUtil.IConnectionInfo[] {
    //     const globalState = global.extGlobalState as vscode.Memento;
    //     const loaded = globalState.get<MCUtil.IConnectionInfo[]>(Settings.CONNECTIONS_KEY) || [];
    //     return loaded;
    // }

    // private static async saveConnections(): Promise<void> {
    //     // We save IConnectionInfo objects since they are simpler and more readable than VSCode URIs.
    //     // This will likely change with ICP support since we would then have to store protocol too.
    //     const connectionInfos: MCUtil.IConnectionInfo[] = ConnectionManager.instance.connections
    //         .map( (connection) => MCUtil.getConnInfoFrom(connection.mcUri));

    //     Log.i("Saving connections", connectionInfos);
    //     try {
    //         const globalState = global.extGlobalState as vscode.Memento;
    //         // connectionInfos must not contain cyclic references (ie, JSON.stringify succeeds)
    //         await globalState.update(Settings.CONNECTIONS_KEY, connectionInfos);
    //     }
    //     catch (err) {
    //         const msg = Translator.t(StringNamespaces.DEFAULT, "errorSavingConnections", { err: err.toString() });
    //         Log.e(msg, err);
    //         vscode.window.showErrorMessage(msg);
    //     }
    // }


    public get allProjects(): Promise<Project[]> {
        return this.connections.reduce(async (allProjects: Promise<Project[]>, connection: Connection): Promise<Project[]> => {
            return (await allProjects).concat(connection.projects);
        }, Promise.resolve([]));
    }
}
