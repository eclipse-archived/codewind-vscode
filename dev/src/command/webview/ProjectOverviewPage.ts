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

import Resources from "../../constants/Resources";
import MCUtil from "../../MCUtil";
import Project from "../../codewind/project/Project";
import WebviewUtil from "../webview/WebviewUtil";
import { CWDocs } from "../../constants/Constants";

// This file does have a bunch of strings that should be translated,
// but the stringfinder is not smart enough to pick them out from the regular html strings. So, do this file by hand.
// non-nls-file

/**
 * These are the messages the WebView can send back to its creator in ProjectInfoCmd
 */
export enum ProjectOverviewWVMessages {
    BUILD = "build",
    TOGGLE_AUTOBUILD = "toggleAutoBuild",
    OPEN = "open",
    UNBIND = "unbind",
    TOGGLE_ENABLEMENT = "toggleEnablement",
    EDIT = "edit",
}

enum OpenableTypes {
    WEB = "web",
    FILE = "file",
    FOLDER = "folder",
}

/**
 * Used by 'open' messages to pass back data about what to open
 */
export interface IWVOpenable {
    type: OpenableTypes;
    value: string;
}

export function refreshProjectOverview(webviewPanel: vscode.WebviewPanel, project: Project): string {
    const html = generateHtml(project);
    webviewPanel.webview.html = html;
    return html;
}

const NOT_AVAILABLE = "Not available";
const NOT_RUNNING = "Not running";
const NOT_DEBUGGING = "Not debugging";

function generateHtml(project: Project): string {

    // const emptyRow =
    // `
    // <tr>
    //     <td>&nbsp;</td>
    //     <td>&nbsp;</td>
    // </tr>
    // `;

    return `
        <!DOCTYPE html>

        <html>
        <head>
            <meta charset="UTF-8">
            <!--meta http-equiv="Content-Security-Policy" content="default-src 'self' ;"-->
            <meta name="viewport" content="width=device-width, initial-scale=1.0">

            <link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("common.css")}"/>
            <link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("project-overview.css")}"/>
            ${global.isTheia ?
                `<link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("theia.css")}"/>` : ""}
        </head>
        <body>

        <div class="title">
            <img id="logo" alt="Codewind Logo" src="${WebviewUtil.getIcon(Resources.Icons.Logo)}"/>
            <h1>Project ${project.name}</h1>
        </div>
        <div id="top-section">
            <input type="button" value="Build"
                class="btn btn-prominent ${project.state.isEnabled ? "" : "btn-disabled"}"
                onclick="${project.state.isEnabled ? `sendMsg('${ProjectOverviewWVMessages.BUILD}')` : ""}"/>

            <div id="top-right-btns">
                <input id="enablement-btn" class="btn btn-prominent" type="button"
                    onclick="sendMsg('${ProjectOverviewWVMessages.TOGGLE_ENABLEMENT}')"
                    value="${(project.state.isEnabled ? "Disable" : "Enable") + " project"}"
                />
                <input class="btn btn-red" type="button"
                    onclick="sendMsg('${ProjectOverviewWVMessages.UNBIND}')"
                    value="Remove project"
                />
            </div>
        </div>
        <div class="section">
            <h3>Project Information</h3>
            <table>
                ${buildRow("Type", project.type.toString())}
                ${buildRow("Language", MCUtil.uppercaseFirstChar(project.language))}
                ${buildRow("Project ID", project.id)}
                ${buildRow("Local Path", project.localPath.fsPath, global.isTheia ? undefined : OpenableTypes.FOLDER)}
            </table>
        </div>
        <div class="section">
            <h3>Project Status</h3>
            <table>
                <tr>
                    <td class="info-label">Auto build:</td>
                    <td>
                        <input id="auto-build-toggle" type="checkbox" class="btn"
                            onclick="sendMsg('${ProjectOverviewWVMessages.TOGGLE_AUTOBUILD}')"
                            ${project.autoBuildEnabled ? "checked" : ""}
                            ${project.state.isEnabled ? " " : " disabled"}
                        />
                    </td>
                </tr>
                ${buildRow("Application Status", project.state.appState)}
                ${buildRow("Build Status", normalize(project.state.getBuildString(), NOT_AVAILABLE))}
                ${buildRow("Last Image Build", normalizeDate(project.lastImgBuild, NOT_AVAILABLE))}
                ${buildRow("Last Build", normalizeDate(project.lastBuild, NOT_AVAILABLE))}
            </table>
        </div>
        <div class="section">
            <div id="app-info-header-section">
                <h3>Application Information</h3>
                <div id="about-project-settings">
                    <a onclick="vscOpen('${OpenableTypes.WEB}', '${CWDocs.getDocLink(CWDocs.PROJECT_SETTINGS)}')" title="More Info">More Info</a>
                </div>
            </div>
            <!-- Hide Container ID in theia -->
            ${global.isTheia ? "" : `
                <table class="bottom-padded">
                    ${buildRow("Container ID", normalize(project.containerID, NOT_AVAILABLE, 32))}
                </table>`
            }

            <table>
                ${buildRow("Application Endpoint",
                    normalize(project.appUrl, NOT_RUNNING),
                    (project.appUrl != null ? OpenableTypes.WEB : undefined), true)}
                ${buildRow("Exposed App Port", normalize(project.ports.appPort, NOT_RUNNING))}
                ${buildRow("Internal App Port",
                    normalize(project.ports.internalPort, NOT_AVAILABLE),
                    undefined, true)}

                <!-- buildDebugSection must also close the <table> -->
                ${buildDebugSection(project)}
            <!-- /table -->
        </div>

        <script type="text/javascript">
            const vscode = acquireVsCodeApi();

            function vscOpen(type, value) {
                sendMsg("${ProjectOverviewWVMessages.OPEN}", { type, value });
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

function buildRow(label: string, data: string, openable?: OpenableTypes, editable: boolean = false): string {
    let secondColTdContents: string = "";
    let thirdColTdContents: string = "";
    if (openable) {
        secondColTdContents += `<a title="${label}" onclick="vscOpen('${openable}', '${data}')">${data}</a>`;
    }
    else {
        secondColTdContents = `${data}`;
    }

    if (editable) {
        const tooltip = `title="Edit Project Settings"`;
        const onClick = `onclick="sendMsg('${ProjectOverviewWVMessages.EDIT}', { type: '${editable}' })"`;

        thirdColTdContents = `
            <input type="image" id="edit-${MCUtil.slug(label)}" class="edit-btn" ${tooltip} ${onClick}` +
                `src="${WebviewUtil.getIcon(Resources.Icons.Edit)}"/>
        `;
    }

    const secondTd = `<td title="${label}">${secondColTdContents}</td>`;
    const thirdTd = thirdColTdContents ? `<td>${thirdColTdContents}</td>` : "";
    const fourthTd = openable === OpenableTypes.WEB ?
        `
        <td>
            <input type="image" title="Open" src="${WebviewUtil.getIcon(Resources.Icons.OpenExternal)}" onclick="vscOpen('${openable}', '${data}')"/>
        </td>
        `
        : "";

    return `
        <tr class="info-row">
            <td class="info-label">${label}:</td>
            ${secondTd}
            ${thirdTd}
            ${fourthTd}
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
    if (global.isTheia) {
        return `
            </table>
        `;
    }

    let noDebugMsg;
    if (project.connection.isRemote) {
        noDebugMsg = "Remote projects do not support debug.";
    }
    else if (!project.capabilities.supportsDebug) {
        noDebugMsg = `${project.type} projects do not support debug.`;
    }

    if (noDebugMsg) {
        return `
            </table>
            ${noDebugMsg}
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
