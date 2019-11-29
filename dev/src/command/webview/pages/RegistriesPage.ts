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

// This looks awfully similar to ManageTemplateReposPage.ts ...

// import * as vscode from "vscode";

import Resources from "../../../constants/Resources";
import WebviewUtil from "../WebviewUtil";
import { ContainerRegistry, ManageRegistriesWVMessages } from "../RegistriesPageWrapper";

const FULL_ADDRESS_ATTR = "data-full-address";

export default function getManageRegistriesPage(connectionLabel: string, registries: ContainerRegistry[], hasPushRegistry: boolean): string {
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
                <h1 id="title">Container Registries</h1>
                <h2 id="subtitle">${connectionLabel}</h2>
            </div>
        </div>
        <div tabindex="0" id="learn-more-btn" class="btn" onclick="sendMsg('${ManageRegistriesWVMessages.HELP}')">
            Learn More<img alt="Learn More" src="${WebviewUtil.getIcon(Resources.Icons.Help)}"/>
        </div>
    </div>

    <div id="toolbar">
        <div id="toolbar-right-buttons">
            <div tabindex="0" class="btn btn-background" onclick="sendMsg('${ManageRegistriesWVMessages.REFRESH}')">
                Refresh<img alt="Refresh" src="${WebviewUtil.getIcon(Resources.Icons.Refresh)}"/>
            </div>
            <div tabindex="0" id="add-btn" class="btn btn-prominent" onclick="sendMsg('${ManageRegistriesWVMessages.ADD_NEW}')">
                Add New<img alt="Add New" src="${WebviewUtil.getIcon(Resources.Icons.New)}"/>
            </div>
        </div>
    </div>

    ${buildTable(registries, hasPushRegistry)}

    <script>
        const vscode = acquireVsCodeApi();

        function changePushRegistry(selectPushBtn) {
            const fullAddress = selectPushBtn.getAttribute("${FULL_ADDRESS_ATTR}");
            sendMsg("${ManageRegistriesWVMessages.CHANGE_PUSH}", { fullAddress });
        }

        function deleteRegistry(deleteBtn) {
            const fullAddress = deleteBtn.getAttribute("${FULL_ADDRESS_ATTR}");
            sendMsg("${ManageRegistriesWVMessages.DELETE}", { fullAddress });
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

function buildTable(registries: ContainerRegistry[], hasPushRegistry: boolean): string {

    const rows = registries.map((registry) => buildRow(registry, hasPushRegistry));

    return `
    <table>
        <colgroup>
            <col id="address-col"/>
            <col id="username-col"/>
            ${hasPushRegistry ? `<col id="namespace-col"/>` : "" }
            ${hasPushRegistry ? `<col id="push-registry-col"/>` : ""}
            <!--col class="btn-col"/-->      <!-- Edit buttons -->
            <col class="btn-col"/>      <!-- Delete buttons -->
        </colgroup>
        <thead>
            <tr>
                <td>Address</td>
                <td>Username</td>
                ${hasPushRegistry ? "<td>Namespace</td>" : ""}
                ${hasPushRegistry ?
                    `<td id="push-registry-header">Select a Push Registry</td>` : ""
                }
                <!--td></td-->
                <td></td>
            </tr>
        </thead>
        <tbody>
            ${rows.join("")}
        </tbody>
    </table>
    `;
}

function buildRow(registry: ContainerRegistry, hasPushRegistry: boolean): string {
    // These two columns are left out for the local non-che connection, which does not use a push registry.
    let namespaceTD = "";
    let pushRegistryTD = "";
    if (hasPushRegistry) {
        // Namespace is greyed out if it's not the current push registry (because it's only used for pushing)
        namespaceTD = `
            <td class="${registry.isPushRegistry ? "" : "namespace-disabled"}">
                ${registry.namespace || ""}
            </td>
        `;
        pushRegistryTD = `
            <td class="btn-cell">
                <input type="radio" ${FULL_ADDRESS_ATTR}="${registry.fullAddress}" class="push-registry-radiobtn" name="push-registry"
                    onclick="changePushRegistry(this)"
                    ${registry.isPushRegistry ? "checked" : ""}
                />
            </td>
        `;
    }

    return `
    <tr>
        <td>${registry.address}</td>
        <td>${registry.username}</td>
        ${namespaceTD}
        ${pushRegistryTD}
        <!--td class="btn-cell">
            <input type="image" ${FULL_ADDRESS_ATTR}="${registry.fullAddress}" alt="Edit ${registry.fullAddress}" title="Edit"
                onclick="" class="btn" src="${WebviewUtil.getIcon(Resources.Icons.Edit)}"
            />
        </td-->
        <td class="btn-cell">
            <input type="image" ${FULL_ADDRESS_ATTR}="${registry.fullAddress}" alt="Delete ${registry.fullAddress}" title="Delete ${registry.fullAddress}"
                onclick="deleteRegistry(this)" class="btn" src="${WebviewUtil.getIcon(Resources.Icons.Trash)}"
            />
        </td>
    </tr>
    `;
}
