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
import ProjectOverviewPageWrapper from "../webview/ProjectOverviewPageWrapper";
import MCUtil from "../../MCUtil";

export default async function projectOverviewCmd(project: Project, startAtLinkTab: boolean = false): Promise<void> {
    try {
        if (project.overviewPage) {
            project.overviewPage.reveal();
            return;
        }

        // tslint:disable-next-line: no-unused-expression
        new ProjectOverviewPageWrapper(project, startAtLinkTab);
    }
    catch (err) {
        const errMsg = `Error opening Project Info page for ${project.name}:`;
        vscode.window.showErrorMessage(`${errMsg} ${MCUtil.errToString(err)}`);
        Log.e(errMsg, err);
    }
}
