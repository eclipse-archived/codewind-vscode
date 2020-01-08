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
import * as path from "path";

import Project from "../../codewind/project/Project";
import Log from "../../Logger";

/**
 * Add the given project to the user's existing workspace folders.
 */
export default async function addProjectToWorkspaceCmd(project: Project): Promise<void> {
    const wsFolders: vscode.WorkspaceFolder[] = vscode.workspace.workspaceFolders || [];

    if (wsFolders.some((wsf) => wsf.uri.fsPath === project.localPath.fsPath)) {
        vscode.window.showInformationMessage(`${project.localPath.fsPath} is already a workspace folder.`);
        return;
    }

    const newWsFolder = {
        uri: project.localPath,
        index: wsFolders.length,
        name: path.basename(project.localPath.fsPath),
    };

    Log.i(`Adding ${project.localPath.fsPath} to workspace`);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        cancellable: false,
        title: `Adding ${project.name} to workspace...`,
    }, () => {
        vscode.workspace.updateWorkspaceFolders(wsFolders.length, 0, newWsFolder);
        return new Promise((resolve) => {
            vscode.workspace.onDidChangeWorkspaceFolders((_e) => {
                resolve();
            });
        });
    });

}
