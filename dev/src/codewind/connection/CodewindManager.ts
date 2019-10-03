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
import InstallerWrapper from "./InstallerWrapper";
import Resources from "../../constants/Resources";
import MCUtil from "../../MCUtil";
import activateConnection from "../../command/connection/ActivateConnectionCmd";
import { CodewindStates } from "./CodewindStates";
import { CWEnvData } from "./CWEnvironment";
import Requester from "../project/Requester";

const CHE_CW_URL = "https://localhost:9090";

export type OnChangeCallbackArgs = Connection | Project | undefined;

/**
 * Manages the lifecycle of Codewind and its Connections.
 * Also responsible for refreshing the Codewind Tree.
 */
export default class CodewindManager implements vscode.Disposable {

    private _codewindUrl: vscode.Uri | undefined;

    // public readonly initPromise: Promise<void>;

    private static _instance: CodewindManager;

    /**
     * Currently only connections[0] is used, but all the caller code treats this as an array,
     * so we will leave it this way until we make a decision about multi-connection architecture.
     */
    private readonly _connections: Connection[] = [];
    private readonly listeners: Array<( (changed: OnChangeCallbackArgs) => void )> = [];

    private _state: CodewindStates = CodewindStates.STOPPED;

    public static get instance(): CodewindManager {
        return CodewindManager._instance || (CodewindManager._instance = new this());
    }

    public get codewindUrl(): vscode.Uri | undefined {
        return this._codewindUrl;
    }

    public async dispose(): Promise<void> {
        await Promise.all([
        //     // InstallerWrapper.stopAll(),
            this.connections.map((conn) => conn.dispose()),
        ]);
    }

    public get connections(): Connection[] {
        return this._connections;
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

    public async startCodewind(): Promise<void> {
        let cwUrl: vscode.Uri | undefined;
        try {
            cwUrl = await this.startCodewindInner();
            this._codewindUrl = cwUrl;
        }
        catch (err) {
            if (!InstallerWrapper.isCancellation(err)) {
                vscode.window.showErrorMessage(MCUtil.errToString(err));
            }
            return;
        }

        try {
            await activateConnection(cwUrl);
        }
        catch (err) {
            Log.e("Error connecting to Codewind after it appeared to start", err);
            this.changeState(CodewindStates.ERR_CONNECTING);
            vscode.window.showErrorMessage(MCUtil.errToString(err));
        }
    }

    /**
     * Installs and starts Codewind, if required. Will exit immediately if already started.
     * @returns The URL to the running Codewind instance, or undefined if it did not appear to start successfully.
     */
    private async startCodewindInner(): Promise<vscode.Uri> {
        if (global.isTheia) {
            // In the che case, we do not start codewind. we just wait for it to come up
            this.changeState(CodewindStates.STARTING);
            const cheCwUrl = vscode.Uri.parse(CHE_CW_URL);
            await this.waitForCodewindToStart(cheCwUrl);
            this.changeState(CodewindStates.STARTED);
            return cheCwUrl;
        }

        // If it was not started, we do that here. The install step is done if necessary.
        await InstallerWrapper.installAndStart();

        let cwUrl: vscode.Uri | undefined;
        try {
            cwUrl = await InstallerWrapper.getCodewindUrl();
            if (!cwUrl) {
                throw new Error("Could not determine Codewind URL");
            }
        }
        catch (err) {
            Log.e("Error getting URL after Codewind should have started", err);
            this.changeState(CodewindStates.ERR_CONNECTING);
            throw err;
        }
        Log.i("Codewind appears to have started at " + cwUrl);
        return cwUrl;
    }

    public async stopCodewind(): Promise<void> {
        await InstallerWrapper.stop();
        this._connections.splice(0, 1);
        this._codewindUrl = undefined;
    }

    public changeState(newState: CodewindStates): void {
        // Log.d(`Codewind state changing from ${this._state} to ${newState}`);
        this._state = newState;
        this.onChange(undefined);
    }

    public get state(): CodewindStates {
        return this._state;
    }

    public get isStarted(): boolean {
        return this._codewindUrl != null;
    }

    /**
     * Theia Only -
     * For the theia case where we do not control CW's lifecycle, we simply wait for it to start
     */
    private async waitForCodewindToStart(baseUrl: vscode.Uri): Promise<void> {
        const waitingForReadyProm = Requester.waitForReady(baseUrl);
        vscode.window.setStatusBarMessage(`${Resources.getOcticon(Resources.Octicons.sync, true)}` +
            `Waiting for Codewind to start...`, waitingForReadyProm);
        return waitingForReadyProm.then(() => Promise.resolve());
    }

    public async connect(uri: vscode.Uri, cwEnv: CWEnvData): Promise<Connection> {
        const existing = this._connections[0];
        if (existing) {
            if (existing.url.toString() === uri.toString()) {
                return existing;
            }
            const errMsg = `Requested to add a second connection with URL ${uri} when one already exists with URL ${existing.url}`;
            Log.e(errMsg);
            throw new Error(errMsg);
        }
        // const existing = this.getExisting(uri);
        // if (existing != null) {
        //     Log.e("Connection already exists at " + uri.toString());
        //     // const alreadyExists = Translator.t(StringNamespaces.DEFAULT, "connectionAlreadyExists", { uri });
        //     // Log.i(alreadyExists);
        //     return existing;
        // }

        // all validation that this connection is good must be done by this point
        // - eg nothing missing from the environment, not a dupe
        const newConnection: Connection = new Connection(uri, cwEnv);
        Log.i("New Connection @ " + uri);
        this._connections[0] = newConnection;

        // pass undefined here to refresh the tree from its root
        this.onChange(undefined);
        return newConnection;
    }

    // private getExisting(uri: vscode.Uri): Connection | undefined {
    //     return this._connections.find((conn) => {
    //         return conn.url.toString() === uri.toString();
    //     });
    // }

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
