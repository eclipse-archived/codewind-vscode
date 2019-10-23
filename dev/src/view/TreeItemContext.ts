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
 * The functions in this file generate the TreeItems' contextIDs,
 * which are checked against the regex in package.nls.json to determine command enablement in context menus.
 */

enum TreeItemContextValues {
    BASE = "ext.cw",

    ROOT = "root",
    NO_PROJECTS = "noProjects",

    // Local Codewind status
    LOCAL_CW_STOPPED = "local.stopped",
    LOCAL_CW_STARTED = "local.started",

    // Connection
    CONN_BASE = "connection",
    CONN_CONNECTED = "connected",
    // CONN_ERRORED = "errored",
    REMOTECONN_ENABLED = "remote.enabled",
    REMOTECONN_DISABLED = "remote.disabled",

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
        const connectionContext = localCW.localConnection ? getConnectionContextInner(localCW.localConnection) : [];
        const cv = buildContextValue([ ...connectionContext, contextValue ]);
        // Log.d("Local connection context " + cv);
        return cv;
    }

    function getConnectionContextInner(connection: Connection): string[] {
        const contextValues: TreeItemContextValues[] = [ TreeItemContextValues.CONN_BASE ];

        if (connection.isRemote) {
            if (connection.enabled) {
                contextValues.push(TreeItemContextValues.REMOTECONN_ENABLED);
            }
            else {
                contextValues.push(TreeItemContextValues.REMOTECONN_DISABLED);
            }
        }
        if (connection.isConnected) {
            contextValues.push(TreeItemContextValues.CONN_CONNECTED);
        }

        return contextValues;
    }

    export function getConnectionContext(connection: Connection): string {
        const cv = buildContextValue(getConnectionContextInner(connection));
        // Log.d(`The context value for ${connection} is ${cv}`);
        return cv;
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
