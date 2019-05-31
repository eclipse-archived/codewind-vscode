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

import Connection from "../microclimate/connection/Connection";
import { promptForConnection } from "./CommandUtil";
import Log from "../Logger";
import InstallerWrapper, { InstallerCommands } from "../microclimate/connection/InstallerWrapper";
import * as MCUtil from "../MCUtil";

export default async function deactivateConnectionCmd(connection: Connection): Promise<void> {
    if (connection == null) {
        const selected = await promptForConnection(false);
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        connection = selected;
    }

    try {
        return await InstallerWrapper.installerExec(InstallerCommands.STOP_ALL);
    }
    catch (err) {
        if (!InstallerWrapper.isCancellation(err)) {
            Log.e("Error stopping codewind", err);
            if (err.toString() === err) {
                vscode.window.showErrorMessage("Error stopping Codewind: " + err);
            }
            else {
                vscode.window.showErrorMessage("Error stopping Codewind: " + MCUtil.errToString(err));
            }
        }
    }
}
