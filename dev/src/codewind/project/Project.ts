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
import * as path from "path";
import * as fs from "fs-extra";

import MCUtil from "../../MCUtil";
import ProjectState from "./ProjectState";
import Log from "../../Logger";
import Translator from "../../constants/strings/Translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import ProjectCapabilities, { StartModes } from "./ProjectCapabilities";
import MCLogManager from "./logs/MCLogManager";
import DebugUtils from "./DebugUtils";
import ProjectType from "./ProjectType";
import ProjectPendingRestart from "./ProjectPendingRestart";
import Connection from "../connection/Connection";
import SocketEvents from "../connection/SocketEvents";
import Validator from "./Validator";
import Constants from "../../constants/Constants";
import Commands from "../../constants/Commands";
import ProjectOverviewPageWrapper from "../../command/webview/ProjectOverviewPageWrapper";
import { MetricsDashboardStatus, MetricsInjectionStatus, PFEProjectData } from "../Types";
import Requester from "../Requester";
import ProjectRequester from "./ProjectRequester";
import { CLICommandRunner } from "../cli/CLICommandRunner";

const STRING_NS = StringNamespaces.PROJECT;

/**
 * Project's ports info. Keys match those provided by backend.
 */
interface IProjectPorts {
    appPort?: number;
    internalPort?: number;
    debugPort?: number;
    internalDebugPort?: number;
}

export default class Project implements vscode.QuickPickItem {

    public readonly initPromise: Promise<void>;

    // Immutable project data
    public readonly name: string;
    public readonly id: string;
    public readonly type: ProjectType;
    public readonly language: string;
    // abs path to the project on the user's filesystem
    public readonly localPath: vscode.Uri;
    // abs path to the source code within the container, used for debug source mapping so only set for specific project types.
    public readonly containerAppRoot: string | undefined;

    private _capabilities: ProjectCapabilities | undefined;

    // Mutable project data, will change with calls to update() and similar functions. Prefixed with _ because these all have getters.
    private readonly _state: ProjectState;
    private _containerID: string | undefined;
    private _podName: string | undefined;
    private _namespace: string | undefined;
    private _contextRoot: string;
    private readonly _ports: IProjectPorts;
    private kubeAppBaseURL: vscode.Uri | undefined;
    private _autoBuildEnabled: boolean;
    private _usesHttps: boolean;
    private _lastBuild: Date | undefined;
    private _lastImageBuild: Date | undefined;

    private readonly requester: ProjectRequester;
    public readonly logManager: MCLogManager;

    private _metricsDashboardStatus: MetricsDashboardStatus;
    private _perfDashboardPath: string | null;
    private _metricsInjectStatus: MetricsInjectionStatus;

    // can we query filewatcher for this project's capabilities
    private _capabilitiesReady: boolean;

    public static readonly diagnostics: vscode.DiagnosticCollection
        = vscode.languages.createDiagnosticCollection(Validator.DIAGNOSTIC_COLLECTION_NAME);

    // Represents a pending restart operation. Only set if the project is currently restarting.
    private pendingRestart: ProjectPendingRestart | undefined;

    // Active ProjectInfo webviewPanel. Only one per project. Undefined if no project overview page is active.
    // Track this so we can refresh it when update() is called, and prevent multiple webviews being open for one project.
    private _overviewPage: ProjectOverviewPageWrapper | undefined;

    private resolvePendingDeletion: (() => void) | undefined;

    constructor(
        projectInfo: PFEProjectData,
        public readonly connection: Connection,
    ) {
        Log.d("Creating project from info:", projectInfo);
        this.name = projectInfo.name;
        this.id = projectInfo.projectID;

        const extensionName = (projectInfo.extension) ? projectInfo.extension.name : undefined;
        this.type = new ProjectType(projectInfo.projectType, projectInfo.language, extensionName);
        this.language = projectInfo.language || "Unknown";
        this.localPath = vscode.Uri.file(projectInfo.locOnDisk);
        this._contextRoot = projectInfo.contextRoot || "";
        this._usesHttps = projectInfo.isHttps === true;

        if (projectInfo.extension && projectInfo.extension.config) {
            this.containerAppRoot = projectInfo.extension.config.containerAppRoot;
        }
        if (!this.containerAppRoot) {
            this.containerAppRoot = projectInfo.containerAppRoot;
        }

        // These will be overridden by the call to update(), but we set them here too so the compiler can see they're always set.
        this._autoBuildEnabled = projectInfo.autoBuild;
        // lastbuild is a number
        if (projectInfo.lastbuild) {
            this._lastBuild = new Date(projectInfo.lastbuild);
        }
        if (projectInfo.appImageLastBuild) {
            // appImageLastBuild is a string
            this._lastImageBuild = new Date(Number(projectInfo.appImageLastBuild));
        }

        // this field won't be here pre-0.8
        // https://github.com/eclipse/codewind/pull/1774
        this._capabilitiesReady = projectInfo.capabilitiesReady || false;

        this._ports = {
            appPort: undefined,
            debugPort: undefined,
            internalPort: undefined,
            internalDebugPort: undefined,
        };

        this._metricsDashboardStatus = projectInfo.metricsDashboard || { hosting: null, path: null };
        this._perfDashboardPath = projectInfo.perfDashboardPath     || null;
        this._metricsInjectStatus = projectInfo.injection           || { injectable: false, injected: false };

        this.requester = new ProjectRequester(this);

        this._state = new ProjectState(this.name);
        this._state = this.update(projectInfo);

        // if the inf data has logs and the project is enabled, logs are available now. Else, we have to wait for logsListChanged events.
        const canGetLogs = this._state.isEnabled && projectInfo.logs != null;
        this.logManager = new MCLogManager(this, this.requester, canGetLogs);

        // Do any async initialization work that must be done before the project is ready, here.
        // The function calling the constructor must await on this promise before expecting the project to be ready.
        this.initPromise = Promise.all([
            this.updateCapabilities(),
            // skip the debug config step in Che
            global.IS_CHE ? Promise.resolve() : this.updateDebugConfig(),
        ])
        .then(() => Promise.resolve());

        Log.i(`Created ${this.type.toString()} project ${this.name} on ${this.connection.label} with ID ${this.id} at ${this.localPath.fsPath}`);
    }

    public toString(): string {
        return this.name;
    }

    public async dispose(): Promise<void> {
        await Promise.all([
            this.clearValidationErrors(),
            this.logManager?.destroyAllLogs(),
            this._overviewPage != null ? this._overviewPage.dispose() : Promise.resolve(),
            DebugUtils.removeDebugLaunchConfigFor(this),
        ]);
    }

    /**
     * Set this project's status based on the project info event payload passed.
     * This includes checking the appStatus, buildStatus, buildStatusDetail, and startMode.
     * Also updates the appPort and debugPort.
     */
    public update = (projectInfo: PFEProjectData): ProjectState => {
        if (projectInfo.projectID !== this.id) {
            // shouldn't happen, but just in case
            Log.e(`Project ${this.id} received status update request for wrong project ${projectInfo.projectID}`);
            // return the old state
            return this._state;
        }

        this.setContainerID(projectInfo.containerId);
        this.setPodName(projectInfo.podName);
        this._namespace = projectInfo.namespace;

        this._lastBuild = projectInfo.lastbuild ? new Date(projectInfo.lastbuild) : undefined;
        this._lastImageBuild = projectInfo.appImageLastBuild ? new Date(Number(projectInfo.appImageLastBuild)) : undefined;
        this.setAutoBuild(projectInfo.autoBuild);

        if (projectInfo.isHttps) {
            this._usesHttps = projectInfo.isHttps === true;
        }

        if (projectInfo.contextRoot) {
            this._contextRoot = projectInfo.contextRoot;
        }

        if (projectInfo.appBaseURL) {
            const asUri = vscode.Uri.parse(projectInfo.appBaseURL);
            if (!asUri.scheme || !asUri.authority) {
                Log.e(`Bad appBaseURL "${projectInfo.appBaseURL}" provided; missing scheme or authority`);
            }
            this.kubeAppBaseURL = asUri;
        }

        const wasEnabled = this.state.isEnabled;
        const oldStateStr = this.state.toString();
        const stateChanged = this.state.update(projectInfo);

        let wasDisabled = false;
        if (stateChanged) {
            const startModeMsg = projectInfo.startMode == null ? "" : `, startMode=${projectInfo.startMode}`;
            Log.d(`${this.name} went from ${oldStateStr} to ${this._state}${startModeMsg}`);

            // Check if the project was just enabled or disabled
            if (wasEnabled && !this.state.isEnabled) {
                wasDisabled = true;
                this.onDisable();
            }
            else if (!wasEnabled && this.state.isEnabled) {
                this.onEnable();
            }
        }

        const oldCapabilitiesReady = this._capabilitiesReady;
        if (projectInfo.capabilitiesReady) {
            this._capabilitiesReady = projectInfo.capabilitiesReady;
        }
        if (oldCapabilitiesReady !== this._capabilitiesReady) {
            // Retain the capabilities for a project that was disabled.
            if (!wasDisabled) {
                // Log.d(`${this.name} capabilities now ready`);
                this.updateCapabilities();
            }
        }

        const ports = projectInfo.ports;
        if (ports) {
            this.updatePorts(ports);
        }
        else if (this._state.isStarted) {
            Log.e("No ports were provided for an app that is supposed to be started");
        }

        if (projectInfo.metricsDashboard) {
            this._metricsDashboardStatus = projectInfo.metricsDashboard;
        }
        if (projectInfo.perfDashboardPath) {
            this._perfDashboardPath = projectInfo.perfDashboardPath;
        }
        if (projectInfo.injection) {
            this._metricsInjectStatus = projectInfo.injection;
        }

        if (this.pendingRestart != null) {
            this.pendingRestart.onStateChange(this.state.appState);
        }
        this.onChange();

        return this._state;
    }

    /**
     * Call when this project's mutable fields change
     * to update the tree view and project info pages.
     */
    private onChange(): void {
        this.connection.onChange(this);
        this._overviewPage?.refresh();
    }

    /**
     * Update this project's port fields. Does not call onChange().
     * @param ports - Ports object from a socket event or Project info
     * @returns true if at least one port was changed
     */
    private updatePorts(ports: {
        exposedPort?: string | undefined;
        exposedDebugPort?: string | undefined;
        internalPort?: string | undefined;
        internalDebugPort?: string | undefined;
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

    public async doRestart(mode: StartModes): Promise<void> {
        if (this.pendingRestart != null) {
            // should be prevented by the RestartProjectCommand
            Log.e(this.name + ": doRestart called when already restarting");
            return;
        }

        await this.requester.requestProjectRestart(mode);
        this.pendingRestart = new ProjectPendingRestart(this, mode);
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

            errMsg = Translator.t(STRING_NS, "genericErrorProjectRestart", { thisName: this.name });
            if (event.errorMsg != null) {
                errMsg = event.errorMsg;
            }

            success = false;
        }
        else if (event.ports == null || event.startMode == null ||
                !ProjectCapabilities.allStartModes.map((mode) => mode.toString()).includes(event.startMode)) {

            // If the status is "success" (as we just checked), these must all be set and valid
            errMsg = Translator.t(StringNamespaces.DEFAULT, "genericErrorProjectRestart", { thisName: this.name });
            Log.e(errMsg + ", payload:", event);

            success = false;
        }
        else {
            Log.d("Restart event is valid");
            this.updatePorts(event.ports);
            // https://github.com/eclipse/codewind/issues/311
            if (event.containerId) {
                this.setContainerID(event.containerId);
            }
            this.onChange();
            success = true;
        }

        this.pendingRestart.onReceiveRestartEvent(success, errMsg);
    }

    private async updateCapabilities(): Promise<void> {
        if (!this.state.isEnabled || !this._capabilitiesReady) {
            // The project must refresh the capabilities on re-enable, or when capabilitiesReady becomes true.
            // server will return a 404 in this case
            return;
        }
        try {
            this._capabilities = await this.requester.getCapabilities();
        }
        catch (err) {
            Log.e("Error retrieving capabilities for " + this.name, err);
            this._capabilities = ProjectCapabilities.NO_CAPABILITIES;
        }
        this.onChange();
    }

    private async updateDebugConfig(): Promise<void> {
        try {
            if (this.type.debugType !== undefined) {
                await DebugUtils.setDebugConfig(this);
            }
        }
        catch (err) {
            Log.e(`Error creating debug configuration for  ${this.name}`, err);
        }
    }

    public async requestBuild(): Promise<void> {
        Log.i(`Request build for project ${this.name}`);
        try {
            await this.requester.requestBuild();
            vscode.window.showInformationMessage(`Building ${this.name}`);
        }
        catch (err) {
            const errMsg = `Error initialing a build of ${this.name}`;
            Log.e(errMsg, err);
            vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
        }
    }

    public async toggleEnablement(): Promise<void> {
        Log.i(`Toggle enablement for project ${this.name}`);

        const newEnablement = !this.state.isEnabled;
        try {
            vscode.window.showInformationMessage(`${newEnablement ? "Enabling" : "Disabling"} ${this.name}`);
            return this.requester.requestToggleEnablement(newEnablement);
        }
        catch (err) {
            const errMsg = `Failed to ${newEnablement ? "enable" : "disable"} ${this.name}`;
            Log.e(errMsg, err);
            vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
        }
    }

    public async toggleAutoBuild(): Promise<void> {
        const newAutoBuild = !this._autoBuildEnabled;
        try {
            await this.requester.requestToggleAutoBuild(newAutoBuild);
            vscode.window.showInformationMessage(`${newAutoBuild ? "Enabling" : "Disabling"} auto-build for ${this.name}`);
            this.setAutoBuild(newAutoBuild);
        }
        catch (err) {
            const errMsg = `Failed to ${newAutoBuild ? "enable" : "disable"} auto-build for ${this.name}`;
            Log.e(errMsg, err);
            vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
        }
    }

    public async toggleInjectMetrics(): Promise<void> {
        const newInjectMetrics = !this.isInjectingMetrics;
        try {
            await this.requester.requestToggleInjectMetrics(newInjectMetrics);
            vscode.window.showInformationMessage(`${newInjectMetrics ? "Enabling" : "Disabling"} Application Metrics injection for ${this.name}`);
            this.setInjectMetrics(newInjectMetrics);
        }
        catch (err) {
            const errMsg = `Failed to ${newInjectMetrics ? "enable" : "disable"} Application Metrics injection for ${this.name}`;
            Log.e(errMsg, err);
            vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
        }
    }

    public onConnectionReconnect(): void {
        this.logManager.onReconnectOrEnable();
    }

    public onConnectionDisconnect(): void {
        if (this.pendingRestart != null) {
            this.pendingRestart.onDisconnectOrDisable(true);
        }
        this.logManager.onDisconnect();
    }

    public async onEnable(): Promise<void> {
        Log.i(`${this.name} has been enabled`);
        this.logManager.onReconnectOrEnable();
        await this.updateCapabilities();
    }

    public async onDisable(): Promise<void> {
        Log.i(`${this.name} has been disabled`);
        if (this.pendingRestart != null) {
            this.pendingRestart.onDisconnectOrDisable(false);
        }
        // this.logManager.destroyAllLogs();
        this.logManager?.destroyAllLogs();

        // Clear now-invalid application info
        this._containerID = undefined;
        this._podName = undefined;
        this.kubeAppBaseURL = undefined;
        this.updatePorts({
            exposedPort: undefined,
            exposedDebugPort: undefined,
        });
        await this.clearValidationErrors();
    }

    public async onLoadRunnerUpdate(event: SocketEvents.LoadRunnerStatusEvent): Promise<void> {
        Log.d(`${this.name} load runner status changed to "${event.status}" at ${event.timestamp}`);
        if (![ "hcdReady", "profilingReady"].includes(event.status)) {
            return;
        }
        Log.d("Profiling data is ready to be saved to workspace");

        const timestampPath = path.join(this.localPath.fsPath, "load-test", event.timestamp);

        let fileName = "";
        if (this.language.toLowerCase() === ProjectType.Languages.JAVA) {
            fileName = "profiling.hcd";
        } else if (this.language.toLowerCase() === ProjectType.Languages.NODE) {
            fileName = "profiling.json";
        } else {
            // should not be possible because the load test should not have run in the first place
            Log.e(`Project language ${this.language} not supported for profiling`);
            return;
        }

        const profilingOutPath = path.join(timestampPath, fileName);
        try {
            await fs.ensureDir(timestampPath);
        }
        catch (err) {
            Log.e(`Error creating directory ${timestampPath}`, err);
            vscode.window.showErrorMessage(`Could not create directory at ${timestampPath}: ${MCUtil.errToString(err)}`);
            return;
        }

        await this.requester.receiveProfilingData(event.timestamp, profilingOutPath);
    }

    public async deleteFromCodewind(deleteFiles: boolean): Promise<void> {
        Log.d(`Deleting ${this}`);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: `Removing ${this.name} from ${this.connection.label}...`
        }, async () => {
            return new Promise<void>(async (resolve, reject) => {
                this.resolvePendingDeletion = resolve;

                try {
                    await CLICommandRunner.removeProject(this.id, deleteFiles);
                }
                catch (err) {
                    this.resolvePendingDeletion = undefined;
                    reject(err);
                }
            });
        });
    }

    public async onDeletionEvent(event: SocketEvents.DeletionResult): Promise<void> {
        if (!this.resolvePendingDeletion) {
            Log.e(`Received deletion event for ${this} that was not pending deletion`);
            return;
        }

        if (event.status !== SocketEvents.STATUS_SUCCESS) {
            Log.e(`Received bad deletion event for ${this}`, event);
            vscode.window.showErrorMessage(`Error deleting ${this.name}`);
            // resolve the pending deletion because they will have to try again
            this.resolvePendingDeletion();
            return;
        }

        Log.i(`${this} was deleted from ${this.connection.label}`);

        try {
            await this.dispose();
        }
        catch (err) {
            Log.e(`Error disposing ${this.name}`, err);
        }

        this.resolvePendingDeletion();
        this.resolvePendingDeletion = undefined;
        this.connection.onProjectDeletion(this.id);
        Log.d(`Finished deleting ${this}`);
    }

    /**
     * Clear all diagnostics for this project's path
     */
    public async clearValidationErrors(): Promise<void> {
        Project.diagnostics.delete(this.localPath);
    }

    ///// ProjectOverview

    public onDidOpenOverviewPage(overviewPage: ProjectOverviewPageWrapper): void {
        this._overviewPage = overviewPage;
    }

    public get overviewPage(): ProjectOverviewPageWrapper | undefined {
        return this._overviewPage;
    }

    public onDidCloseOverviewPage(): void {
        this._overviewPage = undefined;
    }

    ///// Getters

    // QuickPickItem
    public get label(): string {
        return Translator.t(STRING_NS, "quickPickLabel", { projectName: this.name, projectType: this.type.toString() });
    }

    // QuickPickItem
    public get description(): string {
        const appUrl = this.appUrl;
        if (appUrl != null) {
            return appUrl.toString();
        }
        else {
            return Translator.t(STRING_NS, "quickPickNotRunning");
        }
    }

    // QuickPickItem
    public get detail(): string {
        return this.connection.label;
    }

    public get isRestarting(): boolean {
        return this.pendingRestart != null;
    }

    public get containerID(): string | undefined {
        return this._containerID;
    }

    public get podName(): string | undefined {
        return this._podName;
    }

    public get namespace(): string | undefined {
        return this._namespace;
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

    public get capabilities(): ProjectCapabilities | undefined {
        return this._capabilities;
    }

    public get appUrl(): vscode.Uri | undefined {
        // If the backend has provided us with a baseUrl already, use that
        if (this.kubeAppBaseURL) {
            return this.kubeAppBaseURL.with({
                path: this._contextRoot,
            });
        }

        if (this._ports.appPort == null || isNaN(this._ports.appPort)) {
            // app is stopped, disabled, etc.
            return undefined;
        }

        const scheme = this._usesHttps ? "https" : "http";                  // non-nls

        return this.connection.url.with({
            scheme,
            authority: `${this.connection.pfeHost}:${this._ports.appPort}`,    // non-nls
            path: this._contextRoot
        });
    }

    public get debugUrl(): string | undefined {
        if (this._ports.debugPort == null || isNaN(this._ports.debugPort)) {
            return undefined;
        }

        return this.connection.pfeHost + ":" + this._ports.debugPort;            // non-nls
    }

    public get lastBuild(): Date | undefined {
        return this._lastBuild;
    }

    public get lastImgBuild(): Date | undefined {
        return this._lastImageBuild;
    }

    public get hasContextRoot(): boolean {
        return this._contextRoot != null && this._contextRoot.length > 0 && this._contextRoot !== "/";
    }

    public get canContainerShell(): boolean {
        return !this.connection.isRemote; // && !!this.containerID;
    }

    /**
     * @returns The VS Code workspace folder containing this project, if one exists.
     * `isExactMatch` is true if the returned workspace folder is this project's folder,
     * or false if the returned folder is a parent directory of this project.
     * If the project any of its parent directories is not under the VS Code workspace, returns undefined.
     */
    public get workspaceFolder(): vscode.WorkspaceFolder & { isExactMatch: boolean } | undefined {
        const wsFolders = vscode.workspace.workspaceFolders;
        if (wsFolders == null) {
            return undefined;
        }

        let bestMatch: vscode.WorkspaceFolder | undefined;
        for (const wsFolder of wsFolders) {
            if (wsFolder.uri.fsPath === this.localPath.fsPath) {
                // exact match, this project is a workspace folder
                return { ...wsFolder, isExactMatch: true };
            }

            if (this.localPath.fsPath.startsWith(wsFolder.uri.fsPath)) {
                if (!bestMatch || wsFolder.uri.fsPath.length > bestMatch.uri.fsPath.length) {
                    // if this is the first match, or a longer (more precise) match, update the bestMatch
                    bestMatch = wsFolder;
                }
            }
        }

        if (bestMatch) {
            return { ...bestMatch, isExactMatch: false };
        }
        return undefined;
    }

    public get isInVSCodeWorkspace(): boolean {
        return this.workspaceFolder != null;
    }

    public get hasMetricsDashboard(): boolean {
        return this._metricsDashboardStatus != null &&
            this._metricsDashboardStatus.hosting != null &&
            this._metricsDashboardStatus.path != null;
    }

    /**
     * Return the URL to this project's metrics dashboard (previously called app monitor), if it has one.
     * Can be hosted either by the project (eg with appmetrics-dash installed) or by the Codewind performance container.
     */
    public get metricsDashboardURL(): vscode.Uri | undefined {
        if (!this.hasMetricsDashboard || !this._metricsDashboardStatus.path) {
            return undefined;
        }

        let baseUrl: vscode.Uri;
        // See https://github.com/eclipse/codewind/issues/1815#issuecomment-583354048 for background
        if (this._metricsDashboardStatus.hosting === "project") {
            // If the project hosts its own metrics dashboard we just append the metrics-dash path to the app container's base URL
            if (this.appUrl == null) {
                return undefined;
            }
            baseUrl = this.appUrl;
        }
        else if (this._metricsDashboardStatus.hosting === "performanceContainer") {
            baseUrl = this.connection.pfeBaseURL;
        }
        else {
            Log.e(`Unrecognizable metrics dashboard status:`, this._metricsDashboardStatus);
            return undefined;
        }
        const metricsDashUrl = MCUtil.appendUrl(baseUrl.toString(), this._metricsDashboardStatus.path);
        return vscode.Uri.parse(metricsDashUrl);
    }

    public get perfDashboardURL(): vscode.Uri | undefined {
        if (!this._perfDashboardPath) {
            // Log.d(`${this.name} missing perf dashboard info`);
            return undefined;
        }
        const perfDashboardUrl = MCUtil.appendUrl(this.connection.pfeBaseURL.toString(), this._perfDashboardPath);
        return vscode.Uri.parse(perfDashboardUrl);
    }

    public get canInjectMetrics(): boolean {
        return this._metricsInjectStatus.injectable;
    }

    public get isInjectingMetrics(): boolean {
        return this._metricsInjectStatus.injected;
    }

    ///// Setters

    /**
     * Set one of this project's Port fields.
     * @param newPort Can be undefined if the caller wishes to "unset" the port (ie, because the app is stopping)
     * @returns true if at least one port was changed.
     */
    private setPort(newPort: string | undefined, portType: keyof IProjectPorts): boolean {
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
                if (this._ports[portType]) {
                    Log.d(`Unset ${portType} for ${this.name}`);
                }
                this._ports[portType] = undefined;
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

    private setContainerID(newContainerID: string | undefined): void {
        if (newContainerID === "") {
            newContainerID = undefined;
        }
        const oldContainerID = this._containerID;
        this._containerID = newContainerID;

        const changed = this._containerID !== oldContainerID;
        if (changed) {
            const asStr = this._containerID == null ? "undefined" : this._containerID.substring(0, 8);
            Log.i(`New containerID for ${this.name} is ${asStr}`);
        }
    }

    private setPodName(newPodName: string | undefined): void {
        if (newPodName === "") {
            newPodName = undefined;
        }
        const oldPodName = this._podName;
        this._podName = newPodName;

        const changed = this._podName !== oldPodName;
        if (changed) {
            Log.i(`New podName for ${this.name} is ${this.podName}`);
        }
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

    public setInjectMetrics(newInjectMetrics: boolean | undefined): boolean {
        if (newInjectMetrics == null) {
            return false;
        }
        const oldInjectMetrics = this.isInjectingMetrics;
        this._metricsInjectStatus.injected = newInjectMetrics;

        const changed = this._metricsInjectStatus.injected !== oldInjectMetrics;
        if (changed) {
            // onChange has to be invoked explicitly because this function can be called outside of update()
            Log.d(`New autoInjectMetricsEnabled for ${this.name} is ${this._metricsInjectStatus.injected}`);
            this.onChange();
        }
        return changed;
    }

    public async tryOpenSettingsFile(): Promise<void> {
        const settingsFilePath = path.join(this.localPath.fsPath, Constants.PROJ_SETTINGS_FILE_NAME);
        const settingsFileExists = await fs.pathExists(settingsFilePath);

        if (settingsFileExists) {
            vscode.commands.executeCommand(Commands.VSC_OPEN, vscode.Uri.file(settingsFilePath));
        }
        else if (this.type.isExtensionType) {
            // this is expected; https://github.com/eclipse/codewind/issues/649
            vscode.window.showWarningMessage(`Application settings cannot be configured for ${this.type.toString()} projects.`);
        }
        else {
            // fall-back in case the user deleted the file, or something.
            vscode.window.showWarningMessage(`${settingsFilePath} does not exist or was not readable.`);
        }
    }

    /**
     * Extra test for appsody projects' metrics dashboard - workaround for https://github.com/eclipse/codewind/issues/258
     */
    public async testPingMetricsDash(): Promise<boolean> {
        if (!this.type.isAppsody) {
            // this workaround is not necessary for non-appsody projects
            return true;
        }

        if (this.metricsDashboardURL == null) {
            return false;
        }

        Log.i(`Testing ${this.name} perf dash before opening`);
        try {
            return Requester.ping(this.metricsDashboardURL, 5000, 404);
        }
        catch (err) {
            Log.w(`Failed to access app monitor for project ${this.name} at ${this.metricsDashboardURL}`, err);
            return false;
        }
    }
}
