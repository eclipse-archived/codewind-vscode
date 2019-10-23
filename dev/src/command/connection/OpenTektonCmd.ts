/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import Connection from "../../codewind/connection/Connection";
import MCUtil from "../../MCUtil";
import Log from "../../Logger";
import Commands from "../../constants/Commands";
import CWEnvironment from "../../codewind/connection/CWEnvironment";

export async function openTektonDashboard(connection: Connection): Promise<void> {
    try {
        const tektonStatus = (await CWEnvironment.getEnvData(connection.url)).tektonStatus;

        if (!tektonStatus.status || !tektonStatus.url) {
            if (tektonStatus.message === "not-installed") {
                vscode.window.showErrorMessage("Tekton Dashboard does not appear to be installed on this cluster. " +
                    "Please install Tekton Dashboard on your cluster.");
            }
            else {
                vscode.window.showErrorMessage("There was an error detecting the Tekton Dashboard installation on this cluster. " +
                    "Please install or re-install Tekton Dashboard on your cluster.");
            }
            return;
        }

        // TODO is it always http?
        // The 'url' is just the authority component
        const asUri = vscode.Uri.parse(`http://${tektonStatus.url}`);

        const isGoodUrl = !!(asUri.authority);
        if (!isGoodUrl) {
            vscode.window.showErrorMessage(`The Tekton Dashboard URL "${tektonStatus.url}" does not appear to be valid`);
            return;
        }

        // we did it
        vscode.commands.executeCommand(Commands.VSC_OPEN, asUri);
    }
    catch (err) {
        Log.e("Error doing openTektonCmd", err);
        vscode.window.showErrorMessage(MCUtil.errToString(err));
    }
}
