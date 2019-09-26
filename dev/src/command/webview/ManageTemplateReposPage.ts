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

import Resources from "../../constants/Resources";
// import MCUtil from "../../MCUtil";
import WebviewUtil from "./WebviewUtil";
import { ITemplateRepo, ManageReposWVMessages } from "../connection/ManageTemplateReposCmd";

const REPO_ID_ATTR = "data-id";
const REPO_ENABLED_ATTR = "data-enabled";
const REPO_TOGGLE_CLASS = "repo-toggle";
export const LEARN_MORE_LINK = "learn-more-placeholder";

export default function getManageReposPage(repos: ITemplateRepo[]): string {
    return `
    <!DOCTYPE html>

    <html>
    <head>
        <meta charset="UTF-8">

        ${global.isTheia ? "" : `
        <meta http-equiv="Content-Security-Policy"
            content="default-src 'none'; img-src vscode-resource: https:; script-src vscode-resource: 'unsafe-inline'; style-src vscode-resource:;"
        >`}
        <meta name="viewport" content="width=device-width, initial-scale=1.0">

        <link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("repos-table.css")}"/>
        <link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("common.css")}"/>
        ${global.isTheia ?
            `<link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("theia.css")}"/>` : ""}
        <!--link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("theia.css")}"/-->
    </head>
    <body>

    <div id="table-wrapper">
        <div id="top-section">
            <div id="title">
                <img id="logo" alt="Codewind Logo" src="${WebviewUtil.getIcon(Resources.Icons.Logo)}"/>
                <h1>Template Source Manager</h1>
            </div>
            <div tabindex="0" id="learn-more-btn" class="btn toolbar-btn" onclick="sendMsg('${ManageReposWVMessages.HELP}')">
                Learn More<img alt="Learn More" src="${WebviewUtil.getIcon(Resources.Icons.Help)}"/>
            </div>
        </div>

        <div id="toolbar">
            <!--div class="btn toolbar-btn" onclick="onEnableAllOrNone(event, true)">
                Enable All<img alt="Enable All" src="${WebviewUtil.getIcon(Resources.Icons.Play)}"/>
            </div-->
            <div id="toolbar-right-buttons">
                <div tabindex="0" class="btn toolbar-btn" onclick="sendMsg('${ManageReposWVMessages.REFRESH}')">
                    Refresh<img alt="Refresh" src="${WebviewUtil.getIcon(Resources.Icons.Refresh)}"/>
                </div>
                <div tabindex="0" id="add-repo-btn" class="toolbar-btn btn btn-w-background" onclick="sendMsg('${ManageReposWVMessages.ADD_NEW}')">
                    Add New<img alt="Add New" src="${WebviewUtil.getIcon(Resources.Icons.New)}"/>
                </div>
            </div>
        </div>

        ${buildTemplateTable(repos)}
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // function onEnableAllOrNone(event, isSelectAll) {
        //     const repos = Array.from(document.getElementsByClassName("${REPO_TOGGLE_CLASS}"))
        //     .map((toggleBtn) => {
        //         return getRepoEnablementObj(toggleBtn);
        //     });
        //     sendMsg("${ManageReposWVMessages.ENABLE_DISABLE}", { repos });
        // }

        function onToggleRepo(toggleBtn) {

            // update the enable attr, and switch the toggle image
            const newEnablement = toggleBtn.getAttribute("${REPO_ENABLED_ATTR}") != "true";
            toggleBtn.setAttribute("${REPO_ENABLED_ATTR}", newEnablement);

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

            sendMsg("${ManageReposWVMessages.ENABLE_DISABLE}", { repos: [ getRepoEnablementObj(toggleBtn) ] });
        }

        /**
         * Generate data field to pass back in IRepoEnablementEvent (see ManageTemplateReposCmd)
         */
        function getRepoEnablementObj(toggleBtn) {
            const repoID = toggleBtn.getAttribute("${REPO_ID_ATTR}");
            const enable = toggleBtn.getAttribute("${REPO_ENABLED_ATTR}") == "true";
            return {
                repoID,
                enable,
            };
        }

        function deleteRepo(repoDeleteBtn) {
            const repoID = repoDeleteBtn.getAttribute("${REPO_ID_ATTR}");
            sendMsg("${ManageReposWVMessages.DELETE}", repoID);
        }

        function sendMsg(type, data = undefined) {
            // See IWebViewMsg in ManageTemplateReposCmd
            const msg = { type: type, data: data };
            // console.log("Send message " + JSON.stringify(msg));
            vscode.postMessage(msg);
        }
    </script>

    </body>
    </html>
    `;
}

function buildTemplateTable(repos: ITemplateRepo[]): string {

    const repoRows = repos.map(buildRepoRow);

    return `
    <table>
        <colgroup>
            <col id="name-col"/>
            <col id="style-col"/>
            <col id="descr-col"/>
            <col id="status-col"/>
            <col id="delete-col"/>
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

function buildRepoRow(repo: ITemplateRepo): string {
    const repoName = repo.name ? repo.name : "No name available";
    return `
    <tr>
        <td class="name-cell"><a href="${repo.url}">${repoName}</a></td>
        <td class="style-cell">${repo.projectStyles.join(", ")}</td-->
        <td class="descr-cell">${repo.description}</td>
        ${getStatusToggleTD(repo)}
        ${getDeleteBtnTD(repo)}
    </tr>
    `;
}

function getStatusToggleTD(repo: ITemplateRepo): string {
    return `<td class="repo-toggle-cell">
        <input type="image" alt="${getStatusToggleAlt(repo.enabled)}" ${REPO_ID_ATTR}="${repo.url}" ${REPO_ENABLED_ATTR}="${repo.enabled}"
            class="${REPO_TOGGLE_CLASS} btn" src="${getStatusToggleIconSrc(repo.enabled)}" onclick="onToggleRepo(this)"/>
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

function getDeleteBtnTD(repo: ITemplateRepo): string {
    let title = "Delete";
    let deleteBtnClass = "btn delete-btn";
    let onClick = "deleteRepo(this)";
    if (repo.protected) {
        deleteBtnClass += " not-allowed";
        title = "This source cannot be deleted.";
        onClick = "";
    }

    const deleteBtn = `<input type="image" ${REPO_ID_ATTR}="${repo.url}" alt="Delete ${repo.description}" title="${title}"
        onclick="${onClick}" class="${deleteBtnClass}" src="${WebviewUtil.getIcon(Resources.Icons.Trash)}"/>`;

    return `
    <td class="delete-btn-cell">
        ${deleteBtn}
    </td>`;
}
