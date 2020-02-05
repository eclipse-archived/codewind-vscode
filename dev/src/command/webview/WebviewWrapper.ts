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

import * as vscode from "vscode";

import { CWImage } from "../../constants/CWImages";
import WebviewUtil from "./WebviewUtil";
import Log from "../../Logger";
import MCUtil from "../../MCUtil";

export interface WebviewResourceProvider {
    getStylesheet(path: string): string;
    /**
     *
     * @param forceThemeColour - Set this to override the theme detection and use a particular theme's icon.
     *  If forceThemeColour is "dark", the dark theme version of the icon will be used.
     *  This is useful if the background the image is being shown on is known, eg if it is on a button.
     */
    getImage(image: CWImage, forceThemeColour?: "dark" | "light" | undefined): string;
}

const VSC_RESOURCE_SCHEME = "vscode-resource:";
const CONFIG_SECTION_WORKBENCH = "workbench";
const CONFIG_THEMECOLOR = "colorTheme";

export abstract class WebviewWrapper {

    protected readonly webPanel: vscode.WebviewPanel;
    private readonly resourceProvider: WebviewResourceProvider;

    private _isDarkThemeActive: boolean;
    private readonly themeChangeListener: vscode.Disposable;

    /**
     * Create and open the webview.
     *
     * **Subclass must call** `this.refresh()` after performing all initialization,
     *  since we want to execute this constructor, then sub constructor, then refresh.
     */
    constructor(
        protected readonly title: string,
        titleImage: CWImage,
        viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active,
    ) {
        this.webPanel = vscode.window.createWebviewPanel(title, title, viewColumn, WebviewUtil.getWebviewOptions());

        this.webPanel.reveal();
        this.webPanel.onDidDispose(() => {
            this.onDidDispose();
        });

        this.webPanel.iconPath = titleImage.paths;

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

        this._isDarkThemeActive = this.isDarkThemeActive();
        // make sure to dispose of this listener when the webview is closed
        this.themeChangeListener = vscode.workspace.onDidChangeConfiguration(this.onDidChangeColorTheme);

        this.resourceProvider = {
            getImage: (image, forceThemeColour) => {
                let useDarkThemeImage;
                if (forceThemeColour) {
                    if (forceThemeColour === "dark") {
                        useDarkThemeImage = true;
                    }
                    else {
                        useDarkThemeImage = false;
                    }
                }
                else {
                    useDarkThemeImage = this._isDarkThemeActive;
                }

                const fsUri = useDarkThemeImage ? image.paths.dark : image.paths.light;
                if (global.isTheia) {
                    return VSC_RESOURCE_SCHEME + fsUri.fsPath;
                }
                return this.webPanel.webview.asWebviewUri(fsUri).toString();
            },
            getStylesheet: (filename: string) => {
                const fsUri = WebviewUtil.getCssPath(filename);
                if (global.isTheia) {
                    return VSC_RESOURCE_SCHEME + fsUri.fsPath;
                }
                return this.webPanel.webview.asWebviewUri(fsUri).toString();
            }
        };
    }

    private isDarkThemeActive(): boolean {
        const themeName = vscode.workspace.getConfiguration(CONFIG_SECTION_WORKBENCH).get<string | undefined>(CONFIG_THEMECOLOR);
        if (themeName == null) {
            // the default theme is dark
            return true;
        }
        else {
            // if it includes "light", it's light, else we have to assume it is dark.
            return !(themeName.toLowerCase().includes("light"));
        }
    }

    /**
     * Refresh this page if the theme changes
     */
    private readonly onDidChangeColorTheme = (event: vscode.ConfigurationChangeEvent): void => {
        if (!event.affectsConfiguration(`${CONFIG_SECTION_WORKBENCH}.${CONFIG_THEMECOLOR}`)) {
            return;
        }
        const wasDarkTheme = this._isDarkThemeActive;
        this._isDarkThemeActive = this.isDarkThemeActive();
        if (wasDarkTheme !== this._isDarkThemeActive) {
            this.refresh();
        }
    }

    public reveal(): void {
        this.webPanel.reveal();
    }

    public dispose(): void {
        this.webPanel.dispose();
        this.themeChangeListener.dispose();
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
