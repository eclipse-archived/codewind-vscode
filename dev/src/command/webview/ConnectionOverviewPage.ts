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
import WebviewUtil from "./WebviewUtil";
import { ConnectionOverviewWVMessages, ConnectionOverviewFields } from "./ConnectionOverview";

// const csp = `<meta http-equiv="Content-Security-Policy"
    // content="default-src 'none'; img-src vscode-resource: https:; script-src vscode-resource: 'unsafe-inline'; style-src vscode-resource:;"
    // />`;

const csp = "";

export default function getConnectionInfoPage(connectionInfo: ConnectionOverviewFields): string {
    return `
    <!DOCTYPE html>

    <html>
    <head>
        <meta charset="UTF-8">

        ${global.isTheia ? "" : csp}
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("connection-overview.css")}"/>
        <link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("common.css")}"/>
        ${global.isTheia ?
            `<link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("theia.css")}"/>` : ""}
        <link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("theia.css")}"/>
    </head>
    <body>

    <div id="top-section">
        <div class="title">
            <img id="connection-logo" alt="Codewind Logo" src="${connectionInfo.ingressUrl ? WebviewUtil.getIcon(Resources.Icons.ConnectionConnected) : WebviewUtil.getIcon(Resources.Icons.ConnectionDisconnected)}"/>
            <input id="remote-connection-name" class="bx--text-input" value=${connectionInfo.label}>
        </div>
        <div tabindex="0" id="learn-more-btn"  style="color: #0f62fe;" class="btn" onclick="sendMsg('${ConnectionOverviewWVMessages.HELP}')">
            Learn More<img alt="Learn More" src="${WebviewUtil.getIcon(Resources.Icons.Help)}"/>
        </div>
    </div>
    <div id="description">
        <input id="description-text" class="bx--text-input-description" placeholder="Description about this remote connection that the user might use for some reason">
    </div>
    <div id="main">

            <div id="deployment-box">

                <h3>Codewind Connection
                    ${connectionInfo.ingressUrl ? `<img alt="remote connection" src="${WebviewUtil.getIcon(Resources.Icons.ConnectionConnected)}"/>` :
                    `<img alt="remote connection" src="${WebviewUtil.getIcon(Resources.Icons.ConnectionDisconnected)}"/>`}
                </h3>

                <div class="input">
                    <p>Fill in the fields about the connection that you're starting from.</p>

                    <label for="input-url">URL</label>

                    ${connectionInfo.ingressUrl ? `<div>${connectionInfo.ingressUrl}</div>` :
                    `<input type="text" id="ingress-url" class="input-url" name="ingress-url"
                        placeholder="${connectionInfo.ingressUrl ? "" : "codewind-gatekeeper-k2s2zuwf-10.105.198.173.nip.io"}"
                        value="${connectionInfo.ingressUrl ? connectionInfo.ingressUrl : ""}"
                    />`}

                    <div style="float: left; margin-top: 10px;">
                        <label for="input-username">Username</label>
                        ${connectionInfo.ingressUrl ? `<div>${connectionInfo.username}</div>` :
                        `<input type="text" id="ingress-username" class="input-username" name="ingress-username"
                        value="${connectionInfo.username ? connectionInfo.username : "developer"}"
                        />`}
                    </div>
                    <div style="overflow: hidden; margin-top: 10px;">
                    ${connectionInfo.ingressUrl ? `` :
                        `<label for="input-password">Password</label>
                            <input type="password" id="ingress-password" class="input-password" name="ingress-password" value="********"
                        />`}
                    </div>

                    ${connectionInfo.ingressUrl ? `` : `<div type="button" id="test-btn" class="btn btn-prominent" onclick="testNewConnection()">Test</div>`}
                </div>

            </div>

            <div id="deployment-box" style="margin-left: 50px;">
                <h3>Docker Registry</h3>

                <div class="input">
                     <p>Fill in the fields about the Docker registry that you want to connect to.</p>

                    <label for="input-url">URL</label>
                        <input type="text" id="docker-url" class="input-url" name="docker-url"
                        value="${connectionInfo.registryUrl ? connectionInfo.registryUrl : ""}"
                    />

                    <div style="float: left; margin-top: 10px;">
                        <label for="input-username">Username</label>
                        <input type="text" id="docker-username" class="input-username" name="docker-username"
                        value="${connectionInfo.registryUsername ? connectionInfo.registryUsername : ""}"
                        />
                    </div>

                    <div style="overflow: hidden; margin-top: 10px;">
                        <label for="input-password">Password</label>
                            <input type="password" id="docker-password" class="input-password" name="docker-password"
                        />
                    </div>

                    <div type="button" id="test-btn" class="btn btn-prominent" onclick="testNewDockerRegistry()">Test</div>
                </div>
            </div>

            <div>
            ${connectionInfo.ingressUrl ? `<div type="button" id="delete-btn" class="btn btn-prominent" onclick="deleteConnection()">Delete Connection</div>
                                   <div type="button" id="save-btn" class="btn btn-prominent" onclick="()">Edit</div>
                                   <div type="button" id="cancel-btn" class="btn btn-prominent" onclick="">Disconnect</div>`
                :

                `<div type="button" id="save-btn" class="btn btn-prominent" onclick="submitNewConnection()">Save</div>
                <div type="button" id="cancel-btn" class="btn btn-prominent" onclick="()">Cancel</div>`}
            </div>

    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function submitNewConnection() {
            const ingressInput = document.querySelector("#ingress-url");
            const ingressUsername = document.querySelector("#ingress-username");
            const ingressPassword = document.querySelector("#ingress-password");

            const clabel = document.querySelector("#remote-connection-name");

            const dockerRegistryURL = document.querySelector("#docker-url");
            const dockerRegistryUsername = document.querySelector("#docker-username");
            const dockerRegistryPassword = document.querySelector("#docker-password");

            // Data body is IConnectionInfoFields
            sendMsg("${ConnectionOverviewWVMessages.SAVE_CONNECTION_INFO}", {
                ingressUrl: ingressInput.value,
                username: ingressUsername.value,
                password: ingressPassword.value,
                label: clabel.value,
                registryUrl: dockerRegistryURL.value,
                registryUsername: dockerRegistryUsername.value,
                registryPassword: dockerRegistryPassword.value
            });
        }

        function testNewConnection() {

        }

        function deleteConnection() {
            sendMsg("${ConnectionOverviewWVMessages.DELETE}");
        }

        function testNewDockerRegistry() {
            const dockerRegistryURL = document.querySelector("#docker-url");
            const dockerRegistryUsername = document.querySelector("#docker-username");
            const dockerRegistryPassword = document.querySelector("#docker-password");

            sendMsg("${ConnectionOverviewWVMessages.SAVE_REGISTRY}", {
                registryUrl: dockerRegistryURL.value,
                registryUsername: dockerRegistryUsername.value,
                registryPassword: dockerRegistryPassword.value
            });
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
