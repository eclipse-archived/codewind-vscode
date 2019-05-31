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

enum Commands {
    // all of these must match package.nls.json command IDs
    ACTIVATE_CONNECTION = "ext.cw.activateConn",
    DEACTIVATE_CONNECTION = "ext.cw.deactivateConn",
    REFRESH_CONNECTION = "ext.cw.refreshConnection",

    CREATE_PROJECT = "ext.cw.createProject",
    BIND_PROJECT = "ext.cw.bindProject",

    OPEN_WS_FOLDER = "ext.cw.openWorkspaceFolder",

    ATTACH_DEBUGGER = "ext.cw.attachDebugger",
    RESTART_RUN = "ext.cw.restartProjectRun",
    RESTART_DEBUG = "ext.cw.restartProjectDebug",

    OPEN_IN_BROWSER = "ext.cw.openInBrowser",
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

    VALIDATE = "ext.cw.validate",

    // VSCode commands, kept here for easy reference. These will never change.
    VSC_OPEN = "vscode.open",
    VSC_OPEN_FOLDER = "vscode.openFolder",
    VSC_REVEAL_IN_OS = "revealFileInOS",
    VSC_REVEAL_EXPLORER = "revealInExplorer",
    VSC_FOCUS_PROBLEMS = "workbench.action.problems.focus",
}

export default Commands;
