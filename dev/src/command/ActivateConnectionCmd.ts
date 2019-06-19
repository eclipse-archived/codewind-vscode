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

import * as MCUtil from "../MCUtil";
import CodewindManager from "../microclimate/connection/CodewindManager";
import Log from "../Logger";
import Commands from "../constants/Commands";
import Connection from "../microclimate/connection/Connection";
import MCEnvironment from "../microclimate/connection/MCEnvironment";
import InstallerWrapper from "../microclimate/connection/InstallerWrapper";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

const STRING_NS = StringNamespaces.STARTUP;

export default async function activateConnection(): Promise<void> {
    try {
        const url = CodewindManager.instance.CW_URL;
        Log.i("Activating connection to " + url);
        const envData = await MCEnvironment.getEnvData(url);
        Log.i("ENV data:", envData);

        const connection = await connect(url, envData);
        await connection.initFileWatcherPromise;

        onConnectSuccess(connection);
        // return connection;
    }
    catch (err) {
        if (!InstallerWrapper.isCancellation(err)) {
            Log.e("Failed to start/connect to codewind:", err);
            vscode.window.showErrorMessage(MCUtil.errToString(err));
        }
        // return undefined;
    }
}

async function connect(url: vscode.Uri, envData: MCEnvironment.IMCEnvData): Promise<Connection> {
    // const rawVersion: string = envData.microclimate_version;
    const rawWorkspace: string = envData.workspace_location;
    const rawSocketNS: string = envData.socket_namespace || "";

    // if (rawVersion == null) {
        // throw new Error("No version information was provided by Codewind.");
    // }
    if (rawWorkspace == null) {
        throw new Error("No workspace information was provided by Codewind.");
    }

    const workspace = MCUtil.containerPathToFsPath(rawWorkspace);
    const versionNum = MCEnvironment.getVersionNumber(envData);

    // normalize namespace so it doesn't start with '/'
    const socketNS = rawSocketNS.startsWith("/") ? rawSocketNS.substring(1, rawSocketNS.length) : rawSocketNS;

    return await CodewindManager.instance.addConnection(url, versionNum, socketNS, workspace);
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
