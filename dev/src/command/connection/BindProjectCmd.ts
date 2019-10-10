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
import Connection from "../../codewind/connection/Connection";
import MCUtil from "../../MCUtil";
import UserProjectCreator from "../../codewind/connection/UserProjectCreator";
import RegistryUtils from "../../codewind/connection/RegistryUtils";

/**
 * @param create true for Create page, false for Import page
 */
export default async function bindProject(connection: Connection): Promise<void> {
    if (!(await connection.isRegistrySet())) {
        RegistryUtils.onRegistryNotSet(connection);
        return;
    }

    try {
        const defaultPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : undefined;
        const dirToBindUri = await UserProjectCreator.promptForDir("Add to Codewind", defaultPath);
        if (dirToBindUri == null) {
            return;
        }

        const response = await UserProjectCreator.validateAndBind(connection, dirToBindUri);
        if (response == null) {
            return;
        }

        vscode.window.showInformationMessage(`Added ${MCUtil.containerPathToFsPath(response.projectPath)} as ${response.projectName}`);
    }
    catch (err) {
        const errMsg = "Error importing project: ";
        Log.e(errMsg, err);
        vscode.window.showErrorMessage(errMsg + MCUtil.errToString(err));
    }
}
