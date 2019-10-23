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

import MCUtil from "../../MCUtil";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Translator from "../../constants/strings/translator";
import Log from "../../Logger";
import Connection from "./Connection";
import { IRemoteCodewindInfo } from "./RemoteConnection";

const SAVED_CONNECTIONS_KEY = "savedConnections";

namespace ConnectionMemento {
    export function loadSavedConnections(): IRemoteCodewindInfo[] {
        const globalState = global.extGlobalState as vscode.Memento;
        const loaded = globalState.get<IRemoteCodewindInfo[]>(SAVED_CONNECTIONS_KEY) || [];
        Log.i(`Loaded ${loaded.length} saved remote connections`);
        return loaded;
    }

    export async function saveConnections(connections: Connection[]): Promise<void> {
        const connectionInfos: IRemoteCodewindInfo[] = connections
        .map((connection): IRemoteCodewindInfo => {
            return {
                ingressHost: connection.url.authority,
                label: connection.label,
            };
        });

        Log.i("Saving connections", connectionInfos);
        try {
            const globalState = global.extGlobalState as vscode.Memento;
            // connectionInfos must not contain cyclic references (ie, JSON.stringify succeeds)
            await globalState.update(SAVED_CONNECTIONS_KEY, connectionInfos);
        }
        catch (err) {
            const msg = Translator.t(StringNamespaces.DEFAULT, "errorSavingConnections", { err: MCUtil.errToString(err) });
            Log.e(msg, err);
            vscode.window.showErrorMessage(msg);
        }
    }
}


export default ConnectionMemento;
