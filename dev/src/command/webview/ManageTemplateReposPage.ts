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
import { IRawTemplateRepo, ManageReposWVMessages, REPOS_PAGE_TITLE } from "../connection/ManageTemplateReposCmd";

const REPO_ID_ATTR_NAME = "data-id";
const REPO_CHECKBOX_CLASS = "repo-toggle";
export const LEARN_MORE_LINK = "learn-more-placeholder";

export default function getManageReposPage(repos: IRawTemplateRepo[]): string {
    return `
    <!DOCTYPE html>

    <html>
    <head>
        <meta charset="UTF-8">
        <!--meta http-equiv="Content-Security-Policy" content="default-src 'self' ;"-->
        <meta name="viewport" content="width=device-width, initial-scale=1.0">

        <link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("common.css")}"/>
        <link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("repos-table.css")}"/>
        <!--${global.isTheia ?
            `<link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("theia.css")}"/>` : ""}-->
        <link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("theia.css")}"/>
    </head>
    <body>

    <div id="main">
        <div id="top-section">
            <img id="logo" alt="Codewind Logo" src="${WebviewUtil.getIcon(Resources.Icons.Logo)}"/>
            <h2>${REPOS_PAGE_TITLE}</h2>
        </div>

        <div id="toolbar">
            <div class="btn toolbar-btn" onclick="onSelectAllOrNone(event, true)">
                <input type="checkbox" class="btn" checked/>Select All
            </div>
            <div class="btn toolbar-btn" onclick="onSelectAllOrNone(event, false)">
                <input type="checkbox" class="btn"/>Select None
            </div>
            <div class="btn toolbar-btn" onclick="sendMsg('${ManageReposWVMessages.REFRESH}')">
                <img alt="Refresh" src="${WebviewUtil.getIcon(Resources.Icons.Refresh)}"/>Refresh
            </div>
            <div class="btn toolbar-btn" onclick="sendMsg('${ManageReposWVMessages.HELP}')">
                <img alt="Learn More" src="${WebviewUtil.getIcon(Resources.Icons.Help)}"/>Learn More
            </div>
            <input id="add-repo-btn" class="btn btn-w-background"
                type="button" onclick="sendMsg('${ManageReposWVMessages.ADD_NEW}')" class="btn" value="Add New"/>

        </div>

        ${buildTemplateTable(repos)}
    </div>

    <script type="text/javascript">
        const vscode = acquireVsCodeApi();

        function onSelectAllOrNone(event, isSelectAll) {
            event.preventDefault();
            const repos = Array.from(document.getElementsByClassName("${REPO_CHECKBOX_CLASS}"))
            .map((checkbox) => {
                console.log("Disable " + JSON.stringify(checkbox));
                checkbox.checked = isSelectAll;
                return getRepoEnablementObj(checkbox);
            });
            sendMsg("${ManageReposWVMessages.ENABLE_DISABLE}", { repos });
        }

        function onToggleRepo(checkbox) {
            sendMsg("${ManageReposWVMessages.ENABLE_DISABLE}", { repos: [ getRepoEnablementObj(checkbox) ] })
        }

        /**
         * Generate data field to pass back in IRepoEnablementEvent (see ManageTemplateReposCmd)
         */
        function getRepoEnablementObj(checkbox) {
            const repoID = checkbox.getAttribute("${REPO_ID_ATTR_NAME}");
            return {
                repoID,
                enable: checkbox.checked,
            };
        }

        function deleteRepo(repoDeleteBtn) {
            const repoID = repoDeleteBtn.getAttribute("${REPO_ID_ATTR_NAME}");
            sendMsg("${ManageReposWVMessages.DELETE}", { value: repoID });
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
        <thead>
            <tr>
                <td></td>
                <td>Repo Name</td>
                <td>Style</td>
                <td>Description</td>
                <td>Link</td>
                <td class="no-border"></td>        <!-- Delete buttons column -->
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
        <td class="repo-toggle-cell">
            <input ${REPO_ID_ATTR_NAME}="${repo.url}" class="${REPO_CHECKBOX_CLASS}" type="checkbox" class="btn" ${repo.enabled ? "checked" : ""}
            onclick="onToggleRepo(this)"/>
        </td>
        <td class="name-cell">${repo.name}</td>
        <td class="style-cell">${"????????, ".repeat(2)}</td>
        <td class="descr-cell">${repo.description}</td>
        <td class="source-cell"><a href="${repo.url}">Source</a></td>
        <td class="delete-btn-cell no-border">
            <input ${REPO_ID_ATTR_NAME}="${repo.url}" class="red-btn btn" type="button" onclick="deleteRepo(this)" class="btn" value="Delete"/>
        </td>
    </tr>
    `;
}
