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

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

import { getBaseResourcesPath, ThemelessImages } from "../../constants/CWImages";
import MCUtil from "../../MCUtil";
import Log from "../../Logger";
import { WebviewResourceProvider } from "./WebviewWrapper";
import Commands from "../../constants/Commands";

export enum CommonWVMessages {
    OPEN_CONNECTION = "openConnection",
    ADD_NEW = "addNew",
    DELETE = "delete",
    HELP = "help",
    REFRESH = "refresh",
    OPEN_WEBLINK = "openWebLink"
}

/**
 * See debugWriteOutWebview()
 */
const ENVVAR_WEBVIEW_DEBUG_DIR = "WEBVIEW_DEBUG_DIR";

const STYLE_FOLDER_NAME = "css";

namespace WebviewUtil {

    export function getWebviewOptions(): vscode.WebviewOptions & vscode.WebviewPanelOptions  {
        return {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(getBaseResourcesPath())
            ],
        };
    }

    export function getCssPath(filename: string): vscode.Uri {
        const cssPath = path.join(getBaseResourcesPath(), STYLE_FOLDER_NAME, filename);
        return vscode.Uri.file(cssPath);
    }

    export interface IWVMessage {
        type: string;
        data: any;
    }

    /**
     * `<head>` section for our webviews
     * @param stylesheets Filenames under res/css to include
     */
    export function getHead(rp: WebviewResourceProvider, ...stylesheets: string[]): string {
        // These should be loaded first so they can be overridden
        stylesheets.unshift("common.css");

        if (global.isTheia || !!process.env[ENVVAR_WEBVIEW_DEBUG_DIR]) {
            stylesheets.unshift("theia.css");
        }

        const stylesheetLinks = stylesheets.reduce((allSheets, sheet) => {
            return `
            ${allSheets}
            <link rel="stylesheet" href="${rp.getStylesheet(sheet)}"/>`;
        }, "");

        return `<head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${getCSP()}
            ${stylesheetLinks}
            ${getFontLinks()}
        </head>`;
    }

    function getCSP(): string {
        if (global.isTheia || MCUtil.isDevEnv()) {
            return "";
        }
        return `<meta http-equiv="Content-Security-Policy"
            content="default-src 'none'; img-src vscode-resource: https:; script-src vscode-resource: 'unsafe-inline'; style-src vscode-resource: 'unsafe-inline';"
        >`;
    }

    function getFontLinks(): string {
        const weights = [ 300, 400, 500, 700 ].join(",");
        return `<link href="https://fonts.googleapis.com/css?family=IBM+Plex+Sans:${weights}&amp;display=swap" rel="stylesheet">`;
    }

    export function buildTitleSection(rp: WebviewResourceProvider, title: string, connectionLabel: string, isRemoteConnection: boolean): string {
        // the subtitle is ommitted in Che since there is only one connection
        const hasSubtitle = !global.isChe;

        return `<div class="title-section ${hasSubtitle ? "title-section-subtitled" : ""}">
            <div id="logo-container">
                <img id="logo" alt="Codewind Logo" src="${rp.getImage(ThemelessImages.Logo)}"/>
            </div>
            <div>
                <div id="title">${title}</div>
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
        return `<div id="subtitle" ${classAttr} ${onClick}>${connectionLabel}</div>`;
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
        const toggleIcon = rp.getImage(enabled ? ThemelessImages.ToggleOnThin : ThemelessImages.ToggleOffThin);
        if (escapeBackslash) {
            return getEscapedPath(toggleIcon);
        }
        return toggleIcon;
    }

    /**
     * Paths to be opened that are embedded into the webview HTML require an extra escape on Windows.
     * https://github.com/eclipse/codewind/issues/476
     */
    export function getEscapedPath(resourcePath: string): string {
        if (MCUtil.getOS() === "windows") {
            return resourcePath.replace(/\\/g, "\\\\");
        }
        return resourcePath;
    }

    /**
     * To work around https://github.com/eclipse/codewind/issues/2273 we use this instead of <a href> to open links that may not use https.
     */
    export function openWeblink(link: string): void {
        const asUri = vscode.Uri.parse(link);
        if (!asUri.scheme) {
            Log.e(`Received bad link to open from webview`, link);
            vscode.window.showErrorMessage(`Cannot open "${link}"`);
            return;
        }
        else if (asUri.scheme === "file") {
            Log.w(`Refusing to open file URI`, asUri.toString());
            vscode.window.showWarningMessage(`This link points to a file, and cannot be opened.`);
            return;
        }
        vscode.commands.executeCommand(Commands.VSC_OPEN, asUri);
    }

    /**
     * For debugging in a real browser (with real developer tools), write out the html to a file on disk, and point to the resources on disk.
     * The file will be stored in the path in process.env.WEBVIEW_DEBUG_DIR.
     *
     * If WEBVIEW_DEBUG_DIR is not set, this function does nothing.
     */
    export async function debugWriteOutWebview(html: string, filename: string): Promise<void> {
        const destDir = process.env[ENVVAR_WEBVIEW_DEBUG_DIR];
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
