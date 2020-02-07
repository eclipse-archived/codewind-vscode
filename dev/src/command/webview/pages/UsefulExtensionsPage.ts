/*******************************************************************************
 * Copyright (c) 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import WebviewUtil from "../WebviewUtil";
import { WebviewResourceProvider } from "../WebviewWrapper";
import { USEFUL_EXTENSIONS } from "../UsefulExtensionsPageWrapper";
import { ThemedImages } from "../../../constants/CWImages";

export default function getUsefulExtensionsPage(rp: WebviewResourceProvider): string {
    return `
    <!DOCTYPE html>
    <html>
    ${WebviewUtil.getHead(rp, "useful-extensions.css")}
    <body>
        <div id="content">
            <div id="useful-extensions-title">Useful Extensions</div>
            <div class="extensions-category-header">
                By Codewind
            </div>
            <div class="extensions-category">
                ${buildExtensionCard(rp, "JAVA_PROFILER")}
                ${buildExtensionCard(rp, "NODE_PROFILER")}
                ${buildExtensionCard(rp, "OPENAPI_TOOLS")}
            </div>
            <div class="extensions-category-header">
                By Third-party developers
            </div>
            <div class="extensions-category">
                ${buildExtensionCard(rp, "DOCKER")}
                ${buildExtensionCard(rp, "KUBE")}
            </div>
        </div>
    <script>
    </script>
    </body>
    </html>`;
}

function buildExtensionCard(rp: WebviewResourceProvider, extensionKey: keyof typeof USEFUL_EXTENSIONS): string {
    const extension = USEFUL_EXTENSIONS[extensionKey];
    return `
    <div class="extension-card">
        <a href="${extension.link}" class="extension-link-header">
            <div class="extension-name">
                ${extension.name}
            </div>
            <img class="extension-link-btn" src="${rp.getImage(ThemedImages.Extensions, "dark")}"/>
        </a>
        <div class="extension-description">${extension.description}</div>
    </div>
    `;
}
