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

import Project from "../../codewind/project/Project";
import Log from "../../Logger";
import Translator from "../../constants/strings/Translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import ProjectCapabilities from "../../codewind/project/ProjectCapabilities";
import MCUtil from "../../MCUtil";
import ProjectState from "../../codewind/project/ProjectState";

export default async function restartProjectCmd(project: Project, debug: boolean): Promise<boolean> {
    const capabilities = project.capabilities;
    if (capabilities == null) {
        // shouldn't happen because UI blocks restart action until this is done
        vscode.window.showErrorMessage(`Cannot restart ${project.name} - project is still initializing. Wait for the project to build.`);
        return false;
    }

    if (project.isRestarting) {
        const alreadyRestartingMsg = Translator.t(StringNamespaces.PROJECT, "alreadyRestarting", { projectName: project.name });
        Log.i(alreadyRestartingMsg);
        vscode.window.showWarningMessage(alreadyRestartingMsg);
        return false;
    }

    if (project.state.isBuilding) {
        Log.d(`Blocking restart because ${project.name} is building`);
        vscode.window.showWarningMessage(`Projects cannot be restarted while they are building. Wait for ${project.name} to build and start.`);
        return false;
    }

    const restartableStates = ProjectState.getAppStateSet("started-starting");

    if (!restartableStates.states.includes(project.state.appState)) {
        Log.d(`Blocking restart because ${project.name} is not ${restartableStates.userLabel}`);
        vscode.window.showWarningMessage(`Projects can only be restarted if they are starting or running. ` +
            `Wait for ${project.name} to start.`);
        return false;
    }

    const startMode = capabilities.getDefaultStartMode(debug, project.type.type);
    const ufStartMode = ProjectCapabilities.getUserFriendlyStartMode(startMode);
    Log.i(`RestartProject on project ${project.name} into ${startMode} mode`);

    try {
        await project.doRestart(startMode, false);
        return true;
    }
    catch (err) {
        const errMsg = `Failed to restart ${project.name} in ${ufStartMode} mode`;
        Log.e(errMsg, err);
        vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
    }
    return false;
}
