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

import Project from "../microclimate/project/Project";
import { promptForProject } from "../command/CommandUtil";
import ProjectState from "../microclimate/project/ProjectState";
import Log from "../Logger";
import StartModes from "../constants/StartModes";
import Requester from "../microclimate/project/Requester";
import * as MCUtil from "../MCUtil";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

export default async function restartProjectCmd(project: Project, debug: boolean): Promise<boolean> {
    if (project == null) {
        const selected = await promptForProject(ProjectState.AppStates.STARTED, ProjectState.AppStates.STARTING);
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return false;
        }
        project = selected;
    }

    const startMode: StartModes.Modes = StartModes.getDefaultStartMode(debug, project.type.type);

    Log.i(`RestartProject on project ${project.name} into ${startMode} mode`);

    if (project.isRestarting) {
        const alreadyRestartingMsg = Translator.t(StringNamespaces.PROJECT, "alreadyRestarting", { projectName: project.name });
        Log.i(alreadyRestartingMsg);
        vscode.window.showWarningMessage(alreadyRestartingMsg);
        return false;
    }

    let restartResponse;
    try {
        restartResponse = await Requester.requestProjectRestart(project, startMode);
    }
    catch (err) {
        // requester will display the error
        return false;
    }
    const statusCode = Number(restartResponse.statusCode);

    // Note here that we don't return whether or not the restart actually suceeded,
    // just whether or not it was accepted by the server and therefore initiated.
    if (MCUtil.isGoodStatusCode(statusCode)) {
        Log.d("Restart was accepted by server");

        const restarting = project.doRestart(startMode);
        if (!restarting) {
            // Should never happen
            Log.e("Restart was rejected by Project class");
            return false;
        }

        return true;
    }
    return false;
}
