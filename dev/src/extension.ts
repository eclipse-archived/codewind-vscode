/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

"use strict";
import * as vscode from "vscode";

import { createCommands } from "./command/CommandUtil";
import createViews from "./view/InitViews";
import Log from "./Logger";

import Translator from "./constants/strings/translator";
import StringNamespaces from "./constants/strings/StringNamespaces";
import connectLocalCodewindCmd from "./command/StartCodewindCmd";
import Constants from "./constants/Constants";
import ConnectionManager from "./codewind/connection/ConnectionManager";

// configures json as the language of the codewind settings file.
function setSettingsFileLanguage(doc: vscode.TextDocument): void {
    // sometimes the path has .git appended, see https://github.com/Microsoft/vscode/issues/22561
    // since we are using the uri, the path separator will always be a forward slash.
    if ((doc.uri.scheme === "file" && doc.uri.path.endsWith(`/${Constants.PROJ_SETTINGS_FILE_NAME}`)) ||
        doc.uri.scheme === "git" && doc.uri.path.endsWith(`/${Constants.PROJ_SETTINGS_FILE_NAME}.git`)) {
        vscode.languages.setTextDocumentLanguage(doc, "json");
    }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext): Promise<void> {

    process.on("unhandledRejection", (err) => Log.e("Unhandled promise rejection:", err));

    // Initialize our globals
    global.__extRoot = context.extensionPath;
    // Declared as 'any' type, but will always be assigned globalState which is a vscode.Memento
    global.extGlobalState = context.globalState;

    // https://github.com/theia-ide/theia/issues/5501
    global.isTheia = vscode.env.appName.toLowerCase().includes("theia");

    Log.setLogFilePath(context);
    Log.i("Finished activating logger");

    try {
        await Translator.init();
    }
    catch (err) {
        // This string can't be translated for obvious reasons :)
        const errmsg = "Error initializing i18next - placeholder strings will be used! " + (err.message || err);        // non-nls
        Log.e(errmsg, err);
        vscode.window.showErrorMessage(errmsg);
    }
    const msg = Translator.t(StringNamespaces.DEFAULT, "activeMsg");
    // Make sure i18next loaded the strings properly here.
    Log.i("activeMsg:", msg);
    // vscode.window.showInformationMessage(msg);

    const subscriptions: vscode.Disposable[] = [
        ...createViews(),
        ...createCommands(),
        // ...createDebug()
    ];

    subscriptions.push(ConnectionManager.instance);

    // configure json as the language of the codewind settings file.  ensure that this is applied
    // to any settings file active in the editor at the time this extension activates.
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc) => setSettingsFileLanguage(doc)));
    setImmediate(() => {
        if (vscode.window.activeTextEditor) {
            setSettingsFileLanguage(vscode.window.activeTextEditor.document);
        }
    });

    await ConnectionManager.instance.activate();
    // Connect to local codewind if it's started, but don't start it automatically.
    connectLocalCodewindCmd(false);

    subscriptions.forEach((e) => {
        context.subscriptions.push(e);
    });

    Log.d("Finished activating");
}

// this method is called when your extension is deactivated
export function deactivate(): void {
    // nothing here
}
