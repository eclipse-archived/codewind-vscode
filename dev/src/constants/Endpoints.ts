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

import Connection from "../codewind/connection/Connection";
import Project from "../codewind/project/Project";

export type Endpoint = MCEndpoints | ProjectEndpoints;

// non-nls-file
/**
 *  "Regular" endpoints, eg "localhost:9090/api/v1/environment"
 */
export enum MCEndpoints {
    HEALTH = "/health",
    ENVIRONMENT = "api/v1/environment",
    TEMPLATES = "api/v1/templates",
    PROJECTS = "api/v1/projects",
    CREATE_FROM_TEMPLATE = "api/v1/projects/",
    PREBIND_VALIDATE = "api/v1/validate",
    BIND = "api/v1/projects/bind",
    REMOTE_BIND_START = "api/v1/projects/remote-bind/start",
    REGISTRY = "api/v1/registry",
}

/**
 * Project endpoints, eg "localhost:9090/api/v1/project/81eba580-0aea-11e9-b530-67b2995d0cd9/restart"
 */
export enum ProjectEndpoints {
    RESTART_ACTION = "restart",
    BUILD_ACTION = "build",
    LOGS = "logs",
    METRICS_STATUS = "metrics/status",

    OPEN = "open",
    CLOSE = "close",
    UNBIND = "unbind",

    UPLOAD = "remote-bind/upload",
    REMOTE_BIND_END = "remote-bind/end",

    CAPABILITIES = "capabilities",
}

/**
 * Functions for resolving Portal endpoints
 */
export namespace EndpointUtil {

    export function isProjectEndpoint(endpoint: Endpoint): boolean {
        return Object.values(ProjectEndpoints).includes(endpoint);
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

    export function getPerformanceDashboard(project: Project): vscode.Uri {
        // return value looks like http://localhost:9090/performance/charts?project=bacd4760-70ce-11e9-af94-d39edf21b705

        const authority = global.isTheia ? project.connection.host : project.connection.url.authority;
        return project.connection.url.with({
            authority,
            path: "/performance/charts",
            query: `project=${project.id}`,
        });
    }
}

export default EndpointUtil;
