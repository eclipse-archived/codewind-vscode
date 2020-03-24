/*******************************************************************************
 * Copyright (c) 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import Project from "../../codewind/project/Project";
import Log from "../../Logger";
import ConnectionManager from "../../codewind/connection/ConnectionManager";
import toggleEnablementCmd from "./ToggleEnablementCmd";
import { addProjectToConnection } from "../connection/BindProjectCmd";
import RegistryUtils from "../../codewind/connection/registries/ImageRegistryUtils";
import { removeProject } from "./RemoveProjectCmd";
import MCUtil from "../../MCUtil";
import { IDetectedProjectType } from "../../codewind/Types";

export default async function changeProjectConnectionCmd(project: Project): Promise<void> {

    try {
        const selectableConnections = ConnectionManager.instance.connections.filter((conn) =>
            // we show a given connection if the other connection is connected and does not already have this project
            conn.isConnected && conn !== project.connection && !conn.hasProjectAtPath(project.localPath)
        );

        if (selectableConnections.length === 0) {
            vscode.window.showWarningMessage(`No suitable target for moving ${project.name} - ` +
                `there is no connection that is connected and does not already have this project.`);
            return;
        }

        const targetConnection = await vscode.window.showQuickPick(selectableConnections, {
            canPickMany: false,
            ignoreFocusOut: true,
            matchOnDetail: true,
            placeHolder: `Select the connection to move ${project.name} to.`,
        });

        if (targetConnection == null) {
            return;
        }

        if (await RegistryUtils.doesNeedPushRegistry(project.type.internalType, targetConnection)) {
            return;
        }

        // Ask what to do with the existing instance of the project
        const optionRemove: vscode.QuickPickItem = {
            label: "Remove",
            detail: `Remove the project from ${project.connection.label}. The source code is not affected.`,
        };
        const optionDisable: vscode.QuickPickItem = {
            label: "Disable",
            detail: `Keep the project on ${project.connection.label}, but Disable it so it doesn't build there.`,
        };
        const optionNothing: vscode.QuickPickItem = {
            label: "Leave it alone",
            detail: `Leave the project running on ${project.connection.label}. It will be built on both Codewind instances.`
        };

        const options = [ optionRemove ];
        if (project.state.isEnabled) {
            options.push(optionDisable);
        }
        options.push(optionNothing);

        const existingActionResponse = await vscode.window.showQuickPick(options, {
            canPickMany: false,
            ignoreFocusOut: true,
            placeHolder: `Select what to do with the existing instance of ${project.name} deployed on ${project.connection.label}.`,
        });

        if (existingActionResponse == null) {
            return;
        }

        Log.i(`Moving ${project.name} from ${project.connection.label} to ${targetConnection.label}`);

        const projectType: IDetectedProjectType = {
            language: project.language,
            projectType: project.type.internalType,
            // projectSubtype:
        };

        try {
            await addProjectToConnection(targetConnection, project.name, project.localPath.fsPath, projectType);
        }
        catch (err) {
            const errMsg = `Failed to add ${project.name} to ${targetConnection.label}`;
            Log.e(errMsg, err);

            // We use regex instead .includes here because for some reason this error message uses non-breaking spaces
            if (/type\sis\sinvalid/.test(err.toString() as string)) {
                Log.i(`Cannot add ${project.type.internalType} project to ${targetConnection.label}`);
                vscode.window.showErrorMessage(`${errMsg}: ${targetConnection.label} does not support ${project.type.type} projects.`);
            }
            else {
                vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
            }

            // Don't clean up the project from the old instance if it failed to get added to the new one
            return;
        }

        if (existingActionResponse === optionRemove) {
            await removeProject(project, false);
        }
        else if (existingActionResponse === optionDisable) {
            await toggleEnablementCmd(project);
        }
        // else, they selected to leave the existing project
    }
    catch (err) {
        const errMsg = `Error moving ${project.name}`;
        Log.e(errMsg, err);
        vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
    }
}
