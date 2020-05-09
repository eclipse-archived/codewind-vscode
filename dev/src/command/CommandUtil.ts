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

import Commands from "../constants/Commands";
import Translator from "../constants/strings/Translator";
import StringNamespaces from "../constants/strings/StringNamespaces";
import Log from "../Logger";
import MCUtil from "../MCUtil";
import restartProjectCmd from "./project/RestartProjectCmd";
import openAppCmd from "./project/OpenAppCmd";
import requestBuildCmd from "./project/RequestBuildCmd";
import toggleEnablementCmd from "./project/ToggleEnablementCmd";
import projectOverviewCmd from "./project/ProjectOverviewCmd";
import toggleAutoBuildCmd from "./project/ToggleAutoBuildCmd";
import openMetricsDashboardCmd from "./project/OpenMetricsDashboard";
import { refreshConnectionCmd, refreshLocalCWCmd } from "./connection/RefreshConnectionCmd";
import { manageLogs, showAllLogs, hideAllLogs } from "./project/ManageLogsCmd";
import createProjectCmd from "./connection/CreateUserProjectCmd";
import bindProjectCmd from "./connection/BindProjectCmd";
import openPerformanceDashboard from "./project/OpenPerfDashboard";
import connectLocalCodewindCmd from "./StartCodewindCmd";
import stopLocalCodewindCmd from "./StopCodewindCmd";
import removeImagesCmd from "./RemoveImagesCmd";
import Connection from "../codewind/connection/Connection";
import Project from "../codewind/project/Project";
import ProjectState from "../codewind/project/ProjectState";
import attachDebuggerCmd from "./project/AttachDebuggerCmd";
import containerShellCmd from "./project/ContainerShellCmd";
import removeProjectCmd from "./project/RemoveProjectCmd";
import addProjectToWorkspaceCmd from "./project/AddToWorkspaceCmd";
import manageSourcesCmd from "./connection/ManageSourcesCmd";
import { openTektonDashboard } from "./connection/OpenTektonCmd";
import ConnectionManager from "../codewind/connection/ConnectionManager";
import LocalCodewindManager from "../codewind/connection/local/LocalCodewindManager";
import connectionOverviewCmd from "./connection/ConnectionOverviewCmd";
import removeConnectionCmd from "./connection/RemoveConnectionCmd";
import toggleConnectionEnablementCmd from "./connection/ToggleConnectionEnablement";
import manageRegistriesCmd from "./connection/ManageRegistriesCmd";
import toggleInjectMetricsCmd from "./project/ToggleInjectMetricsCmd";
import changeProjectConnectionCmd from "./project/ChangeProjectConnectionCmd";
import { setLogLevelCmd } from "./connection/SetLogLevelCmd";
import showHomePageCmd from "./HomePageCmd";
import newRemoteConnectionCmd from "./connection/NewConnectionCmd";
import CWExtensionContext from "../CWExtensionContext";

export function createCommands(): vscode.Disposable[] {

    // Register our commands here
    // The first parameter must match the command ID as declared in package.json
    // the second parameter is the callback function, which is passed the user's selection, which is either:
    // - undefined (if run from command palette)
    // - or the user's selected TreeView object (if run from the context menu) -> Either LocalCodewindManager, Connection, or Project
    return [
        vscode.commands.registerCommand(Commands.HOMEPAGE,          showHomePageCmd),
        vscode.commands.registerCommand(Commands.NEW_CONNECTION,    newRemoteConnectionCmd),

        vscode.commands.registerCommand(Commands.START_LOCAL_CODEWIND,  connectLocalCodewindCmd),
        vscode.commands.registerCommand(Commands.STOP_LOCAL_CODEWIND,   stopLocalCodewindCmd),
        vscode.commands.registerCommand(Commands.REMOVE_LOCAL_IMAGES,   removeImagesCmd),

        // the separator is just for display purposes and has no command bound to it
        vscode.commands.registerCommand(Commands.SEPARATOR, () => { /**/ }),

        // For connection commands, make sure the connected-ness requirement matches the context enablement regex used in package.json
        registerConnectionCommand(Commands.REMOVE_CONNECTION, removeConnectionCmd, [], false, true),
        registerConnectionCommand(Commands.ENABLE_CONNECTION, toggleConnectionEnablementCmd, [ true ], false, true),
        registerConnectionCommand(Commands.DISABLE_CONNECTION, toggleConnectionEnablementCmd, [ false ], false, true),
        // registerConnectionCommand(Commands.REFRESH_CONNECTION, refreshConnectionCmd, [], false, false),

        // the refresh command is unique because it's valid for the stopped local connection, as well as regular, connected connections.
        vscode.commands.registerCommand(Commands.REFRESH_CONNECTION, async (selection: LocalCodewindManager | Connection | undefined) => {
            if (selection instanceof LocalCodewindManager) {
                return refreshLocalCWCmd();
            }
            else if (selection == null) {
                selection = await promptForConnection(true, false);
                if (selection == null) {
                    return;
                }
            }
            return refreshConnectionCmd(selection);
        }),

        registerConnectionCommand(Commands.CREATE_PROJECT, createProjectCmd, [], true, false),
        registerConnectionCommand(Commands.BIND_PROJECT, bindProjectCmd, [], true, false),

        registerConnectionCommand(Commands.CONNECTION_OVERVIEW, connectionOverviewCmd, [], false, true),
        registerConnectionCommand(Commands.MANAGE_TEMPLATE_SOURCES, manageSourcesCmd, [], true, false),
        registerConnectionCommand(Commands.MANAGE_REGISTRIES, manageRegistriesCmd, [], true, false),
        registerConnectionCommand(Commands.OPEN_TEKTON, openTektonDashboard, [], true, false),
        registerConnectionCommand(Commands.SET_LOG_LEVEL, setLogLevelCmd, [], true, false),

        registerProjectCommand(Commands.PROJECT_OVERVIEW, projectOverviewCmd, []),
        registerProjectCommand(Commands.OPEN_APP, openAppCmd, [], ProjectState.getAppStateSet("started-starting")),
        registerProjectCommand(Commands.CONTAINER_SHELL, containerShellCmd, [], ProjectState.getAppStateSet("started-starting")),

        registerProjectCommand(Commands.ADD_PROJECT_TO_WS, addProjectToWorkspaceCmd, []),

        registerProjectCommand(Commands.REQUEST_BUILD, requestBuildCmd, [], ProjectState.getAppStateSet("enabled")),
        registerProjectCommand(Commands.TOGGLE_AUTOBUILD, toggleAutoBuildCmd, [], ProjectState.getAppStateSet("enabled")),
        // Enable and disable AB are the same as Toggle AB - they are just presented to the user differently.
        registerProjectCommand(Commands.ENABLE_AUTOBUILD, toggleAutoBuildCmd, [], ProjectState.getAppStateSet("enabled")),
        registerProjectCommand(Commands.DISABLE_AUTOBUILD, toggleAutoBuildCmd, [], ProjectState.getAppStateSet("enabled")),

        registerProjectCommand(Commands.ATTACH_DEBUGGER, attachDebuggerCmd, [], ProjectState.getAppStateSet("debuggable")),
        registerProjectCommand(Commands.RESTART_RUN, restartProjectCmd, [ false ], ProjectState.getAppStateSet("started-starting")),
        registerProjectCommand(Commands.RESTART_DEBUG, restartProjectCmd, [ true ], ProjectState.getAppStateSet("started-starting")),

        registerProjectCommand(Commands.MANAGE_LOGS, manageLogs, [], ProjectState.getAppStateSet("enabled")),
        registerProjectCommand(Commands.SHOW_ALL_LOGS, showAllLogs, [], ProjectState.getAppStateSet("enabled")),
        registerProjectCommand(Commands.HIDE_ALL_LOGS, hideAllLogs, [], ProjectState.getAppStateSet("enabled")),

        registerProjectCommand(Commands.ENABLE_PROJECT, toggleEnablementCmd, [], ProjectState.getAppStateSet("disabled")),
        registerProjectCommand(Commands.DISABLE_PROJECT, toggleEnablementCmd, [], ProjectState.getAppStateSet("enabled")),
        registerProjectCommand(Commands.REMOVE_PROJECT, removeProjectCmd, []),
        registerProjectCommand(Commands.CHANGE_PROJECT_CONNECTION, changeProjectConnectionCmd, []),

        registerProjectCommand(Commands.OPEN_APP_MONITOR, openMetricsDashboardCmd, [], ProjectState.getAppStateSet("started-starting")),
        registerProjectCommand(Commands.OPEN_PERF_DASHBOARD, openPerformanceDashboard, [], ProjectState.getAppStateSet("started-starting")),

        registerProjectCommand(Commands.TOGGLE_INJECT_METRICS, toggleInjectMetricsCmd, [], ProjectState.getAppStateSet("enabled")),
        // Enable and disable "Inject Metrics" are the same as Toggle "Inject Metrics" - they are just presented to the user differently.
        registerProjectCommand(Commands.ENABLE_INJECT_METRICS, toggleInjectMetricsCmd, [], ProjectState.getAppStateSet("enabled")),
        registerProjectCommand(Commands.DISABLE_INJECT_METRICS, toggleInjectMetricsCmd, [], ProjectState.getAppStateSet("enabled")),
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
function registerProjectCommand<P extends any[] = [ void ]>(
    id: string, executor: (project: Project, ...params: P) => Promise<unknown>, params: P,
    acceptableStates?: ProjectState.AppStateSet): vscode.Disposable {

    return vscode.commands.registerCommand(id, async (selection: Project | undefined) => {
        if (!selection) {
            selection = await promptForProject(acceptableStates);
            if (!selection) {
                return;
            }
        }

        try {
            await executor(selection, ...params);
        }
        catch (err) {
            Log.e(`Unexpected error running command ${id}`, err);
            vscode.window.showErrorMessage(`Error running command ${id} on project ${selection.name} ${MCUtil.errToString(err)}`);
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
function registerConnectionCommand<P extends any[] = [ void ]>(
    id: string, executor: (connection: Connection, ...params: P) => Promise<unknown>, params: P,
    connectedOnly: boolean, remoteOnly: boolean): vscode.Disposable {

    // The selection can be a TreeItem if the command was run from the tree root's context menu,
    // a Connection if the command was run from a Connection's context menu,
    // or undefined if the command palette
    return vscode.commands.registerCommand(id, async (selection: vscode.TreeItem | LocalCodewindManager | Connection | undefined) => {
        if (selection instanceof LocalCodewindManager) {
            selection = LocalCodewindManager.instance.localConnection;
        }
        if (!(selection instanceof Connection)) {
            selection = await promptForConnection(connectedOnly, remoteOnly);
            // if (selection == null) {
            if (!(selection instanceof Connection)) {
                return;
            }
        }

        try {
            await executor(selection, ...params);
        }
        catch (err) {
            Log.e(`Unexpected error running command ${id}`, err);
            vscode.window.showErrorMessage(`Error running command ${id} on connection ${selection.url} ${MCUtil.errToString(err)}`);
        }
    });
}

/**
 * If the user runs a Project command through the Command Palette, have them pick the project to run the cmd on
 * @param acceptableStates - If at least one state is passed, only projects in one of these states will be presented to the user.
 */
async function promptForProject(acceptableStates?: ProjectState.AppStateSet): Promise<Project | undefined> {
    let projectChoices = await ConnectionManager.instance.allProjects;
    if (acceptableStates) {
        projectChoices = projectChoices.filter((p) => acceptableStates.states.includes(p.state.appState));
    }

    // If no choices are available, show a popup message
    if (projectChoices.length === 0) {
        showNoValidProjectsMsg(acceptableStates);
        return undefined;
    }

    return /* await */ vscode.window.showQuickPick(projectChoices, {
        canPickMany: false,
        placeHolder: "Select a project to run this command on",
    }) as Promise<Project>;
}

const STRING_NS = StringNamespaces.CMD_RES_PROMPT;

function showNoValidProjectsMsg(acceptableStates?: ProjectState.AppStateSet): void {
    let noValidProjectsMsg: string;
    if (!acceptableStates) {
        noValidProjectsMsg = Translator.t(STRING_NS, "noProjToRunOn");
    }
    else {
        noValidProjectsMsg = Translator.t(STRING_NS, "noProjToRunOnWithStates", { states: acceptableStates.userLabel });
    }

    vscode.window.showWarningMessage(noValidProjectsMsg);
}
/**
 * If the user runs a Connection command through the Command Palette, have them pick the connection to run the cmd on
 */
export async function promptForConnection(connectedOnly: boolean, remoteOnly: boolean): Promise<Connection | undefined> {
    const choices = ConnectionManager.instance.connections.filter((conn) => {
        if (connectedOnly && !conn.isConnected) {
            return false;
        }
        if (remoteOnly && !conn.isRemote) {
            return false;
        }
        return true;
    });

    if (choices.length === 1) {
        // only one connection met the criteria so we don't have to have them select it
        return choices[0];
    }
    else if (choices.length === 0) {
        if (CWExtensionContext.get().isChe) {
            vscode.window.showWarningMessage(`Codewind has not yet started. Wait for the Codewind pod to come up before running this command.`);
        }
        else {
            const startCwBtn = "Start Local Codewind";
            const newConnectionBtn = "New Remote Connection";

            const btns = [ newConnectionBtn ];
            if (!remoteOnly) {
                btns.unshift(startCwBtn);
            }

            vscode.window.showWarningMessage(Translator.t(STRING_NS, "noConnToRunOn"), ...btns)
            .then((res) => {
                if (res === startCwBtn) {
                    connectLocalCodewindCmd(LocalCodewindManager.instance, true);
                }
                else if (res === newConnectionBtn) {
                    newRemoteConnectionCmd();
                }
            });
        }

        return undefined;
    }

    return /* await */ vscode.window.showQuickPick(choices, {
        canPickMany: false,
        placeHolder: "Select a connection to run this command on",
    }) as Promise<Connection>;
}
