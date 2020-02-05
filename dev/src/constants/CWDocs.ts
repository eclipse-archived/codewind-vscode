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

// tslint:disable-next-line: variable-name
export const CWDocs = {
    HOME:                   new CWDoc(""),
    TEMPLATE_MANAGEMENT:    new CWDoc("mdt-vsc-workingwithtemplates.html"),
    INSTALL_INFO:           new CWDoc("mdt-vsc-installinfo.html"),
    PROJECT_SETTINGS:       new CWDoc("mdt-vsc-commands-project.html#configuring-project-settings"),
    INSTALL_ON_CLOUD:       new CWDoc("installoncloud.html"),
    WORKSPACE_NEWS:         new CWDoc("news06.html#codewind-workspace-updates"),
    REGISTRIES:             new CWDoc("image-registry-credentials.html"),
    REMOTE_UI:              new CWDoc("remoteconnectionui.html"),
    REMOTE_DEPLOYING:       new CWDoc("remoteoverview.html"),
    GETTING_STARTED:        new CWDoc("gettingstarted.html"),
    COMMANDS_OVERVIEW:      new CWDoc("mdt-vsc-commands-overview.html"),
    PERF_MONITORING:        new CWDoc("performance.html"),
    FIRST_PROJECT_LOCAL:    new CWDoc("mdt-vsc-firstproject.html"),
};

export default CWDocs;
