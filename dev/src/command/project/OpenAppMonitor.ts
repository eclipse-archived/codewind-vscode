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

import Project from "../../microclimate/project/Project";
import Log from "../../Logger";
import Commands from "../../constants/Commands";
import MCUtil from "../../MCUtil";
import Requester from "../../microclimate/project/Requester";

const langToPathMap = new Map<string, string>();
langToPathMap.set("java", "javametrics-dash");
langToPathMap.set("nodejs", "appmetrics-dash");
langToPathMap.set("swift", "swiftmetrics-dash");

export default async function openAppMonitorCmd(project: Project): Promise<void> {
    try {
        const appMetricsPath = langToPathMap.get(project.type.language);

        const supported = appMetricsPath != null && project.capabilities.metricsAvailable;
        // const supported = appMetricsPath != null;
        Log.d(`${project.name} supports metrics ? ${supported}`);
        if (!supported) {
            vscode.window.showWarningMessage(`${project.name} does not support application metrics.`);
            return;
        }

        if (project.appBaseUrl == null) {
            vscode.window.showWarningMessage(`Cannot open application monitor - ${project.name} is not currently running.`);
            return;
        }

        let monitorPageUrlStr = project.appBaseUrl.toString();
        if (!monitorPageUrlStr.endsWith("/")) {
            monitorPageUrlStr += "/";
        }

        // https://github.com/eclipse/codewind-vscode/issues/99
        monitorPageUrlStr = monitorPageUrlStr + appMetricsPath + "/";
        Log.d("Open monitor at " + monitorPageUrlStr);
        vscode.commands.executeCommand(Commands.VSC_OPEN, vscode.Uri.parse(monitorPageUrlStr));
    }
    catch (err) {
        vscode.window.showErrorMessage(MCUtil.errToString(err));
    }
}
