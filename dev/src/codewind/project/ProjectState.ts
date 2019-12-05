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

import Log from "../../Logger";
import SocketEvents from "../connection/SocketEvents";
import ProjectCapabilities from "./ProjectCapabilities";

/**
 * Represents the project's state. This means app state, build state, and any status details.
 * Immutable.
 */
export class ProjectState {
    public readonly appState: ProjectState.AppStates;
    public readonly appDetail: SocketEvents.AppStatusDetail | undefined;
    public readonly buildState: ProjectState.BuildStates;
    public readonly buildDetail: string;

    constructor(
        private readonly projectName: string,
        projectInfoPayload: any,
        // Use oldState if the projectInfoPayload is missing state information (eg. from a restart success event)
        // It will be used as fallback values if the new state is null or UNKNOWN.
        oldState: ProjectState | undefined
    ) {
        if (projectInfoPayload != null) {
            if (oldState != null) {
                if (projectInfoPayload[SocketEvents.Keys.APP_STATE] == null) {
                    projectInfoPayload[SocketEvents.Keys.APP_STATE] = oldState.appState.toString();
                }
                if (projectInfoPayload[SocketEvents.Keys.APP_DETAIL] == null) {
                    if (oldState.appDetail) {
                        // Only show a given notification once
                        oldState.appDetail.notify = false;
                    }
                    projectInfoPayload[SocketEvents.Keys.APP_DETAIL] = oldState.appDetail;
                }
                if (projectInfoPayload[SocketEvents.Keys.BUILD_STATE] == null) {
                    projectInfoPayload[SocketEvents.Keys.BUILD_STATE] = oldState.buildState.toString();
                }
                if (!projectInfoPayload[SocketEvents.Keys.BUILD_DETAIL]) {
                    projectInfoPayload[SocketEvents.Keys.BUILD_DETAIL] = oldState.buildDetail;
                }
            }

            this.appState = ProjectState.getAppState(projectInfoPayload);
            if (this.appState !== ProjectState.AppStates.DISABLED) {
                this.appDetail = projectInfoPayload[SocketEvents.Keys.APP_DETAIL];
            }
            else {
                this.appDetail = undefined;
            }
            this.buildState = ProjectState.getBuildState(projectInfoPayload);
            this.buildDetail = (projectInfoPayload[SocketEvents.Keys.BUILD_DETAIL] || "").trim();

            if (this.appDetail) {
                vscode.window.showInformationMessage(`APP DETAIL FOR ${this.projectName} ${JSON.stringify(this.appDetail)}`);
            }

            if (this.appDetail && this.appDetail.notify) {
                this.notify();
            }
        }
        else {
            Log.e("ProjectState received null ProjectInfo");
            this.appState = ProjectState.AppStates.UNKNOWN;
            this.buildState = ProjectState.BuildStates.UNKNOWN;
            this.buildDetail = "";
        }
    }

    public equals(other: ProjectState): boolean {
        return other != null &&
            this.appState === other.appState &&
            this.appDetail === other.appDetail &&
            this.buildState === other.buildState &&
            this.buildDetail === other.buildDetail;
    }

    public get isEnabled(): boolean {
        return ProjectState.getEnabledStates().includes(this.appState);
    }

    public get isStarted(): boolean {
        return ProjectState.getStartedStates().includes(this.appState);
    }

    public get isStarting(): boolean {
        return ProjectState.getStartingStates().includes(this.appState);
    }

    public get isDebuggable(): boolean {
        return ProjectState.getDebuggableStates().includes(this.appState);
    }

    public get isBuilding(): boolean {
        return this.buildState === ProjectState.BuildStates.BUILDING;
    }

    public toString(): string {
        if (!this.isEnabled) {
            // Just show Disabled for disabled projects
            return `[${this.appState}]`;
        }

        const buildStatusStr = this.getBuildString();
        if (this.appState === ProjectState.AppStates.UNKNOWN) {
            if (!buildStatusStr) {
                Log.e("Both app status and build status are unknown");
                return "";
            }
            // Return only the build status if app status is unknown
            return `[${buildStatusStr}]`;
        }
        else {
            // Return both statuses
            return `[${this.appState}] [${buildStatusStr}]`;
        }
    }

    public getBuildString(): string | undefined {
        if (!this.isEnabled) {
            return undefined;
        }

        let buildStateStr = "";

        if (this.buildDetail != null && this.buildDetail.trim() !== "") {
            // a detailed status is available
            if (this.buildState === ProjectState.BuildStates.BUILDING) {
                // Don't show "building" because the detail will have "building" in it already
                return this.buildDetail;
            }
            else {
                buildStateStr = `${this.buildState} - ${this.buildDetail}`;
            }
        }
        // Don't display the build state if it's unknown
        else if (this.buildState !== ProjectState.BuildStates.UNKNOWN) {
            buildStateStr = `${this.buildState}`;                               // non-nls
        }
        return buildStateStr;
    }

    public getAppStatusWithDetail(): string {
        let status = this.appState.toString();
        if (this.appDetail && this.appDetail.message) {
            status += ` - ${this.appDetail.message}`;
        }
        return status;
    }

    private notify(): void {
        // https://github.com/eclipse/codewind/issues/1297
        if (!this.appDetail || !this.appDetail.notify) {
            return;
        }

        Log.i(`Showing user detailed app status ${this.appDetail.message} for project ${this.projectName}`);
        const notificationMsg = `${this.projectName} - ${this.appDetail.message}`;

        if (this.appDetail.severity === "ERROR") {
            vscode.window.showErrorMessage(notificationMsg);
        }
        else if (this.appDetail.severity === "WARN") {
            vscode.window.showWarningMessage(notificationMsg);
        }
        else {
            vscode.window.showInformationMessage(notificationMsg);
        }
    }
}

export namespace ProjectState {

    // The AppStates and BuildStates string values are all exposed to the user.

    export enum AppStates {
        STARTED = "Running",
        STARTING = "Starting",
        STOPPING = "Stopping",
        STOPPED = "Stopped",

        DEBUGGING = "Debugging",
        DEBUG_STARTING = "Starting - Debug",

        DISABLED = "Disabled",
        UNKNOWN = "Unknown"
    }

    export enum BuildStates {
        BUILD_SUCCESS = "Build Succeeded",
        BUILDING = "Building",
        BUILD_FAILED = "Build Failed",
        BUILD_QUEUED = "Build Queued",

        UNKNOWN = "Unknown"
    }

    export function getAllAppStates(): AppStates[] {
        return Object.values(AppStates);
    }

    export function getEnabledStates(): AppStates[] {
        return Object.values(AppStates).filter((state) => state !== ProjectState.AppStates.DISABLED);
    }

    export function getStartedStates(): AppStates[] {
        return [
            ProjectState.AppStates.STARTED,
            ProjectState.AppStates.DEBUGGING
        ];
    }

    export function getStartingStates(): AppStates[] {
        return [
            ProjectState.AppStates.STARTING,
            ProjectState.AppStates.DEBUG_STARTING
        ];
    }

    export function getStartedOrStartingStates(): AppStates[] {
        return getStartedStates().concat(getStartingStates());
    }

    export function getDebuggableStates(): AppStates[] {
        return [
            ProjectState.AppStates.DEBUGGING,
            ProjectState.AppStates.DEBUG_STARTING
        ];
    }

    /**
     * Convert a project info object into a ProjectState.
     */
    export function getAppState(projectInfoPayload: any): ProjectState.AppStates {

        // Logger.log("PIP", projectInfoPayload);
        const appStatus: string = projectInfoPayload[SocketEvents.Keys.APP_STATE] as string || "";

        const closedState: string | undefined = projectInfoPayload[SocketEvents.Keys.CLOSED_STATE];
        const startMode:   string | undefined = projectInfoPayload[SocketEvents.Keys.START_MODE];

        // Logger.log(`Convert - appStatus=${appStatus}, closedState=${closedState}, startMode=${startMode}`);

        // First, check if the project is closed (aka Disabled)
        if (closedState === "closed") {                                                                                         // non-nls
            return ProjectState.AppStates.DISABLED;
        }
        // Now, check the app states. Compare against both the value we expect from MC,
        // as well as our own possible values, in case we used the fallbackState in the constructor.
        else if (appStatus === "started" || appStatus === AppStates.DEBUGGING || appStatus === AppStates.STARTED) {             // non-nls
            if (startMode != null && ProjectCapabilities.isDebugMode(startMode)) {
                return ProjectState.AppStates.DEBUGGING;
            }
            return ProjectState.AppStates.STARTED;
        }
        else if (appStatus === "starting" || appStatus === AppStates.STARTING || appStatus === AppStates.DEBUG_STARTING) {      // non-nls
            if (startMode != null && ProjectCapabilities.isDebugMode(startMode)) {
                return ProjectState.AppStates.DEBUG_STARTING;
            }
            return ProjectState.AppStates.STARTING;
        }
        else if (appStatus === "stopping" || appStatus === AppStates.STOPPING) {                        // non-nls
            return ProjectState.AppStates.STOPPING;
        }
        else if (appStatus === "stopped" || appStatus === AppStates.STOPPED) {                          // non-nls
            return ProjectState.AppStates.STOPPED;
        }
        else if (!appStatus || appStatus === "unknown" || appStatus === AppStates.UNKNOWN) {      // non-nls
            return ProjectState.AppStates.UNKNOWN;
        }
        else {
            Log.e("Unknown app state:", appStatus);
            return ProjectState.AppStates.UNKNOWN;
        }
    }

    export function getBuildState(projectInfoPayload: any): BuildStates {
        const buildStatus: string | undefined = projectInfoPayload[SocketEvents.Keys.BUILD_STATE];

        if (buildStatus === "success" || buildStatus === BuildStates.BUILD_SUCCESS) {           // non-nls
            return BuildStates.BUILD_SUCCESS;
        }
        else if (buildStatus === "inProgress" || buildStatus === BuildStates.BUILDING) {        // non-nls
            return BuildStates.BUILDING;
        }
        else if (buildStatus === "queued" || buildStatus === BuildStates.BUILD_QUEUED) {        // non-nls
            return BuildStates.BUILD_QUEUED;
        }
        else if (buildStatus === "failed" || buildStatus === BuildStates.BUILD_FAILED) {        // non-nls
            return BuildStates.BUILD_FAILED;
        }
        else if (buildStatus == null || buildStatus.toLowerCase() === "unknown") {              // non-nls
            return BuildStates.UNKNOWN;
        }
        else {
            Log.e("Unknown build state:", buildStatus);
            return BuildStates.UNKNOWN;
        }
    }
}

export default ProjectState;
