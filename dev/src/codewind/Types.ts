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

///// Project

export interface MetricsDashboardStatus {
    hosting: "project" | "performanceContainer" | null;
    path: string | null;
}

export interface MetricsInjectionStatus {
    injectable: boolean;
    injected: boolean;
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
    readonly startMode?: string;
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
}
