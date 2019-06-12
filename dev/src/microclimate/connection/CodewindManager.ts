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
import * as request from "request-promise-native";

import Connection from "./Connection";
import Log from "../../Logger";
import Project from "../project/Project";
import InstallerWrapper, { InstallerCommands } from "./InstallerWrapper";
import { MCEndpoints } from "../../constants/Endpoints";

export type OnChangeCallbackArgs = Connection | Project | undefined;

enum CodewindStates {
    STOPPED, STARTED,
    // STARTING, STOPPING,
}

/**
 * Manages the lifecycle of Codewind and its Connections.
 * Also responsible for refreshing the Codewind Tree.
 */
export default class CodewindManager implements vscode.Disposable {

    public readonly CW_URL: vscode.Uri = vscode.Uri.parse("http://localhost:9090");

    // public readonly initPromise: Promise<void>;

    private static _instance: CodewindManager;

    private readonly _connections: Connection[] = [];
    private readonly listeners: Array<( (changed: OnChangeCallbackArgs) => void )> = [];

    private _state: CodewindStates = CodewindStates.STOPPED;

    public static get instance(): CodewindManager {
        return CodewindManager._instance || (CodewindManager._instance = new this());
    }

    public async dispose(): Promise<void> {
        await Promise.all([
            // InstallerWrapper.stopAll(),
            this.connections.map((conn) => conn.dispose()),
        ]);
    }

    public get connections(): Connection[] {
        return this._connections;
    }

    public async addConnection(uri: vscode.Uri, mcVersion: number, socketNS: string, workspace: string): Promise<Connection> {
        const existing = this.getExisting(uri);
        if (existing != null) {
            Log.e("Connection already exists at " + uri.toString());
            // const alreadyExists = Translator.t(StringNamespaces.DEFAULT, "connectionAlreadyExists", { uri });
            // Log.i(alreadyExists);
            return existing;
        }

        // all validation that this connection is good must be done by this point

        const newConnection: Connection = new Connection(uri, mcVersion, socketNS, workspace);
        Log.i("New Connection @ " + uri);
        this._connections.push(newConnection);
        // ConnectionManager.saveConnections();

        // pass undefined here to refresh the tree from its root
        this.onChange(undefined);
        return newConnection;
    }

    private getExisting(uri: vscode.Uri): Connection | undefined {
        return this._connections.find((conn) => {
            return conn.url.toString() === uri.toString();
        });
    }

    /**
     * Pass this a function to call whenever a connection is added, removed, or changed,
     * eg to trigger a tree update in the UI.
     * Test-friendly.
     */
    public addOnChangeListener(callback: (changed: OnChangeCallbackArgs) => void): void {
        Log.i("Adding onChangeListener " + callback.name);
        this.listeners.push(callback);
    }

    /**
     * Call this whenever a connection is added, removed, or changed.
     * Pass the item that changed (Connection or Project) or undefined for the tree's root.
     */
    public onChange = (changed: OnChangeCallbackArgs): void => {
        // Log.d(`There was a change, notifying ${this.listeners.length} listeners`);
        this.listeners.forEach((cb) => cb(changed));
    }

    ///// Start/Stop Codewind /////

    /**
     * Installs and starts Codewind, if required. Will exit immediately if already started.
     * Throws errors so we wrap this in the the command handler
     */
    public async startCodewind(): Promise<void> {
        if (await this.isCodewindActive()) {
            // nothing to do
            Log.i("Codewind is already started");
            this.changeState(CodewindStates.STARTED);
            return;
        }

        Log.i("Initial Codewind ping failed");

        await InstallerWrapper.install();
        await InstallerWrapper.installerExec(InstallerCommands.START);

        Log.i("Codewind should have started, getting ENV data now");
        // vscode.window.showInformationMessage("Codewind was started successfully");

        this.changeState(CodewindStates.STARTED);
    }

    private async isCodewindActive(): Promise<boolean> {
        try {
            // const healthRes = await request.get(this.CW_URL.with({ path: MCEndpoints.HEALTH }).toString());
            await request.get(this.CW_URL.with({ path: MCEndpoints.HEALTH }).toString());
            Log.i("Good response from healthcheck");
            return true;
        }
        catch (err) {
            Log.i("Health error response", err);
            return false;
        }
    }

    public async stopCodewind(): Promise<void> {
        await InstallerWrapper.installerExec(InstallerCommands.STOP_ALL);
        this.changeState(CodewindStates.STOPPED);
    }

    private changeState(newState: CodewindStates): void {
        this._state = newState;
        this.onChange(undefined);
    }

    public isStarted(): boolean {
        return this._state === CodewindStates.STARTED;
    }

    // public async removeConnection(connection: Connection): Promise<boolean> {
    //     const indexToRemove = this.connections.indexOf(connection);
    //     if (indexToRemove === -1) {
    //         Log.e(`Request to remove connection ${connection} but it doesn't exist!`);
    //         return false;
    //     }
    //     connection.dispose();
    //     this.connections.splice(indexToRemove, 1);
    //     Log.i("Removed connection", connection);
    //     // ConnectionManager.saveConnections();
    //     this.onChange(undefined);
    //     return true;
    // }

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
    //     let newEnvData: MCEnvironment.IMCEnvData | undefined;
    //     // Sometimes this can execute before Portal is ready, resulting in a 404.
    //     while (newEnvData == null && tries < 10) {
    //         tries++;
    //         try {
    //             newEnvData = await MCEnvironment.getEnvData(connection.mcUri);
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

    //     if (MCEnvironment.envMatches(connection, newEnvData)) {
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


    // public get allProjects(): Promise<Project[]> {
    //     return this.connections.reduce(async (allProjects: Promise<Project[]>, connection: Connection): Promise<Project[]> => {
    //         const projects = await connection.getProjects();
    //         return (await allProjects).concat(projects);
    //     }, Promise.resolve([]));
    // }
}
