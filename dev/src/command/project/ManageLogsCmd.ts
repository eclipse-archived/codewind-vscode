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
import Log from "../../Logger";
import MCUtil from "../../MCUtil";
import CWExtensionContext from "../../CWExtensionContext";

// const STRING_NS = StringNamespaces.LOGS;

/**
 *
 * @param manageAll - Set this to show or hide all logs. Leave unset to prompt the user with the list of logs and let them manage logs from there.
 */
export async function manageLogs(project: Project, manageAll?: "show" | "show-from-creation"| "hide"): Promise<void> {
    try {
        await manageLogsInner(project, manageAll);
    }
    catch (err) {
        let action;
        if (manageAll == null) {
            action = "managing";
        }
        else if (manageAll === "hide") {
            action = "hiding"
        }
        else {
            action = "showing";
        }

        const errMsg = `Error ${action} logs for ${project.name}`;
        Log.e(errMsg, err);
        vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
    }
}

async function manageLogsInner(project: Project, all?: "show" | "show-from-creation"| "hide"): Promise<void> {
    // Wait for the logmanager to initialize, just in case it hasn't finished yet
    await project.logManager.initPromise;

    const logs = project.logManager.logs;

    if (all === "hide") {
        await project.logManager.hideAll();
        return;
    }

    if (all === "show" || all === "show-from-creation") {
        if (all === "show" && logs.length === 0) {
            vscode.window.showInformationMessage(`${project.name} does not have any logs available at this time. ` +
                `Logs will be shown as they become available`);
        }
        const showAllType = all === "show" ? "background" : "foreground";
        await project.logManager.showAll(showAllType);
        return;
    }

    if (logs.length === 0) {
        vscode.window.showWarningMessage(`${project.name} does not have any logs available at this time. ` +
            `Wait for the project to build, and try again.`);
        return;
    }

    // https://github.com/eclipse-theia/theia/issues/5673
    // In theia, the strings are a little different because we can only manage one log at a time due to no canPickMany support.
    // Note that the MCLog's 'detail' field is only set in Theia.
    const isTheiaManageLogs = CWExtensionContext.get().isTheia;

    const placeHolder = isTheiaManageLogs ?
        `Select a log to show or hide in the Output view` :
        `Select the logs you wish to see in the Output view`;

    const logsSelected = await vscode.window.showQuickPick<MCLog>(logs, {
        canPickMany: true,
        matchOnDescription: true,
        placeHolder,
    });

    if (logsSelected == null) {
        // cancelled
        return;
    }

    let logsToShow;
    if (!isTheiaManageLogs) {
        logsToShow = logsSelected;
    }
    else {
        logsToShow = logs.filter((log) => {
            if (logsSelected.includes(log)) {
                // inside theia, we just toggle the one log that was selected
                Log.d(`Log ${log.logName} is the selected one; toggling`);
                return !log.isOpen;
            }
            // maintain the state for all the logs that are not the selected one
            Log.d(`Log ${log.logName} is not selected; maintaining state`);
            return log.isOpen;
        });
    }

    await project.logManager.showSome(logsToShow, true);
}
