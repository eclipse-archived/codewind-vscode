/*******************************************************************************
 * Copyright (c) 2018 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import Connection from "../codewind/connection/Connection";
import Log from "../Logger";
import Commands from "../constants/Commands";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

export default async function openCodewindWorkspaceCmd(connection: Connection): Promise<void> {
    const workspacePathUri = connection.workspacePath;
    Log.i("Going to folder " + workspacePathUri);

    const currentFolders = vscode.workspace.workspaceFolders;
    // currentFolders[0] is the current workspace root.
    if (currentFolders != null && currentFolders[0] != null && currentFolders[0].uri.fsPath === workspacePathUri.fsPath) {
        Log.i("Selected folder is already workspace root, nothing to do");
        vscode.window.showWarningMessage(Translator.t(StringNamespaces.CMD_MISC, "alreadyInSelectedFolder"));
    }
    else {
        // To change 'in new window' behaviour, use "window.openFoldersInNewWindow": "default",
        Log.i(`Opening folder ${workspacePathUri.fsPath}`);
        vscode.commands.executeCommand(Commands.VSC_OPEN_FOLDER, workspacePathUri);
    }
}
