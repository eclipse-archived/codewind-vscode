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

// import Translator from "../constants/strings/translator";
// import StringNamespaces from "../constants/strings/StringNamespaces";
import Log from "../Logger";
import Project from "../microclimate/project/Project";
import ProjectState from "../microclimate/project/ProjectState";
import { promptForProject } from "./CommandUtil";
import MCLog from "../microclimate/project/logs/MCLog";

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
    if (project == null) {
        const selected = await promptForProject(...ProjectState.getEnabledStates());
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    // Wait for the logmanager to initialize, just in case it hasn't finished yet
    await project.logManager.initPromise;
    const logs = project.logManager.logs;

    if (logs.length === 0) {
        vscode.window.showWarningMessage("This project does not have any logs available at this time.");
        return;
    }

    if (all === "show") {
        Log.d("Showing all logs for " + project.name);
        project.logManager.logs.forEach((log) => log.showOutput());
        await project.logManager.toggleLogStreaming(true);
        return;
    }
    else if (all === "hide") {
        Log.d("Hiding all logs for " + project.name);
        project.logManager.logs.forEach((log) => log.removeOutput());
        await project.logManager.toggleLogStreaming(false);
        return;
    }

    const options: vscode.QuickPickOptions = {
        canPickMany: true,
        placeHolder: "Select the logs you wish to see in the Output view"
    };

    // https://github.com/Microsoft/vscode/issues/64014
    const logsToShow: MCLog[] | undefined = await vscode.window.showQuickPick<MCLog>(logs, options) as (MCLog[] | undefined);
    if (logsToShow != null) {
        // Log.d("selection", selection);

        logs.forEach((log) => {
            if (logsToShow.includes(log)) {
                log.showOutput();
            }
            else {
                log.removeOutput();
            }
        });

        // stop the stream if 0 logs are to be shown,
        // or restart the stream if at least one is to be shown (in case one of the ones to be shown is a new one)
        await project.logManager.toggleLogStreaming(logsToShow.length !== 0);
    }
}
