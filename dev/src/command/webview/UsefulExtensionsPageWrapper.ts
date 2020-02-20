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

import * as vscode from "vscode";

import { WebviewWrapper, WebviewResourceProvider } from "./WebviewWrapper";
import WebviewUtil from "./WebviewUtil";
import getUsefulExtensionsPage from "./pages/UsefulExtensionsPage";
import { ThemelessImages } from "../../constants/CWImages";

interface UsefulExtension {
    // readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly link: string;
}

function getVSCExtensionLink(extensionID: string): string {
    return `vscode:extension/${extensionID}`;
}

export const USEFUL_EXTENSIONS: { [key: string]: UsefulExtension } = {
    JAVA_PROFILER: {
        name: "Codewind Java Profiler",
        description: `Annotates your Java code with code highlighting for your hottest methods in your Codewind projects.`,
        // link: "https://marketplace.visualstudio.com/items?itemName=IBM.codewind-java-profiler",
        link: getVSCExtensionLink("IBM.codewind-java-profiler"),
    },
    NODE_PROFILER: {
        name: "Codewind Node.js Profiler",
        description: `Annotates your Node.js code with code highlighting for your hottest methods in your Codewind projects.`,
        link: getVSCExtensionLink("IBM.codewind-node-profiler"),
    },
    OPENAPI_TOOLS: {
        name: "Codewind OpenAPI Tools",
        description: `Provides commands that invoke the OpenAPI Generator to create API clients, server stubs, and HTML documentation from OpenAPI Specifications.`,
        link: getVSCExtensionLink("IBM.codewind-openapi-tools"),
    },
    DOCKER: {
        name: "Docker Extension for Visual Studio Code",
        description: `The Docker extension makes it easy to build manage and deploy containerized applications from Visual Studio Code.`,
        link: getVSCExtensionLink("ms-azuretools.vscode-docker"),
    },
    KUBE: {
        name: "Visual Studio Code Kubernetes Tools",
        description: `The extension for developers building applications to run in Kubernetes clusters and for DevOps staff troubleshooting Kubernetes applications.`,
        link: getVSCExtensionLink("ms-kubernetes-tools.vscode-kubernetes-tools"),
    },
};

export class UsefulExtensionsPageWrapper extends WebviewWrapper {

    private static _instance: UsefulExtensionsPageWrapper | undefined;

    constructor(

    ) {
        super(`Useful Extensions`, ThemelessImages.Logo, false, vscode.ViewColumn.Beside);
        UsefulExtensionsPageWrapper._instance = this;
        this.refresh();
    }

    public static get instance(): UsefulExtensionsPageWrapper | undefined {
        return UsefulExtensionsPageWrapper._instance;
    }

    protected async generateHtml(resourceProvider: WebviewResourceProvider): Promise<string> {
        const html = getUsefulExtensionsPage(resourceProvider);
        return html;
    }

    protected handleWebviewMessage = async (_msg: WebviewUtil.IWVMessage): Promise<void> =>  {
        // no messages yet
    }

    protected onDidDispose(): void {
        UsefulExtensionsPageWrapper._instance = undefined;
    }
}
