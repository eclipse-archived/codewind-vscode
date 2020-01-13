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
import MCUtil from "../../MCUtil";
import Log from "../../Logger";
import { WebviewResourceProvider } from "./WebviewWrapper";

export enum CommonWVMessages {
    OPEN_CONNECTION = "openConnection",
    ADD_NEW = "add-new",
    DELETE = "delete",
    HELP = "help",
    REFRESH = "refresh",
}

namespace WebviewUtil {

    export function getWebviewOptions(): vscode.WebviewOptions & vscode.WebviewPanelOptions  {
        return {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                Resources.getBaseResourcePath()
            ],
        };
    }

    export interface IWVMessage {
        type: string;
        data: any;
    }

    export function getCSP(): string {
        if (global.isTheia || MCUtil.isDevEnv()) {
            return "";
        }
        return `<meta http-equiv="Content-Security-Policy"
            content="default-src 'none'; img-src vscode-resource: https:; script-src vscode-resource: 'unsafe-inline'; style-src vscode-resource: 'unsafe-inline';"
        >`;
    }

    export function buildTitleSection(rp: WebviewResourceProvider, title: string, connectionLabel: string, isRemoteConnection: boolean): string {
        // the subtitle is ommitted in theia since there is only one connection
        const hasSubtitle = !global.isTheia;

        return `<div class="title-section ${hasSubtitle ? "" : "title-section-subtitled"}">
            <img id="logo" alt="Codewind Logo" src="${rp.getIcon(Resources.Icons.Logo)}"/>
            <div>
                <h1 id="title">${title}</h1>
                ${hasSubtitle ? buildConnectionSubtitle(connectionLabel, isRemoteConnection) : ""}
            </div>
        </div>`;
    }

    function buildConnectionSubtitle(connectionLabel: string, isRemoteConnection: boolean): string {
        let classAttr = "";
        let onClick = "";

        if (isRemoteConnection) {
            classAttr = `class="clickable"`;
            onClick = `onclick="sendMsg('${CommonWVMessages.OPEN_CONNECTION}')"`;
        }
        return `<h2 id="subtitle" ${classAttr} ${onClick}>${connectionLabel}</h2>`;
    }

    export const ATTR_ID = "data-id";
    export const ATTR_ENABLED = "data-enabled";
    export const TOGGLE_BTN_CLASS = "toggle-btn";

    export function buildToggleTD(rp: WebviewResourceProvider, enabled: boolean, title: string, idAttrValue: string): string {
        return `<td class="btn-cell">
            <input type="image" title="${title}" alt="${title}" ${ATTR_ID}="${idAttrValue}" ${ATTR_ENABLED}="${enabled}"
                class="${TOGGLE_BTN_CLASS} btn" src="${getStatusToggleIconSrc(rp, enabled)}" onclick="onToggle(this)"/>
        </td>`;
    }

    export function getStatusToggleIconSrc(rp: WebviewResourceProvider, enabled: boolean, escapeBackslash: boolean = false): string {
        const toggleIcon = rp.getIcon(enabled ? Resources.Icons.ToggleOnThin : Resources.Icons.ToggleOffThin);
        if (escapeBackslash) {
            return getEscapedPath(toggleIcon);
        }
        return toggleIcon;
    }

    /**
     * Paths to be opened that are embedded into the webview HTML require an extra escape on Windows.
     * https://github.com/eclipse/codewind/issues/476
     */
    export function getEscapedPath(path: string): string {
        if (MCUtil.getOS() === "windows") {
            return path.replace(/\\/g, "\\\\");
        }
        return path;
    }


    /**
     * For debugging in the browser, write out the html to an html file on disk and point to the resources on disk.
     * The file will be stored in the path in process.env.WEBVIEW_DEBUG_DIR, or ~.
     *
     * If WEBVIEW_DEBUG_DIR is not set, this function does nothing.
     */
    export async function debugWriteOutWebview(html: string, filename: string): Promise<void> {
        const destDir = process.env.WEBVIEW_DEBUG_DIR;
        if (!destDir) {
            return;
            // destDir = process.env.HOME || ((MCUtil.getOS() === "windows") ? "C:\\" : "/");
        }

        if (!filename.endsWith(".html")) {
            filename = filename + ".html";
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
