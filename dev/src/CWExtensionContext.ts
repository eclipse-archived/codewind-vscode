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
import path from "path";

import Constants from "./constants/Constants";

/**
 * A superset of the VS Code extension context with additional fields specific to the Codewind extension.
 */
class CWExtensionContext implements vscode.ExtensionContext {

    /**
     * Path to res/ folder with images and static web resources.
     */
    public readonly resourcesPath: string;

    /**
     * If true, the extension is running in Theia, else it is running in VS Code.
     */
    public readonly isTheia: boolean;
    /**
     * If true, the extension is running in Theia in Che.
     */
    public readonly isChe: boolean;

    /**
     * The running version of this extension, eg "0.7.0"
     */
    public readonly extensionVersion: string;
    /**
     * The Codewind docker image tag to pull and start for local.
     */
    public readonly codewindImageTag: string;
    /**
     * The Appsody version to download and store next to cwctl.
     */
    public readonly appsodyVersion: string;

    constructor(
        private readonly vscContext: vscode.ExtensionContext,
    ) {
        this.resourcesPath = path.join(vscContext.extensionPath, "res");
        this.isTheia = vscode.env.appName.toLowerCase().includes("theia");
        this.isChe = !!process.env[Constants.CHE_WORKSPACEID_ENVVAR];

        const thisExtension = vscode.extensions.getExtension("IBM.codewind")!;
        this.extensionVersion = thisExtension.packageJSON.version;
        this.codewindImageTag = thisExtension.packageJSON.codewindImageTag;
        this.appsodyVersion = thisExtension.packageJSON.appsodyVersion;
    }

    public asAbsolutePath(relativePath: string): string {
        return this.vscContext.asAbsolutePath(relativePath);
    }

    public get extensionPath(): string {
        return this.vscContext.extensionPath;
    }

    public get globalState(): vscode.Memento {
        return this.vscContext.globalState;
    }

    public get globalStoragePath(): string {
        return this.vscContext.globalStoragePath;
    }

    public get logPath(): string {
        return this.vscContext.logPath;
    }

    public get storagePath(): string | undefined {
        return this.vscContext.storagePath;
    }

    public get subscriptions(): vscode.Disposable[] {
        return this.vscContext.subscriptions;
    }

    public get workspaceState(): vscode.Memento {
        return this.vscContext.workspaceState;
    }

    public toString(): string {
        return `
            Codewind extension version ${this.extensionVersion} running in${this.isChe ? " Che" : ""} ${this.isTheia ? "Theia" : "VS Code"} ` +
            `using Codewind ${this.codewindImageTag}, Appsody ${this.appsodyVersion}.
        `;
    }
}

let cwContext: CWExtensionContext;

namespace CWExtensionContext {
    export function init(vscodeContext: vscode.ExtensionContext): CWExtensionContext {
        cwContext = new CWExtensionContext(vscodeContext);
        return cwContext;
    }

    export function get(): CWExtensionContext {
        if (cwContext == null) {
            throw new Error(`CWExtensionContext requested before initialization`);
        }
        return cwContext;
    }
}

export default CWExtensionContext;
