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

import Project from "../project/Project";
import { MCEndpoints, EndpointUtil } from "../../constants/Endpoints";
import MCSocket from "./MCSocket";
import Log from "../../Logger";
import CWEnvironment from "./CWEnvironment";
import MCUtil from "../../MCUtil";
import Requester from "../project/Requester";
import Constants from "../../constants/Constants";
import { CreateFileWatcher, FileWatcher } from "codewind-filewatcher";
import { LogSettings as FWLogSettings } from "codewind-filewatcher/lib/Logger";
import LocalCodewindManager from "./local/LocalCodewindManager";
import CodewindEventListener, { OnChangeCallbackArgs } from "./CodewindEventListener";
import CLIWrapper from "./CLIWrapper";
import { ConnectionStates, ConnectionState } from "./ConnectionState";
import * as requestErrors from "request-promise-native/errors";

export default class Connection implements vscode.QuickPickItem, vscode.Disposable {

    public readonly host: string;

    protected cwVersion: string = CWEnvironment.UNKNOWN_VERSION;
    protected _state: ConnectionState;
    protected _socket: MCSocket | undefined;

    private fileWatcher: FileWatcher | undefined;
    public readonly initPromise: Promise<void>;

    private hasConnected: boolean = false;

    private _projects: Project[] = [];
    private needProjectUpdate: boolean = true;

    private _isRegistrySet: boolean = false;

    constructor(
        public readonly url: vscode.Uri,
        public readonly label: string,
        public readonly isRemote: boolean,
    ) {
        this._state = ConnectionStates.NETWORK_ERROR;
        this.host = this.getHost(url);
        // caller must await on this promise before expecting this connection to function correctly
        this.initPromise = this.enable();
    }

    public get enabled(): boolean {
        return this._socket != null;
    }

    public get state(): ConnectionState {
        return this._state;
    }

    public get isConnected(): boolean {
        return this._state.isConnected;
    }

    protected async enable(): Promise<void> {
        Log.i(`Enable connection ${this.url}`);

        try {
            const envData = await CWEnvironment.getEnvData(this.url);
            this.cwVersion = envData.version;
            // onConnect will be called on initial socket connect,
            // which does the initial projects population and sets the state to Connected
            this._socket = new MCSocket(this, envData.socketNamespace);
            Log.d(`${this.url} has env data`, envData);
        }
        catch (err) {
            // if the initial enablement fails, we use DISABLED instead of NETWORK_ERROR
            // so the user sees the connection has to be re-connected by hand after fixing the problem
            // This should only apply to remote connections
            this._state = ConnectionStates.DISABLED;

            if (err instanceof requestErrors.StatusCodeError) {
                let errMsg: string = err.message;
                if (err.statusCode === 404) {
                    errMsg = `Codewind API was not found. Does "${this.url}" point to a running Codewind instance?`;
                }
                throw new Error(`Received status ${err.statusCode}: ${errMsg}`);
            }
            throw err;
        }

        const initFWProm = this.initFileWatcher();
        await initFWProm;
        this.onChange(this);
    }

    protected async disable(): Promise<void> {
        Log.d("Disable connection " + this);

        const fwDisposeProm = new Promise((resolve) => {
            if (this.fileWatcher) {
                this.fileWatcher.dispose();
            }
            resolve();
        });

        await Promise.all([
            fwDisposeProm,
            // disposing the socket will result in onDisconnect being called
            this._socket ? this._socket.dispose() : Promise.resolve(),
            this._projects.map((p) => p.dispose()),
        ]);
        this._socket = undefined;
        this.fileWatcher = undefined;
        this._projects = [];
        this.onChange(this);
    }

    public async dispose(): Promise<void> {
        return this.disable();
    }

    public toString(): string {
        return `${this.url} ${this.cwVersion}`;
    }

    private async initFileWatcher(): Promise<void> {
        if (global.isTheia) {
            Log.i("In theia; no filewatcher required");
            return;
        }

        Log.i("Establishing file watcher");
        const cliPath = await CLIWrapper.getExecutablePath();
        return vscode.window.withProgress({
            title: "Establishing Codewind file watchers",
            cancellable: false,
            location: vscode.ProgressLocation.Window,
        }, (_progress) => {
            return CreateFileWatcher(this.url.toString(), Log.getLogDir, undefined, cliPath)
            .then((fw: FileWatcher) => {
                this.fileWatcher = fw;
                FWLogSettings.getInstance().setOutputLogsToScreen(false);
                Log.i("File watcher is established");
            });
        });
    }

    private getHost(url: vscode.Uri): string {
        if (global.isTheia) {
            // On theia we have to use the che ingress
            // something like CHE_API_EXTERNAL=http://che-eclipse-che.9.28.239.191.nip.io/api
            const cheExternalUrlStr = process.env[Constants.CHE_API_EXTERNAL_ENVVAR];
            Log.d(`${Constants.CHE_API_EXTERNAL_ENVVAR}=${cheExternalUrlStr}`);
            if (cheExternalUrlStr != null) {
                // we only want the authority component.
                const cheExternalUrl = vscode.Uri.parse(cheExternalUrlStr);
                const authority = cheExternalUrl.authority;
                if (authority) {
                    Log.i("Setting connection host in Theia to " + authority);
                    return authority;
                }
            }
            Log.e(`${Constants.CHE_API_EXTERNAL_ENVVAR} is not set in the environment or was invalid: falling back to default host`);
        }
        return MCUtil.getHostnameFrom(url);
    }

    /**
     * Call this whenever the tree needs to be updated - ie when this connection or any of its projects changes.
     */
    public async onChange(changed?: OnChangeCallbackArgs): Promise<void> {
        if (changed == null) {
            changed = this;
        }
        // Log.d(`Connection ${this.mcUri} changed`);
        CodewindEventListener.onChange(changed);
        if (!this.isRemote) {
            CodewindEventListener.onChange(LocalCodewindManager.instance);
        }
    }

    public onConnect = async (): Promise<void> => {
        Log.d(`${this} onConnect`);
        if (this.isConnected) {
            // we already know we're connected, nothing to do until we disconnect
            return;
        }

        if (this.hasConnected) {
            // things to do on reconnect, but not initial connect, go here
            this._projects.forEach((p) => p.onConnectionReconnect());
        }
        await Requester.waitForReady(this.url);
        this.hasConnected = true;
        this._state = ConnectionStates.CONNECTED;
        Log.d(`${this} is now connected`);
        try {
            await this.forceUpdateProjectList();
        }
        catch (err) {
            Log.e("Error getting projects list after connect event", err);
        }

        this.onChange();
    }

    public onDisconnect = async (): Promise<void> => {
        Log.d(`${this} onDisconnect`);
        if (this._state === ConnectionStates.NETWORK_ERROR) {
            // we already know we're disconnected, nothing to do until we reconnect
            return;
        }
        this._state = ConnectionStates.NETWORK_ERROR;

        this._projects.forEach((p) => p.onConnectionDisconnect());
        this._projects = [];

        Log.d(`${this} is now disconnected`);

        this.onChange();
    }

    public get projects(): Project[] {
        return this._projects;
    }

    private async updateProjects(): Promise<Project[]> {
        // Log.d("getProjects");
        if (!this.needProjectUpdate) {
            return this._projects;
        }
        Log.d(`Updating projects list from ${this}`);

        const projectsUrl = EndpointUtil.resolveMCEndpoint(this, MCEndpoints.PROJECTS);
        const result = await Requester.get(projectsUrl, { json : true });

        const oldProjects = this._projects;
        this._projects = [];
        const initPromises: Array<Promise<void>> = [];

        for (const projectInfo of result) {
            // This is a hard-coded exception for a backend bug where projects get stuck in the Deleting or Validating state
            // and don't go away until they're deleted from the workspace and MC is restarted.
            if (projectInfo.action === "deleting" || projectInfo.action === "validating") {     // non-nls
                Log.e("Project is in a bad state and won't be displayed:", projectInfo);
                continue;
            }

            let project: Project | undefined;

            // If we already have a Project object for this project, just update it, don't make a new object
            const existing = oldProjects.find( (p) => p.id === projectInfo.projectID);

            if (existing != null) {
                project = existing;
                existing.update(projectInfo);
                // Log.d("Reuse project " + project.name);
            }
            else {
                try {
                    project = new Project(projectInfo, this);
                    initPromises.push(project.initPromise);
                    Log.d("New project " + project.name);
                }
                catch (err) {
                    Log.e(`Error creating new project with ID ${projectInfo.id} name ${projectInfo.name}`, err);
                    vscode.window.showErrorMessage(`Error with new project ${projectInfo.name}: ${MCUtil.errToString(err)}`);
                }
            }
            if (project) {
                this._projects.push(project);
            }
        }

        // Log.d("Awaiting init promises " + Date.now());
        await Promise.all(initPromises);
        // Log.d("Done awaiting init promises " + Date.now());
        this.needProjectUpdate = false;
        Log.d("Done projects update");
        this.onChange();
        return this._projects;
    }

    public async getProjectByID(projectID: string): Promise<Project | undefined> {
        const result = this._projects.find((project) => project.id === projectID);
        if (result == null) {
            // Logger.logE(`Couldn't find project with ID ${projectID} on connection ${this}`);
        }
        return result;
    }

    public async forceUpdateProjectList(wipeProjects: boolean = false): Promise<void> {
        // Log.d("forceUpdateProjectList");
        if (wipeProjects) {
            Log.d(`Connection ${this} wiping ${this._projects.length} projects`);
            this._projects.forEach((p) => p.dispose());
            this._projects = [];
        }
        this.needProjectUpdate = true;
        await this.updateProjects();
        if (wipeProjects) {
            // refresh whole tree
            this.onChange();
        }
    }

    /**
     * Check if this connection has a docker registry set. It is not guaranteed to be valid or have valid credentials.
     * Once this succeeds, it will be cached for the remainder of the VS Code session, so we don't have to check every time we create a project.
     */
    public async isRegistrySet(): Promise<boolean> {
        if (this._isRegistrySet) {
            return true;
        }

        let isRegistrySet: boolean = false;
        if (!this.isRemote && !global.isTheia) {
            // Local connections outside of Theia do not require a container registry
            isRegistrySet = true;
        }
        else {
            isRegistrySet = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
                title: "Checking deployment registry status..."
            }, () => {
                return Requester.isRegistrySet(this);
            });
        }

        // cache this so we can skip this request for the remainder of the session
        this._isRegistrySet = isRegistrySet;
        return this._isRegistrySet;
    }

    public async setRegistry(registry: string): Promise<void> {
        await Requester.configureRegistry(this, "set", registry);
        this._isRegistrySet = true;
    }

    public get detail(): string {
        return this.url.toString();
    }

    public get socketURI(): string | undefined {
        return this._socket ? this._socket.uri : undefined;
    }
}
