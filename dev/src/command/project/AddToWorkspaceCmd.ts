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
import MCUtil from "../../MCUtil";

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
        const res = await vscode.window.showInformationMessage(
            `${project.name} is already in your VS Code workspace under ${projectWsFolder.uri.fsPath}`,
            addAnywayBtn
        );

        if (res !== addAnywayBtn) {
            return;
        }
    }

    Log.d(`addToWorkspaceCmd ${project.name}`);

    const wsFolders = vscode.workspace.workspaceFolders || [];

    const newWsFolder = {
        uri: project.localPath,
        index: wsFolders.length,
        name: path.basename(project.localPath.fsPath),
    };

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        cancellable: false,
        title: `Adding ${project.name} to workspace...`,
    }, async () => {
        await MCUtil.updateWorkspaceFolders("add", newWsFolder);
    });

    CodewindEventListener.onChange(project);
}
