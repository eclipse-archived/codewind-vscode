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
import * as fs from "fs";
import * as path from "path";

import Resources from "../../constants/Resources";
import Commands from "../../constants/Commands";
import { IWVOpenable } from "./pages/ProjectOverviewPage";
import MCUtil from "../../MCUtil";
import Log from "../../Logger";

namespace WebviewUtil {

    export function getWebviewOptions(): vscode.WebviewOptions & vscode.WebviewPanelOptions  {
        return {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(Resources.getBaseResourcePath())
            ],
        };
    }

    export interface IWVMessage {
        type: string;
        data: any;
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

    export function getCSP(): string {
        if (global.isTheia || MCUtil.isDevEnv()) {
            return "";
        }
        return `<meta http-equiv="Content-Security-Policy"
            content="default-src 'none'; img-src vscode-resource: https:; script-src vscode-resource: 'unsafe-inline'; style-src vscode-resource: 'unsafe-inline';"
        >`;
    }

    /**
     * For debugging in the browser, write out the html to an html file on disk and point to the resources on disk.
     * The file will be stored in the path in process.env.WEBVIEW_DEBUG_DIR, or ~.
     *
     * If CW_ENV=dev or WEBVIEW_DEBUG_DIR is not set, this function does nothing.
     */
    export async function debugWriteOutWebview(html: string, filename: string): Promise<void> {
        if (!MCUtil.isDevEnv() && !process.env.WEBVIEW_DEBUG_DIR) {
            return;
        }

        if (!filename.endsWith(".html")) {
            filename = filename + ".html";
        }

        let destDir = process.env.WEBVIEW_DEBUG_DIR;
        if (!destDir) {
            destDir = process.env.HOME || ((MCUtil.getOS() === "windows") ? "C:\\" : "/");
        }

        try {
            await fs.promises.access(destDir);
        }
        catch (err) {
            Log.d(`Creating ${destDir}`);
            await fs.promises.mkdir(destDir, { recursive: true });
        }

        const destFile = path.join(destDir, filename);
        const htmlWithFileProto = html.replace(/vscode-resource:\/\/file\/\//g, "file://");

        try {
            await fs.promises.writeFile(destFile, htmlWithFileProto);
            Log.d(`Wrote out debug webview to ${destFile}`);
        }
        catch (err) {
            Log.e(`Error writing out debug webview ${filename}`, err);
        }
    }
}

export default WebviewUtil;
