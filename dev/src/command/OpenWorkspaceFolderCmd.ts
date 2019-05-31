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

import Project from "../microclimate/project/Project";
import Connection from "../microclimate/connection/Connection";
import { promptForResource } from "./CommandUtil";
import Log from "../Logger";
import Commands from "../constants/Commands";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

export default async function openWorkspaceFolderCmd(resource: Project | Connection): Promise<void> {
    if (resource == null) {
        const selected = await promptForResource(false);
        if (selected == null) {
            Log.d("User cancelled prompt for resource");
            // user cancelled
            return;
        }
        resource = selected;
    }

    let uri;
    if (resource instanceof Project) {
        uri = resource.localPath;
    }
    else if (resource instanceof Connection) {
        uri = resource.workspacePath;
    }
    else {
        // Should never happen
        Log.e(`Could not get resource URI from object of type ${typeof(resource)}:`, resource);
        return;
    }

    Log.i("Going to folder " + uri);

    const currentFolders = vscode.workspace.workspaceFolders;
    // currentFolders[0] is the current workspace root.
    if (currentFolders != null && currentFolders[0] != null && currentFolders[0].uri.fsPath === uri.fsPath) {
        Log.i("Selected folder is already workspace root, nothing to do");
        vscode.window.showWarningMessage(Translator.t(StringNamespaces.CMD_MISC, "alreadyInSelectedFolder"));
    }
    else {
        // To change 'in new window' behaviour, use "window.openFoldersInNewWindow": "default",
        Log.i(`Opening folder ${uri.fsPath}`);
        vscode.commands.executeCommand(Commands.VSC_OPEN_FOLDER, uri);
    }
}
