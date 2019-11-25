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
import Log from "../../Logger";
import ConnectionManager from "../../codewind/connection/ConnectionManager";
import LocalCodewindManager from "../../codewind/connection/local/LocalCodewindManager";
import stopLocalCodewindCmd from "../StopCodewindCmd";
import MCUtil from "../../MCUtil";

export default async function removeConnectionCmd(connection: Connection): Promise<boolean> {
    Log.i("Removing connection " + connection.url);

    if (connection === LocalCodewindManager.instance.localConnection) {
        const stopCodewindBtn = "Stop Local Codewind";
        vscode.window.showWarningMessage("You cannot remove the local connection. Stop Codewind instead.", stopCodewindBtn)
        .then((res) => {
            if (res === stopCodewindBtn) {
                stopLocalCodewindCmd();
            }
        });
        return false;
    }

    const yesBtn = "Yes";
    const confirm = await vscode.window.showWarningMessage(`Are you sure you want to remove ${connection.label}?`, { modal: true }, yesBtn);
    if (confirm !== yesBtn) {
        return false;
    }

    try {
        await ConnectionManager.instance.removeConnection(connection);
        return true;
    }
    catch (err) {
        const errMsg = `Error removing ${connection.label}`;
        Log.e(errMsg, err);
        vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(errMsg)}`);
        return false;
    }
}
