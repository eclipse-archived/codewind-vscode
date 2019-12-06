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
import WebviewUtil from "../WebviewUtil";
import { ConnectionOverviewWVMessages, ConnectionOverviewFields } from "../ConnectionOverviewPageWrapper";

export default function getConnectionInfoHtml(connectionInfo: ConnectionOverviewFields, isConnected: boolean): string {
    // If the ingress URL has been saved, then we have created the connection and we are now viewing or editing it.
    const connectionExists = !!connectionInfo.ingressUrl;
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${WebviewUtil.getCSP()}

        <link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("connection-overview.css")}"/>
        <link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("common.css")}"/>
        ${global.isTheia ?
            `<link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("theia.css")}"/>` : ""}
    </head>
    <body>
    <div id="top-section">
        <div class="title-section">
            <img id="connection-logo" alt="Codewind Logo"
                src="${isConnected ? WebviewUtil.getIcon(Resources.Icons.ConnectionConnected) : WebviewUtil.getIcon(Resources.Icons.ConnectionDisconnected)}"/>
            <div id="remote-connection-name" class="connection-name">${connectionInfo.label}</div>
        </div>
    </div>
    <!--div id="description">
        <input id="description-text" class="bx--text-input-description" placeholder="Description about this remote connection that the user might use for some reason"/>
    </div-->
    <div tabindex="0" id="learn-more-btn-remote" class="btn" onclick="sendMsg('${ConnectionOverviewWVMessages.HELP}')">
        Learn More<img alt="Learn More" src="${WebviewUtil.getIcon(Resources.Icons.Help)}"/>
    </div>
    </div>
    <div id="main">
            <div id="deployment-box">
                <h3>Codewind Connection
                    ${isConnected ? `<img alt="remote connection" src="${WebviewUtil.getIcon(Resources.Icons.ConnectionConnectedCheckmark)}"/>` :
                    `<img alt="remote connection" src="${WebviewUtil.getIcon(Resources.Icons.ConnectionDisconnectedCheckmark)}"/>`}
                </h3>
                <div class="input">
                    <p ${connectionExists ? "style='display: none;'" : ""}>Fill in the fields about the connection that you're starting from.</p>
                    <label for="input-url">Codewind Gatekeeper URL</label>
                    <div id="url" ${connectionExists ? "" : "style='display: none;'"}>${connectionInfo.ingressUrl}</div>
                    <input type="text" id="ingress-url" class="input-url" name="ingress-url" placeholder="codewind-gatekeeper-mycluster.nip.io"
                        ${connectionExists ? "style='display: none;'" : ""}
                        value="${connectionInfo.ingressUrl ? connectionInfo.ingressUrl : ""}"/>

                    <div style="float: left; margin-top: 10px;">
                        <label for="input-username">Username</label>
                        <div id="ingress-username-label" ${connectionExists ? "" : "style='display: none;'"}>${connectionInfo.username}</div>
                        <input type="text" id="ingress-username" class="input-username" name="ingress-username"
                            ${connectionExists ? "style='display: none;'" : ""}
                            value='${connectionInfo.username || "developer"}'/>
                    </div>
                    <div style="overflow: hidden; margin-top: 10px;">
                        <div id="input-password" ${connectionExists ? "style='display: none;'" : ""}>
                            <label for="input-password" style="margin-left: 10px;">Password</label>
                            <input type="password" id="ingress-password" class="input-password" name="ingress-password" placeholder="**************"/>
                        </div>
                    </div>
                    <!--div type="button" id="test-btn" class="btn btn-prominent" ${connectionExists ? "style='display: none;'" : ""} onclick="testNewConnection()">Test</div-->
                </div>
            </div>

            <div class="remote-connection-btn-group">
                <div type="button" id="delete-btn" class="btn btn-prominent" onclick="deleteConnection()"
                    ${connectionExists ? `style="display: inline-block;"` : `style="display: none;"`}>Remove Connection<img src="${WebviewUtil.getIcon(Resources.Icons.Trash)}"/></div>
                <div type="button" id="edit-btn" class="btn btn-prominent" onclick="editConnection()"
                    ${connectionExists ? `style="display: inline;"` : `style="display: none;"`}>Edit<img src="${WebviewUtil.getIcon(Resources.Icons.Edit)}"/></div>
                <div type="button" id="toggle-connect-btn" class="btn btn-prominent" onclick="toggleConnection()"
                    ${connectionExists ? `style="display: inline;"` : `style="display: none;"`}>${isConnected ? "Disconnect" : "Connect"}</div>
                <div type="button" id="save-btn" class="btn btn-prominent" onclick="submitNewConnection()"
                    ${connectionExists ? `style="display: none;"` : `style="display: inline;"`}>Save</div>
                <div type="button" id="cancel-btn" class="btn btn-prominent"  onclick="sendMsg('${ConnectionOverviewWVMessages.CANCEL}')"
                    ${connectionExists ? `style="display: none;"` : `style="display: inline;"`}>Cancel</div>
            </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function submitNewConnection() {
            const ingressInput = document.querySelector("#ingress-url").value;
            const ingressUsername = document.querySelector("#ingress-username").value;
            const ingressPassword = document.querySelector("#ingress-password").value;
            let connectionName = document.querySelector("#remote-connection-name").value;

            if (!connectionName) {
                connectionName = document.querySelector("#remote-connection-name").innerText;
            }

            // If none of the fields changed, treat it the same as a cancel
            if (ingressInput === '${connectionInfo.ingressUrl}'
                && ingressUsername === '${connectionInfo.username}'
                && !ingressPassword) {

                sendMsg("${ConnectionOverviewWVMessages.CANCEL}");
            } else {
                // Data body is IConnectionInfoFields
                sendMsg("${ConnectionOverviewWVMessages.SAVE_CONNECTION_INFO}", {
                    ingressUrl: ingressInput,
                    username: ingressUsername,
                    password: ingressPassword,
                    label: connectionName
                });
            }
        }

        function editConnection() {
            document.querySelector("#deployment-box p").style.display = "block";
            // document.querySelector("#ingress-url").style.display = "block";
            document.querySelector("#ingress-username-label").style.display = "none"
            document.querySelector("#ingress-username").style.display = "block";
            // document.querySelector("#url").style.display = "none";
            document.querySelector("#input-password").style.display = "block";
            document.querySelector("#edit-btn").style.display = "none";
            document.querySelector("#toggle-connect-btn").style.display = "none";
            document.querySelector("#cancel-btn").style.display = "inline";
            document.querySelector("#save-btn").style.display = "inline";
            document.querySelector("#test-btn").style.display = "inline";
        }

        function toggleConnection() {
            sendMsg("${ConnectionOverviewWVMessages.TOGGLE_CONNECTED}");
        }

        function deleteConnection() {
            sendMsg("${ConnectionOverviewWVMessages.DELETE}");
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
