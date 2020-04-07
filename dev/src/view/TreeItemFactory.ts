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

import StringNamespaces from "../constants/strings/StringNamespaces";
import TreeItemContext from "./TreeItemContext";
import { ThemedImages } from "../constants/CWImages";
import LocalCodewindManager from "../codewind/connection/local/LocalCodewindManager";
import Connection from "../codewind/connection/Connection";
import Translator from "../constants/strings/Translator";
import { CodewindTreeItem } from "./CodewindTree";
import Commands from "../constants/Commands";
import Project from "../codewind/project/Project";
import { ConnectionStates } from "../codewind/connection/ConnectionState";

const STRING_NS = StringNamespaces.TREEVIEW;

namespace TreeItemFactory {

    const CW_STOPPED_NODE_ID = "ext.cw.localTreeStopped";
    const CW_STARTED_NODE_ID = "ext.cw.localTreeStarted";

    export function getLocalCWTI(): vscode.TreeItem {
        const cwState = LocalCodewindManager.instance.state;
        const cwStarted = LocalCodewindManager.instance.isStarted;

        let label = "Local";
        if (global.IS_CHE) {
            // it's confusing to say "local" in Che
            label = "Projects";
        }
        // Show state except when started (since it's obvious in that case).
        if (!cwStarted) {
            label += ` (${cwState})`;
        }
        const cwUrl = LocalCodewindManager.instance.localConnection ? LocalCodewindManager.instance.localConnection.url : undefined;
        const tooltip = (cwUrl || "Stopped").toString();
        // we use the ID only in the started case so that when CW starts the new TreeItem can auto-expand after it starts
        const id = cwStarted ?  CW_STARTED_NODE_ID : CW_STOPPED_NODE_ID;
        const collapsibleState = cwStarted ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None;
        const icon = cwStarted ? ThemedImages.Local_Connected : ThemedImages.Local_Disconnected;

        const cwStatusItem: vscode.TreeItem = {
            id,
            label,
            tooltip,
            collapsibleState,
            iconPath: icon.paths,
            contextValue: TreeItemContext.getLocalCWContext(LocalCodewindManager.instance),
        };

        return cwStatusItem;
    }

    export function getConnectionTI(connection: Connection): vscode.TreeItem {
        const collapsibleState = connection.state.hasChildrenInTree ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None;
        // change ID so it refreshes the collapsiblestate
        const id = `${connection.label}.${connection.state.hasChildrenInTree ? "connected" : "disconnected"}`;

        const icon = connection.isConnected ? ThemedImages.Connection_Connected : ThemedImages.Connection_Disconnected;

        return {
            collapsibleState,
            contextValue: TreeItemContext.getConnectionContext(connection),
            iconPath: icon.paths,
            id,
            label: connection.label,
            tooltip: `${connection.enabled ? "" : "[Disabled] "}${connection.url}`,
        };
    }

    export function getConnectionChildren(connection: Connection): CodewindTreeItem[] {
        if (connection.state === ConnectionStates.AUTH_ERROR) {
            return [{
                label: "Authentication error",
                iconPath: ThemedImages.Server_Error.paths,
                tooltip: "Click here to open this connection's Settings",
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: Commands.CONNECTION_OVERVIEW,
                    title: "",
                    arguments: [connection]
                }
            }];
        }
        else if (connection.state === ConnectionStates.INITIALIZING) {
            return [{
                label: "Connecting...",
                iconPath: ThemedImages.Server_Error.paths,
                collapsibleState: vscode.TreeItemCollapsibleState.None,
            }];
        }
        else if (!connection.isConnected) {
            return [{
                label: Translator.t(STRING_NS, "disconnectedConnectionLabel"),
                iconPath: ThemedImages.Server_Error.paths,
                collapsibleState: vscode.TreeItemCollapsibleState.None,
            }];
        }
        else if (connection.isConnected) {
            if (connection.projects.length > 0) {
                return connection.projects.sort((a, b) => a.name.localeCompare(b.name));
            }
            return [{
                label: "No projects (Click here to create a project)",
                iconPath: ThemedImages.Error.paths,
                tooltip: "Click here to create a project",
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: Commands.CREATE_PROJECT,
                    title: "",
                    arguments: [connection]
                }
            }];
        }

        // it is disabled
        return [];
    }

    export function getProjectTI(project: Project): vscode.TreeItem {
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
            contextValue: TreeItemContext.getProjectContext(project),
            iconPath: project.type.icon.paths,
            // command run on single-click (or double click - depends on a user setting - https://github.com/Microsoft/vscode/issues/39601)
            command,
        };
    }
}

export default TreeItemFactory;
