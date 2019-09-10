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
import { IRawTemplateRepo, ManageReposWVMessages } from "../connection/ManageTemplateReposCmd";

const REPO_ID_ATTR = "data-id";
const REPO_ENABLED_ATTR = "data-enabled";
const REPO_TOGGLE_CLASS = "repo-toggle";
export const LEARN_MORE_LINK = "learn-more-placeholder";

export default function getManageReposPage(repos: IRawTemplateRepo[]): string {
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
            <div id="learn-more-btn" class="btn toolbar-btn" onclick="sendMsg('${ManageReposWVMessages.HELP}')">
                Learn More<img alt="Learn More" src="${WebviewUtil.getIcon(Resources.Icons.Help)}"/>
            </div>
        </div>

        <div id="toolbar">
            <!--div class="btn toolbar-btn" onclick="onEnableAllOrNone(event, true)">
                Enable All<img alt="Enable All" src="${WebviewUtil.getIcon(Resources.Icons.Play)}"/>
            </div-->
            <div id="toolbar-right-buttons">
                <div class="btn toolbar-btn" onclick="sendMsg('${ManageReposWVMessages.REFRESH}')">
                    Refresh<img alt="Refresh" src="${WebviewUtil.getIcon(Resources.Icons.Refresh)}"/>
                </div>
                <div id="add-repo-btn" class="toolbar-btn btn btn-w-background" onclick="sendMsg('${ManageReposWVMessages.ADD_NEW}')">
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

            let newToggleImg;
            if (newEnablement) {
                newToggleImg = "${getStatusToggleIconSrc(true)}";
            }
            else {
                newToggleImg = "${getStatusToggleIconSrc(false)}";
            }
            toggleBtn.src = newToggleImg;

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

function buildTemplateTable(repos: IRawTemplateRepo[]): string {

    const repoRows = repos.map(buildRepoRow);

    return `
    <table>
        <colgroup>
            <col id="status-col"/>
            <col id="descr-col"/>
            <col id="source-col"/>
            <col id="delete-col"/>
        </colgroup>
        <thead>
            <tr>
                <td>Enabled</td>
                <!--td>Repo Name</td-->
                <!--td>Style</td-->
                <td>Description</td>
                <td>Link</td>
                <td></td>        <!-- Delete buttons column -->
            </tr>
        </thead>
        <tbody>
            ${repoRows.join("")}
        </tbody>
    </table>
    `;
}

function buildRepoRow(repo: IRawTemplateRepo): string {
    return `
    <tr>
        ${getStatusToggleTD(repo)}
        <!--td class="name-cell">${repo.name}</td-->
        <!--td class="style-cell">${"????????, ".repeat(2)}</td-->
        <td class="descr-cell">${repo.description}</td>
        <td class="source-cell"><a href="${repo.url}">Source</a></td>
        ${getDeleteBtnTD(repo)}
    </tr>
    `;
}

function getStatusToggleTD(repo: IRawTemplateRepo): string {
    return `<td class="repo-toggle-cell">
        <img ${REPO_ID_ATTR}="${repo.url}" ${REPO_ENABLED_ATTR}="${repo.enabled}" class="${REPO_TOGGLE_CLASS} btn"
            src="${getStatusToggleIconSrc(repo.enabled)}" onclick="onToggleRepo(this)"/>
    </td>`;
}

function getStatusToggleIconSrc(enabled: boolean): string {
    return WebviewUtil.getIcon(enabled ? Resources.Icons.ToggleOn : Resources.Icons.ToggleOff);
}

function getDeleteBtnTD(repo: IRawTemplateRepo): string {
    let title = "Delete";
    let deleteBtnClass = "btn delete-btn";
    let onClick = "deleteRepo(this)";
    if (repo.protected) {
        deleteBtnClass += " not-allowed";
        title = "This source cannot be deleted.";
        onClick = "";
    }

    const deleteBtn = `<img ${REPO_ID_ATTR}="${repo.url}" alt="Delete" title="${title}" onclick="${onClick}" class="${deleteBtnClass}"
        src="${WebviewUtil.getIcon(Resources.Icons.Trash)}"/>`;

    return `
    <td class="delete-btn-cell">
        ${deleteBtn}
    </td>`;
}
