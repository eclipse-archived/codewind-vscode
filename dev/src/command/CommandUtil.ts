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

import Commands from "../constants/Commands";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";
import Log from "../Logger";
import MCUtil from "../MCUtil";
import openCodewindWorkspaceCmd from "./OpenWorkspaceFolderCmd";
import restartProjectCmd from "./project/RestartProjectCmd";
import openAppCmd from "./project/OpenAppCmd";
import requestBuildCmd from "./project/RequestBuildCmd";
import toggleEnablementCmd from "./project/ToggleEnablementCmd";
import projectOverviewCmd from "./project/ProjectOverviewCmd";
import toggleAutoBuildCmd from "./project/ToggleAutoBuildCmd";
import openAppMonitorCmd from "./project/OpenAppMonitor";
import refreshConnectionCmd from "./connection/RefreshConnectionCmd";
import { manageLogs, showAllLogs, hideAllLogs } from "./project/ManageLogsCmd";
import createProject from "./connection/CreateUserProjectCmd";
import bindProject from "./connection/BindProjectCmd";
import openPerformanceDashboard from "./project/OpenPerfDashboard";
import startCodewindCmd from "./StartCodewindCmd";
import stopCodewindCmd from "./StopCodewindCmd";
import removeImagesCmd from "./RemoveImagesCmd";
import { setRegistryCmd } from "./connection/SetRegistryCmd";
import Connection from "../microclimate/connection/Connection";
import Project from "../microclimate/project/Project";
import ProjectState from "../microclimate/project/ProjectState";
import CodewindManager from "../microclimate/connection/CodewindManager";
import attachDebuggerCmd from "./project/AttachDebuggerCmd";
import containerShellCmd from "./project/ContainerShellCmd";

export function createCommands(): vscode.Disposable[] {

    // Register our commands here
    // The first parameter must match the command ID as declared in package.json
    // the second parameter is the callback function, which is passed the user's selection, which is either:
    // - undefined (if run from command palette)
    // - or the user's selected TreeView object (if run from the context menu) -> IE either a Project or Connection
    return [
        // vscode.commands.registerCommand(Commands.ACTIVATE_CONNECTION, () => activateConnectionCmd()),
        // vscode.commands.registerCommand(Commands.DEACTIVATE_CONNECTION, (selection) => deactivateConnectionCmd(selection)),
        vscode.commands.registerCommand(Commands.START_CODEWIND,      startCodewindCmd),
        vscode.commands.registerCommand(Commands.START_CODEWIND_2,    startCodewindCmd),
        vscode.commands.registerCommand(Commands.STOP_CODEWIND,       stopCodewindCmd),
        vscode.commands.registerCommand(Commands.STOP_CODEWIND_2,     stopCodewindCmd),

        vscode.commands.registerCommand(Commands.REMOVE_IMAGES,       removeImagesCmd),

        registerConnectionCommand(Commands.CREATE_PROJECT, createProject, undefined),
        registerConnectionCommand(Commands.BIND_PROJECT, bindProject, undefined),

        registerConnectionCommand(Commands.REFRESH_CONNECTION, refreshConnectionCmd, undefined),
        registerConnectionCommand(Commands.OPEN_WS_FOLDER, openCodewindWorkspaceCmd, undefined),
        registerConnectionCommand(Commands.SET_REGISTRY, setRegistryCmd, undefined),

        registerProjectCommand(Commands.PROJECT_OVERVIEW, projectOverviewCmd, undefined),
        registerProjectCommand(Commands.OPEN_APP, openAppCmd, ProjectState.getStartedOrStartingStates()),
        registerProjectCommand(Commands.CONTAINER_SHELL, containerShellCmd, ProjectState.getStartedOrStartingStates()),

        registerProjectCommand(Commands.REQUEST_BUILD, requestBuildCmd, undefined),
        registerProjectCommand(Commands.TOGGLE_AUTOBUILD, toggleAutoBuildCmd, undefined),
        // Enable and disable AB are the same as Toggle AB - they are just presented to the user differently.
        registerProjectCommand(Commands.ENABLE_AUTOBUILD, toggleAutoBuildCmd, undefined),
        registerProjectCommand(Commands.DISABLE_AUTOBUILD, toggleAutoBuildCmd, undefined),

        registerProjectCommand(Commands.ATTACH_DEBUGGER, attachDebuggerCmd, undefined, ProjectState.getDebuggableStates()),
        registerProjectCommand<boolean>(Commands.RESTART_RUN, restartProjectCmd, false, ProjectState.getStartedOrStartingStates()),
        registerProjectCommand<boolean>(Commands.RESTART_DEBUG, requestBuildCmd, true, ProjectState.getStartedOrStartingStates()),

        registerProjectCommand(Commands.MANAGE_LOGS, manageLogs, undefined),
        registerProjectCommand(Commands.SHOW_ALL_LOGS, showAllLogs, undefined),
        registerProjectCommand(Commands.HIDE_ALL_LOGS, hideAllLogs, undefined),

        registerProjectCommand<boolean>(Commands.ENABLE_PROJECT, toggleEnablementCmd, true, [ ProjectState.AppStates.DISABLED ]),
        registerProjectCommand<boolean>(Commands.DISABLE_PROJECT, toggleEnablementCmd, false, ProjectState.getEnabledStates()),

        registerProjectCommand(Commands.OPEN_APP_MONITOR, openAppMonitorCmd, undefined, ProjectState.getStartedOrStartingStates()),
        registerProjectCommand(Commands.OPEN_PERF_DASHBOARD, openPerformanceDashboard, undefined, ProjectState.getStartedOrStartingStates()),
    ];
}

function registerProjectCommand<T>(
    id: string, executor: (project: Project, params: T) => void, params: T,
    acceptableStates: ProjectState.AppStates[] = ProjectState.getEnabledStates()): vscode.Disposable {

    return vscode.commands.registerCommand(id, async (project: Project | undefined) => {
        if (project == null) {
            project = await promptForProject(acceptableStates);
            if (!project) {
                return;
            }
        }
        try {
            executor(project, params);
        }
        catch (err) {
            Log.e(`Unexpected error running command ${id}`, err);
            vscode.window.showErrorMessage(`Unexpected error running command ${id}: on project ${project.name} ${MCUtil.errToString(err)}`);
        }
    });
}

function registerConnectionCommand<T>(
    id: string, executor: (connection: Connection, params: T) => void, params: T,
    connectedOnly: boolean = false): vscode.Disposable {

    return vscode.commands.registerCommand(id, async (connection: Connection | undefined) => {
        if (connection == null) {
            connection = await promptForConnection(connectedOnly);
            if (!connection) {
                return;
            }
        }
        try {
            executor(connection, params);
        }
        catch (err) {
            Log.e(`Unexpected error running command ${id}`, err);
            vscode.window.showErrorMessage(`Unexpected error running command ${id}: on connection ${connection.url} ${MCUtil.errToString(err)}`);
        }
    });
}

/**
 *
 * @param acceptableStates - If at least one state is passed, only projects in one of these states will be presented to the user.
 */
async function promptForProject(acceptableStates: ProjectState.AppStates[]): Promise<Project | undefined> {
    // for now, assume if they want Started, they also accept Debugging. This may change.
    if (acceptableStates.includes(ProjectState.AppStates.STARTED) && !acceptableStates.includes(ProjectState.AppStates.DEBUGGING)) {
        acceptableStates.push(ProjectState.AppStates.DEBUGGING);
    }
    // same for Starting / Starting - Debug
    if (acceptableStates.includes(ProjectState.AppStates.STARTING) && !acceptableStates.includes(ProjectState.AppStates.DEBUG_STARTING)) {
        acceptableStates.push(ProjectState.AppStates.DEBUG_STARTING);
    }

    // Logger.log("Accept states", acceptableStates);


    const choices: vscode.QuickPickItem[] = (await CodewindManager.instance.allProjects)
        .filter((p) => acceptableStates.includes(p.state.appState));

    // If no choices are available, show a popup message
    if (choices.length === 0) {
        showNoValidProjectsMsg(acceptableStates);
        return undefined;
    }

    return /* await */ vscode.window.showQuickPick(choices, { canPickMany: false }) as Promise<Project>;
}

const STRING_NS = StringNamespaces.CMD_RES_PROMPT;

function showNoValidProjectsMsg(acceptableStates: ProjectState.AppStates[]): void {
    const statesSpecified: boolean = acceptableStates.length !== 0;
    let noValidResourcesMsg: string;
    let requiredStatesStr: string = "";
    if (statesSpecified) {
        // this builds something like "Starting - Debug or Debugging", to represent the project states this command can run on.
        const sep = Translator.t(StringNamespaces.DEFAULT, "statesSeparator");
        requiredStatesStr += acceptableStates.map((state) => state.toString()).join(sep);
        noValidResourcesMsg = Translator.t(STRING_NS, "noProjToRunOnWithStates", { states: requiredStatesStr });
    }
    else {
        noValidResourcesMsg = Translator.t(STRING_NS, "noProjToRunOn");
    }
    vscode.window.showWarningMessage(noValidResourcesMsg);
}

async function promptForConnection(connectedOnly: boolean): Promise<Connection | undefined> {
    if (CodewindManager.instance.connections.length === 1) {
        const onlyConnection = CodewindManager.instance.connections[0];
        if (onlyConnection.isConnected || !connectedOnly) {
            return onlyConnection;
        }
    }

    const choices = [];
    const connections = CodewindManager.instance.connections;
    if (connectedOnly) {
        choices.push(...(connections.filter((conn) => conn.isConnected)));
    }
    else {
        choices.push(...connections);
    }

    if (choices.length === 0) {
        vscode.window.showWarningMessage(Translator.t(STRING_NS, "noConnToRunOn"));
        return undefined;
    }

    return /* await */ vscode.window.showQuickPick(choices, { canPickMany: false }) as Promise<Connection>;
}
