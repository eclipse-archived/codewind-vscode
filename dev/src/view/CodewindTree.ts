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

import ConnectionManager from "../codewind/connection/ConnectionManager";
// import Commands from "../constants/Commands";
import Log from "../Logger";
import Project from "../codewind/project/Project";
import Connection from "../codewind/connection/Connection";
import { buildContextValue, getConnectionContext, getProjectContext, TreeContextValues } from "./TreeItemContext";
import MCUtil from "../MCUtil";
import { CWConfigurations } from "../constants/Configurations";
import Resources from "../constants/Resources";
import StringNamespaces from "../constants/strings/StringNamespaces";
import Commands from "../constants/Commands";
import Translator from "../constants/strings/translator";
import LocalCodewindManager from "../codewind/connection/local/LocalCodewindManager";
import CodewindEventListener from "../codewind/connection/CodewindEventListener";

const STRING_NS = StringNamespaces.TREEVIEW;

export type CodewindTreeItem = LocalCodewindManager | Connection | Project | vscode.TreeItem;

export default class CodewindTreeDataProvider implements vscode.TreeDataProvider<CodewindTreeItem> {

    public static readonly VIEW_ID: string = "ext.cw.explorer";                  // must match package.nls.json
    public readonly treeView: vscode.TreeView<CodewindTreeItem>;

    private readonly onTreeDataChangeEmitter: vscode.EventEmitter<CodewindTreeItem> = new vscode.EventEmitter<CodewindTreeItem>();
    public readonly onDidChangeTreeData: vscode.Event<CodewindTreeItem> = this.onTreeDataChangeEmitter.event;

    private readonly root: vscode.TreeItem;

    constructor() {
        this.treeView = vscode.window.createTreeView(CodewindTreeDataProvider.VIEW_ID, { treeDataProvider: this });

        CodewindEventListener.addOnChangeListener(this.refresh);
        Log.d("Finished constructing ProjectTree");

        this.root = getRoot();
        if (MCUtil.isUserInCwWorkspaceOrProject()) {
            let autoShowEnabled = vscode.workspace.getConfiguration().get(CWConfigurations.AUTO_SHOW_VIEW);
            if (autoShowEnabled == null) {
                autoShowEnabled = true;
            }
            if (autoShowEnabled) {
                Log.d("Auto-expanding the Codewind view");
                this.treeView.reveal(this.root);
            }
        }

        // this.treeView.onDidChangeSelection((e) => {
        //     Log.d("Selection is now", e.selection[0]);
        // });
    }

    /**
     * Notifies VSCode that this tree has to be refreshed.
     */
    public refresh = (treeItem: CodewindTreeItem | undefined): void => {
        // Log.d("refresh tree");
        this.onTreeDataChangeEmitter.fire(treeItem);
    }

    public getTreeItem(node: CodewindTreeItem): vscode.TreeItem | Promise<vscode.TreeItem> {
        if (node instanceof LocalCodewindManager) {
            return getLocalCWTI();
        }
        else if (node instanceof Project || node instanceof Connection) {
            return toTreeItem(node);
        }
        return node;
    }

    public getChildren(node?: CodewindTreeItem): CodewindTreeItem[] | Promise<CodewindTreeItem[]> {
        if (node == null) {
            // if root needs to be updated, do it here, but it's currently static.
            // this.root = getRoot();
            return [ this.root ];
        }
        else if (node instanceof Connection) {
            return getConnectionChildren(node);
        }
        else if (node instanceof Project) {
            // projects have no children
            return [];
        }
        else if (node instanceof LocalCodewindManager) {
            const localConnection = node.localConnection;
            if (localConnection == null) {
                // codewind is turned off
                return [];
            }
            return getConnectionChildren(localConnection);
        }
        else if (node === this.root) {
            const remoteConnections = ConnectionManager.instance.connections.filter((conn) => !conn.isLocalConnection);
            return [
                LocalCodewindManager.instance,
                ...remoteConnections,
            ];
        }
        else {
            // Log.e("Cannot get children for unexpected item", node);
            return [];
        }
    }

    public getParent(node: CodewindTreeItem): CodewindTreeItem | Promise<CodewindTreeItem> | undefined {
        if (node instanceof Project) {
            return node.connection;
        }
        else if (node instanceof Connection) {
            return this.root;
        }
        else if (node === this.root) {
            return undefined;
        }
        Log.e("Unexpected TreeItem!", node);
        return undefined;
    }
}

function getRoot(): vscode.TreeItem {
    return {
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        iconPath: Resources.getIconPaths(Resources.Icons.Logo),
        label: "Codewind",
    };
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

    return [ getDisconnectedConnectionTI() ];
}

function getDisconnectedConnectionTI(): vscode.TreeItem {
    return {
        label: Translator.t(STRING_NS, "disconnectedConnectionLabel"),
        iconPath: Resources.getIconPaths(Resources.Icons.Disconnected),
        contextValue: "nothing",        // anything truthy works
        collapsibleState: vscode.TreeItemCollapsibleState.None,
    };
}

const CW_STOPPED_NODE_ID = "ext.cw.localTreeStopped";
const CW_STARTED_NODE_ID = "ext.cw.localTreeStarted";

function getLocalCWTI(): vscode.TreeItem {
    const cwState = LocalCodewindManager.instance.state;
    const cwStarted = LocalCodewindManager.instance.isStarted;

    let label = "Local Codewind";
    // Show state except when started (since it's obvious in that case).
    if (!cwStarted) {
        label += ` (${cwState})`;
    }
    const cwUrl = LocalCodewindManager.instance.localConnection ? LocalCodewindManager.instance.localConnection.url : undefined;
    const tooltip = (cwUrl || "Stopped").toString();
    // we use the ID only in the started case so that when CW starts the new TreeItem can auto-expand after it starts
    const id = cwStarted ?  CW_STARTED_NODE_ID : CW_STOPPED_NODE_ID;
    const contextValue = cwStarted ? TreeContextValues.CW_STARTED : TreeContextValues.CW_STOPPED;
    const collapsibleState = cwStarted ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None;

    const cwStatusItem: vscode.TreeItem = {
        id,
        label,
        tooltip,
        collapsibleState,
        iconPath: Resources.getIconPaths(Resources.Icons.LocalProjects),
        contextValue: buildContextValue([contextValue]),
    };

    return cwStatusItem;
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
