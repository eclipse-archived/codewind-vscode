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
            ${connectionInfo.ingressUrl ? `<div id="connection-name">${connectionInfo.label}</div><input id="remote-connection-name" class="bx--text-input" value=${connectionInfo.label} style="display: none;">` :
            `<input id="remote-connection-name" class="bx--text-input" value=${connectionInfo.label}>`}
        </div>
    </div>
    <div>
    <div id="description">
        ${connectionInfo.ingressUrl ? `<input id="description-text" class="bx--text-input-description" style="display: none;" placeholder="Description about this remote connection that the user might use for some reason"/>`
        : `<input id="description-text" class="bx--text-input-description" placeholder="Description about this remote connection that the user might use for some reason"/>`}
    </div>
    <div tabindex="0" id="learn-more-btn-remote" class="btn" onclick="sendMsg('${ConnectionOverviewWVMessages.HELP}')">
        Learn More<img alt="Learn More" src="${WebviewUtil.getIcon(Resources.Icons.Help)}"/>
    </div>
    </div>
    <div id="main">
            <div id="deployment-box">
                <h3>Codewind Connection
                    ${connectionInfo.ingressUrl ? `<img alt="remote connection" src="${WebviewUtil.getIcon(Resources.Icons.ConnectionConnectedCheckmark)}"/>` :
                    `<img alt="remote connection" src="${WebviewUtil.getIcon(Resources.Icons.ConnectionDisconnectedCheckmark)}"/>`}
                </h3>
                <div class="input">
                    ${connectionInfo.ingressUrl ? `<p style="display: none;">Fill in the fields about the connection that you're starting from.</p>`
                    : "<p>Fill in the fields about the connection that you're starting from.</p>" }
                    <label for="input-url">URL</label>
                    ${connectionInfo.ingressUrl ? `<div id="url">${connectionInfo.ingressUrl}</div><input type="text" id="ingress-url" class="input-url" name="ingress-url" style="display: none;"
                    placeholder="codewind-gatekeeper-mycluster.nip.io"
                    value="${connectionInfo.ingressUrl ? connectionInfo.ingressUrl : ""}"
                />` :
                    `<input type="text" id="ingress-url" class="input-url" name="ingress-url"
                        placeholder="codewind-gatekeeper-mycluster.nip.io"
                        value="${connectionInfo.ingressUrl ? connectionInfo.ingressUrl : ""}"
                    />`}

                    <div style="float: left; margin-top: 10px;">
                        <label for="input-username">Username</label>
                        ${connectionInfo.ingressUrl ? `<div id="ingress-username-label">${connectionInfo.username}</div>
                            <input type="text" id="ingress-username" class="input-username" name="ingress-username" style="display: none;" value="developer"/>`
                        :
                        `<input type="text" id="ingress-username" class="input-username" name="ingress-username" value="developer"/>`}
                    </div>
                    <div style="overflow: hidden; margin-top: 10px;">
                    ${connectionInfo.ingressUrl ? `` :
                        `<label for="input-password" style="margin-left: 10px;">Password</label>
                            <input type="password" id="ingress-password" class="input-password" name="ingress-password"
                        />`}
                    <div id="input-password" style="display: none;">
                        <label for="input-password" style="margin-left: 10px;">Password</label>
                            <input type="password" id="ingress-password" class="input-password" name="ingress-password"/>
                    </div>
                    </div>
                    ${connectionInfo.ingressUrl ? `<div type="button" id="test-btn" class="btn btn-prominent" style="display: none"; onclick="testNewConnection()">Test</div>` : `<div type="button" id="test-btn" class="btn btn-prominent" onclick="testNewConnection()">Test</div>`}
                </div>
            </div>

            <div>
                <div type="button" id="delete-btn" class="btn btn-prominent" onclick="deleteConnection()" ${connectionInfo.ingressUrl ? `style="display: inline-block;"` : `style="display: none;"`}>Delete Connection</div>
                <div type="button" id="edit-btn" class="btn btn-prominent" onclick="editConnection()" ${connectionInfo.ingressUrl ? `style="display: inline;"` : `style="display: none;"`}>Edit</div>
                <div type="button" id="disconnect-btn" class="btn btn-prominent" onclick="" ${connectionInfo.ingressUrl ? `style="display: inline;"` : `style="display: none;"`}>Disconnect</div>
                <div type="button" id="save-btn" class="btn btn-prominent" onclick="submitNewConnection()" ${connectionInfo.ingressUrl ? `style="display: none;"` : `style="display: inline;"`}>Save</div>
                <div type="button" id="cancel-btn" class="btn btn-prominent"  onclick="sendMsg('${ConnectionOverviewWVMessages.CANCEL}')" ${connectionInfo.ingressUrl ? `style="display: none;"` : `style="display: inline;"`}>Cancel</div>
            </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function submitNewConnection() {
            const ingressInput = document.querySelector("#ingress-url");
            const ingressUsername = document.querySelector("#ingress-username");
            const ingressPassword = document.querySelector("#ingress-password");
            const connectionName = document.querySelector("#remote-connection-name");

            // Data body is IConnectionInfoFields
            sendMsg("${ConnectionOverviewWVMessages.SAVE_CONNECTION_INFO}", { ingressUrl: ingressInput.value,  username: ingressUsername.value, password: ingressPassword.value, label: connectionName.value });
        }

        function editConnection() {
            document.querySelector("#deployment-box p").style.display = "block";
            document.querySelector("#ingress-url").style.display = "block";
            document.querySelector("#ingress-username-label").style.display = "none"
            document.querySelector("#ingress-username").style.display = "block";
            document.querySelector("#url").style.display = "none";
            document.querySelector("#input-password").style.display = "block";
            document.querySelector("#input-password").style.marginTop = "5px";
            document.querySelector("#edit-btn").style.display = "none";
            document.querySelector("#disconnect-btn").style.display = "none";
            document.querySelector("#remote-connection-name").style.display = "block";
            document.querySelector("#connection-name").style.display = "none";
            document.querySelector("#description-text").style.display = "block";
            document.querySelector("#cancel-btn").style.display = "inline";
            document.querySelector("#save-btn").style.display = "inline";
            document.querySelector("#test-btn").style.display = "inline";
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
