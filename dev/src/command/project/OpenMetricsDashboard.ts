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
import Commands from "../../constants/Commands";
import MCUtil from "../../MCUtil";

export default async function openMetricsDashboardCmd(project: Project): Promise<void> {
    try {
        if (!project.state.isStarted) {
            vscode.window.showWarningMessage(`${project.name} is not running. Wait for the project to be Running before accessing the Metrics Dashboard.`);
            return;
        }
        else if (!project.metricsDashboardURL || !(await project.testPingMetricsDash())) {
            vscode.window.showWarningMessage(`${project.name} does not support the Metrics Dashboard.`);
            return;
        }

        Log.d(`Open ${project.name} metrics dashboard at ${project.metricsDashboardURL}`);
        vscode.commands.executeCommand(Commands.VSC_OPEN, project.metricsDashboardURL);
    }
    catch (err) {
        Log.e(`Error opening performance monitor for ${project.name}`, err);
        vscode.window.showErrorMessage(MCUtil.errToString(err));
    }
}
