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
import ProjectType from "../../codewind/project/ProjectType";
import Requester from "../../codewind/project/Requester";
import CodewindEventListener from "../../codewind/connection/CodewindEventListener";

export default async function openAppMonitorCmd(project: Project): Promise<void> {
    try {
        if (project.appUrl == null) {
            vscode.window.showWarningMessage(`Cannot open application monitor - ${project.name} is not currently running.`);
            return;
        }

        if (project.appMonitorUrl == null || !(await testPingAppMonitor(project))) {
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

/**
 * Extra test for extension projects - workaround for https://github.com/eclipse/codewind/issues/258
 */
export async function testPingAppMonitor(project: Project): Promise<boolean> {
    if (project.type.type !== ProjectType.Types.EXTENSION) {
        // this test is not necessary for non-extension projects
        return true;
    }
    // this was checked above; just to satisfy the compiler
    if (project.appMonitorUrl == null) {
        return false;
    }

    Log.i(`Testing extension project's app monitor before opening`);
    try {
        await Requester.get(project.appMonitorUrl);
        return true;
    }
    catch (err) {
        // cache this so we don't have to do this test every time.
        project.capabilities.metricsAvailable = false;
        // Notify the treeview that this project has changed so it can hide these context actions
        CodewindEventListener.onChange(project);
        return false;
    }
}
