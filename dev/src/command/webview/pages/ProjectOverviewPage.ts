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

import Resources from "../../../constants/Resources";
import MCUtil from "../../../MCUtil";
import Project from "../../../codewind/project/Project";
import WebviewUtil from "../WebviewUtil";
import CWDocs from "../../../constants/CWDocs";
import { ProjectOverviewWVMessages } from "../ProjectOverviewPageWrapper";
import { WebviewResourceProvider } from "../WebviewWrapper";

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

const NOT_AVAILABLE = "Not available";
const NOT_RUNNING = "Not running";
const NOT_DEBUGGING = "Not debugging";

export function getProjectOverviewHtml(rp: WebviewResourceProvider, project: Project): string {

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
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${WebviewUtil.getCSP()}

            <link rel="stylesheet" href="${rp.getStylesheet("common.css")}"/>
            <link rel="stylesheet" href="${rp.getStylesheet("project-overview.css")}"/>
            ${global.isTheia ?
                `<link rel="stylesheet" href="${rp.getStylesheet("theia.css")}"/>` : ""}
        </head>
        <body>

        <div class="title-section">
            <img id="logo" alt="Codewind Logo" src="${rp.getIcon(Resources.Icons.Logo)}"/>
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
                ${buildRow(rp, "Type", project.type.toString())}
                ${buildRow(rp, "Language", MCUtil.uppercaseFirstChar(project.language))}
                ${buildRow(rp, "Project ID", project.id)}
                ${buildRow(rp, "Local Path", project.localPath.fsPath, global.isTheia ? undefined : OpenableTypes.FOLDER)}
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
                <tr>
                    <td class="info-label">Inject Appmetrics:</td>
                    <td>
                        <input id="auto-inject-metrics-toggle" type="checkbox" class="btn"
                            onclick="sendMsg('${ProjectOverviewWVMessages.TOGGLE_INJECT_METRICS}')"
                            ${project.injectMetricsEnabled ? "checked" : ""}
                            ${project.type.canInjectMetrics && project.state.isEnabled ? " " : " disabled"}
                        />
                    </td>
                </tr>
                ${buildRow(rp, "Application Status", project.state.getAppStatusWithDetail())}
                ${buildRow(rp, "Build Status", normalize(project.state.getBuildString(), NOT_AVAILABLE))}
                ${buildRow(rp, "Last Image Build", normalizeDate(project.lastImgBuild, NOT_AVAILABLE))}
                ${buildRow(rp, "Last Build", normalizeDate(project.lastBuild, NOT_AVAILABLE))}
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
                    ${buildRow(rp, "Container ID", normalize(project.containerID, NOT_AVAILABLE, 32))}
                </table>`
            }

            <table>
                ${buildRow(rp, "Application Endpoint",
                    normalize(project.appUrl, NOT_RUNNING),
                    (project.appUrl != null ? OpenableTypes.WEB : undefined), true)}
                ${buildRow(rp, "Exposed App Port", normalize(project.ports.appPort, NOT_RUNNING))}
                ${buildRow(rp, "Internal App Port",
                    normalize(project.ports.internalPort, NOT_AVAILABLE),
                    undefined, true)}

                <!-- buildDebugSection must also close the <table> -->
                ${buildDebugSection(rp, project)}
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

function buildRow(rp: WebviewResourceProvider, label: string, data: string, openable?: OpenableTypes, editable: boolean = false): string {
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
                `src="${rp.getIcon(Resources.Icons.Edit)}"/>
        `;
    }

    const secondTd = `<td title="${label}">${secondColTdContents}</td>`;
    const thirdTd = thirdColTdContents ? `<td>${thirdColTdContents}</td>` : "";
    const fourthTd = openable === OpenableTypes.WEB ?
        `
        <td>
            <input type="image" title="Open" src="${rp.getIcon(Resources.Icons.OpenExternal)}" onclick="vscOpen('${openable}', '${data}')"/>
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

function buildDebugSection(rp: WebviewResourceProvider, project: Project): string {
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
        ${buildRow(rp, "Exposed Debug Port", normalize(project.ports.debugPort, NOT_DEBUGGING))}
        ${buildRow(rp, "Internal Debug Port",
            normalize(project.ports.internalDebugPort, NOT_AVAILABLE),
            undefined, true)}
        </table>
    `;
        // ${buildRow(rp, "Debug URL", normalize(project.debugUrl, NOT_DEBUGGING))}
}
