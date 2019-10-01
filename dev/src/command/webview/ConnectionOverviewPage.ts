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
import { IRemoteCodewindInfo } from "../../codewind/connection/RemoteConnection";
import { ConnectionOverviewWVMessages } from "./ConnectionOverview";

// const csp = `<meta http-equiv="Content-Security-Policy"
    // content="default-src 'none'; img-src vscode-resource: https:; script-src vscode-resource: 'unsafe-inline'; style-src vscode-resource:;"
    // />`;

const csp = "";

export default function getConnectionInfoPage(connectionInfo: IRemoteCodewindInfo): string {
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
        <!--link rel="stylesheet" href="${WebviewUtil.getStylesheetPath("theia.css")}"/-->
    </head>
    <body>

    <div id="top-section">
        <div class="title">
            <img id="logo" alt="Codewind Logo" src="${WebviewUtil.getIcon(Resources.Icons.Logo)}"/>
            <h1>${connectionInfo.label}</h1>
        </div>
        <div tabindex="0" id="learn-more-btn" class="btn" onclick="sendMsg('${ConnectionOverviewWVMessages.HELP}')">
            Learn More<img alt="Learn More" src="${WebviewUtil.getIcon(Resources.Icons.Help)}"/>
        </div>
    </div>
    <div id="description">
        <p>
            Placeholder connection description<img id="edit-description" class="btn" src="${WebviewUtil.getIcon(Resources.Icons.Edit)}"/>
        </p>
    </div>
    <div id="main">
        <label for="ingress-input">Ingress Hostname:</label>
        <input type="text" id="ingress-input" name="ingress-input" size="96"
            placeholder="${connectionInfo.ingressHost ? "" : "codewind-workspace-mycluster.nip.io"}"
            value="${connectionInfo.ingressHost ? connectionInfo.ingressHost : ""}"
        />
        <div id="submit-btn" class="btn btn-prominent" onclick="submitNewConnection()">Submit</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function submitNewConnection() {
            const ingressInput = document.querySelector("#ingress-input");
            // Data body is IConnectionInfoFields
            sendMsg("${ConnectionOverviewWVMessages.SAVE_CONNECTION_INFO}", { ingressHost: ingressInput.value });
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
