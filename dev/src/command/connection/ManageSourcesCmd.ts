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
import Log from "../../Logger";
import MCUtil from "../../MCUtil";
import { SourcesPageWrapper } from "../webview/SourcesPageWrapper";

export default async function manageSourcesCmd(connection: Connection): Promise<void> {
    try {
        if (connection.sourcesPage) {
            // Show existing page
            connection.sourcesPage.reveal();
            return;
        }

        // tslint:disable-next-line: no-unused-expression
        new SourcesPageWrapper(connection);
    }
    catch (err) {
        const errMsg = `Error opening Manage Template Sources page:`;
        vscode.window.showErrorMessage(`${errMsg} ${MCUtil.errToString(err)}`);
        Log.e(errMsg, err);
    }
}
