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

// import * as vscode from "vscode";

import Resources from "../../../constants/Resources";
// import MCUtil from "../../MCUtil";
import WebviewUtil from "../WebviewUtil";
import { ITemplateSource, ManageSourcesWVMessages } from "../SourcesPageWrapper";

const SOURCE_ID_ATTR = "data-id";
const SOURCE_ENABLED_ATTR = "data-enabled";

export default function getManageSourcesPage(connectionLabel: string, sources: ITemplateSource[]): string {
    return `
    <!DOCTYPE html>

    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${WebviewUtil.getCSP()}

        <link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("sources-registries-tables.css")}"/>
        <link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("common.css")}"/>
        ${global.isTheia ?
            `<link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("theia.css")}"/>` : ""}
    </head>
    <body>

    <div id="top-section">
        <div class="title-section title-section-subtitled">
            <img id="logo" alt="Codewind Logo" src="${WebviewUtil.getIcon(Resources.Icons.Logo)}"/>
            <div>
                <h1 id="title">Template Sources</h1>
                <h2 id="subtitle">${connectionLabel}</h2>
            </div>
        </div>
        <div tabindex="0" id="learn-more-btn" class="btn" onclick="sendMsg('${ManageSourcesWVMessages.HELP}')">
            Learn More<img alt="Learn More" src="${WebviewUtil.getIcon(Resources.Icons.Help)}"/>
        </div>
    </div>

    <div id="toolbar">
        <!--div class="btn" onclick="onEnableAllOrNone(event, true)">
            Enable All<img alt="Enable All" src="${WebviewUtil.getIcon(Resources.Icons.Play)}"/>
        </div-->
        <div id="toolbar-right-buttons">
            <div tabindex="0" class="btn btn-background" onclick="sendMsg('${ManageSourcesWVMessages.REFRESH}')">
                Refresh<img alt="Refresh" src="${WebviewUtil.getIcon(Resources.Icons.Refresh)}"/>
            </div>
            <div tabindex="0" id="add-btn" class="btn btn-prominent" onclick="sendMsg('${ManageSourcesWVMessages.ADD_NEW}')">
                Add New<img alt="Add New" src="${WebviewUtil.getIcon(Resources.Icons.New)}"/>
            </div>
        </div>
    </div>

    ${buildTemplateTable(sources)}

    <script>
        const vscode = acquireVsCodeApi();

        function onToggleSource(toggleBtn) {
            // update the enable attr, and switch the toggle image
            const newEnablement = toggleBtn.getAttribute("${SOURCE_ENABLED_ATTR}") != "true";
            toggleBtn.setAttribute("${SOURCE_ENABLED_ATTR}", newEnablement);

            let newToggleImg, newToggleAlt;
            if (newEnablement) {
                newToggleImg = "${getStatusToggleIconSrc(true, true)}";
                newToggleAlt = "${getStatusToggleAlt(true)}";
            }
            else {
                newToggleImg = "${getStatusToggleIconSrc(false, true)}";
                newToggleAlt = "${getStatusToggleAlt(false)}";
            }
            toggleBtn.src = newToggleImg;
            toggleBtn.alt = newToggleAlt;

            sendMsg("${ManageSourcesWVMessages.ENABLE_DISABLE}", { repos: [ getRepoEnablementObj(toggleBtn) ] });
        }

        /**
         * Generate data field to pass back in IRepoEnablementEvent (see ManageTemplateReposCmd)
         */
        function getRepoEnablementObj(toggleBtn) {
            const repoID = toggleBtn.getAttribute("${SOURCE_ID_ATTR}");
            const enable = toggleBtn.getAttribute("${SOURCE_ENABLED_ATTR}") == "true";
            return {
                repoID,
                enable,
            };
        }

        function deleteRepo(repoDeleteBtn) {
            const repoID = repoDeleteBtn.getAttribute("${SOURCE_ID_ATTR}");
            sendMsg("${ManageSourcesWVMessages.DELETE}", repoID);
        }

        function sendMsg(type, data = undefined) {
            const msg = { type: type, data: data };
            // console.log("Send message " + JSON.stringify(msg));
            vscode.postMessage(msg);
        }
    </script>

    </body>
    </html>
    `;
}

function buildTemplateTable(sources: ITemplateSource[]): string {

    const repoRows = sources.map(buildRow);

    return `
    <table>
        <colgroup>
            <col id="name-col"/>
            <col id="style-col"/>
            <col id="descr-col"/>
            <col id="status-col"/>
            <col class="btn-col"/>
        </colgroup>
        <thead>
            <tr>
                <td>Name</td>
                <td>Style</td>
                <td>Description</td>
                <td>Enabled</td>
                <td></td>        <!-- Delete buttons column -->
            </tr>
        </thead>
        <tbody>
            ${repoRows.join("")}
        </tbody>
    </table>
    `;
}

function buildRow(source: ITemplateSource): string {
    const name = source.name || "No name available";
    const descr = source.description || "No description available";
    return `
    <tr>
        <td class="name-cell"><a href="${source.url}">${name}</a></td>
        <td class="style-cell">${source.projectStyles.join(", ")}</td-->
        <td class="descr-cell">${descr}</td>
        ${getStatusToggleTD(source)}
        ${getDeleteBtnTD(source)}
    </tr>
    `;
}

function getStatusToggleTD(source: ITemplateSource): string {
    return `<td class="btn-cell">
        <input type="image" alt="${getStatusToggleAlt(source.enabled)}" ${SOURCE_ID_ATTR}="${source.url}" ${SOURCE_ENABLED_ATTR}="${source.enabled}"
            class="source-toggle btn" src="${getStatusToggleIconSrc(source.enabled)}" onclick="onToggleSource(this)"/>
    </td>`;
}

function getStatusToggleAlt(enabled: boolean): string {
    return enabled ? `Disable source` : `Enable source`;
}

function getStatusToggleIconSrc(enabled: boolean, escapeBackslash: boolean = false): string {
    let toggleIcon = WebviewUtil.getIcon(enabled ? Resources.Icons.ToggleOnThin : Resources.Icons.ToggleOffThin);
    if (escapeBackslash) {
        // The src that gets pulled directly into the frontend JS (for when the button is toggled) requires an extra escape on Windows
        // https://github.com/eclipse/codewind/issues/476
        toggleIcon = toggleIcon.replace(/\\/g, "\\\\");
    }
    return toggleIcon;
}

function getDeleteBtnTD(source: ITemplateSource): string {
    let title = "Delete";
    let deleteBtnClass = "btn";
    let onClick = "deleteRepo(this)";
    if (source.protected) {
        deleteBtnClass += " not-allowed";
        title = "This source cannot be deleted.";
        onClick = "";
    }

    const deleteBtn = `<input type="image" ${SOURCE_ID_ATTR}="${source.url}" alt="Delete ${source.description}" title="${title}"
        onclick="${onClick}" class="${deleteBtnClass}" src="${WebviewUtil.getIcon(Resources.Icons.Trash)}"/>`;

    return `
    <td class="btn-cell">
        ${deleteBtn}
    </td>`;
}
