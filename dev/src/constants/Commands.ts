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

// non-nls-file

// all of these MUST MATCH package.nls.json command IDs
enum Commands {
    NEW_CONNECTION = "ext.cw.newConnection",
    REMOVE_CONNECTION = "ext.cw.removeConnection",
    ENABLE_CONNECTION = "ext.cw.enableConnection",
    DISABLE_CONNECTION = "ext.cw.disableConnection",

    START_LOCAL_CODEWIND = "ext.cw.startCodewind",
    STOP_LOCAL_CODEWIND = "ext.cw.stopCodewind",
    REMOVE_LOCAL_IMAGES = "ext.cw.removeImages",

    // These "commands" are the same as START and STOP_CODEWIND,
    // but are registered separately with the "On/Off" icons so we can have the two inline buttons (which do the same thing)
    START_CODEWIND_2 = "ext.cw.startCodewind2",
    STOP_CODEWIND_2 = "ext.cw.stopCodewind2",

    REFRESH_CONNECTION = "ext.cw.refreshConnection",
    SET_REGISTRY = "ext.cw.setRegistry",
    OPEN_TEKTON = "ext.cw.openTekton",

    CREATE_PROJECT = "ext.cw.createProject",
    BIND_PROJECT = "ext.cw.bindProject",
    MANAGE_TEMPLATE_REPOS = "ext.cw.manageTemplateRepos",
    CONNECTION_OVERVIEW = "ext.cw.connectionOverview",

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

    MANAGE_LOGS = "ext.cw.manageLogs",
    SHOW_ALL_LOGS = "ext.cw.showAllLogs",
    HIDE_ALL_LOGS = "ext.cw.hideAllLogs",

    DISABLE_PROJECT = "ext.cw.disable",
    ENABLE_PROJECT = "ext.cw.enable",
    REMOVE_PROJECT = "ext.cw.removeProject",

    VALIDATE = "ext.cw.validate",

    // VSCode commands, kept here for easy reference. These will never change.
    VSC_OPEN = "vscode.open",
    VSC_OPEN_FOLDER = "vscode.openFolder",
    VSC_REVEAL_IN_OS = "revealFileInOS",
    VSC_REVEAL_EXPLORER = "revealInExplorer",
    VSC_FOCUS_PROBLEMS = "workbench.action.problems.focus",
}

export default Commands;
