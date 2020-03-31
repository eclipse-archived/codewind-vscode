/*******************************************************************************
 * Copyright (c) 2019, 2020 IBM Corporation and others.
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
import MCLog from "../../codewind/project/logs/MCLog";

// const STRING_NS = StringNamespaces.LOGS;

export async function showAllLogs(project: Project): Promise<void> {
    return manageLogsInner(project, "show");
}

export async function hideAllLogs(project: Project): Promise<void> {
    return manageLogsInner(project, "hide");
}

export async function manageLogs(project: Project): Promise<void> {
    return manageLogsInner(project);
}

async function manageLogsInner(project: Project, all?: "show" | "hide"): Promise<void> {
    // Wait for the logmanager to initialize, just in case it hasn't finished yet
    await project.logManager.initPromise;

    const logs = project.logManager.logs;

    if (all === "hide") {
        await project.logManager.hideAll();
        return;
    }

    if (logs.length === 0) {
        vscode.window.showWarningMessage(`${project.name} does not have any logs available at this time. ` +
           `Wait for the project to build, and try again.`);
        return;
    }

    if (all === "show") {
        await project.logManager.showAll();
        return;
    }

    const options: vscode.QuickPickOptions = {
        canPickMany: true,
        placeHolder: "Select the logs you wish to see in the Output view."
    };

    // https://github.com/Microsoft/vscode/issues/64014
    const logsToShow = await vscode.window.showQuickPick<MCLog>(logs, options) as (MCLog[] | undefined);
    if (logsToShow == null) {
        return;
    }
    await project.logManager.showSome(logsToShow);
}
