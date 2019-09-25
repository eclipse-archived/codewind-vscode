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

// import Commands from "../constants/Commands";
import Log from "../Logger";
import Project from "../codewind/project/Project";
import Connection from "../codewind/connection/Connection";
import MCUtil from "../MCUtil";
import { CWConfigurations } from "../constants/Configurations";
import LocalCodewindManager from "../codewind/connection/local/LocalCodewindManager";
import CodewindEventListener from "../codewind/connection/CodewindEventListener";
import TreeItemFactory from "./TreeItemFactory";
import ConnectionManager from "../codewind/connection/ConnectionManager";

export type CodewindTreeItem = LocalCodewindManager | Connection | Project | vscode.TreeItem;

export default class CodewindTreeDataProvider implements vscode.TreeDataProvider<CodewindTreeItem> {

    public static readonly VIEW_ID: string = "ext.cw.explorer";                  // must match package.nls.json
    public readonly treeView: vscode.TreeView<CodewindTreeItem>;

    private readonly onTreeDataChangeEmitter: vscode.EventEmitter<CodewindTreeItem> = new vscode.EventEmitter<CodewindTreeItem>();
    public readonly onDidChangeTreeData: vscode.Event<CodewindTreeItem> = this.onTreeDataChangeEmitter.event;

    constructor() {
        this.treeView = vscode.window.createTreeView(CodewindTreeDataProvider.VIEW_ID, { treeDataProvider: this });

        CodewindEventListener.addOnChangeListener(this.refresh);
        Log.d("Finished constructing ProjectTree");

        if (MCUtil.isUserInCwWorkspaceOrProject()) {
            let autoShowEnabled = vscode.workspace.getConfiguration().get(CWConfigurations.AUTO_SHOW_VIEW);
            if (autoShowEnabled == null) {
                autoShowEnabled = true;
            }
            if (autoShowEnabled) {
                Log.d("Auto-expanding the Codewind view");
                // reveal the LocalCodewindManager because it is guaranteed to exist
                this.treeView.reveal(LocalCodewindManager.instance);
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
            return TreeItemFactory.getLocalCWTI();
        }
        else if (node instanceof Project) {
            return TreeItemFactory.getProjectTI(node);
        }
        else if (node instanceof Connection) {
            return TreeItemFactory.getConnectionTI(node);
        }
        return node;
    }

    public getChildren(node?: CodewindTreeItem): CodewindTreeItem[] | Promise<CodewindTreeItem[]> {
        if (node == null) {
            return [
                LocalCodewindManager.instance,
                ...ConnectionManager.instance.remoteConnections,
            ];
        }
        else if (node instanceof Connection) {
            return TreeItemFactory.getConnectionChildren(node);
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
            return this.getChildren(localConnection);
        }
        else {
            Log.e("Cannot get children for unexpected item", node);
            return [];
        }
    }

    public getParent(node: CodewindTreeItem): CodewindTreeItem | Promise<CodewindTreeItem> | undefined {
        if (node instanceof Project) {
            return node.connection;
        }
        else if (node instanceof LocalCodewindManager || node instanceof Connection) {
            // top-level items
            return undefined;
        }
        Log.e("Unexpected TreeItem!", node);
        return undefined;
    }
}
