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

const BTN_DISPLAY = "inline-flex";

export default function getConnectionInfoHtml(rp: WebviewResourceProvider, label: string, connection: RemoteConnection | undefined): string {
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
    <div id="main">
        <div id="connection-box" class="box">
            <h3>1. Codewind Connection
                <div class="learn-more-btn-container">
                    <a tabindex="-1" href="${CWDocs.REMOTE_UI.uri}">
                        <input type="image" alt="Learn More" src="${rp.getImage(ThemedImages.Help)}"/>
                    </a>
                </div>
                ${isConnected ? `<img id="connected-status" alt="Connected" src="${rp.getImage(ThemelessImages.Connected_Checkmark)}"/>` :
                    `<img id="connected-status" alt="Disconnected" src="${rp.getImage(ThemelessImages.Disconnected_Checkmark)}"/>`
                }
            </h3>
            <div class="box-content">
                <p id="enter-url-prompt" ${connectionExists ? "style='display: none;'" : ""}>Enter the URL to your Codewind Gatekeeper ingress.</p>
                <div>
                    <label class="info-label" for="input-url">Codewind Gatekeeper URL</label>
                    ${connectionExists ? `
                        <input type="image" id="copy-url-btn" onclick="copyURL(event)" title="Copy URL" alt="Copy URL"
                            src="${rp.getImage(ThemedImages.Copy)}"
                        />
                        <div id="copy-url-btn-tooltip" style="display: none">Copied!</div>`
                        : ""
                    }
                </div>
                <a id="url" style="${connectionExists ? "" : "display: none"}" href="${connection?.url}">${connection?.url}</a>
                <input type="text" id="input-url" class="input-url" name="ingress-url"
                    placeholder="https://codewind-gatekeeper-abcd1234.mycluster.cloud"
                    ${connectionExists ? "style='display: none;'" : ""}
                    value="${connection?.url ? connection.url : ""}"/>

                <div id="credentials-section" style="display: ${connectionExists ? "none" : "inline-flex"}">
                    <div id="username-input-section" class="input-section">
                        <label class="info-label" for="input-username">Username</label>
                        <input type="text" id="input-username" name="ingress-username"
                            class="credential-input"
                            placeholder="developer"
                            value="${connection?.username || ""}"
                        />
                    </div>
                    <div id="password-input-section" class="input-section">
                        <label class="info-label" for="input-password">Password</label>
                        <input type="password" id="input-password" class="credential-input" name="ingress-password"/>
                    </div>
                </div>
                <div id="saved-info-section" style="display: ${connectionExists ? "block" : "none"}">
                    <div class="saved-info">
                        <div class="info-label">Username</div>
                        <div>${connection?.username}</div>
                    </div>
                    <div class="saved-info">
                        <div class="info-label">Version</div>
                        <div>${connection?.version}</div>
                    </div>
                    <div class="saved-info">
                        <div class="info-label">Namespace</div>
                        <div>${connection?.namespace}</div>
                    </div>
                </div>
            </div>
        </div> <!-- End connection box -->

        <div id="link-container-boxes">
            <div class="box link-container-box">
                <h3>2. Select Sources
                    <div class="learn-more-btn-container">
                        <a tabindex="-1" href="${CWDocs.TEMPLATE_MANAGEMENT.uri}">
                            <input type="image" class="learn-more-btn" alt="Learn More" src="${rp.getImage(ThemedImages.Help)}"/>
                        </a>
                    </div>
                </h3>
                <div class="box-content">
                    <p>A source contains templates for creating cloud-native projects. Select the template sources that you want to use.</p>
                    <button type="button" class="btn" onclick=sendMsg("${ConnectionOverviewWVMessages.SOURCES}");>
                        Open Template Source Manager
                    </button>
                </div>
            </div>
            <div class="box link-container-box">
                <h3>3. Add Registries
                    <div class="learn-more-btn-container">
                        <a tabindex="-1" href="${CWDocs.REGISTRIES.uri}">
                            <input type="image" class="learn-more-btn" alt="Learn More" src="${rp.getImage(ThemedImages.Help)}"/>
                        </a>
                    </div>
                </h3>
                <div class="box-content">
                    <p class="registry-help-label">
                        Optional: Add registries to pull private project images, or add a push registry for Codewind style projects.
                    </p>
                    <button type="button" class="btn" onclick=sendMsg("${ConnectionOverviewWVMessages.REGISTRY}")>Open Image Registry Manager</button>
                </div>
            </div>
        </div> <!-- End link containers -->
    </div>  <!-- End main -->

    <div id="remote-connection-btn-group">
        <button type="button" id="delete-btn" class="btn btn-red" onclick="deleteConnection()"
            style="display: ${connectionExists ? `${BTN_DISPLAY}` : "none"};"
        >
            Remove Connection
            <img src="${rp.getImage(ThemedImages.Trash, "dark")}"/>
        </button>

        <div id="right-btn-group">
            <button type="button" id="toggle-connect-btn"
                class="btn btn-background"
                onclick="toggleConnection()"
                style="display: ${connectionExists ? `${BTN_DISPLAY}` : "none"};"
            >
                ${isConnected ? "Disconnect" : "Connect"}
                <img src="${rp.getImage(isConnected ? ThemedImages.Connection_Disconnected : ThemedImages.Connection_Connected, "dark")}"/>
            </button>
            <button type="button" id="edit-btn"
                class="btn btn-prominent"
                onclick="editConnection()"
                style="display: ${connectionExists ? `${BTN_DISPLAY}` : "none"};"
            >
                Edit
                <img src="${rp.getImage(ThemedImages.Edit, "dark")}"/>
            </button>

            <!-- These two below are shown when editing, or when a new connection, so the display: none is reversed-->

            <button type="button" id="cancel-btn" class="btn ${connectionExists ? "btn-background" : "btn-red"}"
                onclick="sendMsg('${ConnectionOverviewWVMessages.CANCEL}')"
                style="display: ${connectionExists ? "none" : `${BTN_DISPLAY}`};"
            >
                Cancel
                <img src="${rp.getImage(ThemedImages.Error, "dark")}"/>
            </button>
            <button type="button" id="save-btn" class="btn btn-prominent" onclick="submitConnection()"
                style="display: ${connectionExists ? "none" : `${BTN_DISPLAY}`};"
            >
                Save
                <img src="${rp.getImage(ThemedImages.Save, "dark")}"/>
            </button>
        </div>
        <!-- This lines up the right side of the buttons with the Connection card when editing -->
        <!--div id="btns-right-spacer" style="${connectionExists ? "display: none" : ""};"-->
        </div>
    </div>  <!-- End buttons -->
    </div>  <!-- End content -->
    <script>

        const vscode = acquireVsCodeApi();

        const submitOnEnter = (ev) => {
            if (ev.key === "Enter") {
                submitConnection();
            }
        };

        const ingressInput  = document.querySelector("#input-url");
        const usernameInput = document.querySelector("#input-username");
        const passwordInput = document.querySelector("#input-password");

        ingressInput.addEventListener("keyup", submitOnEnter);
        usernameInput.addEventListener("keyup", submitOnEnter);
        passwordInput.addEventListener("keyup", submitOnEnter);

        function copyURL(e) {
            const url = document.querySelector("#input-url")
            const tempTextArea = document.createElement("textarea");
            tempTextArea.value = url.value;

            let copiedURLToolTip = document.getElementById('copy-url-btn-tooltip');
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

        function submitConnection() {
            const ingressInput = document.querySelector("#input-url").value;
            const ingressUsername = document.querySelector("#input-username").value;
            const ingressPassword = document.querySelector("#input-password").value;
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
            document.querySelector("#credentials-section").style.display = "flex";
            document.querySelector("#saved-info-section").style.display = "none";

            document.querySelector("#edit-btn").style.display = "none";
            document.querySelector("#toggle-connect-btn").style.display = "none";
            document.querySelector("#cancel-btn").style.display = "${BTN_DISPLAY}";
            document.querySelector("#save-btn").style.display = "${BTN_DISPLAY}";
            document.querySelector("#btns-right-spacer").style.display = "inline";
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
