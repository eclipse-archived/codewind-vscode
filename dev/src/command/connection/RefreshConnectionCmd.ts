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

import Connection from "../../codewind/connection/Connection";
import LocalCodewindManager from "../../codewind/connection/local/LocalCodewindManager";
import MCUtil from "../../MCUtil";
import Log from "../../Logger";

export default async function refreshConnectionCmd(connection: Connection): Promise<void> {
    try {
        if (!connection.isRemote) {
            // If local was restarted outside of the IDE, the IDE will not pick up the new URL until a manual refresh.
            // In Theia this has no effect
            const localHasChanged = await LocalCodewindManager.instance.refresh();
            if (localHasChanged) {
                vscode.window.showInformationMessage(`Reconnected to Local Codewind`);
                // We don't have to do the projects update in this case because the connection was recreated
                return;
            }
        }

        await connection.refresh();
    }
    catch (err) {
        const errMsg = `Error refreshing ${connection.label}`;
        vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
        Log.e(errMsg, err);
    }
}
