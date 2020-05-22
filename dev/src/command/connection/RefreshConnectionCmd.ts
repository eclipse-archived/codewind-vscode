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
import toggleConnectionEnablementCmd from "./ToggleConnectionEnablement";
import Translator from "../../constants/strings/Translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";

export async function refreshLocalCWCmd(): Promise<void> {
    // If local was restarted outside of the IDE, the IDE will not pick up the new URL until a manual refresh.
    const localHasChanged: boolean = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        cancellable: false,
        title: `Refreshing Local Codewind...`,
    }, () => {
        return LocalCodewindManager.instance.refresh();
    });

    if (localHasChanged) {
        vscode.window.showInformationMessage(`Reconnected to Local Codewind`);
        // We don't have to do the projects update in this case because the connection was recreated
        return;
    }

    if (LocalCodewindManager.instance.localConnection) {
        await refreshConnectionCmd(LocalCodewindManager.instance.localConnection);
    }
}

export async function refreshConnectionCmd(connection: Connection): Promise<void> {
    try {
        await vscode.window.withProgress({
            cancellable: false,
            location: vscode.ProgressLocation.Notification,
            title: `Refreshing ${connection.label}...`,
        }, () => {
            return connection.refresh();
        });
    }
    catch (err) {
        const errMsg = `Error refreshing ${connection.label}`;
        Log.e(errMsg, err);

        const refreshBtn = Translator.t(StringNamespaces.ACTIONS, "tryAgain");
        const disableBtn = Translator.t(StringNamespaces.ACTIONS, "disable");
        vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`, refreshBtn, disableBtn)
        .then((res) => {
            if (res === refreshBtn) {
                refreshConnectionCmd(connection);
            }
            else if (res === disableBtn) {
                toggleConnectionEnablementCmd(connection, false);
            }
        });
    }
}
