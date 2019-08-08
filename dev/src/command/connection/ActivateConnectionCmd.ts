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

import CodewindManager from "../../codewind/connection/CodewindManager";
import Log from "../../Logger";
import Connection from "../../codewind/connection/Connection";
import CWEnvironment from "../../codewind/connection/CWEnvironment";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Commands from "../../constants/Commands";

const STRING_NS = StringNamespaces.STARTUP;

export default async function activateConnection(): Promise<void> {
    const url = CodewindManager.instance.codewindUrl;
    Log.i("Activating connection to " + url);
    const envData = await CWEnvironment.getEnvData(url);
    Log.i("Massaged env data:", envData);

    const connection = await CodewindManager.instance.addConnection(url, envData);
    await connection.initFileWatcherPromise;

    onConnectSuccess(connection);
    // return connection;
}

/**
 * Show a 'connection succeeded' message and provide a button to open the connection's workspace. Doesn't need to be awaited.
 */
async function onConnectSuccess(connection: Connection): Promise<void> {
    Log.i("Successfully connected to codewind at " + connection.url);
    let inMcWorkspace = false;
    // See if the user has this connection's workspace open
    const wsFolders = vscode.workspace.workspaceFolders;
    if (wsFolders != null) {
        inMcWorkspace = wsFolders.some((folder) => folder.uri.fsPath.includes(connection.workspacePath.fsPath));
    }

    if (!inMcWorkspace) {
        const openWsBtn = "Open Workspace";

        // Provide a button to change their workspace to the codewind-workspace if they wish
        vscode.window.showInformationMessage(Translator.t(STRING_NS, "openWorkspacePrompt"), openWsBtn)
        .then((response) => {
            if (response === openWsBtn) {
                vscode.commands.executeCommand(Commands.VSC_OPEN_FOLDER, connection.workspacePath);
            }
        });
    }
    else {
        // The user already has the workspace open, we don't have to do it for them.
        // vscode.window.showInformationMessage(successMsg);
    }
}
