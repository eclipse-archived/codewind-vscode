/*******************************************************************************
 * Copyright (c) 2019, 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import { Uri } from "vscode";

class CWDoc {
    public readonly uri: Uri;

    constructor(
        path: string,
    ) {
        this.uri = Uri.parse(`https://codewind.dev/${path}`);
    }
}

export const CWDocs = {
    HOME:                   new CWDoc(""),
    TEMPLATE_MANAGEMENT:    new CWDoc("workingwithtemplates.html"),
    INSTALL_INFO:           new CWDoc("vsc-getting-started.html"),
    PROJECT_SETTINGS:       new CWDoc("project-settings.html"),
    WORKSPACE_NEWS:         new CWDoc("news06.html#codewind-workspace-updates"),
    REGISTRIES:             new CWDoc("remote-setupregistries.html"),
    CHE_INSTALL:            new CWDoc("che-installinfo.html"),
    REMOTE_UI:              new CWDoc("remotedeploy-vscode.html"),
    REMOTE_DEPLOYING:       new CWDoc("remote-deploying-codewind.html"),
    GETTING_STARTED:        new CWDoc("gettingstarted.html"),
    COMMANDS_OVERVIEW:      new CWDoc("project-actions.html"),
    PERF_MONITORING:        new CWDoc("performance.html"),
    FIRST_PROJECT_LOCAL:    new CWDoc("vsc-firstproject.html"),
};

export default CWDocs;
