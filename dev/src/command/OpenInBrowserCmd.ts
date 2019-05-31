/*******************************************************************************
 * Copyright (c) 2018 IBM Corporation and others.
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
import { promptForProject } from "./CommandUtil";
import { ProjectState } from "../microclimate/project/ProjectState";
import { Log } from "../Logger";
import Commands from "../constants/Commands";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

const STRING_NS = StringNamespaces.CMD_OPEN_IN_BROWSER;

export default async function openInBrowserCmd(project: Project): Promise<void> {
    Log.d("OpenInBrowserCmd invoked");
    if (project == null) {
        const selected = await promptForProject(...ProjectState.getStartedStates());
        if (selected == null) {
            Log.d("User cancelled prompt for resource");
            // user cancelled
            return;
        }
        project = selected;
    }

    let uriToOpen: vscode.Uri;
    // This will open the project or Microclimate in the external web browser.
    if (!(project instanceof Project)) {
        // should never happen
        Log.e(`Don't know how to open object of type ${typeof(project)} in browser`);
        return;
    }
    if (!project.state.isStarted) {
        vscode.window.showWarningMessage(Translator.t(STRING_NS, "canOnlyOpenStartedProjects"));
        return;
    }
    else if (project.appBaseUrl == null) {
        Log.e("Project is started but has no appBaseUrl: " + project.name);
        vscode.window.showErrorMessage(Translator.t(STRING_NS, "failedDetermineAppUrl", { projectName: project.name }));
        return;
    }
    uriToOpen = project.appBaseUrl;


    Log.i("Open in browser: " + uriToOpen);
    // vscode.window.showInformationMessage("Opening " + uriToOpen);
    vscode.commands.executeCommand(Commands.VSC_OPEN, uriToOpen);
}
