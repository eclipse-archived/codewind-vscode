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
import { IRawTemplateRepo } from "../connection/ManageTemplateReposCmd";

export enum ManageReposWVMessages {
    ADD_NEW = "add-new",
    DELETE = "delete",
    HELP = "help",
    REFRESH = "refresh",
}

const REPO_ID_ATTR_NAME = "data-id";

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
        ${global.isTheia ?
            `<link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("theia.css")}"/>` : ""}
    </head>
    <body>

    <div id="main">
        <div id="top-section">
            <img id="logo" src="${WebviewUtil.getIcon(Resources.Icons.Logo)}"/>
            <h2>Template Repositories</h2>
            <div id="right-icons">
                <img class="right-icon" src="${WebviewUtil.getIcon(Resources.Icons.Refresh)}" onclick="sendMsg('${ManageReposWVMessages.REFRESH}')"/>
                <img class="right-icon" src="${WebviewUtil.getIcon(Resources.Icons.Help)}" onclick="sendMsg('${ManageReposWVMessages.HELP}')"/>
            </div>
        </div>

        ${buildTemplateTable(repos)}

        <input id="add-repo-btn" type="button" onclick="sendMsg('${ManageReposWVMessages.ADD_NEW}')" class="btn" value="Add New"/>
    </div>

    <script type="text/javascript">
        const vscode = acquireVsCodeApi();

        function deleteRepo(repoDeleteBtn) {
            const repoID = repoDeleteBtn.getAttribute('${REPO_ID_ATTR_NAME}');
            sendMsg('${ManageReposWVMessages.DELETE}', { value: repoID });
        }

        function sendMsg(type, data = undefined) {
            // See IWebViewMsg in ManageTemplateReposCmd
            vscode.postMessage({ type: type, data: data });
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
        <!--tr class="title-row">
            <td></td>
            <td id="name-title" class="title-cell">Name</td>
            <td id="desc-title" class="title-cell">Description</td>
            <td class="title-cell"></td>
        </tr-->
        ${repoRows.join("")}
    </table>
    `;
}

function buildRepoRow(repo: IRawTemplateRepo): string {
    return `
    <tr>
        <td class="enabled-checkbox-cell">
            <input style="text-align: center; vertical-align: middle;" center id="repo-enabled-toggle" type="checkbox" class="btn"
                ${repo.enabled ? "checked" : ""}
            />
        </td>
        <td class="name-cell">${repo.name}</td>
        <td class="descr-cell">${repo.description}</td>
        <td class="source-cell"><a href="${repo.url}">Source</a></td>
        <td class="delete-btn-cell">
            <input ${REPO_ID_ATTR_NAME}="${repo.url}" class="red-btn btn" type="button" onclick="deleteRepo(this)" class="btn" value="Delete"/>
        </td>
    </tr>
    `;
}
