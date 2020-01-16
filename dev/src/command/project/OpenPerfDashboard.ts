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

import Project from "../../codewind/project/Project";

import Log from "../../Logger";
import MCUtil from "../../MCUtil";
import EndpointUtil from "../../constants/Endpoints";
import Commands from "../../constants/Commands";
import Constants from "../../constants/Constants";
import { getAppMetricsNotSupportedMsg } from "./OpenAppMonitor";

export default async function openPerformanceDashboard(project: Project): Promise<void> {
    const supportsMetrics = project.hasPerfDashboard;
    Log.d(`${project.name} supports perfmonitor ? ${supportsMetrics}`);
    if (!supportsMetrics || !(await project.testPingAppMonitor())) {
        vscode.window.showWarningMessage(getAppMetricsNotSupportedMsg(project.name));
        return;
    }

    try {
        const cwBaseUrl = global.isTheia ? getCodewindIngress() : project.connection.url;
        const dashboardUrl = EndpointUtil.getPerformanceDashboard(cwBaseUrl, project.id);
        Log.d(`Dashboard url for ${project.name} is ${dashboardUrl}`);
        vscode.commands.executeCommand(Commands.VSC_OPEN, dashboardUrl);
    }
    catch (err) {
        vscode.window.showErrorMessage(MCUtil.errToString(err));
    }
}

const CW_INGRESS_NAME = "codewind";         // :(

export function getCodewindIngress(): vscode.Uri {

    // See https://github.com/eclipse/codewind-vscode/issues/123
    // Hopefully, this is temporary. This is how we assemble the URL to the codewind ingress/route without a kube/OC client.
    // Even though this has nothing to do with the perf dashboard in particular, that is the only feature which can't use the proxy.

    const cheApiUrlStr = process.env[Constants.CHE_API_EXTERNAL_ENVVAR];
    if (!cheApiUrlStr) {
        throw new Error(`Could not determine Che API URL; ${Constants.CHE_API_EXTERNAL_ENVVAR} was not set.`);
    }
    const cheApiUrl = vscode.Uri.parse(cheApiUrlStr);
    Log.d(`Che API URL is "${cheApiUrl}"`);

    const workspaceID = process.env[Constants.CHE_WORKSPACEID_ENVVAR];
    if (!workspaceID) {
        throw new Error(`Could not determine Che workspace ID; ${Constants.CHE_WORKSPACEID_ENVVAR} was not set.`);
    }

    // this will resolve to something like:
    // codewind-workspacebiq5onaqye4u9x3d-che-che.10.99.3.118.nip.io
    const codewindIngressAuthority = `${CW_INGRESS_NAME}-${workspaceID}-${cheApiUrl.authority}`;

    const codewindIngress = vscode.Uri.parse(`${cheApiUrl.scheme}://${codewindIngressAuthority}`);
    Log.i(`Codewind Ingress URL is ${codewindIngress}`);
    return codewindIngress;
}
