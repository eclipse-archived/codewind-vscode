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

import { promptForConnection } from "./CommandUtil";
import Log from "../Logger";
import Connection from "../microclimate/connection/Connection";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

export default async function refreshConnectionCmd(connection: Connection): Promise<void> {
    Log.d("refreshConnectionCmd");
    if (connection == null) {
        const selected = await promptForConnection(true);
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        connection = selected;
    }

    vscode.window.showInformationMessage(Translator.t(StringNamespaces.CMD_MISC, "refreshingConnection", { uri: connection.url }));
    return connection.forceUpdateProjectList(true);
}
