/*******************************************************************************
 * Copyright (c) 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import { StartModes } from "./project/ProjectCapabilities";

///// This file declares types for request/response bodies when communicating with the Codewind server, or with cwctl.

/**
 * Response from 'cwctl sectoken get'. Use the access_token to get past the Gatekeeper.
 */
export interface AccessToken {
    readonly access_token: string;
    readonly expires_in: number;
    readonly token_type: string;
}

/**
 * Status of Local Codewind
 */
export interface CLIStatus {
    // status: "uninstalled" | "stopped" | "started";
    isDockerRunning: boolean;
    "installed-versions": string[];
    started: string[];
    url?: string;   // only set when started
}

///// PFE Environment /////

// From https://github.com/eclipse/codewind/blob/master/src/pfe/portal/routes/environment.route.js
export interface RawCWEnvData {
    readonly codewind_version?: string;
    readonly image_build_time?: string;
    readonly namespace?: string;
    readonly os_platform: string;
    readonly running_in_k8s: boolean;
    readonly socket_namespace?: string;
    readonly tekton_dashboard: TektonStatus;
}

/**
 * Massaged env data, which the plugin is actually interested in
 */
export interface CWEnvData {
    // readonly workspace: string;
    readonly namespace?: string;
    readonly buildTime?: string;
    readonly socketNamespace: string;
    readonly version: string;
    readonly tektonStatus: TektonStatus;
}

interface TektonStatus {
    readonly status: boolean;
    readonly message: string;       // error message or "not-installed" if status is false
    readonly url: string;           // empty if status is false
}

export enum LoadRunningStatus {
    STARTED = "started",
    RUNNING = "running",
    CANCELLING = "cancelling",
    PREPARING = "preparing",
    COLLECTING = "collecting",
}

export enum LoadRunDownloadableStatus {
    PROFILING_READY = "profilingReady",
    HCD_READY = "hcdReady",
}

export enum LoadRunFinishedStatus {
    CANCELLED = "cancelled",
    COMPLETED = "completed",
}

export type LoadRunnerStatus = LoadRunningStatus | LoadRunFinishedStatus | LoadRunDownloadableStatus;

// From https://github.com/eclipse/codewind/blob/master/src/pfe/portal/modules/utils/Logger.js#L38
export interface PFELogLevels {
    readonly currentLevel: string;
    readonly defaultLevel: string;
    readonly allLevels: string[];
}

export interface DiagnosticsResult {
    success: boolean,
    outputdir: string,
    warnings_encountered: [{
        warning: string;
        warning_description: string;
    }],
}

///// Connection /////

export interface CLIConnectionData {
    readonly id: string;
    readonly label: string;
    readonly url: string;
    readonly username: string;
    // These 3 are provided in the 'connections list' output but are not yet consumed.
    readonly auth?: string;
    readonly realm?: string;
    readonly clientid?: string;
}

/**
 * Template repository/source data as provided by the backend
 */
export interface TemplateSource {
    readonly url: string;
    readonly name: string;
    readonly description?: string;
    readonly enabled: boolean;
    readonly projectStyles: string[];
    readonly protected: boolean;
    /**
     * If auth object is not present, the source is public.
     * If it's present and there is a username, then username/pw were used. Else, PAT was used.
     * https://github.com/eclipse/codewind/issues/3101
     */
    readonly authentication?: {
        username?: string;
    }
}

export type TemplateSourceAuthType = "credentials" | "pat";

export type TemplateSourceAuth = {
    type: "credentials",
    username: string,
    password?: string
} | {
    type: "pat",
    personalAccessToken: string
}

export interface NewTemplateSource {
    readonly url: string;
    readonly name: string;
    readonly description?: string;
    readonly auth?: TemplateSourceAuth;
}

/**
 * 'data' field of ENABLE_DISABLE event, which can be converted to an enablement request.
 */
export interface SourceEnablement {
    readonly repos: {
        readonly repoID: string;
        readonly enable: boolean;
    }[];
}

/**
 * Represents a template/stack.
 */
export interface CWTemplateData extends vscode.QuickPickItem {
    label: string;
    description: string;
    detail: string;

    url: string;
    language: string;
    projectType: string;
    source?: string;
}

export type RegistrySecret = {
    readonly address: string;
    readonly username: string;
};

export interface PushRegistryResponse {
    readonly imagePushRegistry: boolean;
    readonly address?: string;
    readonly namespace?: string;
}

///// Project /////

export interface ProjectLink {
    // This is the other project's data; that is, projectName's projectURL is exposed in this project's environment in envName
    readonly projectID: string;
    readonly projectName: string;
    readonly envName: string;
    // projectURL: string;
}

export interface ProjectOutgoingLink extends ProjectLink {
    otherProjectID: string;
    otherProjectName: string;
}

/**
 * Project data as
 * - returned by /api/v1/projects
 * - sent in projectChanged and projectCreation events
 * - saved in the projects' .inf files in the codewind volume
 */
export interface PFEProjectData {
    readonly projectID: string;
    readonly name: string;
    readonly language: string;
    readonly creationTime: number;       // unix time
    readonly locOnDisk: string;
    readonly extension?: {
        readonly name: string;
        readonly config: {
            // user source code location in-container
            readonly containerAppRoot?: string;
        }
        // lots more that's not interesting
    };
    readonly ports?: {
        readonly exposedPort?: string;
        readonly internalPort?: string;
        readonly internalDebugPort?: string
    };
    readonly projectType: string;
    readonly state: string;
    readonly action?: string;
    readonly autoBuild: boolean;
    readonly appStatus?: string;
    readonly buildStatus?: string;
    readonly detailedBuildStatus?: string;
    readonly lastbuild?: number;             // unix time
    readonly appImageLastBuild?: string;     // unix time - actually a number
    readonly containerId?: string;
    readonly podName?: string;
    readonly namespace?: string;
    readonly startMode?: StartModes;
    readonly appBaseURL?: string;
    readonly logs?: object;                  // only checked for existence
    readonly containerAppRoot?: string;
    readonly capabilitiesReady?: boolean;
    // user settings
    readonly contextRoot?: string;
    readonly isHttps?: boolean;
    // metrics - https://github.com/eclipse/codewind/issues/1815#issuecomment-583354048
    readonly metricsDashboard?: MetricsDashboardStatus;
    readonly perfDashboardPath?: string | null;
    readonly injection?: MetricsInjectionStatus;
    readonly links?: {
        readonly _links: ProjectLink[]
    }
}

export interface MetricsDashboardStatus {
    readonly hosting: "project" | "performanceContainer" | null;
    readonly path: string | null;
}

export interface MetricsInjectionStatus {
    injectable: boolean;
    injected: boolean;
}

export interface ILogResponse {
    readonly build?: ILogObject[];
    readonly app?: ILogObject[];
}

export interface ILogObject {
    readonly logName: string;
    readonly workspaceLogPath?: string;
}

///// Project creation /////

export interface IDetectedProjectType {
    readonly language: string;
    readonly projectType: string;
    readonly projectSubtype?: string;
}

export interface IInitializationResponse {
    readonly status: string;
    readonly result: IDetectedProjectType | string | { error: string };
    readonly projectPath?: string;
}

// For use with vscode.Progress
export interface ProgressUpdate {
    message?: string;
    increment?: number;
}
