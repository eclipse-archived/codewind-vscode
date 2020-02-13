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
import * as rmrf from "rimraf";

import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Log from "../../Logger";
import MCUtil from "../../MCUtil";
import Project from "../../codewind/project/Project";
import ConnectionManager from "../../codewind/connection/ConnectionManager";

export default async function removeProjectCmd(project: Project): Promise<void> {
    await removeProject(project, undefined);
}

/**
 * @param deleteFiles - Set this to skip prompting the user, and instead just do the unbind silently.
 */
export async function removeProject(project: Project, deleteFiles: boolean | undefined): Promise<void> {
    let doDeleteProjectDir: boolean;

    if (deleteFiles == null) {
        // ask the user
        const deleteMsg = Translator.t(StringNamespaces.CMD_MISC, "confirmDeleteProjectMsg", {
            projectName: project.name,
            connectionLabel: project.connection.label
        });
        const deleteBtn = Translator.t(StringNamespaces.CMD_MISC, "confirmDeleteBtn", { projectName: project.name });

        const deleteRes = await vscode.window.showInformationMessage(deleteMsg, { modal: true }, deleteBtn);
        if (deleteRes !== deleteBtn) {
            // cancelled
            return;
        }

        const projectDirPath: string = project.localPath.fsPath;
        const isProjectBoundElsewhere = ConnectionManager.instance.connections
            .some((conn) => conn !== project.connection && conn.hasProjectAtPath(project.localPath));

        if (isProjectBoundElsewhere) {
            // Another connection is using this project, so we cannot delete its files.
            doDeleteProjectDir = false;
        }
        else {
            // Ask user if they want to delete the files on disk too.
            const cancelBtn = global.isTheia ? "Close" : "Cancel";

            const deleteDirMsg = Translator.t(StringNamespaces.CMD_MISC, "alsoDeleteDirMsg", {
                projectName: project.name,
                connectionLabel: project.connection.label,
                dirPath: projectDirPath,
                cancelBtn,
            });

            const deleteDirBtn = Translator.t(StringNamespaces.CMD_MISC, "alsoDeleteDirBtn");
            const deleteDirRes = await vscode.window.showWarningMessage(deleteDirMsg, { modal: true }, deleteDirBtn);

            doDeleteProjectDir = deleteDirRes === deleteDirBtn;
        }
    }
    else {
        doDeleteProjectDir = deleteFiles;
    }

    await vscode.window.withProgress({
        cancellable: false,
        location: vscode.ProgressLocation.Notification,
        title: `Removing ${project.name} from ${project.connection.label}...`
    }, async () => {
        await project.deleteFromCodewind(doDeleteProjectDir);
    });
}

export async function deleteProjectDir(project: Project): Promise<void> {
    Log.i("Deleting project directory: " + project.localPath.fsPath);
    const projectDirPath = project.localPath.fsPath;
    return new Promise<void>((resolve, _reject) => {
        rmrf(projectDirPath, { glob: false }, (err) => {
            if (err) {
                vscode.window.showErrorMessage(`Failed to delete ${project.name} directory: ${MCUtil.errToString(err)}`);
            }
            return resolve();
        });
    });
}
