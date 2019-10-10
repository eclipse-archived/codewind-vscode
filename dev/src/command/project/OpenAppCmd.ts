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

import { Log } from "../../Logger";
import Commands from "../../constants/Commands";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";

const STRING_NS = StringNamespaces.CMD_OPEN_IN_BROWSER;

export default async function openAppCmd(project: Project): Promise<void> {
    if (!(project.state.isStarted || project.state.isStarting)) {
        vscode.window.showWarningMessage(Translator.t(STRING_NS, "canOnlyOpenStartedProjects", { projectName: project.name }));
        return;
    }
    else if (project.appUrl == null) {
        Log.e("Project is started but has no app URL: " + project.name);
        vscode.window.showErrorMessage(Translator.t(STRING_NS, "failedDetermineAppUrl", { projectName: project.name }));
        return;
    }

    const uriToOpen = project.appUrl;

    Log.i(`Open project ${project.name} in browser at ${uriToOpen}`);
    // vscode.window.showInformationMessage("Opening " + uriToOpen);
    vscode.commands.executeCommand(Commands.VSC_OPEN, uriToOpen);
}
