
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
import remoteConnectionSettingsCmd from "./ConnectionOverviewCmd";
import { refreshConnectionCmd } from "./RefreshConnectionCmd";

export default async function toggleConnectionEnablementCmd(connection_: Connection, enable: boolean): Promise<void> {
    if (!connection_.isRemote) {
        Log.e("Cannot toggle enablement for the local connection");
        return;
    }

    const connection = connection_ as RemoteConnection;

    if (connection.enabled) {
        if (enable) {
            vscode.window.showWarningMessage(`${connection.label} is already enabled.`);
            return;
        }
    }
    else if (!enable) {
        vscode.window.showWarningMessage(`${connection.label} is already disabled.`);
        return;
    }

    Log.i(`${enable ? "Enable" : "Disable"} ${connection.label}`);

    if (!connection.canToggleEnablement()) {
        Log.t(`Blocking toggle operation for ${connection.label}`);
        return;
    }

    try {
        await vscode.window.withProgress({
            cancellable: false,
            location: vscode.ProgressLocation.Notification,
            title: `${enable ? "Connecting to" : "Disconnecting from"} ${connection.label}...`
        }, async () => {
            await (enable ? connection.enable() : connection.disable());
        });
    }
    catch (err) {
        const errMsg = `Failed to ${enable ? "connect to" : "disconnect from"} ${connection.label}: ${MCUtil.errToString(err)}`;
        Log.e(errMsg, err);
        const openConnSettingsBtn = "Open Connection Settings";
        const refreshBtn = "Refresh";
        vscode.window.showErrorMessage(errMsg, openConnSettingsBtn, refreshBtn)
        .then((res) => {
            if (res === openConnSettingsBtn) {
                remoteConnectionSettingsCmd(connection);
            }
            else if (res === refreshBtn) {
                refreshConnectionCmd(connection);
            }
        });
    }

}
