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
import RemoteConnection from "../../codewind/connection/RemoteConnection";
import ConnectionOverview from "../webview/ConnectionOverview";

export default async function remoteConnectionOverviewCmd(connection: Connection): Promise<void> {
    // if (!(connection instanceof RemoteConnection)) {
    if (!(connection.isRemote)) {
        vscode.window.showWarningMessage("The Local connection does not have any data to show in the overview.");
        return;
    }

    const remoteConnection = connection as RemoteConnection;
    ConnectionOverview.showForExistingConnection(remoteConnection);
}
