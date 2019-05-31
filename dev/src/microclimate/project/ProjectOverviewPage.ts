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
import * as MCUtil from "../../MCUtil";

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

export enum Editable {
    CONTEXT_ROOT = "context-root",
    APP_PORT = "app-port",
    DEBUG_PORT = "debug-port",
    DISABLED = "disabled",
}

export function refreshProjectOverview(webviewPanel: vscode.WebviewPanel, project: Project): void {
    webviewPanel.webview.html = generateHtml(project);
}

export function generateHtml(project: Project): string {

    const emptyRow =
    `
    <tr>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
    </tr>
    `;

    const notAvailable = "Not available";
    const notRunning = "Not running";
    const notDebugging = "Not debugging";

    return `
        <!DOCTYPE html>

        <html>
        <head>
            <meta charset="UTF-8">
            <!--meta http-equiv="Content-Security-Policy" content="default-src 'self' ;"-->
            <meta name="viewport" content="width=device-width, initial-scale=1.0">

            <link rel="stylesheet" href="${getStylesheetPath()}"/>
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
                <!--${buildRow("Microclimate URL", project.connection.toString())}-->
                ${buildRow("Project ID", project.id)}
                ${buildRow("Container ID", normalize(project.containerID, notAvailable, 32))}
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
                ${buildRow("Build Status", normalize(project.state.getBuildString(), notAvailable))}
                ${emptyRow}
                ${buildRow("Last Image Build", normalizeDate(project.lastImgBuild, notAvailable))}
                ${buildRow("Last Build", normalizeDate(project.lastBuild, notAvailable))}
            </table>

            <!-- Separate fixed table for the lower part so that the Edit buttons line up in their own column,
                but also don't appear too far to the right -->
            <table class="fixed-table">
                ${emptyRow}
                ${buildRow("Exposed App Port", normalize(project.ports.appPort, notRunning))}
                ${buildRow("Internal App Port",
                    normalize(project.ports.internalPort, notAvailable),
                    undefined,
                    Editable.APP_PORT)}
                ${buildRow("Application Endpoint",
                    normalize(project.appBaseUrl, notRunning),
                    (project.appBaseUrl != null ? Openable.WEB : undefined),
                    Editable.CONTEXT_ROOT)}
                ${emptyRow}
                ${buildRow("Exposed Debug Port", normalize(project.ports.debugPort, notDebugging))}
                ${buildRow("Internal Debug Port",
                    normalize(project.ports.internalDebugPort, notAvailable),
                    undefined,
                    Editable.DEBUG_PORT)}
                ${buildRow("Debug URL", normalize(project.debugUrl, notDebugging))}
            </table>

            <div id="bottom-section">
                <input id="delete-btn" type="button" onclick="sendMsg('${Messages.UNBIND}')" class="btn" value="Unbind project"/>
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

function getStylesheetPath(): string {
    return RESOURCE_SCHEME + Resources.getCss("project-overview.css");
}

function getIcon(icon: Resources.Icons): string {
    const iconPaths = Resources.getIconPaths(icon);
    // return RESOURCE_SCHEME + dark ? iconPaths.dark : iconPaths.light;
    return RESOURCE_SCHEME + iconPaths.dark;
}

function buildRow(label: string, data: string, openable?: Openable, editable?: Editable): string {
    let secondColTdContents: string = "";
    let thirdColTdContents: string = "";
    if (openable) {
        secondColTdContents += `<a title="${label}" onclick="vscOpen(this, '${openable}')">${data}</a>`;
    }
    else {
        secondColTdContents = `${data}`;
    }

    if (editable) {
        const tooltip = `title=` + (editable === Editable.DISABLED ? `"Upgrade your Microclimate version to use this feature"` : "Edit");
        const cursor = editable ===  Editable.DISABLED ? `style="cursor: not-allowed;"` : "";
        const onClick = editable === Editable.DISABLED ? "" : `onclick="sendMsg('${Messages.EDIT}', { type: '${editable}' })"`;

        thirdColTdContents = `
            <img id="edit-${MCUtil.slug(label)}" class="edit-btn" ${tooltip} ${cursor} ${onClick}` +
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
