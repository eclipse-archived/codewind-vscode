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

import Log from "../../Logger";
import Connection from "../../codewind/connection/Connection";
import CWEnvironment from "../../codewind/connection/CWEnvironment";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import { CWConfigurations } from "../../constants/Configurations";
import MCUtil from "../../MCUtil";
import openWorkspaceCmd from "../OpenWorkspaceCmd";
import ConnectionManager from "../../codewind/connection/ConnectionManager";

const STRING_NS = StringNamespaces.STARTUP;

export default async function activateConnection(url: vscode.Uri, isLocalConnection: boolean): Promise<Connection> {
    Log.i("Activating connection to " + url);
    const envData = await CWEnvironment.getEnvData(url);
    Log.i("Massaged env data:", envData);

    const connection = await ConnectionManager.instance.connect(url, envData, isLocalConnection);
    await connection.initPromise;

    onConnectSuccess(connection);
    return connection;
}

/**
 * Show a 'connection succeeded' message and provide a button to open the connection's workspace. Doesn't need to be awaited.
 */
async function onConnectSuccess(connection: Connection): Promise<void> {
    Log.i("Successfully connected to codewind at " + connection.url);

    if (!await MCUtil.isUserInCwWorkspaceOrProject()) {
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
            openWorkspaceCmd(connection);
        }
        else if (openWsRes === dontShowAgainBtn) {
            vscode.window.showInformationMessage(
                `You can re-enable the Open Workspace prompt by setting "${CWConfigurations.PROMPT_TO_OPEN_WORKSPACE}" in the Preferences.`
            );
            vscode.workspace.getConfiguration().update(CWConfigurations.PROMPT_TO_OPEN_WORKSPACE, false, vscode.ConfigurationTarget.Global);
        }
    }
}
