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
import Commands from "../../constants/Commands";
import MCUtil from "../../MCUtil";

export default async function openAppMonitorCmd(project: Project): Promise<void> {
    try {
        if (!(project.state.isStarted || project.state.isStarting)) {
            vscode.window.showWarningMessage(`Cannot open application monitor - ${project.name} is not currently running.`);
            return;
        }

        if (!project.hasAppMonitor || project.appMonitorUrl == null) {
            vscode.window.showWarningMessage(getAppMetricsNotSupportedMsg(project.name));
            return;
        }

        Log.d("Open monitor at " + project.appMonitorUrl);
        vscode.commands.executeCommand(Commands.VSC_OPEN, vscode.Uri.parse(project.appMonitorUrl));
    }
    catch (err) {
        vscode.window.showErrorMessage(MCUtil.errToString(err));
    }
}

export function getAppMetricsNotSupportedMsg(projectName: string): string {
    return `${projectName} does not support application metrics or the performance dashboard.`;
}
