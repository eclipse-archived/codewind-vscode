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

import Log from "../Logger";
import Project from "../microclimate/project/Project";
import Connection from "../microclimate/connection/Connection";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import ProjectState from "../microclimate/project/ProjectState";

import Commands from "../constants/Commands";

import activateConnectionCmd from "./ActivateConnectionCmd";
import openWorkspaceFolderCmd from "./OpenWorkspaceFolderCmd";
import restartProjectCmd from "./RestartProjectCmd";
import openInBrowserCmd from "./OpenInBrowserCmd";
import requestBuildCmd from "./RequestBuildCmd";
import toggleEnablementCmd from "./ToggleEnablementCmd";
import deactivateConnectionCmd from "./DeactivateConnectionCmd";
import containerBashCmd from "./ContainerShellCmd";
import projectOverviewCmd from "./ProjectOverviewCmd";
import attachDebuggerCmd from "./AttachDebuggerCmd";
import toggleAutoBuildCmd from "./ToggleAutoBuildCmd";
import openAppMonitorCmd from "./OpenAppMonitor";
import refreshConnectionCmd from "./RefreshConnectionCmd";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";
import { manageLogs, showAllLogs, hideAllLogs } from "./ManageLogsCmd";
import createProject from "./CreateUserProjectCmd";
import bindProject from "./BindProjectCmd";
import openPerformanceDashboard from "./OpenPerfDashboard";

export function createCommands(): vscode.Disposable[] {

    // Register our commands here
    // The first parameter must match the command ID as declared in package.json
    // the second parameter is the callback function, which is passed the user's selection, which is either:
    // - undefined (if run from command palette)
    // - or the user's selected TreeView object (if run from the context menu) -> IE either a Project or Connection
    return [
        vscode.commands.registerCommand(Commands.ACTIVATE_CONNECTION, () => activateConnectionCmd()),
        vscode.commands.registerCommand(Commands.DEACTIVATE_CONNECTION, (selection) => deactivateConnectionCmd(selection)),
        vscode.commands.registerCommand(Commands.REFRESH_CONNECTION,    (selection) => refreshConnectionCmd(selection)),

        vscode.commands.registerCommand(Commands.CREATE_PROJECT,    (selection) => createProject(selection)),
        vscode.commands.registerCommand(Commands.BIND_PROJECT,      (selection) => bindProject(selection)),

        vscode.commands.registerCommand(Commands.OPEN_WS_FOLDER,    (selection) => openWorkspaceFolderCmd(selection)),

        vscode.commands.registerCommand(Commands.ATTACH_DEBUGGER,   (selection) => attachDebuggerCmd(selection)),
        vscode.commands.registerCommand(Commands.RESTART_RUN,       (selection) => restartProjectCmd(selection, false)),
        vscode.commands.registerCommand(Commands.RESTART_DEBUG,     (selection) => restartProjectCmd(selection, true)),

        vscode.commands.registerCommand(Commands.OPEN_IN_BROWSER,   (selection) => openInBrowserCmd(selection)),

        vscode.commands.registerCommand(Commands.REQUEST_BUILD,     (selection) => requestBuildCmd(selection)),
        vscode.commands.registerCommand(Commands.TOGGLE_AUTOBUILD,  (selection) => toggleAutoBuildCmd(selection)),
        // Enable and disable AB are the same as Toggle AB - they are just presented to the user differently.
        vscode.commands.registerCommand(Commands.ENABLE_AUTOBUILD,  (selection) => toggleAutoBuildCmd(selection)),
        vscode.commands.registerCommand(Commands.DISABLE_AUTOBUILD, (selection) => toggleAutoBuildCmd(selection)),

        vscode.commands.registerCommand(Commands.MANAGE_LOGS,       (selection) => manageLogs(selection)),
        vscode.commands.registerCommand(Commands.SHOW_ALL_LOGS,     (selection) => showAllLogs(selection)),
        vscode.commands.registerCommand(Commands.HIDE_ALL_LOGS,     (selection) => hideAllLogs(selection)),

        vscode.commands.registerCommand(Commands.DISABLE_PROJECT,   (selection) => toggleEnablementCmd(selection, false)),
        vscode.commands.registerCommand(Commands.ENABLE_PROJECT,    (selection) => toggleEnablementCmd(selection, true)),

        vscode.commands.registerCommand(Commands.CONTAINER_SHELL,   (selection) => containerBashCmd(selection)),

        vscode.commands.registerCommand(Commands.PROJECT_OVERVIEW,  (selection) => projectOverviewCmd(selection)),

        vscode.commands.registerCommand(Commands.OPEN_APP_MONITOR,      (selection) => openAppMonitorCmd(selection)),
        vscode.commands.registerCommand(Commands.OPEN_PERF_DASHBOARD,   (selection) => openPerformanceDashboard(selection)),
    ];
}

// Some commands require a project or connection to be selected,
// if they're launched from the command palette we have to ask which resource they want to run the command on.
// The functions below handle this use case.

/**
 *
 * @param acceptableStates - If at least one state is passed, only projects in one of these states will be presented to the user.
 */
export async function promptForProject(...acceptableStates: ProjectState.AppStates[]): Promise<Project | undefined> {
    const project = await promptForResourceInner(false, true, false, ...acceptableStates);
    if (project instanceof Project) {
        return project as Project;
    }
    else if (project != null) {
        // should never happen
        Log.e("promptForProject received something other than a project back:", project);
    }

    // user cancelled, or error above
    return undefined;
}

export async function promptForConnection(activeOnly: boolean): Promise<Connection | undefined> {
    if (ConnectionManager.instance.connections.length === 1) {
        const onlyConnection = ConnectionManager.instance.connections[0];
        if (onlyConnection.isConnected || !activeOnly) {
            return onlyConnection;
        }
        // else continue to promptForResource, which will report if there are no suitable connections.
    }

    const connection = await promptForResourceInner(true, false, activeOnly);
    if (connection instanceof Connection) {
        return connection as Connection;
    }
    else if (connection != null) {
        // should never happen
        Log.e("promptForConnection received something other than a connection back:", connection);
    }

    // user cancelled, or error above
    return undefined;
}

export async function promptForResource(activeConnectionsOnly: boolean, ...acceptableStates: ProjectState.AppStates[]):
                                        Promise<Project | Connection | undefined> {

    return promptForResourceInner(true, true, activeConnectionsOnly, ...acceptableStates);
}

/**
 * If !includeConnections, activeConnectionsOnly is ignored.
 * If !includeProjects, acceptableStates is ignored.
 */
async function promptForResourceInner(includeConnections: boolean, includeProjects: boolean, activeConnectionsOnly: boolean,
                                      ...acceptableStates: ProjectState.AppStates[]):
                                      Promise<Project | Connection | undefined> {

    if (!includeConnections && !includeProjects) {
        // One of these must always be set
        Log.e("Neither connection or projects are to be included!");
        return undefined;
    }
    else if (!includeProjects && acceptableStates.length > 0) {
        // This doesn't actually matter, but we're going to log this misuse anyway
        Log.e("Not including projects, but acceptable states were specified!");
        acceptableStates = [];
    }
    else if (!includeConnections && activeConnectionsOnly) {
        // This doesn't actually matter, but we're going to log this misuse anyway
        Log.e("Not including connections, but activeConnectionsOnly is set!");
    }

    const choices: vscode.QuickPickItem[] = [];

    const connections = ConnectionManager.instance.connections;
    if (includeConnections) {
        if (activeConnectionsOnly) {
            choices.push(...(connections.filter( (conn) => conn.isConnected)));
        }
        else {
            choices.push(...connections);
        }
    }

    if (includeProjects) {
        // for now, assume if they want Started, they also accept Debugging. This may change.
        if (acceptableStates.includes(ProjectState.AppStates.STARTED) && !acceptableStates.includes(ProjectState.AppStates.DEBUGGING)) {
            acceptableStates.push(ProjectState.AppStates.DEBUGGING);
        }
        // same for Starting / Starting - Debug
        if (acceptableStates.includes(ProjectState.AppStates.STARTING) && !acceptableStates.includes(ProjectState.AppStates.DEBUG_STARTING)) {
            acceptableStates.push(ProjectState.AppStates.DEBUG_STARTING);
        }

        // Logger.log("Accept states", acceptableStates);

        // For each connection, get its project list, and filter by projects we're interested in.
        // then add the remaining projects to our QuickPick choices.
        for (const conn of connections) {
            let projects = conn.projects;

            if (acceptableStates.length > 0) {
                // Filter out projects that are not in one of the acceptable states
                projects = projects.filter( (p) => acceptableStates.includes(p.state.appState));
            }
            choices.push(...projects);
        }
    }

    // If no choices are available, show a popup message
    if (choices.length === 0) {
        showNoValidResourcesMsg(includeProjects, includeConnections, acceptableStates);
        return undefined;
    }

    const selection = await vscode.window.showQuickPick(choices, { canPickMany: false, /*ignoreFocusOut: choices.length !== 0*/ });
    if (selection == null) {
        // user cancelled
        return undefined;
    }
    else if (selection instanceof Project) {
        return selection as Project;
    }
    else if (selection instanceof Connection) {
        return selection as Connection;
    }
    else {
        Log.e(`Unsupported type in promptForResource ${typeof(selection)}`);
        return undefined;
    }
}

const STRING_NS = StringNamespaces.CMD_RES_PROMPT;

/**
 * Show a message stating that the command to be run can't be run on the current state of the workspace.
 * The message will be something like:
 * "There is no connection, or Starting - Debug or Debugging project, to run this command on."
 */
function showNoValidResourcesMsg(includeProjects: boolean, includeConnections: boolean, acceptableStates: ProjectState.AppStates[]): void {
    let requiredStatesStr: string = "";     // non-nls

    const statesSpecified: boolean = acceptableStates.length !== 0;
    if (statesSpecified) {
        // this builds something like "Starting - Debug or Debugging", to represent the project states this command can run on.
        const sep = Translator.t(StringNamespaces.DEFAULT, "statesSeparator");
        requiredStatesStr += acceptableStates.map( (state) => state.toString()).join(sep);
    }

    // In the case that the user runs a command but there is nothing valid to run that command on, we have to show a message.
    // There are several slightly different messages depending on the resource types the command accepts.
    let noValidResourcesMsg: string;
    if (includeProjects) {
        if (includeConnections) {
            if (statesSpecified) {
                noValidResourcesMsg = Translator.t(STRING_NS, "noConnOrProjToRunOnWithStates", { states: requiredStatesStr });
            }
            else {
                noValidResourcesMsg = Translator.t(STRING_NS, "noConnOrProjToRunOn");
            }
        }
        else if (statesSpecified) {
            noValidResourcesMsg = Translator.t(STRING_NS, "noProjToRunOnWithStates", { states: requiredStatesStr });
        }
        else {
            noValidResourcesMsg = Translator.t(STRING_NS, "noProjToRunOn");
        }
    }
    else if (includeConnections) {
        noValidResourcesMsg = Translator.t(STRING_NS, "noConnToRunOn");
    }
    else {
        // this will never happen, it's checked for at the top of promptForResourceInner
        Log.e("Neither connection or projects are to be included!");
        return;
    }
    vscode.window.showWarningMessage(noValidResourcesMsg);
}
