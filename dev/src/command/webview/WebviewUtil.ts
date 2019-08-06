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
import Log from "../../Logger";
import Commands from "../../constants/Commands";

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
        type: string;
        data: {
            type: string;
            value: string;
        };
    }

    export enum WVOpenable {
        WEB = "web",
        FILE = "file",
        FOLDER = "folder",
    }

    export async function onRequestOpen(msg: WebviewUtil.IWVMessage): Promise<void> {
        Log.d("Got msg to open, data is ", msg.data);
        let uri: vscode.Uri;
        if (msg.data.type === WVOpenable.FILE || msg.data.type === WVOpenable.FOLDER) {
            uri = vscode.Uri.file(msg.data.value);
        }
        else {
            // default to web
            uri = vscode.Uri.parse(msg.data.value);
        }

        Log.i("The uri is:", uri);
        const cmd: string = msg.data.type === WVOpenable.FOLDER ? Commands.VSC_REVEAL_IN_OS : Commands.VSC_OPEN;
        vscode.commands.executeCommand(cmd, uri);
    }
}

export default WebviewUtil;
