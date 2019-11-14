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
import { IRemoteCodewindInfo } from "./RemoteConnection";
import { CLICommandRunner } from "./CLICommands";

namespace ConnectionMemento {
    export async function loadSavedConnections(): Promise<IRemoteCodewindInfo[]> {
        const loaded = (await CLICommandRunner.getRemoteConnections());
        Log.i(`Loaded ${loaded.length} saved remote connections`);
        return loaded;
    }

    export async function addConnection(label: string, url: string): Promise<void> {
        Log.i(`Saving remote connection ${label} @ ${url}`);
        try {
            await CLICommandRunner.addConnection(label, url);
        }
        catch (err) {
            const msg = Translator.t(StringNamespaces.DEFAULT, "errorSavingConnections", { err: MCUtil.errToString(err) });
            Log.e(msg, err);
            vscode.window.showErrorMessage(msg);
        }
    }
}

export default ConnectionMemento;
