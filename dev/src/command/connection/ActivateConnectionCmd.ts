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
import { CWConfigurations } from "../../constants/Configurations";

const STRING_NS = StringNamespaces.STARTUP;

export default async function activateConnection(url: vscode.Uri): Promise<void> {
    Log.i("Activating connection to " + url);
    const envData = await CWEnvironment.getEnvData(url);
    Log.i("Massaged env data:", envData);

    const connection = await CodewindManager.instance.connect(url, envData);
    await connection.initFileWatcherPromise;

    onConnectSuccess(connection);
    // return connection;
}

/**
 * Show a 'connection succeeded' message and provide a button to open the connection's workspace. Doesn't need to be awaited.
 */
async function onConnectSuccess(connection: Connection): Promise<void> {
    Log.i("Successfully connected to codewind at " + connection.url);
    let isInWorkspace = false;
    // See if the user has this connection's workspace open
    const wsFolders = vscode.workspace.workspaceFolders;
    if (wsFolders != null) {
        isInWorkspace = wsFolders.some((folder) => folder.uri.fsPath.includes(connection.workspacePath.fsPath));
    }

    if (!isInWorkspace) {
        // Provide a button to change their workspace to the codewind-workspace if they wish, and haven't disabled this feature.
        let promptOpenWs = vscode.workspace.getConfiguration().get(CWConfigurations.PROMPT_TO_OPEN_WORKSPACE);
        if (promptOpenWs == null) {
            promptOpenWs = true;
        }
        if (!promptOpenWs) {
            return;
        }

        const openWsBtn = "Open Workspace";
        const dontShowAgainBtn = "Hide This Message";
        const openWsRes = await vscode.window.showInformationMessage(Translator.t(STRING_NS, "openWorkspacePrompt"),
            { modal: true }, openWsBtn, dontShowAgainBtn
        );

        if (openWsRes === openWsBtn) {
            vscode.commands.executeCommand(Commands.VSC_OPEN_FOLDER, connection.workspacePath);
        }
        else if (openWsRes === dontShowAgainBtn) {
            vscode.window.showInformationMessage(
                `You can re-enable the Open Workspace prompt by setting "${CWConfigurations.PROMPT_TO_OPEN_WORKSPACE}" in the Preferences.`
            );
            vscode.workspace.getConfiguration().update(CWConfigurations.PROMPT_TO_OPEN_WORKSPACE, false, vscode.ConfigurationTarget.Global);
        }
    }
}
