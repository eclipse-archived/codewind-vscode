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

import CodewindManager from "../microclimate/connection/CodewindManager";
// import Commands from "../constants/Commands";
import Log from "../Logger";
import Project from "../microclimate/project/Project";
import Connection from "../microclimate/connection/Connection";
import TreeItemFactory, { CodewindTreeItem } from "./TreeItemFactory";

// const STRING_NS = StringNamespaces.TREEVIEW;

export default class ProjectTreeDataProvider implements vscode.TreeDataProvider<CodewindTreeItem> {

    private readonly VIEW_ID: string = "ext.cw.explorer";                  // must match package.nls.json
    public readonly treeView: vscode.TreeView<CodewindTreeItem>;

    private readonly onTreeDataChangeEmitter: vscode.EventEmitter<CodewindTreeItem> = new vscode.EventEmitter<CodewindTreeItem>();
    public readonly onDidChangeTreeData: vscode.Event<CodewindTreeItem> = this.onTreeDataChangeEmitter.event;

    constructor() {
        this.treeView = vscode.window.createTreeView(this.VIEW_ID, { treeDataProvider: this });

        CodewindManager.instance.addOnChangeListener(this.refresh);
        Log.d("Finished constructing ProjectTree");

        // this.treeView.onDidChangeSelection((e) => {
        //     Log.d("Selection is now", e.selection[0]);
        // });
    }

    /**
     * Notifies VSCode that this tree has to be refreshed.
     * Used as a call-back for ConnectionManager OnChange.
     */
    public refresh = (treeItem: CodewindTreeItem | undefined): void => {
        // Log.d("refresh tree");

        this.onTreeDataChangeEmitter.fire(treeItem);
    }

    public getTreeItem(node: CodewindTreeItem): vscode.TreeItem | Promise<vscode.TreeItem> {
        if (node instanceof Project || node instanceof Connection) {
            return TreeItemFactory.toTreeItem(node);
        }
        return node;
    }

    public getChildren(node?: CodewindTreeItem): CodewindTreeItem[] | Promise<CodewindTreeItem[]> {
        if (node == null) {
            // root
            return TreeItemFactory.getRootTreeItems();
        }
        else if (node instanceof Connection) {
            return TreeItemFactory.getConnectionChildren(node);
        }
        else if (node instanceof Project) {
            // projects have no children
            return [];
        }
        else if (node.id === TreeItemFactory.CW_STARTED_NODE_ID) {
            return CodewindManager.instance.connections;
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
            return undefined;
        }
        Log.e("Unexpected TreeItem!", node);
        return undefined;
    }
}
