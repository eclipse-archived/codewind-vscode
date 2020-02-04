/*******************************************************************************
 * Copyright (c) 2018, 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import { ThemedImages } from "../../../constants/CWImages";
import MCUtil from "../../../MCUtil";
import Project from "../../../codewind/project/Project";
import WebviewUtil from "../WebviewUtil";
import CWDocs from "../../../constants/CWDocs";
import { ProjectOverviewWVMessages } from "../ProjectOverviewPageWrapper";
import { WebviewResourceProvider } from "../WebviewWrapper";

interface RowOptions {
    openable?: "web" | "folder";
    editable?: boolean;
    copyable?: boolean;
}

const NOT_AVAILABLE = "Not available";
const NOT_RUNNING = "Not running";
const NOT_DEBUGGING = "Not debugging";

export function getProjectOverviewHtml(rp: WebviewResourceProvider, project: Project): string {
    return `
    <!DOCTYPE html>

    <html>
    ${WebviewUtil.getHead(rp, "project-overview.css")}
    <body>

    ${WebviewUtil.buildTitleSection(rp, project.name, project.connection.label, project.connection.isRemote)}

    <div id="main">
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
                ${buildRow(rp, "Local Path", getUserFriendlyPath(project), { openable: global.isTheia ? undefined : "folder"})}
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
                ${buildRow(rp, "Application Status", normalize(project.state.getAppStatusWithDetail(), NOT_AVAILABLE))}
                ${buildRow(rp, "Build Status", normalize(project.state.getBuildString(), NOT_AVAILABLE))}
                ${buildRow(rp, "Last Image Build", normalizeDate(project.lastImgBuild, NOT_AVAILABLE))}
                ${buildRow(rp, "Last Build", normalizeDate(project.lastBuild, NOT_AVAILABLE))}
            </table>
        </div>
        <div class="section">
            <div id="app-info-header-section">
                <h3>Application Information</h3>
                <div id="about-project-settings">
                    <a href="${CWDocs.getDocLink(CWDocs.PROJECT_SETTINGS)}" title="More Info">More Info</a>
                </div>
            </div>
            <!-- Hide Container ID when it doesn't apply -->
            ${project.connection.isKubeConnection ? "" : `
                <table>
                    ${buildRow(rp, "Container ID", normalize(project.containerID, NOT_AVAILABLE, 32))}
                </table>`
            }

            <table>
                ${buildRow(rp, "Application Endpoint", normalize(project.appUrl, NOT_RUNNING), {
                    editable: true,
                    openable: project.appUrl != null ? "web" : undefined
                })}
                ${buildRow(rp, "Exposed App Port", normalize(project.ports.appPort, NOT_RUNNING))}
                ${buildRow(rp, "Internal App Port",
                    normalize(project.ports.internalPort, NOT_AVAILABLE),
                    { editable: true })
                }

                <!-- buildDebugSection must also close the <table> -->
                ${buildDebugSection(rp, project)}
            <!-- /table -->
        </div>
    <!-- end main -->
    </div>

    <script type="text/javascript">
        const vscode = acquireVsCodeApi();

        function sendMsg(type, data = undefined) {
            // See IWebViewMsg in ProjectOverviewCmd
            vscode.postMessage({ type: type, data: data });
        }
    </script>

    </body>
    </html>
    `;
}

function getUserFriendlyPath(project: Project): string {
    const fsPath = project.localPath.fsPath;
    if (MCUtil.getOS() === "windows") {
        // uppercase drive letter
        return MCUtil.uppercaseFirstChar(fsPath);
    }
    return fsPath;
}

const DEFAULT_ROW_OPTIONS: RowOptions = {
    copyable: false,
    editable: false,
    openable: undefined,
};

function buildRow(rp: WebviewResourceProvider, label: string, data: string, options: RowOptions = DEFAULT_ROW_OPTIONS): string {
    let secondColTdContents: string = "";
    let thirdColTd: string = "";
    let fourthColTd: string = "";

    if (options.openable) {
        let classAttr: string  = "";
        let href: string = "";
        let onclick: string = "";
        if (options.openable === "web") {
            href = `href="${data}"`;
            classAttr = `class="url"`;
        }
        else {
            // it is a folder
            const folderPath: string = WebviewUtil.getEscapedPath(data);
            onclick = `onclick="sendMsg('${ProjectOverviewWVMessages.OPEN_FOLDER}', '${folderPath}')"`;
        }
        secondColTdContents += `<a title="${label}" ${classAttr} ${href} ${onclick}>${data}</a>`;
    }
    else {
        secondColTdContents = `${data}`;
    }

    if (options.editable) {
        const tooltip = `title="Edit Project Settings"`;
        const onClick = `onclick="sendMsg('${ProjectOverviewWVMessages.EDIT}')"`;

        thirdColTd = `
            <td class="btn-cell">
                <input type="image" id="edit-${MCUtil.slug(label)}" class="edit-btn" ${tooltip} ${onClick} src="${rp.getImage(ThemedImages.Edit)}"/>
            </td>
        `;
    }

    if (options.openable === "web") {
        // add an 'open' button if this row's data is a web link
        fourthColTd = `
            <td class="btn-cell">
                <a href="${data}">
                    <input type="image" title="Open" src="${rp.getImage(ThemedImages.Launch)}"/>
                </a>
            </td>
        `;
    }

    const secondTd = `<td title="${label}">${secondColTdContents}</td>`;

    return `
        <tr class="info-row">
            <td class="info-label">${label}:</td>
            ${secondTd}
            ${thirdColTd}
            ${fourthColTd}
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
    else if (project.capabilities && !project.capabilities.supportsDebug) {
        if (project.type.isExtensionType) {
            noDebugMsg = `This project does not support debug.`;
        }
        else {
            noDebugMsg = `${project.type} projects do not support debug.`;
        }
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
            normalize(project.ports.internalDebugPort, NOT_AVAILABLE), { editable: true })}
        </table>
    `;
        // ${buildRow(rp, "Debug URL", normalize(project.debugUrl, NOT_DEBUGGING))}
}
