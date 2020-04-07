/*******************************************************************************
 * Copyright (c) 2018, 2020 IBM Corporation and others.
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
import MCSocket from "./MCSocket";
import Log from "../../Logger";
import CWEnvironment from "./CWEnvironment";
import MCUtil from "../../MCUtil";
import Constants from "../../constants/Constants";
import { CreateFileWatcher, FileWatcher } from "codewind-filewatcher";
import { LogSettings as FWLogSettings } from "codewind-filewatcher/lib/Logger";
import LocalCodewindManager from "./local/LocalCodewindManager";
import CodewindEventListener, { OnChangeCallbackArgs } from "./CodewindEventListener";
import { ConnectionStates, ConnectionState } from "./ConnectionState";
import { SourcesPageWrapper } from "../../command/webview/SourcesPageWrapper";
import { RegistriesPageWrapper } from "../../command/webview/RegistriesPageWrapper";
import TemplateSourcesList from "./TemplateSourceList";
import ConnectionRequester from "./ConnectionRequester";
import { AccessToken } from "../Types";
import CLISetup from "../cli/CLISetup";

export const LOCAL_CONNECTION_ID = "local";

export default class Connection implements vscode.QuickPickItem, vscode.Disposable {

    public readonly pfeHost: string;

    public readonly requester: ConnectionRequester;

    // Only used in Che-theia case
    private codewindCheIngress: vscode.Uri | undefined;

    protected cwVersion: string = CWEnvironment.UNKNOWN_VERSION;
    protected cwNamespace: string = "Unknown";
    protected cwBuildTime: string | undefined;

    protected _state: ConnectionState;
    protected _socket: MCSocket | undefined;

    private fileWatcher: FileWatcher | undefined;

    private hasConnected: boolean = false;

    private _projects: Project[] = [];

    public readonly templateSourcesList: TemplateSourcesList = new TemplateSourcesList(this);

    private _sourcesPage: SourcesPageWrapper  | undefined;
    private _registriesPage: RegistriesPageWrapper | undefined;

    private hasInitialized: boolean = false;
    private _hasHadPushRegistry: boolean = false;

    constructor(
        /**
         * Connection ID as returned by `cwctl connections add`
         */
        public readonly id: string,
        /**
         * URL as returned by `cwctl status` in local, or to Codewind Gatekeeper for remote
         */
        public readonly url: vscode.Uri,
        /**
         * User-provided label, or hard-coded local label
         */
        public readonly label: string,
        public readonly isRemote: boolean,
    ) {
        Log.d(`Creating new connection ${this.label} @ ${this.url}`);
        this._state = ConnectionStates.INITIALIZING;
        this.requester = new ConnectionRequester(this);
        this.pfeHost = this.getPFEHost();
        this.enable()
        .catch((err) => {
            const errMsg = `Error initializing Codewind connection:`;
            Log.e(errMsg, err);
            vscode.window.showErrorMessage(`${errMsg} ${MCUtil.errToString(err)}`);
        });
    }

    public get enabled(): boolean {
        return this.state !== ConnectionStates.DISABLED;
    }

    public get state(): ConnectionState {
        return this._state;
    }

    protected setState(newState: ConnectionState): void {
        Log.d(`${this.label} is now ${newState}`);
        this._state = newState;
        this.onChange();
    }

    public get isConnected(): boolean {
        return this._state.isConnected;
    }

    protected async enable(): Promise<void> {
        Log.i(`${this.label} starting base enable`);

        const readyTimeoutS = 90;
        const ready = await this.requester.waitForReady(readyTimeoutS);
        if (!ready) {
            let troubleshootMsg: string = "To troubleshoot, you can ";
            if (global.isChe) {
                troubleshootMsg += `check the Codewind Workspace pod logs and refresh Theia.`;
            }
            else if (this.isRemote) {
                troubleshootMsg += `check the Codewind pod logs and refresh this connection.`;
            }
            else {
                // local, docker
                troubleshootMsg += `check the Codewind container logs and restart local Codewind.`;
            }

            const errMsg = `${this.label} connected, but was not ready after ${readyTimeoutS} seconds. ${troubleshootMsg}`;
            this.setState(ConnectionStates.NETWORK_ERROR);
            throw new Error(errMsg);
        }

        const envData = await CWEnvironment.getEnvData(this);
        this.cwVersion = envData.version;
        this.cwNamespace = envData.namespace || "Unknown";
        this.cwBuildTime = envData.buildTime;
        // onConnect will be called on initial socket connect,
        // which does the initial projects population and sets the state to Connected
        this._socket = new MCSocket(this, envData.socketNamespace);

        await this.initFileWatcher();

        try {
            Log.d("Updating projects list after ready");
            await this.updateProjects();
        }
        catch (err) {
            Log.e("Error updating projects list after ready", err);
        }

        this.hasInitialized = true;
        if (this._socket.isReady) {
            Log.d(`${this} is now ready - enable finished after connect`);
            this.setState(ConnectionStates.READY);
        }
        this.onChange(this);
        Log.i(`${this} finished base enable`);
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
        this.hasConnected = false;
        this.hasInitialized = false;

        this._socket = undefined;
        this.fileWatcher = undefined;
        this._projects = [];
        this.onChange(this);
    }

    public async dispose(): Promise<void> {
        return this.disable();
    }

    public toString(): string {
        return `${this.label}`;
    }

    private async initFileWatcher(): Promise<void> {
        if (global.isChe) {
            Log.i("In Che; no filewatcher required");
            return;
        }

        Log.i("Establishing file watcher");
        const cliPath = CLISetup.getCwctlPath();

        this.fileWatcher = await this.createFileWatcher(cliPath);

        FWLogSettings.getInstance().setOutputLogsToScreen(false);
        Log.i(`${this.label} File watcher is established`);
    }

    protected async createFileWatcher(cliPath: string): Promise<FileWatcher> {
        return CreateFileWatcher(this.url.toString(), Log.getLogDir, undefined, cliPath);
    }

    private getPFEHost(): string {
        if (global.isChe) {
            // On Che we have to use the che ingress
            // something like CHE_API_EXTERNAL=http://che-eclipse-che.9.28.239.191.nip.io/api
            const cheExternalUrlStr = process.env[Constants.CHE_API_EXTERNAL_ENVVAR];
            Log.d(`${Constants.CHE_API_EXTERNAL_ENVVAR}=${cheExternalUrlStr}`);
            if (cheExternalUrlStr != null) {
                // we only want the authority component.
                const cheExternalUrl = vscode.Uri.parse(cheExternalUrlStr);
                const authority = cheExternalUrl.authority;
                if (authority) {
                    Log.i("Setting connection host in Che to " + authority);
                    return authority;
                }
            }
            Log.e(`${Constants.CHE_API_EXTERNAL_ENVVAR} is not set in the environment or was invalid: falling back to default host`);
        }
        return MCUtil.getHostnameFrom(this.url);
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

    public async onConnect(): Promise<void> {
        Log.d(`${this} base onConnect`);
        if (this.isConnected) {
            // we already know we're connected, nothing to do until we disconnect
            return;
        }

        if (this.hasConnected) {
            // things to do on reconnect, but not initial connect, go here
            try {
                if (this.hasInitialized) {
                    await this.updateProjects();
                }
                this._projects.forEach((p) => p.onConnectionReconnect());
            }
            catch (err) {
                const errMsg = `Error reconnecting to ${this.label}`;
                Log.e(errMsg);
                vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
            }
        }

        this.hasConnected = true;
        Log.i(`${this} is now connected`);
        if (this.hasInitialized) {
            Log.d(`${this} is now ready - initialize finished before connect`);
            this.setState(ConnectionStates.READY);
        }
        this.onChange();
    }

    public async onDisconnect(): Promise<void> {
        Log.d(`${this} onDisconnect`);
        if (this._state === ConnectionStates.NETWORK_ERROR) {
            // we already know we're disconnected, nothing to do until we reconnect
            return;
        }
        this.setState(ConnectionStates.NETWORK_ERROR);

        this._projects.forEach((p) => p.onConnectionDisconnect());
        this._projects = [];

        Log.i(`${this} is now disconnected`);

        this.onChange();
    }

    public get projects(): Project[] {
        return this._projects;
    }

    public hasProjectAtPath(path: vscode.Uri): boolean {
        return this.projects.some((proj) => proj.localPath.fsPath === path.fsPath);
    }

    public async updateProjects(): Promise<void> {
        const projectsData = await this.requester.getProjects();

        const oldProjects = this._projects;
        this._projects = [];
        const initPromises: Promise<void>[] = [];

        for (const projectInfo of projectsData) {
            // This is a hard-coded exception for a backend bug where projects get stuck in the Deleting or Validating state
            // and don't go away until they're deleted from the workspace and codewind is restarted.
            if (projectInfo.action === "deleting" || projectInfo.action === "validating") {     // non-nls
                Log.e("Project is in a bad state and won't be displayed:", projectInfo);
                continue;
            }

            let project: Project | undefined;

            // If we already have a Project object for this project, just update it, don't make a new object
            const existing = oldProjects.find((p) => p.id === projectInfo.projectID);

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
                    Log.e(`Error creating new project with ID ${projectInfo.projectID} name ${projectInfo.name}`, err);
                    vscode.window.showErrorMessage(`Error with new project ${projectInfo.name}: ${MCUtil.errToString(err)}`);
                }
            }
            if (project) {
                this._projects.push(project);
            }
        }

        // Log.d("Awaiting init promises " + Date.now());
        await Promise.all(initPromises);
        Log.d("Done projects update");
        this.onChange();
    }

    public async getProjectByID(projectID: string): Promise<Project | undefined> {
        const result = this._projects.find((project) => project.id === projectID);
        if (result == null) {
            // Logger.logE(`Couldn't find project with ID ${projectID} on connection ${this}`);
        }
        return result;
    }

    public onProjectDeletion(projectID: string): void {
        const index = this._projects.findIndex((proj) => proj.id === projectID);
        if (index === -1) {
            Log.e(`Requested to delete project ${projectID} that was not found`);
            return;
        }
        this._projects.splice(index, 1);
        Log.d(`${this.label} removed project ${projectID}`);
        this.onChange();
    }

    /**
     * Returns if this connection's CW instance is running in Kube.
     * This is the case for remote connections, or the local connection in che.
     */
    public get isKubeConnection(): boolean {
        return this.isRemote || global.isChe;
    }

    public async needsPushRegistry(): Promise<boolean> {
        if (!this.isKubeConnection) {
            // The local connection does not ever need a push registry since the images are deployed to docker for desktop
            return false;
        }
        else if (this._hasHadPushRegistry) {
            // Once the push registry is configured once, we skip that step to save time.
            // if we had one and then the user removed it, codewind-style builds will fail, but the user was warned
            return false;
        }

        // const pushRegistryRes = await vscode.window.withProgress({
        //     cancellable: false,
        //     location: vscode.ProgressLocation.Notification,
        //     title: `Checking for image push registry...`,
        // }, () => {
        //     return Requester.getPushRegistry(this);
        // });

        const pushRegistryRes = await this.requester.getPushRegistry();

        const hasPushRegistry = pushRegistryRes.imagePushRegistry;
        if (hasPushRegistry) {
            this._hasHadPushRegistry = true;
        }
        // If the imagePushRegistry IS set, we do NOT need a push registry (since we already have one)
        return !hasPushRegistry;
    }

    public async refresh(): Promise<void> {
        await this.updateProjects();
    }

    public get version(): string {
        if (this.cwVersion === "x.x.dev") {
            // this is a useless version
            let devVersion = "Development";
            if (this.cwBuildTime) {
                devVersion += " - " + this.cwBuildTime;
            }
            return devVersion;
        }
        return this.cwVersion;
    }

    public get namespace(): string {
        return this.cwNamespace || "Unknown";
    }

    // QuickPick description
    public get description(): string {
        return `(${this.version}, ${this.projects.length} projects)`;
    }

    // QuickPick detail
    public get detail(): string {
        return this.url.toString();
    }

    public get socketURI(): string | undefined {
        return this._socket ? this._socket.uri : undefined;
    }

    public async getAccessToken(): Promise<AccessToken | undefined> {
        return undefined;
    }

    public get pfeBaseURL(): vscode.Uri {
        if (!global.isChe) {
            return this.url;
        }

        // In Che, we have to use the environment to figure out the Codewind ingress (in place of using a kube client)
        if (this.codewindCheIngress) {
            return this.codewindCheIngress;
        }

        const cheApiUrlStr = process.env[Constants.CHE_API_EXTERNAL_ENVVAR];
        if (!cheApiUrlStr) {
            throw new Error(`Could not determine Che API URL; ${Constants.CHE_API_EXTERNAL_ENVVAR} was not set.`);
        }
        const cheApiUrl = vscode.Uri.parse(cheApiUrlStr);
        Log.d(`Che API URL is "${cheApiUrl}"`);

        const workspaceID = process.env[Constants.CHE_WORKSPACEID_ENVVAR];
        if (!workspaceID) {
            throw new Error(`Could not determine Che workspace ID; ${Constants.CHE_WORKSPACEID_ENVVAR} was not set.`);
        }

        // this will resolve to something like:
        // codewind-workspacebiq5onaqye4u9x3d-che-che.10.99.3.118.nip.io
        const codewindIngressAuthority = `codewind-${workspaceID}-${cheApiUrl.authority}`;

        this.codewindCheIngress = vscode.Uri.parse(`${cheApiUrl.scheme}://${codewindIngressAuthority}`);
        Log.i(`Codewind Ingress URL is ${this.codewindCheIngress}`);
        return this.codewindCheIngress;
    }

    ///// Webview management

    public onDidOpenSourcesPage(page: SourcesPageWrapper): void {
        this._sourcesPage = page;
    }

    public onDidOpenRegistriesPage(page: RegistriesPageWrapper): void {
        this._registriesPage = page;
    }

    public get sourcesPage(): SourcesPageWrapper | undefined {
        return this._sourcesPage;
    }

    public get registriesPage(): RegistriesPageWrapper | undefined {
        return this._registriesPage;
    }

    public onDidCloseSourcesPage(): void {
        this._sourcesPage = undefined;
    }

    public onDidCloseRegistriesPage(): void {
        this._registriesPage = undefined;
    }
}
