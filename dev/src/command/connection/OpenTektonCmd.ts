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

export async function openTektonDashboard(connection: Connection): Promise<void> {
    if (!global.isTheia) {
        vscode.window.showWarningMessage("This command does not apply to local Codewind.");
        return;
    }

    try {
        // TODO add doc links and improve error
        if (!connection.tektonStatus || connection.tektonStatus === "error") {
            vscode.window.showErrorMessage("There was an error detecting the Tekton Dashboard installation on this cluster. " +
                "Please install or re-install Tekton Dashboard on your cluster, and restart your Codewind Che workspace.");
            return;
        }
        else if (connection.tektonStatus === "not-installed") {
            vscode.window.showErrorMessage("Tekton Dashboard does not appear to be installed on this cluster. " +
                "Please install Tekton Dashboard on your cluster, and restart your Codewind Che workspace.");
            return;
        }

        // TODO is it always http??
        // The tektonStatus is just the authority component
        const asUri = vscode.Uri.parse(`http://${connection.tektonStatus}`);

        const isGoodUrl = !!(asUri.authority);
        if (!isGoodUrl) {
            vscode.window.showErrorMessage(`The Tekton Dashboard URL "${connection.tektonStatus}" does not appear to be valid`);
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
