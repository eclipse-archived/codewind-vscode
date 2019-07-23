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

import Project from "./Project";
import Resources from "../../constants/Resources";
import MCUtil from "../../MCUtil";

// This file does have a bunch of strings that should be translated,
// but the stringfinder is not smart enough to pick them out from the regular html strings. So, do this file by hand.
// non-nls-file

/**
 * These are the messages the WebView can send back to its creator in ProjectInfoCmd
 */
export enum Messages {
    BUILD = "build",
    TOGGLE_AUTOBUILD = "toggleAutoBuild",
    OPEN = "open",
    UNBIND = "unbind",
    TOGGLE_ENABLEMENT = "toggleEnablement",
    EDIT = "edit",
}

export enum Openable {
    WEB = "web",
    FILE = "file",
    FOLDER = "folder",
}


export function refreshProjectOverview(webviewPanel: vscode.WebviewPanel, project: Project): void {
    webviewPanel.webview.html = generateHtml(project);
}

const NOT_AVAILABLE = "Not available";
const NOT_RUNNING = "Not running";
const NOT_DEBUGGING = "Not debugging";

export function generateHtml(project: Project): string {

    const emptyRow =
    `
    <tr>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
    </tr>
    `;

    return `
        <!DOCTYPE html>

        <html>
        <head>
            <meta charset="UTF-8">
            <!--meta http-equiv="Content-Security-Policy" content="default-src 'self' ;"-->
            <meta name="viewport" content="width=device-width, initial-scale=1.0">

            <link rel="stylesheet" href="${getStylesheetPath("project-overview.css")}"/>
            ${global.isTheia ?
                `<link rel="stylesheet" href="${getStylesheetPath("theia.css")}"/>` : ""}
        </head>
        <body>

        <div id="main">
            <div id="top-section">
                <img id="mc-icon" width="30px" src="${getIcon(Resources.Icons.Logo)}"/>
                <h2>Project ${project.name}</h2>
                <input id="build-btn" type="button" value="Build"
                    onclick="${project.state.isEnabled ? `sendMsg('${Messages.BUILD}')` : ""}"
                    class="btn ${project.state.isEnabled ? "" : "btn-disabled"}"/>
            </div>

            <table>
                <!--${buildRow("Name", project.name)}-->
                ${buildRow("Type", project.type.toString())}
                ${buildRow("Language", MCUtil.uppercaseFirstChar(project.language))}
                ${buildRow("Project ID", project.id)}
                ${buildRow("Container ID", normalize(project.containerID, NOT_AVAILABLE, 32))}
                ${buildRow("Location on Disk", project.localPath.fsPath, Openable.FOLDER)}
                <tr>
                    <td class="info-label">Auto build:</td>
                    <td>
                        <input id="auto-build-toggle" type="checkbox" class="btn"
                            onclick="sendMsg('${Messages.TOGGLE_AUTOBUILD}')"
                            ${project.autoBuildEnabled ? "checked" : ""}
                            ${project.state.isEnabled ? " " : " disabled"}
                        />
                    </td>
                </tr>
                ${emptyRow}
                ${buildRow("Application Status", project.state.appState)}
                ${buildRow("Build Status", normalize(project.state.getBuildString(), NOT_AVAILABLE))}
                ${emptyRow}
                ${buildRow("Last Image Build", normalizeDate(project.lastImgBuild, NOT_AVAILABLE))}
                ${buildRow("Last Build", normalizeDate(project.lastBuild, NOT_AVAILABLE))}
            </table>

            <!-- Separate fixed table for the lower part so that the Edit buttons line up in their own column,
                but also don't appear too far to the right -->
            <table class="fixed-table">
                ${emptyRow}
                ${buildRow("Exposed App Port", normalize(project.ports.appPort, NOT_RUNNING))}
                ${buildRow("Internal App Port",
                    normalize(project.ports.internalPort, NOT_AVAILABLE),
                    undefined, true)}
                ${buildRow("Application Endpoint",
                    normalize(project.appBaseUrl, NOT_RUNNING),
                    (project.appBaseUrl != null ? Openable.WEB : undefined), true)}
                ${emptyRow}
                <!-- buildDebugSection must also close the <table> -->
                ${buildDebugSection(project)}
            <!-- /table -->

            <div id="bottom-section">
                <input id="delete-btn" type="button" onclick="sendMsg('${Messages.UNBIND}')" class="btn" value="Remove project"/>
                <input id="enablement-btn" type="button" onclick="sendMsg('${Messages.TOGGLE_ENABLEMENT}')" class="btn"
                    value="${(project.state.isEnabled ? "Disable" : "Enable") + " project"}"/>
            </div>
        </div>

        <script type="text/javascript">
            const vscode = acquireVsCodeApi();

            function vscOpen(element, type) {
                sendMsg("${Messages.OPEN}", { type: type, value: element.textContent });
            }

            function sendMsg(type, data = undefined) {
                // See IWebViewMsg in ProjectOverviewCmd
                vscode.postMessage({ type: type, data: data });
            }
        </script>

        </body>
        </html>
    `;
}

const RESOURCE_SCHEME = "vscode-resource:";

function getStylesheetPath(filename: string): string {
    return RESOURCE_SCHEME + Resources.getCss(filename);
}

function getIcon(icon: Resources.Icons): string {
    const iconPaths = Resources.getIconPaths(icon);
    // return RESOURCE_SCHEME + dark ? iconPaths.dark : iconPaths.light;
    return RESOURCE_SCHEME + iconPaths.dark;
}

function buildRow(label: string, data: string, openable?: Openable, editable: boolean = false): string {
    let secondColTdContents: string = "";
    let thirdColTdContents: string = "";
    if (openable) {
        secondColTdContents += `<a title="${label}" onclick="vscOpen(this, '${openable}')">${data}</a>`;
    }
    else {
        secondColTdContents = `${data}`;
    }

    if (editable) {
        const tooltip = `title="Edit"`;
        const onClick = `onclick="sendMsg('${Messages.EDIT}', { type: '${editable}' })"`;

        thirdColTdContents = `
            <img id="edit-${MCUtil.slug(label)}" class="edit-btn" ${tooltip} ${onClick}` +
                `src="${getIcon(Resources.Icons.Edit)}"/>
        `;
    }

    const secondTd = `<td title="${label}">${secondColTdContents}</td>`;
    const thirdTd = thirdColTdContents ? `<td>${thirdColTdContents}</td>` : "";

    return `
        <tr class="info-row">
            <td class="info-label">${label}:</td>
            ${secondTd}
            ${thirdTd}
        </tr>
    `;
}

/**
 * Convert `item` to a user-friendly string, or the fallback if `item` is undefined or invalid.
 */
function normalize(item: vscode.Uri | number | string | undefined, fallback: string, maxLength?: number): string {
    let result: string;
    if (item == null || item === "" || (typeof item === typeof 0 && isNaN(Number(item)))) {
        result = fallback;
    }
    else if (item instanceof vscode.Uri && (item as vscode.Uri).scheme.includes("file")) {
        result = item.fsPath;
    }
    else {
        result = item.toString();
    }

    if (maxLength != null) {
        result = result.substring(0, maxLength);
    }

    return result;
}

function normalizeDate(d: Date, fallback: string): string {
    if (MCUtil.isGoodDate(d)) {
        let dateStr: string = d.toLocaleDateString();
        if (dateStr === (new Date()).toLocaleDateString()) {
            dateStr = "Today";
        }

        return `${dateStr} at ${d.toLocaleTimeString()}`;
    }
    else {
        return fallback;
    }
}

function buildDebugSection(project: Project): string {
    if (!project.capabilities.supportsDebug) {
        return `
            </table>
            ${project.type} projects do not support debug.
        `;
    }

    return `
        ${buildRow("Exposed Debug Port", normalize(project.ports.debugPort, NOT_DEBUGGING))}
        ${buildRow("Internal Debug Port",
            normalize(project.ports.internalDebugPort, NOT_AVAILABLE),
            undefined, true)}
        </table>
    `;
        // ${buildRow("Debug URL", normalize(project.debugUrl, NOT_DEBUGGING))}
}
