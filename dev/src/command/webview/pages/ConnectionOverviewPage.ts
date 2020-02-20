/*******************************************************************************
 * Copyright (c) 2019, 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

// import * as vscode from "vscode";

import { ThemedImages, ThemelessImages } from "../../../constants/CWImages";
import WebviewUtil from "../WebviewUtil";
import { ConnectionOverviewWVMessages } from "../ConnectionOverviewPageWrapper";
import CWDocs from "../../../constants/CWDocs";
import { WebviewResourceProvider } from "../WebviewWrapper";
import RemoteConnection from "../../../codewind/connection/RemoteConnection";

export default function getConnectionInfoHtml(rp: WebviewResourceProvider, label: string, connection: RemoteConnection | undefined): string {
    // If the ingress URL has been saved, then we have created the connection and we are now viewing or editing it.
    const connectionExists = connection != null;
    const isConnected = connection != null && connection.isConnected;

    return `
    <!DOCTYPE html>
    <html>
    ${WebviewUtil.getHead(rp, "connection-overview.css")}
    <body>
    <div id="content">
    <div id="top-section">
        <div class="title-section">
            <img id="connection-logo" alt="Codewind Logo"
                src="${isConnected ? rp.getImage(ThemedImages.Connection_Connected) : rp.getImage(ThemedImages.Connection_Disconnected)}"/>
            <div id="remote-connection-name" class="connection-name">${label}</div>
        </div>
    </div>
    <!--div id="description">
        <input id="description-text" class="bx--text-input-description" placeholder="Description about this remote connection that the user might use for some reason"/>
    </div-->
    <div id="main">
        <div style="display: inline-block;">
            <div id="deployment-box">
                <h3>1. Codewind Connection
                    <div id="learn-more-btn-remote">
                        <a tabindex="-1" href="${CWDocs.REMOTE_UI.uri}">
                            <input type="image" class="learn-more-btn" alt="Learn More" src="${rp.getImage(ThemedImages.Help)}"/>
                        </a>
                    </div>
                    ${isConnected ? `<img alt="Connected" src="${rp.getImage(ThemelessImages.Connected_Checkmark)}"/>` :
                        `<img alt="Disconnected" src="${rp.getImage(ThemelessImages.Disconnected_Checkmark)}"/>`
                    }
                </h3>
                <div class="input-section">
                    <p ${connectionExists ? "style='display: none;'" : ""}>Enter the URL to your Codewind Gatekeeper ingress.</p>
                    ${connectionExists ? `
                        <label class="info-label" for="input-url">Codewind Gatekeeper URL</label>
                        <input type="image" id="copy_url" onclick="copyURL(event)" alt="Copy URL" src="${rp.getImage(ThemedImages.Copy)}"/>
                        <div id="copy_url_tooltip">Copied!</div>`
                        :
                        `<label class="info-label" for="input-url">Codewind Gatekeeper URL</label>`
                    }
                    <div id="url" ${connectionExists ? "" : "style='display: none;'"}>${connection?.url}</div>
                    <input type="text" id="ingress-url" class="input-url" name="ingress-url" placeholder="codewind-gatekeeper-mycluster.nip.io"
                        ${connectionExists ? "style='display: none;'" : ""}
                        value="${connection?.url ? connection.url : ""}"/>

                    <div style="float: left; margin-top: 40px">
                        <label class="info-label" for="input-username">Username</label>
                        <div id="ingress-username-label" ${connectionExists ? "" : "style='display: none;'"}>${connection?.username}</div>
                        <input type="text" id="ingress-username" class="input-username" name="ingress-username"
                            ${connectionExists ? "style='display: none;'" : ""}
                            placeholder="developer"
                            value="${connection?.username || ""}"/>
                    </div>
                    <div style="overflow: hidden; margin-top: 40px">
                        <div id="input-password" ${connectionExists ? "style='display: none;'" : ""}>
                            <label class="info-label" for="input-password" style="margin-left: 11px;">Password</label>
                            <input type="password" id="ingress-password" class="input-password" name="ingress-password"/>
                        </div>
                    </div>
                    <!--div type="button" id="test-btn" class="btn btn-prominent" ${connectionExists ? "style='display: none;'" : ""} onclick="testNewConnection()">Test</div-->
                </div>
            </div>

            <div class="link-containers">
                <div class="link-containers-group">
                <div id="link-container-box">
                    <h3>2. Select Sources
                        <a tabindex="-1" href="${CWDocs.TEMPLATE_MANAGEMENT.uri}">
                            <input type="image" alt="Learn More" src="${rp.getImage(ThemedImages.Help)}"/>
                        </a>
                    </h3>
                    <p>A source contains templates for creating cloud-native projects. Select the template sources that you want to use.</p><br>
                    <button type="button" class="btn" onclick=sendMsg("${ConnectionOverviewWVMessages.SOURCES}");>Open Template Source Manager</button>
                </div>

                <div id="link-container-box" style="margin-top: 30px">
                    <h3>3. Add Registries
                        <a tabindex="-1" href="${CWDocs.REGISTRIES.uri}">
                            <input type="image" alt="Learn More" src="${rp.getImage(ThemedImages.Help)}"/>
                        </a>
                    </h3>
                    <p class="registry-help-label">Optional: Add registries to pull private project images, or add a push registry for Codewind style projects.</p>
                    <button type="button" class="btn" onclick=sendMsg("${ConnectionOverviewWVMessages.REGISTRY}");>Open Image Registry Manager</button>
                </div>
                </div>
            </div>
        </div>

        <div class="remote-connection-btn-group">
            <button type="button" id="delete-btn" class="btn btn-red" onclick="deleteConnection()"
                ${connectionExists ? `style="display: inline;"` : `style="display: none;"`}>Remove Connection
                <img src="${rp.getImage(ThemedImages.Trash, "dark")}"/>
            </button>
            <div class="edit-connection-group">
                <button type="button" id="save-btn" class="btn btn-prominent" onclick="submitNewConnection()"
                    ${connectionExists ? `style="display: none;"` : `style="display: inline; float: left; margin-left: 0px"`}>Save
                </button>
                <button type="button" id="edit-btn"
                    class="btn btn-prominent"
                    onclick="editConnection()"
                    ${connectionExists ? `style="display: inline;"` : `style="display: none;"`}>
                    <div>Edit <img src="${rp.getImage(ThemedImages.Edit, "dark")}"/></div>
                </button>
                <button type="button" id="toggle-connect-btn"
                    class="btn btn-background"
                    onclick="toggleConnection()"
                    ${connectionExists ? `style="display: inline;"` : `style="display: none;"`}>${isConnected ? "Disconnect" : "Connect"}
                </button>
                <button type="button" id="cancel-btn" class="btn ${connectionExists ? "btn-background" : "btn-red"}" onclick="sendMsg('${ConnectionOverviewWVMessages.CANCEL}')"
                    ${connectionExists ? `style="display: none;"` : `style="display: inline; float: left;"`}>Cancel
                </button>
            </div>
        </div>
    </div>
</div>
    <script>
        const submitOnEnter = (ev) => {
            if (ev.key === "Enter") {
                submitNewConnection();
            }
        };

        const ingressInput  = document.querySelector("#ingress-url");
        const usernameInput = document.querySelector("#ingress-username");
        const passwordInput = document.querySelector("#input-password");

        ingressInput.addEventListener("keyup", submitOnEnter);
        usernameInput.addEventListener("keyup", submitOnEnter);
        passwordInput.addEventListener("keyup", submitOnEnter);

        function copyURL(e) {
            const url = document.querySelector("#ingress-url")
            const tempTextArea = document.createElement("textarea");
            tempTextArea.value = url.value;

            let copiedURLToolTip = document.getElementById('copy_url_tooltip');
            copiedURLToolTip.style.display = "inline";
            copiedURLToolTip.style.position = "absolute";
            copiedURLToolTip.style.left = e.pageX + 25 + 'px';
            copiedURLToolTip.style.top = e.pageY - 10 +'px';

            setTimeout(() => { copiedURLToolTip.style.display = "none"; }, 1000);

            document.body.appendChild(tempTextArea);
            tempTextArea.select();
            document.execCommand('copy');

            document.body.removeChild(tempTextArea);
        }

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
            if (ingressInput === '${connection?.url}'
                && ingressUsername === '${connection?.username}'
                && !ingressPassword) {

                sendMsg("${ConnectionOverviewWVMessages.CANCEL}");
            } else {
                // Data body is IConnectionInfoFields
                sendMsg("${ConnectionOverviewWVMessages.SAVE_CONNECTION_INFO}", {
                    url: ingressInput,
                    username: ingressUsername,
                    password: ingressPassword,
                    label: connectionName
                });
            }
        }

        function editConnection() {
            // document.querySelector("#deployment-box p").style.display = "block";
            // document.querySelector("#ingress-url").style.display = "block";
            document.querySelector("#ingress-username-label").style.display = "none"
            document.querySelector("#ingress-username").style.display = "block";
            // document.querySelector("#url").style.display = "none";
            document.querySelector("#input-password").style.display = "block";
            document.querySelector("#edit-btn").style.display = "none";
            document.querySelector("#toggle-connect-btn").style.display = "none";
            document.querySelector("#cancel-btn").style.display = "inline";
            document.querySelector("#save-btn").style.display = "inline";
            // document.querySelector("#test-btn").style.display = "inline";
        }

        function deleteConnection() {
            sendMsg("${ConnectionOverviewWVMessages.DELETE}");
        }

        function toggleConnection() {
            sendMsg("${ConnectionOverviewWVMessages.TOGGLE_CONNECTED}");
        }

        const disabledBtnClass = "btn-disabled";

        function onIsToggling() {
            const editBtn = document.querySelector("#edit-btn");
            const toggleConnectBtn = document.querySelector("#toggle-connect-btn");
            [ editBtn, toggleConnectBtn ].forEach((element) => {
                // Disable these buttons until the toggle operation finishes (at which point the page will refresh)
                element.onclick = "";
                element.classList.add(disabledBtnClass);
            });
        }

        function onFinishedToggling() {
            const editBtn = document.querySelector("#edit-btn");
            editBtn.classList.remove(disabledBtnClass);
            editBtn.onclick = editConnection;

            const toggleConnectBtn = document.querySelector("#toggle-connect-btn");
            toggleConnectBtn.classList.remove(disabledBtnClass);
            toggleConnectBtn.onclick = toggleConnection;
        }

        function sendMsg(type, data = undefined) {
            // See IWebViewMsg in ManageTemplateReposCmd
            const msg = { type: type, data: data };
            // console.log("Send message " + JSON.stringify(msg));
            vscode.postMessage(msg);
        }

        window.addEventListener('message', (event) => {
            const message = event.data;
            if (message === "${ConnectionOverviewWVMessages.TOGGLE_STARTED}") {
                onIsToggling();
            }
            else if (message === "${ConnectionOverviewWVMessages.TOGGLE_FINISHED}") {
                onFinishedToggling();
            }
        });
    </script>

    </body>
    </html>
    `;
}
