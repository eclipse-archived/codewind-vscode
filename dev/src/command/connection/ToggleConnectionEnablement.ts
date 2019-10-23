
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
import Log from "../../Logger";
import RemoteConnection from "../../codewind/connection/RemoteConnection";
import MCUtil from "../../MCUtil";
import remoteConnectionOverviewCmd from "./ConnectionOverviewCmd";

export default async function toggleConnectionEnablement(connection_: Connection, enable: boolean): Promise<void> {
    if (!connection_.isRemote) {
        Log.e("Cannot toggle enablement for the local connection");
        return;
    }

    const connection = connection_ as RemoteConnection;

    try {
        if (connection.enabled) {
            if (enable) {
                vscode.window.showWarningMessage(`${connection.label} is already enabled.`);
                return;
            }
            await connection.disable();
        }
        else {
            if (!enable) {
                vscode.window.showWarningMessage(`${connection.label} is already disabled.`);
                return;
            }
            await connection.enable();
        }
        vscode.window.showInformationMessage(`Successfully ${enable ? "connected to " : "disconnected from "} ${connection.url}`);
    }
    catch (err) {
        const errMsg = `Failed to ${enable ? "connect to " : "disconnect from "} ${connection.url}. ${MCUtil.errToString(err)}`;
        Log.e(errMsg, err);
        const openConnOverviewBtn = "Open Connection Overview";
        const retryBtn = "Retry";
        vscode.window.showErrorMessage(errMsg, openConnOverviewBtn, retryBtn)
        .then((res) => {
            if (res === openConnOverviewBtn) {
                remoteConnectionOverviewCmd(connection);
            }
            else if (res === retryBtn) {
                toggleConnectionEnablement(connection, enable);
            }
        });
    }

}
