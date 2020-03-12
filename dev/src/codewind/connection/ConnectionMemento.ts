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

import Log from "../../Logger";
import ConnectionManager from "./ConnectionManager";
import MCUtil from "../../MCUtil";
import { CLICommandRunner } from "../cli/CLICommandRunner";
import remoteConnectionOverviewCmd from "../../command/connection/ConnectionOverviewCmd";
import { CLIConnectionData } from "../Types";

export namespace ConnectionMemento {

    /**
     * Save the given connection info using the CLI.
     * @returns The new connection's ID.
     */
    export async function addConnection(label: string, url: string | vscode.Uri, username: string): Promise<string> {
        if (url instanceof vscode.Uri) {
            url = url.toString();
        }
        Log.i(`Saving remote connection ${label} @ ${url}`);
        const addResult = await CLICommandRunner.addConnection(label, url, username);
        const id = addResult.id;
        return id;
    }

    export async function loadSavedConnections(): Promise<void> {
        const loaded = (await CLICommandRunner.getRemoteConnections());
        Log.i(`Loaded ${loaded.length} saved remote connections`);
        await Promise.all(loaded.map(loadConnection));
    }

    async function loadConnection(cliData: CLIConnectionData): Promise<void> {
        try {
            await ConnectionManager.instance.loadRemoteConnection(cliData);
        }
        catch (err) {
            const errMsg = `Error loading connection ${cliData.label}`;
            Log.e(errMsg, err);

            // const retryBtn = "Retry";
            const openSettingsBtn = "Open Connection Settings";
            const rmBtn = "Remove Connection";

            const loadedConn = ConnectionManager.instance.remoteConnections.find((conn) => conn.id === cliData.id);
            // const btns = [ retryBtn ];
            const btns = [];
            if (loadedConn) {
                // The load did succeed, there is just a promise with the connection
                btns.push(openSettingsBtn);
            }
            else {
                // give the user some way to remove the broken connection
                btns.push(rmBtn);
            }

            vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`, ...btns)
            .then((res) => {
                if (res === rmBtn) {
                    CLICommandRunner.removeConnection(cliData.id);
                }
                // else if (res === retryBtn) {
                    // loadConnection(cliData);
                // }
                // loadedConn will be non-null from the btns condition above
                else if (res === openSettingsBtn && loadedConn) {
                    remoteConnectionOverviewCmd(loadedConn);
                }
            });
        }
    }

    export async function save(connectionData: CLIConnectionData): Promise<void> {
        return CLICommandRunner.updateConnection(connectionData);
    }

}
