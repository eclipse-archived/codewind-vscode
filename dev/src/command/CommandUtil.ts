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
import openWorkspaceCmd from "./OpenWorkspaceCmd";
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
import Connection from "../codewind/connection/Connection";
import Project from "../codewind/project/Project";
import ProjectState from "../codewind/project/ProjectState";
import CodewindManager from "../codewind/connection/CodewindManager";
import attachDebuggerCmd from "./project/AttachDebuggerCmd";
import containerShellCmd from "./project/ContainerShellCmd";
import removeProjectCmd from "./project/RemoveProjectCmd";
import addProjectToWorkspaceCmd from "./project/AddToWorkspaceCmd";

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
        registerConnectionCommand(Commands.OPEN_WS_FOLDER, openWorkspaceCmd, undefined),
        registerConnectionCommand(Commands.SET_REGISTRY, setRegistryCmd, undefined),

        registerProjectCommand(Commands.PROJECT_OVERVIEW, projectOverviewCmd, undefined, ProjectState.getAllAppStates()),
        registerProjectCommand(Commands.OPEN_APP, openAppCmd, undefined, ProjectState.getStartedOrStartingStates()),
        registerProjectCommand(Commands.CONTAINER_SHELL, containerShellCmd, undefined, ProjectState.getStartedOrStartingStates()),

        registerProjectCommand(Commands.ADD_PROJECT_TO_WS, addProjectToWorkspaceCmd, undefined, ProjectState.getAllAppStates()),

        registerProjectCommand(Commands.REQUEST_BUILD, requestBuildCmd, undefined, ProjectState.getEnabledStates()),
        registerProjectCommand(Commands.TOGGLE_AUTOBUILD, toggleAutoBuildCmd, undefined, ProjectState.getEnabledStates()),
        // Enable and disable AB are the same as Toggle AB - they are just presented to the user differently.
        registerProjectCommand(Commands.ENABLE_AUTOBUILD, toggleAutoBuildCmd, undefined, ProjectState.getEnabledStates()),
        registerProjectCommand(Commands.DISABLE_AUTOBUILD, toggleAutoBuildCmd, undefined, ProjectState.getEnabledStates()),

        registerProjectCommand(Commands.ATTACH_DEBUGGER, attachDebuggerCmd, undefined, ProjectState.getDebuggableStates()),
        registerProjectCommand<boolean>(Commands.RESTART_RUN, restartProjectCmd, false, ProjectState.getStartedOrStartingStates()),
        registerProjectCommand<boolean>(Commands.RESTART_DEBUG, restartProjectCmd, true, ProjectState.getStartedOrStartingStates()),

        registerProjectCommand(Commands.MANAGE_LOGS, manageLogs, undefined, ProjectState.getEnabledStates()),
        registerProjectCommand(Commands.SHOW_ALL_LOGS, showAllLogs, undefined, ProjectState.getEnabledStates()),
        registerProjectCommand(Commands.HIDE_ALL_LOGS, hideAllLogs, undefined, ProjectState.getEnabledStates()),

        registerProjectCommand(Commands.ENABLE_PROJECT, toggleEnablementCmd, undefined, [ ProjectState.AppStates.DISABLED ]),
        registerProjectCommand(Commands.DISABLE_PROJECT, toggleEnablementCmd, undefined, ProjectState.getEnabledStates()),
        registerProjectCommand(Commands.REMOVE_PROJECT, removeProjectCmd, undefined, ProjectState.getAllAppStates()),

        registerProjectCommand(Commands.OPEN_APP_MONITOR, openAppMonitorCmd, undefined, ProjectState.getStartedOrStartingStates()),
        registerProjectCommand(Commands.OPEN_PERF_DASHBOARD, openPerformanceDashboard, undefined, ProjectState.getStartedOrStartingStates()),
    ];
}

/**
 * Register a command that runs on Project objects.
 *
 * The type argument(s) must be the types of the arguments (other than the first) to be passed to the executor.
 * Note the compiler does not check that these actually match the function signature.
 *
 * @param id - The command ID
 * @param executor - The function that runs the command
 * @param params - Parameters to pass to the executor function
 * @param acceptableStates - If the user runs the command through the command palette,
 *      the list of projects presented to choose from is filtered to projects in these states
 */
function registerProjectCommand<T>(
    id: string, executor: (project: Project, params: T) => void, params: T,
    acceptableStates: ProjectState.AppStates[]): vscode.Disposable {

    return vscode.commands.registerCommand(id, async (project: Project | undefined) => {
        if (!project) {
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
            vscode.window.showErrorMessage(`Error running command ${id}: on project ${project.name} ${MCUtil.errToString(err)}`);
        }
    });
}

/**
 * Register a command that runs on Connection objects.
 *
 * The type argument(s) must be the types of the arguments (other than the first) to be passed to the executor.
 * Note the compiler does not check that these actually match the function signature.
 *
 * @param id - The command ID
 * @param executor - The function that runs the command
 * @param params - Parameters to pass to the executor function
 * @param connectedOnly - If the user runs the command through the command palette,
 *      only currently connected connections will be presented as options
 */
function registerConnectionCommand<T>(
    id: string, executor: (connection: Connection, params: T) => void, params: T,
    connectedOnly: boolean = false): vscode.Disposable {

    return vscode.commands.registerCommand(id, async (connection: Connection | undefined) => {
        if (!connection) {
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
            vscode.window.showErrorMessage(`Error running command ${id}: on connection ${connection.url} ${MCUtil.errToString(err)}`);
        }
    });
}

/**
 * If the user runs a Project command through the Command Palette, have them pick the project to run the cmd on
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

    const choices: vscode.QuickPickItem[] = (await CodewindManager.instance.allProjects)
        .filter((p) => acceptableStates.includes(p.state.appState));

    // If no choices are available, show a popup message
    if (choices.length === 0) {
        showNoValidProjectsMsg(acceptableStates);
        return undefined;
    }

    return /* await */ vscode.window.showQuickPick(choices, {
        canPickMany: false,
        placeHolder: "Select a project to run this command on",
    }) as Promise<Project>;
}

const STRING_NS = StringNamespaces.CMD_RES_PROMPT;

function showNoValidProjectsMsg(acceptableStates: ProjectState.AppStates[]): void {
    const statesSpecified = acceptableStates.length !== 0;
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
/**
 * If the user runs a Connection command through the Command Palette, have them pick the connection to run the cmd on
 * @connectedOnly Only prompt the user with Connected connections
 */
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

    return /* await */ vscode.window.showQuickPick(choices, {
        canPickMany: false,
        placeHolder: "Select a Connection to run this command on",
    }) as Promise<Connection>;
}
