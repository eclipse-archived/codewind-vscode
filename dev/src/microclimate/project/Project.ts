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

import * as MCUtil from "../../MCUtil";
import ProjectState from "./ProjectState";
import Log from "../../Logger";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import { refreshProjectOverview } from "./ProjectOverviewPage";
import StartModes from "../../constants/StartModes";
import MCLogManager from "./logs/MCLogManager";
import DebugUtils from "./DebugUtils";
import ProjectType from "./ProjectType";
import ProjectPendingRestart from "./ProjectPendingRestart";
import Connection from "../connection/Connection";
import SocketEvents from "../connection/SocketEvents";
import Validator from "./Validator";

const STRING_NS = StringNamespaces.PROJECT;

/**
 * Project's ports info. Keys match those provided by Microclimate.
 */
interface IProjectPorts {
    appPort: OptionalNumber;
    internalPort: OptionalNumber;
    debugPort: OptionalNumber;
    internalDebugPort: OptionalNumber;
}

export default class Project implements vscode.QuickPickItem {

    // Immutable project data
    public readonly name: string;
    public readonly id: string;
    public readonly type: ProjectType;
    public readonly localPath: vscode.Uri;

    // Mutable project data, will change with calls to update() and similar functions. Prefixed with _ because these all have getters.
    private _state: ProjectState;
    private _containerID: OptionalString;
    private _contextRoot: string;
    private readonly _ports: IProjectPorts;
    private _autoBuildEnabled: boolean;
    // Dates below will always be set, but might be "invalid date"s
    private _lastBuild: Date;
    private _lastImgBuild: Date;

    public static readonly diagnostics: vscode.DiagnosticCollection
        = vscode.languages.createDiagnosticCollection(Validator.DIAGNOSTIC_COLLECTION_NAME);

    // QuickPickItem fields
    public readonly label: string;
    public readonly detail?: string;

    // in MS
    private readonly RESTART_TIMEOUT: number = 180 * 1000;
    // Represents a pending restart operation. Only set if the project is currently restarting.
    private pendingRestart: ProjectPendingRestart | undefined;

    // Active ProjectInfo webviewPanel. Only one per project. Undefined if no project overview page is active.
    // Track this so we can refresh it when update() is called, and prevent multiple webviews being open for one project.
    private activeProjectInfo: vscode.WebviewPanel | undefined;

    public readonly logManager: MCLogManager;

    constructor(
        projectInfo: any,
        public readonly connection: Connection,
    ) {
        Log.d("Creating project from info:", projectInfo);
        this.name = projectInfo.name;
        this.id = projectInfo.projectID;

        this.type = new ProjectType(projectInfo.projectType, projectInfo.language);

        this.localPath = vscode.Uri.file(
            MCUtil.appendPathWithoutDupe(connection.workspacePath.fsPath, vscode.Uri.file(projectInfo.locOnDisk).fsPath)
        );

        this._contextRoot = projectInfo.contextRoot || projectInfo.contextroot || "";

        // These will be overridden by the call to update(), but we set them here too so the compiler can see they're always set.
        this._autoBuildEnabled = projectInfo.autoBuild;
        // lastbuild is a number
        this._lastBuild = new Date(projectInfo.lastbuild);
        // appImageLastBuild is a string
        this._lastImgBuild = new Date(Number(projectInfo.appImgLastBuild));

        this._ports = {
            appPort: undefined,
            debugPort: undefined,
            internalPort: undefined,
            internalDebugPort: undefined,
        };

        this._state = this.update(projectInfo);

        // QuickPickItem
        this.label = Translator.t(STRING_NS, "quickPickLabel", { projectName: this.name, projectType: this.type.type });
        // this.detail = this.id;

        this.logManager = new MCLogManager(this);

        Log.i(`Created ${this.type} project ${this.name} with ID ${this.id} at ${this.localPath.fsPath}`);
    }

    // description used by QuickPickItem
    public get description(): string {
        const appUrl = this.appBaseUrl;
        if (appUrl != null) {
            return appUrl.toString();
        }
        else {
            return Translator.t(STRING_NS, "quickPickNotRunning");
        }
    }

    /**
     * Set this project's status based on the project info event payload passed.
     * This includes checking the appStatus, buildStatus, buildStatusDetail, and startMode.
     * Also updates the appPort and debugPort.
     */
    public update = (projectInfo: any, isRestart: boolean = false): ProjectState => {
        if (projectInfo.projectID !== this.id) {
            // shouldn't happen, but just in case
            Log.e(`Project ${this.id} received status update request for wrong project ${projectInfo.projectID}`);
            // return the old state
            return this._state;
        }

        // Whether or not this update call has changed the project such that we have to update the UI.
        let changed: boolean = false;

        if (!isRestart) {
            // Ignore these if it's a restart because the restart event won't have them
            changed = this.setContainerID(projectInfo.containerId) || changed;
            changed = this.setLastBuild(projectInfo.lastbuild) || changed;
            // appImageLastBuild is a string
            changed = this.setLastImgBuild(Number(projectInfo.appImageLastBuild)) || changed;
            changed = this.setAutoBuild(projectInfo.autoBuild) || changed;
        }

        // note oldState can be null if this is the first time update is being invoked.
        const oldState = this._state;
        this._state = new ProjectState(projectInfo, oldState != null ? oldState : undefined);

        if (!this._state.equals(oldState)) {
            changed = true;
            const startModeMsg = projectInfo.startMode == null ? "" : `, startMode=${projectInfo.startMode}`;
            Log.d(`${this.name} went from ${oldState} to ${this._state}${startModeMsg}`);

            // Check if the project was just enabled or disabled
            if (oldState != null) {
                if (oldState.isEnabled && !this._state.isEnabled) {
                    this.onDisable();
                }
                else if (!oldState.isEnabled && this._state.isEnabled) {
                    this.onEnable();
                }
            }
        }

        const ports = projectInfo.ports;
        if (ports != null) {
            changed = this.updatePorts(ports) || changed;
        }
        else if (this._state.isStarted) {
            Log.e("No ports were provided for an app that is supposed to be started");
        }

        if (this.pendingRestart != null) {
            this.pendingRestart.onStateChange(this.state.appState);
        }

        // Logger.log(`${this.name} has a new status:`, this._state);
        if (changed) {
            // Log.d(`${this.name} has changed`);
            this.onChange();
        }

        return this._state;
    }

    /**
     * Call when this project's mutable fields change
     * to update the tree view and project info pages.
     */
    private onChange(): void {
        this.connection.onChange(this);
        this.tryRefreshProjectInfoPage();
    }

    /**
     * Update this project's port fields. Does not call onChange().
     * @param ports - Ports object from a Microclimate socket event or Project info
     * @returns true if at least one port was changed
     */
    private updatePorts(ports: {
        exposedPort?: OptionalString;
        exposedDebugPort?: OptionalString;
        internalPort?: OptionalString;
        internalDebugPort?: OptionalString;
    }): boolean {
        let changed = false;
        changed = this.setPort(ports.exposedPort, "appPort");
        changed = this.setPort(ports.exposedDebugPort, "debugPort") || changed;
        changed = this.setPort(ports.internalPort, "internalPort") || changed;
        changed = this.setPort(ports.internalDebugPort, "internalDebugPort") || changed;

        return changed;
    }

    public onSettingsChangedEvent(event: SocketEvents.IProjectSettingsEvent): void {
        Log.d("project settings changed " + this.name, event);

        if (event.status !== SocketEvents.STATUS_SUCCESS) {
            let errMsg = "Project settings update failed: ";
            Log.e(errMsg, event.error);
            if (event.error) {
                errMsg += " " + event.error;
            }
            vscode.window.showErrorMessage(errMsg);
            // We still continue with the update even in the case of error
        }

        // Only one of contextroot, app port, or debug port should be set
        // but there's no reason to treat it differently if multiple are set
        let changed = false;
        if (event.contextRoot) {
            let newContextRoot = event.contextRoot;
            // Remove leading / if present
            if (newContextRoot.startsWith("/")) {
                newContextRoot = newContextRoot.substring(1, newContextRoot.length);
            }
            this._contextRoot = event.contextRoot;
            Log.i("ContextRoot now " + this._contextRoot);
            changed = true;
        }
        if (event.ports) {
            if (event.ports.internalPort) {
                changed = this.setPort(event.ports.internalPort, "internalPort");
            }
            else if (event.ports.internalDebugPort) {
                changed = this.setPort(event.ports.internalDebugPort, "internalDebugPort");
            }
            else {
                Log.e("Received unexpected ports response:", event.ports);
            }
        }

        if (changed) {
            this.onChange();
        }
    }

    public doRestart(mode: StartModes.Modes): boolean {
        if (this.pendingRestart != null) {
            // should be prevented by the RestartProjectCommand
            Log.e(this.name + ": doRestart called when already restarting");
            return false;
        }

        this.pendingRestart = new ProjectPendingRestart(this, mode, this.RESTART_TIMEOUT);
        return true;
    }

    public onRestartFinish(): void {
        Log.d(this.name + ": onRestartFinish");
        this.pendingRestart = undefined;
    }

    /**
     * Validate the restart event. If it succeeded, update ports.
     * Notifies the pendingRestart.
     */
    public onRestartEvent(event: SocketEvents.IProjectRestartedEvent): void {
        let success: boolean;
        let errMsg: string | undefined;

        if (this.pendingRestart == null) {
            Log.e(this.name + ": received restart event without a pending restart", event);
            return;
        }

        if (SocketEvents.STATUS_SUCCESS !== event.status) {
            Log.e(`${this.name}: Restart failed, response is`, event);

            errMsg = Translator.t(StringNamespaces.DEFAULT, "genericErrorProjectRestart", { thisName: this.name });
            if (event.errorMsg != null) {
                errMsg = event.errorMsg;
            }

            success = false;
        }
        else if (event.ports == null || event.startMode == null || !StartModes.allStartModes().includes(event.startMode)) {
            // If the status is "success" (as we just checked), these must all be set and valid
            errMsg = Translator.t(StringNamespaces.DEFAULT, "genericErrorProjectRestart", { thisName: this.name });
            Log.e(errMsg + ", payload:", event);

            success = false;
        }
        else {
            Log.d("Restart event is valid");
            this.updatePorts(event.ports);
            this.onChange();
            success = true;
        }

        this.pendingRestart.onReceiveRestartEvent(success, errMsg);
    }

    public onConnectionReconnect(): void {
        this.logManager.onReconnectOrEnable();
    }

    public onConnectionDisconnect(): void {
        if (this.pendingRestart != null) {
            this.pendingRestart.onDisconnectOrDisable(true);
        }
        this.logManager.onDisconnectOrDisable(true);
    }

    public async onEnable(): Promise<void> {
        Log.i(`${this.name} has been enabled`);
        this.logManager.onReconnectOrEnable();
    }

    public async onDisable(): Promise<void> {
        Log.i(`${this.name} has been disabled`);
        if (this.pendingRestart != null) {
            this.pendingRestart.onDisconnectOrDisable(false);
        }
        // this.logManager.destroyAllLogs();
        this.logManager.onDisconnectOrDisable(false);
    }

    public async dispose(): Promise<void> {
        return Promise.all([
            this.clearValidationErrors(),
            this.logManager.destroyAllLogs(),
            this.activeProjectInfo != null ? this.activeProjectInfo.dispose() : Promise.resolve(),
        ])
        .then(() => {
            this.connection.onChange(this);
        });
    }

    /**
     * Call when this project is deleted in Microclimate
     */
    public async onDelete(): Promise<void> {
        Log.i(`${this.name} was deleted`);
        // vscode.window.showInformationMessage(Translator.t(STRING_NS, "onDeletion", { projectName: this.name }));
        DebugUtils.removeDebugLaunchConfigFor(this);
        await this.dispose();
    }

    /**
     * Clear all diagnostics for this project's path
     */
    public async clearValidationErrors(): Promise<void> {
        Project.diagnostics.delete(this.localPath);
    }

    ///// ProjectOverview

    /**
     * To be called when the user tries to open this project's Project Info page.
     *
     * If the user already has a Project Info page open for this project, returns the existing page.
     * In this case, the webview should be re-revealed, but a new one should not be created.
     * If the user does not already have an info page open for this project, returns undefined,
     * and sets the given webview to be this project's project info panel.
     */
    public onOpenProjectInfo(wvPanel: vscode.WebviewPanel): vscode.WebviewPanel | undefined {
        if (this.activeProjectInfo != null) {
            return this.activeProjectInfo;
        }
        // Log.d(`Info opened for project ${this.name}`);
        this.activeProjectInfo = wvPanel;
        return undefined;
    }

    public closeProjectInfo(): void {
        if (this.activeProjectInfo != null) {
            this.activeProjectInfo.dispose();
            this.activeProjectInfo = undefined;
        }
    }

    private tryRefreshProjectInfoPage(): void {
        if (this.activeProjectInfo != null) {
            // Log.d("Refreshing projectinfo");
            refreshProjectOverview(this.activeProjectInfo, this);
        }
    }

    ///// Getters

    public get isRestarting(): boolean {
        return this.pendingRestart != null;
    }

    public get containerID(): OptionalString {
        return this._containerID;
    }

    public get contextRoot(): string {
        return this._contextRoot;
    }

    public get ports(): IProjectPorts {
        return this._ports;
    }

    public get autoBuildEnabled(): boolean {
        return this._autoBuildEnabled;
    }

    public get state(): ProjectState {
        return this._state;
    }

    public get appBaseUrl(): vscode.Uri | undefined {
        if (this._ports.appPort == null || isNaN(this._ports.appPort)) {
            // app is stopped, disabled, etc.
            return undefined;
        }

        return this.connection.url.with({
            authority: `${this.connection.host}:${this._ports.appPort}`,      // non-nls
            path: this._contextRoot
        });
    }

    public get debugUrl(): OptionalString {
        if (this._ports.debugPort == null || isNaN(this._ports.debugPort)) {
            return undefined;
        }

        return this.connection.host + ":" + this._ports.debugPort;            // non-nls
    }

    public get lastBuild(): Date {
        return this._lastBuild;
    }

    public get lastImgBuild(): Date {
        return this._lastImgBuild;
    }

    public get hasContextRoot(): boolean {
        return this._contextRoot != null && this._contextRoot.length > 0 && this._contextRoot !== "/";
    }

    ///// Setters

    /**
     * Set one of this project's Port fields.
     * @param newPort Can be undefined if the caller wishes to "unset" the port (ie, because the app is stopping)
     * @returns true if at least one port was changed.
     */
    private setPort(newPort: OptionalString, portType: keyof IProjectPorts): boolean {
        if (newPort === "") {
            newPort = undefined;
        }
        const newPortNumber = Number(newPort);
        const currentPort = this._ports[portType];

        if (newPort && !MCUtil.isGoodPort(newPortNumber)) {
            Log.w(`Invalid ${portType} port ${newPort} given to project ${this.name}, ignoring it`);
            return false;
        }
        else if (currentPort !== newPortNumber) {
            if (isNaN(newPortNumber)) {
                this._ports[portType] = undefined;
                // Log.d(`Unset ${portType} for ${this.name}`);
            }
            else if (newPortNumber !== currentPort) {
                Log.d(`New ${portType} for ${this.name} is ${newPortNumber}`);
                this._ports[portType] = newPortNumber;
            }
            // the third case is that (the new port === the old port) and neither are null - we don't log anything in this case.
            return true;
        }
        // Log.d(`${portType} port is already ${currentPort}`);
        return false;
    }

    private setContainerID(newContainerID: OptionalString): boolean {
        const oldContainerID = this._containerID;
        this._containerID = newContainerID;

        const changed = this._containerID !== oldContainerID;
        if (changed) {
            const asStr: string = this._containerID == null ? "undefined" : this._containerID.substring(0, 8);
            if (asStr.length === 0) {
                Log.w(`Empty containerID for ${this.name}`);
            }
            Log.d(`New containerID for ${this.name} is ${asStr}`);
        }
        return changed;
    }

    private setLastBuild(newLastBuild: OptionalNumber): boolean {
        if (newLastBuild == null) {
            return false;
        }
        const oldlastBuild = this._lastBuild;
        this._lastBuild = new Date(newLastBuild);

        const changed = this._lastBuild !== oldlastBuild;
        if (changed) {
            // Log.d(`New lastBuild for ${this.name} is ${this._lastBuild}`);
        }
        return changed;
    }

    private setLastImgBuild(newLastImgBuild: OptionalNumber): boolean {
        if (newLastImgBuild == null) {
            return false;
        }
        const oldlastImgBuild = this._lastImgBuild;
        this._lastImgBuild = new Date(newLastImgBuild);

        const changed = this._lastImgBuild !== oldlastImgBuild;
        if (changed) {
            // Log.d(`New lastImgBuild for ${this.name} is ${this._lastImgBuild}`);
        }
        return changed;
    }

    public setAutoBuild(newAutoBuild: boolean | undefined): boolean {
        if (newAutoBuild == null) {
            return false;
        }
        const oldAutoBuild = this._autoBuildEnabled;
        this._autoBuildEnabled = newAutoBuild;

        const changed = this._autoBuildEnabled !== oldAutoBuild;
        if (changed) {
            // onChange has to be invoked explicitly because this function can be called outside of update()
            Log.d(`New autoBuild for ${this.name} is ${this._autoBuildEnabled}`);
            this.onChange();
        }

        return changed;
    }
}
