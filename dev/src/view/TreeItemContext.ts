/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

// import * as vscode from "vscode";

import Project from "../codewind/project/Project";
import Connection from "../codewind/connection/Connection";
import LocalCodewindManager from "../codewind/connection/local/LocalCodewindManager";

/**
 * All of these values must match the viewItem regexes in package.nls.json
 */
enum TreeItemContextValues {
    BASE = "ext.cw",

    ROOT = "root",
    NO_PROJECTS = "noProjects",

    // Local Codewind status
    LOCAL_CW_STOPPED = "local.cwstatus.stopped",
    LOCAL_CW_STARTED = "local.cwstatus.started",

    // Connection
    CONN_CONNECTED = "connection.connected",
    CONN_DISCONNECTED = "connection.disconnected",

    // Project
    PROJ_BASE = "project",

    // (en|dis)abled are mutex
    PROJ_ENABLED = "enabled",
    PROJ_DISABLED = "disabled",

    // debuggable, started both imply enabled
    PROJ_DEBUGGABLE = "debuggable",
    PROJ_STARTED = "started",

    // auto build statuses are mutex
    PROJ_AUTOBUILD_ON = "autoBuildOn",
    PROJ_AUTOBUILD_OFF = "autoBuildOff",

    PROJ_RESTARTABLE = "restartable",
    PROJ_METRICS = "metricsAvailable",
}

namespace TreeItemContext {
    export function getRootContext(): string {
        return buildContextValue([TreeItemContextValues.ROOT]);
    }

    export function getLocalCWContext(localCW: LocalCodewindManager): string {
        const contextValue = localCW.isStarted ? TreeItemContextValues.LOCAL_CW_STARTED : TreeItemContextValues.LOCAL_CW_STOPPED;
        return buildContextValue([contextValue]);
    }

    export function getConnectionContext(connection: Connection): string {
        let contextValue: TreeItemContextValues;
        if (connection.isConnected) {
            contextValue = TreeItemContextValues.CONN_CONNECTED;
        }
        else {
            contextValue = TreeItemContextValues.CONN_DISCONNECTED;
        }
        const cv = buildContextValue([contextValue]);
        // Log.d(`The context value for ${connection} is ${cv}`);
        return cv;
    }

    export function getNoProjectsContext(): string {
        return buildContextValue([TreeItemContextValues.NO_PROJECTS]);
    }

    export function getProjectContext(project: Project): string {
        const contextValues: TreeItemContextValues[] = [ TreeItemContextValues.PROJ_BASE ];

        if (project.state.isEnabled) {
            contextValues.push(TreeItemContextValues.PROJ_ENABLED);
            if (project.state.isStarted) {
                contextValues.push(TreeItemContextValues.PROJ_STARTED);
            }
            if (project.state.isDebuggable) {
                contextValues.push(TreeItemContextValues.PROJ_DEBUGGABLE);
            }
        }
        else {
            contextValues.push(TreeItemContextValues.PROJ_DISABLED);
        }

        if (project.autoBuildEnabled) {
            contextValues.push(TreeItemContextValues.PROJ_AUTOBUILD_ON);
        }
        else {
            contextValues.push(TreeItemContextValues.PROJ_AUTOBUILD_OFF);
        }

        if (project.capabilities.supportsRestart) {
            contextValues.push(TreeItemContextValues.PROJ_RESTARTABLE);
        }

        if (project.capabilities.metricsAvailable) {
            contextValues.push(TreeItemContextValues.PROJ_METRICS);
        }

        // The final result will look like eg: "ext.cw.project.enabled.autoBuildOn"
        const cv = buildContextValue(contextValues);
        // Log.d(`The context value for ${project.name} is ${cv}`);
        return cv;
    }

    function buildContextValue(subvalues: string[]): string {
        return [ TreeItemContextValues.BASE, ...subvalues].join(".");
    }
}

export default TreeItemContext;
