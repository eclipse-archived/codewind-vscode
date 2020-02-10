/*******************************************************************************
 * Copyright (c) 2018, 2020 IBM Corporation and others.
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
import MCUtil from "../../MCUtil";
import Commands from "../../constants/Commands";

export default async function openPerformanceDashboard(project: Project): Promise<void> {
    try {
        if (!project.perfDashboardURL || !(await project.testPingMetricsDash())) {
            vscode.window.showWarningMessage(`${project.name} does not support the Performance Dashboard.`);
            return;
        }
        vscode.commands.executeCommand(Commands.VSC_OPEN, project.perfDashboardURL);
    }
    catch (err) {
        Log.e(`Error opening perf dashboard for ${project.name}`, err);
        vscode.window.showErrorMessage(MCUtil.errToString(err));
    }
}
