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

import Connection from "../codewind/connection/Connection";

export type Endpoint = MCEndpoints | ProjectEndpoints;

// non-nls-file
/**
 *  "Regular" endpoints, eg "localhost:9090/api/v1/environment"
 */
export enum MCEndpoints {
    READY = "ready",
    ENVIRONMENT = "api/v1/environment",
    TEMPLATES = "api/v1/templates",
    TEMPLATE_REPOS = "api/v1/templates/repositories",
    BATCH_TEMPLATE_REPOS = "api/v1/batch/templates/repositories",
    PROJECTS = "api/v1/projects",
    PROJECT_TYPES = "api/v1/project-types",
    REGISTRY_SECRETS = "api/v1/registrysecrets",
    PUSH_REGISTRY = "api/v1/imagepushregistry",
    LOGGING = "api/v1/logging",
}

/**
 * Project endpoints, eg "localhost:9090/api/v1/project/81eba580-0aea-11e9-b530-67b2995d0cd9/restart"
 */
export enum ProjectEndpoints {
    RESTART_ACTION = "restart",
    BUILD_ACTION = "build",
    LOGS = "logs",
    METRICS_STATUS = "metrics/status",
    METRICS_INJECTION = "metrics/inject",
    PROFILING = "profiling",

    OPEN = "open",
    CLOSE = "close",
    UNBIND = "unbind",

    CAPABILITIES = "capabilities",
}

/**
 * Functions for resolving Portal endpoints
 */
export namespace EndpointUtil {

    export function isProjectEndpoint(endpoint: Endpoint): boolean {
        return Object.values(ProjectEndpoints).map((pe) => pe.toString()).includes(endpoint);
    }

    export function resolveMCEndpoint(connection: Connection, endpoint: MCEndpoints): string {
        return connection.url.toString().concat(endpoint);
    }

    export function resolveProjectEndpoint(
        connection: Connection, projectID: string, endpoint: ProjectEndpoints): string {
        return connection.url.toString().concat(`${MCEndpoints.PROJECTS}/${projectID}/${endpoint}`);
    }

    export function getEnablementAction(enable: boolean): ProjectEndpoints {
        return enable ? ProjectEndpoints.OPEN : ProjectEndpoints.CLOSE;
    }

    export function getPerformanceDashboard(pfeUrl: vscode.Uri, projectID: string): vscode.Uri {
        // return value looks like http://localhost:9090/performance/charts?project=bacd4760-70ce-11e9-af94-d39edf21b705

        return pfeUrl.with({
            path: "/performance/charts",
            query: `project=${projectID}`,
        });
    }

    export function getPerformanceMonitor(pfeUrl: vscode.Uri, projectLanguage: string, projectID: string): vscode.Uri {
        // return value looks like http://localhost:9090/performance/monitor/dashboard/java?theme=dark&projectID=bacd4760-70ce-11e9-af94-d39edf21b705

        return pfeUrl.with({
            path: "/performance/monitor/dashboard/" + projectLanguage,
            query: `theme=dark&projectID=${projectID}`,
        });
    }
}

export default EndpointUtil;
