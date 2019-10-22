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

// import * as vscode from "vscode";

import Project from "../../codewind/project/Project";

import Log from "../../Logger";
import Requester from "../../codewind/project/Requester";

export default async function requestBuildCmd(project: Project): Promise<void> {
    Log.i(`Request build for project ${project.name}`);
    await project.sync();
    await Requester.requestBuild(project);
}
