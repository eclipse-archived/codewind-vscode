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

// non-nls-file

// all of these MUST MATCH package.nls.json command IDs
enum Commands {
    NEW_CONNECTION = "ext.cw.newConnection",
    REMOVE_CONNECTION = "ext.cw.removeConnection",
    ENABLE_CONNECTION = "ext.cw.enableConnection",
    DISABLE_CONNECTION = "ext.cw.disableConnection",
    SEPARATOR = "ext.cw.separator",
    REFRESH_CONNECTION = "ext.cw.refreshConnection",

    START_LOCAL_CODEWIND = "ext.cw.startCodewind",
    STOP_LOCAL_CODEWIND = "ext.cw.stopCodewind",
    REMOVE_LOCAL_IMAGES = "ext.cw.removeImages",

    CREATE_PROJECT = "ext.cw.createProject",
    BIND_PROJECT = "ext.cw.bindProject",

    CONNECTION_OVERVIEW = "ext.cw.connectionOverview",
    OPEN_TEKTON = "ext.cw.openTekton",
    MANAGE_TEMPLATE_SOURCES = "ext.cw.manageSources",
    MANAGE_REGISTRIES = "ext.cw.manageRegistries",
    SET_LOG_LEVEL = "ext.cw.setLogLevel",

    OPEN_WS_FOLDER = "ext.cw.openWorkspaceFolder",

    ADD_PROJECT_TO_WS = "ext.cw.addProjectToWorkspace",

    ATTACH_DEBUGGER = "ext.cw.attachDebugger",
    RESTART_RUN = "ext.cw.restartProjectRun",
    RESTART_DEBUG = "ext.cw.restartProjectDebug",

    OPEN_APP = "ext.cw.openInBrowser",
    REQUEST_BUILD = "ext.cw.requestBuild",
    TOGGLE_AUTOBUILD = "ext.cw.toggleAutoBuild",
    ENABLE_AUTOBUILD = "ext.cw.enableAutoBuild",
    DISABLE_AUTOBUILD = "ext.cw.disableAutoBuild",
    CONTAINER_SHELL = "ext.cw.containerShell",
    PROJECT_OVERVIEW = "ext.cw.projectOverview",
    OPEN_APP_MONITOR = "ext.cw.openAppMonitor",
    OPEN_PERF_DASHBOARD = "ext.cw.openPerfDashboard",

    TOGGLE_INJECT_METRICS = "ext.cw.toggleInjectMetrics",
    ENABLE_INJECT_METRICS = "ext.cw.enableInjectMetrics",
    DISABLE_INJECT_METRICS = "ext.cw.disableInjectMetrics",

    MANAGE_LOGS = "ext.cw.manageLogs",
    SHOW_ALL_LOGS = "ext.cw.showAllLogs",
    HIDE_ALL_LOGS = "ext.cw.hideAllLogs",

    DISABLE_PROJECT = "ext.cw.disable",
    ENABLE_PROJECT = "ext.cw.enable",
    REMOVE_PROJECT = "ext.cw.removeProject",
    CHANGE_PROJECT_CONNECTION = "ext.cw.changeProjectConnection",

    VALIDATE = "ext.cw.validate",

    FOCUS_CW_VIEW = "ext.cw.explorer.focus",

    // VSCode commands, kept here for easy reference. These will never change.
    VSC_OPEN = "vscode.open",
    VSC_OPEN_FOLDER = "vscode.openFolder",
    VSC_REVEAL_IN_OS = "revealFileInOS",
    VSC_REVEAL_EXPLORER = "revealInExplorer",
    VSC_FOCUS_PROBLEMS = "workbench.action.problems.focus",
}

export default Commands;
