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

export default async function refreshConnectionCmd(connection: Connection): Promise<void> {

    if (!connection.isRemote) {
        // If local was restarted outside of the IDE, the IDE will not pick up the new URL until a manual refresh
       const localHasChanged = await LocalCodewindManager.instance.refresh();
       if (localHasChanged) {
           vscode.window.showInformationMessage(`Reconnected to Local Codewind`);
           // We don't have to do the projects update in this case because the connection was recreated
           return;
       }
    }

    vscode.window.showInformationMessage(`Refreshed projects list of ${connection.label}`);
    return connection.forceUpdateProjectList(true);
}
