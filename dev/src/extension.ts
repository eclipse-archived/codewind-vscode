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
import ConnectionManager from "./microclimate/connection/ConnectionManager";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext): Promise<void> {

    process.on("unhandledRejection", (err) => Log.e("Unhandled promise rejection:", err));

    // Initialize our globals
    global.__extRoot = context.extensionPath;
    // Declared as 'any' type, but will always be assigned globalState which is a vscode.Memento
    global.extGlobalState = context.globalState;

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
    subscriptions.forEach((e) => {
        context.subscriptions.push(e);
    });

    Log.d("Finished activating");
}

// this method is called when your extension is deactivated
export function deactivate(): void {
    // nothing here
}
