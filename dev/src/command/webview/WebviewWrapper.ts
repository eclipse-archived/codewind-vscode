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

import * as vscode from "vscode";

import Resources from "../../constants/Resources";
import WebviewUtil from "./WebviewUtil";
import Log from "../../Logger";
import MCUtil from "../../MCUtil";

export interface WebviewResourceProvider {
    getStylesheet(path: string): string;
    getIcon(icon: Resources.Icons): string;
}

const VSC_RESOURCE_SCHEME = "vscode-resource:";

export abstract class WebviewWrapper {

    protected readonly webPanel: vscode.WebviewPanel;
    private readonly resourceProvider: WebviewResourceProvider;

    /**
     * Create and open the webview.
     * Subclass must call `this.refresh()` after performing all initialization.
     */
    constructor(
        protected readonly title: string,
        titleIcon: Resources.Icons,
    ) {
        this.webPanel = vscode.window.createWebviewPanel(title, title, vscode.ViewColumn.Active, WebviewUtil.getWebviewOptions());

        this.webPanel.reveal();
        this.webPanel.onDidDispose(() => {
            this.onDidDispose();
        });

        this.webPanel.iconPath = Resources.getIconPaths(titleIcon);

        this.webPanel.webview.onDidReceiveMessage((msg: WebviewUtil.IWVMessage) => {
            try {
                this.handleWebviewMessage(msg);
            }
            catch (err) {
                vscode.window.showErrorMessage(`${this.title}: Error running action ${msg.type} - ${MCUtil.errToString(err)}`);
                Log.e(`Error processing message from webview ${this.title}`, err);
                Log.e("Message was", msg);
            }
        });

        this.resourceProvider = {
            getIcon: (icon: Resources.Icons) => {
                const fsUri = Resources.getIconPaths(icon).dark;
                if (global.isTheia) {
                    return VSC_RESOURCE_SCHEME + fsUri.fsPath;
                }
                return this.webPanel.webview.asWebviewUri(fsUri).toString();
            },
            getStylesheet: (filename: string) => {
                const fsUri = Resources.getCss(filename);
                if (global.isTheia) {
                    return VSC_RESOURCE_SCHEME + fsUri.fsPath;
                }
                return this.webPanel.webview.asWebviewUri(fsUri).toString();
            }
        };
    }

    public reveal(): void {
        this.webPanel.reveal();
    }

    public dispose(): void {
        this.webPanel.dispose();
        this.onDidDispose();
    }

    public async refresh(): Promise<void> {
        let newHtml;
        try {
            newHtml = await this.generateHtml(this.resourceProvider);
        }
        catch (err) {
            const errMsg = `${this.title} error:`;
            Log.e(errMsg, err);
            vscode.window.showErrorMessage(`${errMsg} ${MCUtil.errToString(err)}`);
            return;
        }

        WebviewUtil.debugWriteOutWebview(newHtml, `${MCUtil.slug(this.title)}.html`);
        // Setting the html to "" seems to clear the page state, otherwise there is some caching done
        // which causes eg. the selected radiobutton to not be updated https://github.com/eclipse/codewind/issues/1413
        this.webPanel.webview.html = "";
        this.webPanel.webview.html = newHtml;
    }

    protected async abstract generateHtml(resourceProvider: WebviewResourceProvider): Promise<string>;

    protected abstract readonly handleWebviewMessage: (msg: WebviewUtil.IWVMessage) => void | Promise<void>;

    protected abstract onDidDispose(): void | Promise<void>;
}
