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
import { isRegistrySet, onRegistryNotSet } from "../../codewind/connection/Registry";

/**
 * @param create true for Create page, false for Import page
 */
export default async function bindProject(connection: Connection): Promise<void> {
    if (!(await isRegistrySet(connection))) {
        onRegistryNotSet(connection);
        return;
    }

    try {
        const dirToBindUri = await UserProjectCreator.promptForDir("Add to Codewind", connection.workspacePath);
        if (dirToBindUri == null) {
            return;
        }
        if (dirToBindUri.fsPath === connection.workspacePath.fsPath) {
            Log.d("User tried to bind entire workspace");
            vscode.window.showErrorMessage(`You must select a project under the workspace; not the entire workspace.`);
            return;
        }
        if (!connection.remote) {
            if (!dirToBindUri.fsPath.startsWith(connection.workspacePath.fsPath)) {
                Log.d(`${dirToBindUri.fsPath} is not under workspace ${connection.workspacePath.fsPath}`);
                vscode.window.showErrorMessage(
                    `Currently, projects to be imported must be located under the workspace at ${connection.workspacePath.fsPath}`);
                return;
            }
        }
        const response = await UserProjectCreator.validateAndBind(connection, dirToBindUri);
        if (response == null) {
            return;
        }
        vscode.window.showInformationMessage(`Adding ${MCUtil.containerPathToFsPath(response.projectPath)} as ${response.projectName}`);
    }
    catch (err) {
        const errMsg = "Error importing project: ";
        Log.e(errMsg, err);
        vscode.window.showErrorMessage(errMsg + MCUtil.errToString(err));
    }
}
