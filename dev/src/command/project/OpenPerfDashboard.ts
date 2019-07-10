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

import Project from "../../microclimate/project/Project";
import { promptForProject } from "../CommandUtil";
import Log from "../../Logger";
import Commands from "../../constants/Commands";
import * as MCUtil from "../../MCUtil";
import EndpointUtil from "../../constants/Endpoints";

export default async function openPerformanceDashboard(project: Project): Promise<void> {
    if (project == null) {
        const selected = await promptForProject();
        if (selected == null) {
            Log.d("User cancelled prompt for resource");
            // user cancelled
            return;
        }
        project = selected;
    }

    const supportsMetrics = project.capabilities.metricsAvailable;
    Log.d(`${project.name} supports perfmonitor ? ${supportsMetrics}`);
    if (!supportsMetrics) {
        vscode.window.showWarningMessage(`${project.name} does not support the performance dashboard.`);
        return;
    }

    try {
        const dashboardUrl = EndpointUtil.getPerformanceDashboard(project);
        Log.d(`Dashboard url for ${project.name} is ${dashboardUrl}`);
        vscode.commands.executeCommand(Commands.VSC_OPEN, dashboardUrl);
    }
    catch (err) {
        vscode.window.showErrorMessage(MCUtil.errToString(err));
    }
}
