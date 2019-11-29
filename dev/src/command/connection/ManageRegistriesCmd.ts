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
// import * as fs from "fs";

import Connection from "../../codewind/connection/Connection";
import Log from "../../Logger";
import MCUtil from "../../MCUtil";
import { ManageRegistriesPageWrapper } from "../webview/RegistriesPageWrapper";

export default async function manageRegistriesCmd(connection: Connection): Promise<void> {
    try {
        if (connection.registriesPage) {
            // Show existing page
            connection.registriesPage.reveal();
            return;
        }
        const manageRegistriesPage = new ManageRegistriesPageWrapper(connection);
        connection.onDidOpenRegistriesPage(manageRegistriesPage);
    }
    catch (err) {
        const errMsg = `Error opening Manage Container Registries page:`;
        vscode.window.showErrorMessage(`${errMsg} ${MCUtil.errToString(err)}`);
        Log.e(errMsg, err);
    }
}
