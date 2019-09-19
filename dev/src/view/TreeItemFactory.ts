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


import * as vscode from "vscode";

import Project from "../codewind/project/Project";
import Connection from "../codewind/connection/Connection";
import Translator from "../constants/strings/translator";
import Resources from "../constants/Resources";
import StringNamespaces from "../constants/strings/StringNamespaces";
import Log from "../Logger";
import Commands from "../constants/Commands";
import CodewindManager from "../codewind/connection/CodewindManager";

const STRING_NS = StringNamespaces.TREEVIEW;

/**
 * All of these values must match the viewItem regexes in package.nls.json
 */
enum TreeContextValues {
    // base
    BASE = "ext.cw",
    NO_PROJECTS = "noProjects",

    // Codewind status
    CW_STOPPED = "cwstatus.stopped",
    // CW_STARTING = "cwstatus.starting",
    CW_STARTED = "cwstatus.started",

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

export type CodewindTreeItem = Connection | Project | vscode.TreeItem;

namespace TreeItemFactory {
    const CW_STOPPED_NODE_ID = "ext.cw.stoppedTreeroot";
    export const CW_STARTED_NODE_ID = "ext.cw.treeroot";

    export function getRootTreeItems(): CodewindTreeItem {
        const cwState = CodewindManager.instance.state;
        const cwStarted = CodewindManager.instance.isStarted;

        let label = "Codewind";
        // Show state except when started (since it's obvious in that case).
        if (!cwStarted) {
            label += ` (${cwState})`;
        }
        const tooltip = (CodewindManager.instance.codewindUrl || "Stopped").toString();
        // we use the ID only in the started case so that when CW starts the new TreeItem can auto-expand after it starts
        const id = cwStarted ?  CW_STARTED_NODE_ID : CW_STOPPED_NODE_ID;
        const contextValue = cwStarted ? TreeContextValues.CW_STARTED : TreeContextValues.CW_STOPPED;
        const collapsibleState = cwStarted ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None;

        const cwStatusItem: vscode.TreeItem = {
            id,
            label,
            tooltip,
            collapsibleState,
            iconPath: Resources.getIconPaths(Resources.Icons.Logo),
            contextValue: buildContextValue([contextValue]),
        };

        return cwStatusItem;
    }

    export function toTreeItem(resource: Project | Connection): vscode.TreeItem {
        if (resource instanceof Project) {
            return getProjectTI(resource);
        }
        else if (resource instanceof Connection) {
            return getConnectionTI(resource);
        }
        else {
            // darn you, theia
            const errMsg = "Unexpected object cannot be converted to TreeItem";
            Log.e(errMsg, resource);
            throw new Error(errMsg);
        }
    }

    export function getConnectionChildren(connection: Connection): CodewindTreeItem[] {
       if (connection.isConnected) {
            if (connection.projects.length > 0) {
                return connection.projects.sort((a, b) => a.name.localeCompare(b.name));
            }
            else {
                const label = "No projects (Click here to create a project)";
                const tooltip = "Click here to create a project";

                const command = {
                    command: Commands.CREATE_PROJECT,
                    title: "",
                    arguments: [connection]
                };

                return [{
                    label,
                    iconPath: Resources.getIconPaths(Resources.Icons.Error),
                    tooltip,
                    contextValue: buildContextValue([TreeContextValues.NO_PROJECTS]),
                    collapsibleState: vscode.TreeItemCollapsibleState.None,
                    command,
                }];
            }
        }
        else {
            return [{
                label: Translator.t(STRING_NS, "disconnectedConnectionLabel"),
                iconPath: Resources.getIconPaths(Resources.Icons.Disconnected),
                contextValue: "nothing",        // anything truthy works
                collapsibleState: vscode.TreeItemCollapsibleState.None,
            }];
        }
    }
}

function getConnectionTI(connection: Connection): vscode.TreeItem {
    let label;
    if (global.isTheia) {
        // it's confusing to say "local" in the theia case
        label = Translator.t(STRING_NS, "connectionLabelSimple");
    }
    else {
        // always local for now
        label = Translator.t(STRING_NS, "connectionLabel", { type: Translator.t(STRING_NS, "connectionTypeLocal") });
    }
    const iconPath = Resources.getIconPaths(Resources.Icons.LocalProjects);

    return {
        label,
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        tooltip: `${connection.versionStr} • ${connection.workspacePath.fsPath}`,
        contextValue: getConnectionContext(connection),
        iconPath,
    };
}

function getProjectTI(project: Project): vscode.TreeItem {
    const label = Translator.t(STRING_NS, "projectLabel", { projectName: project.name, state: project.state.toString() });

    // won't work in theia until https://github.com/eclipse-theia/theia/pull/5590
    const command = {
        command: Commands.VSC_REVEAL_EXPLORER,
        title: "",
        arguments: [project.localPath]
    };

    return {
        id: project.id,
        label,
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        tooltip: label,
        contextValue: getProjectContext(project),
        iconPath: project.type.icon,
        // command run on single-click (or double click - depends on a user setting - https://github.com/Microsoft/vscode/issues/39601)
        command,
    };
}

function getConnectionContext(connection: Connection): string {
    let contextValue: TreeContextValues;
    if (connection.isConnected) {
        contextValue = TreeContextValues.CONN_CONNECTED;
    }
    else {
        contextValue = TreeContextValues.CONN_DISCONNECTED;
    }
    const cv = buildContextValue([contextValue]);
    // Log.d(`The context value for ${connection} is ${cv}`);
    return cv;
}

function getProjectContext(project: Project): string {
    const contextValues: TreeContextValues[] = [ TreeContextValues.PROJ_BASE ];

    if (project.state.isEnabled) {
        contextValues.push(TreeContextValues.PROJ_ENABLED);
        if (project.state.isStarted) {
            contextValues.push(TreeContextValues.PROJ_STARTED);
        }
        if (project.state.isDebuggable) {
            contextValues.push(TreeContextValues.PROJ_DEBUGGABLE);
        }
    }
    else {
        contextValues.push(TreeContextValues.PROJ_DISABLED);
    }

    if (project.autoBuildEnabled) {
        contextValues.push(TreeContextValues.PROJ_AUTOBUILD_ON);
    }
    else {
        contextValues.push(TreeContextValues.PROJ_AUTOBUILD_OFF);
    }

    if (project.capabilities.supportsRestart) {
        contextValues.push(TreeContextValues.PROJ_RESTARTABLE);
    }

    if (project.capabilities.metricsAvailable) {
        contextValues.push(TreeContextValues.PROJ_METRICS);
    }

    // The final result will look like eg: "ext.cw.project.enabled.autoBuildOn"
    const cv = buildContextValue(contextValues);
    // Log.d(`The context value for ${project.name} is ${cv}`);
    return cv;
}


// const CONTEXT_SEPARATOR = ".";
function buildContextValue(subvalues: string[]): string {
    return [ TreeContextValues.BASE, ...subvalues].join(".");
}

// export { TreeContextValues };
export default TreeItemFactory;
