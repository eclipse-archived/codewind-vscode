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
import Log from "../Logger";
import Requester from "../microclimate/project/Requester";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";
import ProjectState from "../microclimate/project/ProjectState";

export default async function requestBuildCmd(project: Project): Promise<void> {
    Log.d("RequestBuildCmd invoked");
    if (project == null) {
        const selected = await promptForProject(...ProjectState.getEnabledStates());
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    if (project.state.isBuilding) {
        vscode.window.showWarningMessage(Translator.t(StringNamespaces.CMD_MISC, "projectAlreadyBuilding", { projectName: project.name }));
        return;
    }
    /*
    if (project.autoBuildEnabled) {
        vscode.window.showWarningMessage(Translator.t(StringNamespaces.CMD_MISC, "explicitBuildNotNecessary", { projectName: project.name }));
        // still do the build, though.
    }*/

    Log.i(`Request build for project ${project.name}`);
    Requester.requestBuild(project);
}
