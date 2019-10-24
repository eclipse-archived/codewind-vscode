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
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import LocalCodewindManager from "../../codewind/connection/local/LocalCodewindManager";

export default async function refreshConnectionCmd(connection: Connection): Promise<void> {

    if (!connection.isRemote) {
       const localHasChanged = await LocalCodewindManager.instance.refresh();
       if (localHasChanged) {
           vscode.window.showInformationMessage(`Reconnected to Local Codewind`);
           return;
       }
    }

    vscode.window.showInformationMessage(Translator.t(StringNamespaces.CMD_MISC, "refreshedConnection"));
    return connection.forceUpdateProjectList(true);
}
