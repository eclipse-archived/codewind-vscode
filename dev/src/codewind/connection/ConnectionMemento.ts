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
import { CLICommandRunner } from "./CLICommandRunner";
import ConnectionManager from "./ConnectionManager";
import MCUtil from "../../MCUtil";

/**
 *
 * Represents the data we persist between VS Code sessions for each connection.
 * Part of the ConnectionMemento which is persisted into extension state, NOT into the CLI.
 */
export interface ConnectionMemento {
    readonly id: string;
    readonly label: string;
    readonly ingressUrl: string;
    readonly username: string;
    readonly registryUrl?: string;
    readonly registryUsername?: string;
}
export namespace ConnectionMemento {

    /**
     * Save the given connection info using the CLI.
     * @returns The new connection's ID.
     */
    export async function addConnection(label: string, url: string | vscode.Uri): Promise<string> {
        if (url instanceof vscode.Uri) {
            url = url.toString();
        }
        Log.i(`Saving remote connection ${label} @ ${url}`);
        const addResult = await CLICommandRunner.addConnection(label, url);
        const id = addResult.id;
        return id;
    }

    export async function loadSavedConnections(): Promise<void> {
        const loaded = (await CLICommandRunner.getRemoteConnections());

        if (loaded.length === 0) {
            Log.i("No remote connections were loaded");
            return;
        }

        Log.i(`Loaded ${loaded.length} saved remote connections`);
        const globalState = global.extGlobalState as vscode.Memento;

        // Convert the connection datas from the CLI to ConnectionMementos
        const mementos: Array<ConnectionMemento | undefined> = loaded.map((cliData) => {
            const memento = globalState.get(getKey(cliData.id)) as ConnectionMemento | undefined;
            if (memento == null) {
                const errMsg = `Error loading connection: ${cliData.label}; saved connection data was not found.`;
                vscode.window.showErrorMessage(errMsg);
                Log.e(errMsg, `Data from CLI was`, cliData);
            }
            return memento;
        });

        // remove any that failed to load
        const goodMementos = mementos.filter((memento) => memento != null) as ConnectionMemento[];

        await Promise.all(goodMementos.map(loadConnection));
    }

    async function loadConnection(memento: ConnectionMemento): Promise<void> {
        try {
            await ConnectionManager.instance.loadRemoteConnection(memento);
        }
        catch (err) {
            const errMsg = `Error loading connection ${memento.label}`;
            Log.e(errMsg, err);

            const retryBtn = "Retry";
            vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`, retryBtn)
            .then((res) => {
                if (res === retryBtn) {
                    loadConnection(memento);
                }
            });
        }
    }

    /**
     * @returns The key for saving this memento into the extension state
     */
    function getKey(connID: string): string {
        return `codewind-${connID}`;
    }

    export async function save(memento: ConnectionMemento): Promise<void> {
        const globalState = global.extGlobalState as vscode.Memento;
        await globalState.update(getKey(memento.id), memento);
        Log.d(`Saved memento for connection ${memento.id}`, memento);
    }
}
