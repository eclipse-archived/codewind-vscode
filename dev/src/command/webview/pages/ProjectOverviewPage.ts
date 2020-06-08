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
import Project from "../../../codewind/project/Project";
import CWDocs from "../../../constants/CWDocs";
import { ThemedImages } from "../../../constants/CWImages";
import MCUtil from "../../../MCUtil";
import { ProjectOverviewWVMessages } from "../ProjectOverviewPageWrapper";
import WebviewUtil, { CommonWVMessages } from "../WebviewUtil";
import { WebviewResourceProvider } from "../WebviewWrapper";
import CWExtensionContext from "../../../CWExtensionContext";

interface RowOptions {
    openable?: "web" | "folder";
    editable?: boolean;
    copyable?: boolean;
}

const NOT_AVAILABLE = "Not available";
const NOT_RUNNING = "Not running";
const NOT_DEBUGGING = "Not debugging";

const ATTR_AUTOBUILD_TOGGLE = "autoBuild";
const ATTR_INJECTION_TOGGLE = "inject-metrics";
const DATA_TABINDEX = "tabindex";

export function getProjectOverviewHtml(rp: WebviewResourceProvider, project: Project): string {
    return `
    <!DOCTYPE html>

    <html>
    ${WebviewUtil.getHead(rp, "project-overview.css")}
    <body>

    <div id="top-section">
        ${WebviewUtil.buildTitleSection(rp, project.name, project.connection.label, project.connection.isRemote)}
    </div>

    <div id="btns-section">
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

    <!--div class="tab-group">
        <div class="tab-btn clickable" data-${DATA_TABINDEX}="1" onclick="onTabClick(this)">
            Summary
        </div>
        <div class="tab-btn clickable" data-${DATA_TABINDEX}="2" onclick="onTabClick(this)">
            Links
        </div>
    </div-->

    <div class="tab-body" data-${DATA_TABINDEX}="1">
        <div class="section-header">
            <h3>Project Information</h3>
        </div>
        <div class="section">
            <table>
                ${buildRow(rp, "Build Type", project.type.toString())}
                ${buildRow(rp, "Language", MCUtil.uppercaseFirstChar(project.language))}
                ${buildRow(rp, "Project ID", project.id, { copyable: true })}
                ${buildRow(rp, "Local Path", getUserFriendlyPath(project), {
                    copyable: true,
                    openable: CWExtensionContext.get().isChe ? undefined : "folder"
                })}
            </table>
        </div>
        <div class="section-header">
            <h3>Project Status</h3>
            <div class="section-header-right">
                <div class="section-header-toggle">
                    Auto Build
                    ${WebviewUtil.getToggleInput(rp, project.autoBuildEnabled, "Toggle Auto Build", ATTR_AUTOBUILD_TOGGLE)}
                </div>
                <div class="section-header-toggle">
                    Inject Appmetrics
                    ${WebviewUtil.getToggleInput(rp, project.isInjectingMetrics, "Toggle Inject Appmetrics", ATTR_INJECTION_TOGGLE)}
                </div>
            </div>
        </div>
        <div class="section">
            <table>
                ${buildRow(rp, "Application Status", normalize(project.state.getAppStatusWithDetail(), NOT_AVAILABLE))}
                ${project.type.isAppsody ? "" : buildRow(rp, "Build Status", normalize(project.state.getBuildString(), NOT_AVAILABLE))}
                ${buildRow(rp, "Last Image Build", normalizeDate(project.lastImgBuild, NOT_AVAILABLE))}
                ${buildRow(rp, "Last Build", normalizeDate(project.lastBuild, NOT_AVAILABLE))}
                ${buildLogsRow(rp, project)}
            </table>
        </div>
        <div class="section-header">
            <h3>Application Information</h3>
            <div id="about-project-settings">
                <a href="${CWDocs.PROJECT_SETTINGS.uri}" title="More Info">More Info</a>
            </div>
        </div>
        <div class="section">
            ${buildContainerPodSection(rp, project)}

            <table>
                ${buildRow(rp, "Application Endpoint", normalize(project.appUrl, NOT_RUNNING), {
                    editable: true,
                    openable: project.appUrl != null ? "web" : undefined,
                    copyable: project.appUrl != null
                })}
                ${buildRow(rp, "Exposed App Port", normalize(project.appPort, NOT_RUNNING), {
                    copyable: project.appPort != null
                })}
                ${buildRow(rp, "Internal App Port", normalize(project.internalPort, NOT_AVAILABLE), {
                    editable: true,
                    copyable: project.internalPort != null
                })}

                <!-- buildDebugSection must also close the <table> -->
                ${buildDebugSection(rp, project)}
            <!-- /table -->
        </div>
    </div>
    <!--div class="tab-body" data-${DATA_TABINDEX}="2">
        <div class="section-header">
            <h3>Project Links</h3>
        </div>
        <div class="section">
            <div class="link-table-header">
                Projects that are targets for ${project.name}
            </div>
            <table class="link-table">

            </table>
        </div>
    </div-->

    <script type="text/javascript">
        const vscode = acquireVsCodeApi();

        ${WebviewUtil.getCopyScript()}

        function onToggle(toggle) {
            const btnID = toggle.getAttribute("${WebviewUtil.ATTR_ID}");
            if (btnID === "${ATTR_AUTOBUILD_TOGGLE}") {
                sendMsg("${ProjectOverviewWVMessages.TOGGLE_AUTOBUILD}");
            }
            else if (btnID === "${ATTR_INJECTION_TOGGLE}") {
                sendMsg("${ProjectOverviewWVMessages.TOGGLE_INJECT_METRICS}");
            }
            else {
                console.error("Unrecognized button ID was toggled: " + btnID);
            }
        }

        function sendMsg(type, data = undefined) {
            // See IWebViewMsg in ProjectOverviewCmd
            vscode.postMessage({ type: type, data: data });
        }

        function onTabClick(tabBtn) {
            tabSwitch(tabBtn.dataset.${DATA_TABINDEX});
        }

        function tabSwitch(tabIndex) {
            if (typeof tabIndex === "string") {
                tabIndex = Number(tabIndex);
            }

            Array.from(document.querySelectorAll(".tab-body"))
            .forEach((tabBody) => {
                const newDisplay = tabBody.dataset.${DATA_TABINDEX} == tabIndex ? "block" : "none";
                tabBody.style.display = newDisplay;
            });

            Array.from(document.querySelectorAll(".tab-btn"))
            .forEach((tabBtn) => {
                if (tabBtn.dataset.${DATA_TABINDEX} == tabIndex) {
                    tabBtn.classList.add("selected");
                }
                else {
                    tabBtn.classList.remove("selected");
                }
            });

            vscode.setState({ selectedTabIndex: tabIndex });
        }

        (function() {
            const state = vscode.getState();
            let selectedTabIndex = 1;
            if (state && state.selectedTabIndex) {
                selectedTabIndex = state.selectedTabIndex;
                console.log("Loaded selected tab state " + selectedTabIndex);
            }
            tabSwitch(selectedTabIndex);
        })();

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

    let onContextMenu = "";
    let titleValue = label;
    if (options.copyable) {
        // right-clicking the element copies its value
        onContextMenu = `oncontextmenu="copy(event, '${data}', '${label}')"`;
        titleValue += " (Right click to copy)";
    }

    if (options.openable) {
        let classAttr: string  = "";
        // let href: string = "";
        let onclick: string = "";
        if (options.openable === "web") {
            // href = `href="${data}"`;
            classAttr = `class="url"`;
            onclick = `onclick="sendMsg('${CommonWVMessages.OPEN_WEBLINK}', '${data}')"`;
        }
        else {
            // it is a folder
            const folderPath: string = WebviewUtil.getEscapedPath(data);
            onclick = `onclick="sendMsg('${ProjectOverviewWVMessages.OPEN_FOLDER}', '${folderPath}')"`;
        }
        secondColTdContents += `<a title="${titleValue}" ${classAttr} ${onclick} ${onContextMenu}>${data}</a>`;
    }
    else {
        secondColTdContents = `<span title="${titleValue}" ${onContextMenu}>${data}</span>`;
    }

    const noPossibleActionBtns = 2;
    let actionBtns = [];

    if (options.editable) {
        const tooltip = `title="Edit Project Settings"`;
        const onClick = `onclick="sendMsg('${ProjectOverviewWVMessages.EDIT}')"`;

        actionBtns.push(`
            <input type="image" id="edit-${MCUtil.slug(label)}" class="edit-btn" ${tooltip} ${onClick} src="${rp.getImage(ThemedImages.Edit)}"/>
        `);
    }

    if (options.openable === "web") {
        // add an 'open' button if this row's data is a web link
        actionBtns.push(`
            <a title="${data}" onclick="sendMsg('${CommonWVMessages.OPEN_WEBLINK}', '${data}')">
                <input type="image" title="Open ${data}" alt="Open" src="${rp.getImage(ThemedImages.Launch)}"/>
            </a>
        `);
    }

    while (actionBtns.length < noPossibleActionBtns) {
        actionBtns.unshift("");
    }

    actionBtns = actionBtns.map((btn) => {
        return `<td class="btn-cell">
            ${btn}
        </td>`;
    });

    const secondTd = `<td>${secondColTdContents}</td>`;

    return `
        <tr class="info-row">
            <td class="info-label">${label}:</td>
            ${secondTd}
            ${actionBtns.join("\n")}
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
    else if (item instanceof vscode.Uri && item.scheme.includes("file")) {
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

function normalizeDate(d: Date | undefined, fallback: string): string {
    if (d != null && MCUtil.isGoodDate(d)) {
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

function buildLogsRow(rp: WebviewResourceProvider, project: Project): string {
    const logs = project.logManager.logs;
    let logsText;
    if (logs.length > 0) {
        logsText = project.logManager.logs.map((log) => {
            return `<a onclick="sendMsg('${ProjectOverviewWVMessages.OPEN_LOG}', '${log.logName}')" title="Click to reveal">${log.logName}</a>`;
        }).join(", ");
    }
    else {
        logsText = "No logs available";
        if (project.state.isEnabled) {
            logsText += " - Wait for the project to build and start";
        }
    }

    const manageLogsBtnClass = project.state.isEnabled ? "" : "not-allowed";
    const manageLogsBtnOnClick = project.state.isEnabled ? `sendMsg('${ProjectOverviewWVMessages.MANAGE_LOGS}')` : "";
    const manageLogsBtnTitle = project.state.isEnabled ? "Manage Logs" : "The project is Disabled";

    return `
        <tr class="info-row">
            <td class="info-label">Project Logs:</td>
            <td>${logsText}</td>
            <td>
                <div id="manage-logs-btn" onclick="${manageLogsBtnOnClick}" class="btn btn-background">
                    Manage Logs
                    <input type="image"
                        class="${manageLogsBtnClass}" title="${manageLogsBtnTitle}" alt="Manage Logs" src="${rp.getImage(ThemedImages.Filter)}"
                    />
                </div>
            </td>
        </tr>
    `;
}

function buildContainerPodSection(rp: WebviewResourceProvider, project: Project): string {
    if (project.connection.isKubeConnection) {
        return `
        <table>
            ${buildRow(rp, "Namespace", normalize(project.namespace, NOT_AVAILABLE), { copyable: project.namespace != null })}
            ${buildRow(rp, "Pod Name", normalize(project.podName, NOT_AVAILABLE), { copyable: project.podName != null })}
        </table>`;
    }
    else {
        return `
        <table>
            ${buildRow(rp, "Container ID", normalize(project.containerID, NOT_AVAILABLE, 32), { copyable: project.containerID != null })}
        </table>`;
    }
}

function buildDebugSection(rp: WebviewResourceProvider, project: Project): string {
    if (CWExtensionContext.get().isChe) {
        return `
            </table>
        `;
    }

    let noDebugMsg;
    if (project.capabilities && !project.capabilities.supportsDebug) {
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

    // Either the port forward row or the exposed port row is shown, but not both.
    let portForwardInfoRow = "";
    let exposedDebugPortRow = "";
    if (project.connection.isRemote) {
        let portForwardStatus;
        if (project.isPortForwarding) {
            portForwardStatus = `Forwarding <b>${project.debugUrl}</b> to <b>${project.podName}:${project.internalDebugPort}</b>`
        }
        else {
            portForwardStatus = "Inactive";
        }

        portForwardInfoRow = buildRow(rp, "Debug Port Forward", portForwardStatus);
    }
    else {
        exposedDebugPortRow = buildRow(rp, "Exposed Debug Port", normalize(project.exposedDebugPort, NOT_DEBUGGING), {
            copyable: project.exposedDebugPort != null
        });
    }

    return `
        ${exposedDebugPortRow}
        ${buildRow(rp, "Internal Debug Port", normalize(project.internalDebugPort, NOT_AVAILABLE), {
            editable: true,
            copyable: project.internalDebugPort != null
        })}
        ${portForwardInfoRow}
        </table>
    `;
        // ${buildRow(rp, "Debug URL", normalize(project.debugUrl, NOT_DEBUGGING))}
}
