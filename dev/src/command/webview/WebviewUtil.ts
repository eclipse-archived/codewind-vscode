/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import Resources from "../../constants/Resources";
import Commands from "../../constants/Commands";
import { ProjectOverviewWVMessages, IWVOpenable } from "./ProjectOverviewPage";
import { ManageReposWVMessages, IRepoEnablement } from "../connection/ManageTemplateReposCmd";

const RESOURCE_SCHEME = "vscode-resource:";

namespace WebviewUtil {

    export function getStylesheetPath(filename: string): string {
        return RESOURCE_SCHEME + Resources.getCss(filename);
    }

    export function getIcon(icon: Resources.Icons): string {
        const iconPaths = Resources.getIconPaths(icon);
        // return RESOURCE_SCHEME + dark ? iconPaths.dark : iconPaths.light;
        return RESOURCE_SCHEME + iconPaths.dark;
    }

    export interface IWVMessage {
        type: ProjectOverviewWVMessages | ManageReposWVMessages;
        data:
            IWVOpenable |           // used by project overview
            IRepoEnablement |  // used by repo management
            string;
    }

    export async function onRequestOpen(msg: WebviewUtil.IWVMessage): Promise<void> {
        const openable = msg.data as IWVOpenable;
        // Log.d("Got msg to open, data is ", msg.data);
        let uri: vscode.Uri;
        if (openable.type === "file" || openable.type === "folder") {
            uri = vscode.Uri.file(openable.value);
        }
        else {
            // default to web
            uri = vscode.Uri.parse(openable.value);
        }

        // Log.i("The uri is:", uri);
        const cmd: string = openable.type === "folder" ? Commands.VSC_REVEAL_IN_OS : Commands.VSC_OPEN;
        vscode.commands.executeCommand(cmd, uri);
    }
}

export default WebviewUtil;
