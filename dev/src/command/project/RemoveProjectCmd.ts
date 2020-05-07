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

import Translator from "../../constants/strings/Translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Log from "../../Logger";
import MCUtil from "../../MCUtil";
import Project from "../../codewind/project/Project";
import ConnectionManager from "../../codewind/connection/ConnectionManager";

export default async function removeProjectCmd(project: Project): Promise<void> {
    let deleteFiles: boolean;

    // confirm deletion
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

    // determine if the project files can be deleted from disk
    const projectDirPath: string = project.localPath.fsPath;
    const isProjectBoundElsewhere = ConnectionManager.instance.connections
        .some((conn) => conn !== project.connection && conn.hasProjectAtPath(project.localPath));

    if (isProjectBoundElsewhere) {
        // Another connection is using this project, so we should not delete its files.
        deleteFiles = false;
    }
    else {
        // Ask user if they want to delete the files on disk too.
        const cancelBtn = global.IS_THEIA ? "Close" : "Cancel";

        const deleteDirMsg = Translator.t(StringNamespaces.CMD_MISC, "alsoDeleteDirMsg", {
            projectName: project.name,
            connectionLabel: project.connection.label,
            dirPath: projectDirPath,
            cancelBtn,
        });

        const deleteDirBtn = Translator.t(StringNamespaces.CMD_MISC, "alsoDeleteDirBtn");
        const deleteDirRes = await vscode.window.showWarningMessage(deleteDirMsg, { modal: true }, deleteDirBtn);

        deleteFiles = deleteDirRes === deleteDirBtn;
    }

    // We do not await the deleteFromCodewind since it modifies the workspace folders.
    // If the workspace folder modification results in a reload, this command will get canceled
    // and an error message is shown that this command was canceled.
    // so by not awaiting, this command finishes early, but we don't have to worry about the cancellation.

    // await project.deleteFromCodewind(deleteFiles);

    project.deleteFromConnection(deleteFiles)
    .then(() => Log.i(`Finished removeProjectCmd for ${project.name}`))
    .catch((err) => {
        const errMsg = `Failed to remove ${project.name}`;
        Log.e(errMsg, err);
        vscode.window.showInformationMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
    });
}
