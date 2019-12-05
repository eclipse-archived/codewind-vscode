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

import Project from "../../codewind/project/Project";
import Requester from "../../codewind/project/Requester";

export default async function toggleInjectMetricsCmd(project: Project): Promise<void> {
    if (!project.type.canInjectMetrics) {
        vscode.window.showWarningMessage(`This project type does not support Appmetrics injection.`);
        return;
    }
    return Requester.requestToggleInjectMetrics(project);
}
