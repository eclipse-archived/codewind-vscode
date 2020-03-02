/*******************************************************************************
 * Copyright (c) 2019, 2020 IBM Corporation and others.
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
import CodewindEventListener from "../../codewind/connection/CodewindEventListener";

/**
 * Add the given project to the user's existing workspace folders.
 */
export default async function addProjectToWorkspaceCmd(project: Project): Promise<void> {

    const projectWsFolder = project.workspaceFolder;
    if (projectWsFolder) {
        if (projectWsFolder.isExactMatch) {
            // Nothing to do
            vscode.window.showInformationMessage(`${project.localPath.fsPath} is already a workspace folder`);
            return;
        }

        const addAnywayBtn = "Add Anyway";
        const res = await vscode.window.showInformationMessage(`${project.name} is already in your VS Code workspace under ${projectWsFolder.uri.fsPath}`, addAnywayBtn);

        if (res !== addAnywayBtn) {
            return;
        }
    }

    const wsFolders = vscode.workspace.workspaceFolders || [];

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
        const onDidChangeWsFoldersProm = new Promise((resolve) => {
            vscode.workspace.onDidChangeWorkspaceFolders((_e) => {
                resolve();
            });
        });

        vscode.workspace.updateWorkspaceFolders(wsFolders.length, 0, newWsFolder);

        // this timeout promise will hide the 'adding' progress in case in fails and the above never resolves.
        const timeoutProm = new Promise((resolve) => setTimeout(resolve, 10000));

        return Promise.race([ onDidChangeWsFoldersProm, timeoutProm ]);
    });

    CodewindEventListener.onChange(project);
}
