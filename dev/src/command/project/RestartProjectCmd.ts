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
import Requester from "../../codewind/project/Requester";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";

export default async function restartProjectCmd(project: Project, debug: boolean): Promise<boolean> {
    const capabilities = project.capabilities;
    if (capabilities == null) {
        // shouldn't happen because UI blocks restart action until this is done
        vscode.window.showErrorMessage(`Cannot restart ${project.name} - project is still initializing. Wait for the project to build.`);
        return false;
    }

    const startMode = capabilities.getDefaultStartMode(debug, project.type.type);

    Log.i(`RestartProject on project ${project.name} into ${startMode} mode`);

    if (project.isRestarting) {
        const alreadyRestartingMsg = Translator.t(StringNamespaces.PROJECT, "alreadyRestarting", { projectName: project.name });
        Log.i(alreadyRestartingMsg);
        vscode.window.showWarningMessage(alreadyRestartingMsg);
        return false;
    }

    try {
        const restartAccepted = await Requester.requestProjectRestart(project, startMode);
        if (restartAccepted) {
            return project.doRestart(startMode);
        }
        return restartAccepted;
    }
    catch (err) {
        // requester will display the error
    }
    return false;
}
