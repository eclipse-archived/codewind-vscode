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
import CodewindManager, { OnChangeCallbackArgs } from "./CodewindManager";
import Log from "../../Logger";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import CWEnvironment, { CWEnvData } from "./CWEnvironment";
import MCUtil from "../../MCUtil";
import Requester from "../project/Requester";
import Constants from "../../constants/Constants";
import { CreateFileWatcher, FileWatcher } from "codewind-filewatcher";
import { LogSettings as FWLogSettings } from "codewind-filewatcher/lib/Logger";

export default class Connection implements vscode.QuickPickItem, vscode.Disposable {

    public readonly host: string;

    public readonly workspacePath: vscode.Uri;
    public readonly versionStr: string;

    public readonly socket: MCSocket;

    private fileWatcher: FileWatcher | undefined;
    public readonly initFileWatcherPromise: Promise<void>;

    private hasConnected: boolean = false;
    // Is this connection CURRENTLY connected
    private _isConnected: boolean = false;

    private _projects: Project[] = [];
    private needProjectUpdate: boolean = true;

    public readonly remote: boolean;

    constructor(
        public readonly url: vscode.Uri,
        cwEnv: CWEnvData,
    ) {
        this.socket = new MCSocket(this, cwEnv.socketNamespace);
        this.workspacePath = vscode.Uri.file(cwEnv.workspace);
        this.versionStr = CWEnvironment.getVersionAsString(cwEnv.version);
        this.host = this.getHost(url);
        this.remote = true;

        // caller must await on this promise before expecting this connection to function correctly
        // it does happen very quickly (< 1s) but be aware of potential race here
        if (!this.remote) {
            this.initFileWatcherPromise = this.initFileWatcher();
        } else {
            // Disable file-watcher in remote mode for now.
            this.initFileWatcherPromise = new Promise<void>((resolve) => (resolve()));
        }

        Log.i(`Created new Connection @ ${this}, workspace ${this.workspacePath}`);
    }

    public async dispose(): Promise<void> {
        Log.d("Destroy connection " + this);
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
        }
        await Promise.all([
            this.socket.dispose(),
            this._projects.map((p) => p.dispose()),
        ]);
    }

    public toString(): string {
        return `${this.url} ${this.versionStr}`;
    }

    private async initFileWatcher(): Promise<void> {
        if (global.isTheia) {
            Log.i("In theia; no filewatcher required");
            return;
        }

        Log.i("Establishing file watcher");
        return vscode.window.withProgress({
            title: "Establishing Codewind file watchers",
            cancellable: false,
            location: vscode.ProgressLocation.Window,
        }, (_progress) => {
            return CreateFileWatcher(this.url.toString(), Log.getLogDir)
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
        CodewindManager.instance.onChange(changed);
    }

    public get isConnected(): boolean {
        return this._isConnected;
    }

    public onConnect = async (): Promise<void> => {
        Log.d(`${this} onConnect`);
        if (this._isConnected) {
            // we already know we're connected, nothing to do until we disconnect
            return;
        }

        // if (!(await ConnectionManager.instance.verifyReconnect(this))) {
        //     Log.i(`Connection has changed on reconnect! ${this} is no longer a valid Connection`);
        //     // this connection gets destroyed
        //     return;
        // }

        if (this.hasConnected) {
            // things to do on reconnect, but not initial connect, go here
            this._projects.forEach((p) => p.onConnectionReconnect());
        }
        await Requester.waitForReady(this.url);
        this.hasConnected = true;
        this._isConnected = true;
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
        if (!this._isConnected) {
            // we already know we're disconnected, nothing to do until we reconnect
            return;
        }
        this._isConnected = false;

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

            let project: Project;

            // If we already have a Project object for this project, just update it, don't make a new object
            const existing = oldProjects.find( (p) => p.id === projectInfo.projectID);

            if (existing != null) {
                project = existing;
                existing.update(projectInfo);
                // Log.d("Reuse project " + project.name);
            }
            else {
                project = new Project(projectInfo, this);
                initPromises.push(project.initPromise);
                Log.d("New project " + project.name);
            }
            this._projects.push(project);
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

    // QuickPickItem
    public get label(): string {
        return Translator.t(StringNamespaces.TREEVIEW, "connectionLabel", { uri: this.url });
    }
}
