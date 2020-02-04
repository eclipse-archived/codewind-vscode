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

export namespace CWDocs {
    export function getDocLink(docPath: CWDocs): Uri {
        return Uri.parse(`https://codewind.dev/${docPath}`);
    }
}

export enum CWDocs {
    HOME = "",
    TEMPLATE_MANAGEMENT = "mdt-vsc-workingwithtemplates.html",
    INSTALL_INFO = "mdt-vsc-installinfo.html",
    PROJECT_SETTINGS = "mdt-vsc-commands-project.html#configuring-project-settings",
    INSTALL_ON_CLOUD = "installoncloud.html",
    WORKSPACE_NEWS = "news06.html#codewind-workspace-updates",
    REGISTRIES = "image-registry-credentials.html",
    REMOTE_UI = "remoteconnectionui.html",
    REMOTE_DEPLOYING = "remoteoverview.html",
    GETTING_STARTED = "gettingstarted.html",
    COMMANDS_OVERVIEW = "mdt-vsc-commands-overview.html",
    PERF_MONITORING = "performance.html",
    FIRST_PROJECT_LOCAL = "mdt-vsc-firstproject.html",
}

export default CWDocs;
