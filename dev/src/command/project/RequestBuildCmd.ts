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

import Project from "../../codewind/project/Project";

import Log from "../../Logger";
import Requester from "../../codewind/project/Requester";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";

import { exec } from "child_process";

export default async function requestBuildCmd(project: Project): Promise<void> {
    if (project.state.isBuilding) {
        vscode.window.showWarningMessage(Translator.t(StringNamespaces.CMD_MISC, "projectAlreadyBuilding", { projectName: project.name }));
        return;
    }
    /*
    if (project.autoBuildEnabled) {
        vscode.window.showWarningMessage(Translator.t(StringNamespaces.CMD_MISC, "explicitBuildNotNecessary", { projectName: project.name }));
        // still do the build, though.
    }*/

    if (project.connection.remote) {
        Log.i(`Copying updated files from ${project.localPath} to ${project.connection.host}`);
        await syncChangedFiles(project);
    } else {
        Log.i(`Local build from local file system at ${project.localPath}`);
    }

    Log.i(`Request build for project ${project.name}`);
    Requester.requestBuild(project);
}

async function syncChangedFiles(project: Project) : Promise<void> {
    Log.i(`Request build for project ${project.name} ${project.localPath.fsPath}`);
    await exec(`docker exec -it codewind-pfe sh -c "rm -rf /codewind-workspace/${project.name}/*"`);
    await exec(`docker cp ${project.localPath.fsPath}/ codewind-pfe:/codewind-workspace`);
}

