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
import Resources from "../constants/Resources";
import LocalCodewindManager from "../codewind/connection/local/LocalCodewindManager";
import Connection from "../codewind/connection/Connection";
import Translator from "../constants/strings/translator";
import { CodewindTreeItem } from "./CodewindTree";
import Commands from "../constants/Commands";
import Project from "../codewind/project/Project";

const STRING_NS = StringNamespaces.TREEVIEW;

namespace TreeItemFactory {
    export function getRoot(): vscode.TreeItem {
        return {
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
            iconPath: Resources.getIconPaths(Resources.Icons.Logo),
            label: "Codewind",
            contextValue: TreeItemContext.getRootContext(),
        };
    }

    const CW_STOPPED_NODE_ID = "ext.cw.localTreeStopped";
    const CW_STARTED_NODE_ID = "ext.cw.localTreeStarted";

    export function getLocalCWTI(): vscode.TreeItem {
        const cwState = LocalCodewindManager.instance.state;
        const cwStarted = LocalCodewindManager.instance.isStarted;

        let label = "Local";
        // Show state except when started (since it's obvious in that case).
        if (!cwStarted) {
            label += ` (${cwState})`;
        }
        const cwUrl = LocalCodewindManager.instance.localConnection ? LocalCodewindManager.instance.localConnection.url : undefined;
        const tooltip = (cwUrl || "Stopped").toString();
        // we use the ID only in the started case so that when CW starts the new TreeItem can auto-expand after it starts
        const id = cwStarted ?  CW_STARTED_NODE_ID : CW_STOPPED_NODE_ID;
        const collapsibleState = cwStarted ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None;

        const cwStatusItem: vscode.TreeItem = {
            id,
            label,
            tooltip,
            collapsibleState,
            iconPath: Resources.getIconPaths(Resources.Icons.LocalProjects),
            contextValue: TreeItemContext.getLocalCWContext(LocalCodewindManager.instance),
        };

        return cwStatusItem;
    }

    export function getConnectionTI(connection: Connection): vscode.TreeItem {
        let label;
        if (global.isTheia) {
            // it's confusing to say "local" in the theia case
            label = Translator.t(STRING_NS, "connectionLabelSimple");
        }
        else {
            // label = Translator.t(STRING_NS, "connectionLabel", { label: connection.userLabel });
            label = connection.label;
        }
        const iconPath = Resources.getIconPaths(Resources.Icons.LocalProjects);

        return {
            label,
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
            tooltip: `${connection.url}`,
            contextValue: TreeItemContext.getConnectionContext(connection),
            iconPath,
        };
    }

    export function getConnectionChildren(connection: Connection): CodewindTreeItem[] {
        if (connection.isConnected) {
            if (connection.projects.length > 0) {
                return connection.projects.sort((a, b) => a.name.localeCompare(b.name));
            }
            return [ getNoProjectsTI(connection) ];
        }

        return [ getDisconnectedConnectionTI() ];
    }

    export function getNoProjectsTI(connection: Connection): vscode.TreeItem {
        const label = "No projects (Click here to create a project)";
        const tooltip = "Click here to create a project";

        return {
            label,
            iconPath: Resources.getIconPaths(Resources.Icons.Error),
            tooltip,
            contextValue: TreeItemContext.getNoProjectsContext(),
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            command: {
                command: Commands.CREATE_PROJECT,
                title: "",
                arguments: [connection]
            }
        };
    }

    export function getDisconnectedConnectionTI(): vscode.TreeItem {
        return {
            label: Translator.t(STRING_NS, "disconnectedConnectionLabel"),
            iconPath: Resources.getIconPaths(Resources.Icons.Disconnected),
            contextValue: "nothing",        // anything truthy works
            collapsibleState: vscode.TreeItemCollapsibleState.None,
        };
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
            iconPath: project.type.icon,
            // command run on single-click (or double click - depends on a user setting - https://github.com/Microsoft/vscode/issues/39601)
            command,
        };
    }
}

export default TreeItemFactory;
