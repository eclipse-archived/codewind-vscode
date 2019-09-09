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

import CodewindManager from "../codewind/connection/CodewindManager";
// import Commands from "../constants/Commands";
import Log from "../Logger";
import Project from "../codewind/project/Project";
import Connection from "../codewind/connection/Connection";
import TreeItemFactory, { CodewindTreeItem } from "./TreeItemFactory";
import MCUtil from "../MCUtil";
import { CWConfigurations } from "../constants/Configurations";

// const STRING_NS = StringNamespaces.TREEVIEW;

export default class CodewindTreeDataProvider implements vscode.TreeDataProvider<CodewindTreeItem> {

    public static readonly VIEW_ID: string = "ext.cw.explorer";                  // must match package.nls.json
    public readonly treeView: vscode.TreeView<CodewindTreeItem>;

    private readonly onTreeDataChangeEmitter: vscode.EventEmitter<CodewindTreeItem> = new vscode.EventEmitter<CodewindTreeItem>();
    public readonly onDidChangeTreeData: vscode.Event<CodewindTreeItem> = this.onTreeDataChangeEmitter.event;

    private root: vscode.TreeItem;

    constructor() {
        this.treeView = vscode.window.createTreeView(CodewindTreeDataProvider.VIEW_ID, { treeDataProvider: this });

        CodewindManager.instance.addOnChangeListener(this.refresh);
        Log.d("Finished constructing ProjectTree");

        this.root = TreeItemFactory.getRootTreeItems();
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
            this.root = TreeItemFactory.getRootTreeItems();
            return [ this.root ];
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
            return this.root;
        }
        else if (node === this.root) {
            return undefined;
        }
        Log.e("Unexpected TreeItem!", node);
        return undefined;
    }
}
