/*******************************************************************************
 * Copyright (c) 2018, 2020 IBM Corporation and others.
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
import "source-map-support/register";

import { createCommands } from "./command/CommandUtil";
import createViews from "./view/InitViews";
import Log from "./Logger";

import Translator from "./constants/strings/Translator";
import StringNamespaces from "./constants/strings/StringNamespaces";
import connectLocalCodewindCmd from "./command/StartCodewindCmd";
import Constants from "./constants/Constants";
import ConnectionManager from "./codewind/connection/ConnectionManager";
import LocalCodewindManager from "./codewind/connection/local/LocalCodewindManager";
import { CWConfigurations } from "./constants/Configurations";
import showHomePageCmd from "./command/HomePageCmd";
import MCUtil from "./MCUtil";
import CLIWrapper from "./codewind/cli/CLIWrapper";
import { CodewindStates } from "./codewind/connection/local/CodewindStates";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        await activateInner(context);
    }
    catch (err) {
        Log.e(`Uncaught error activating`, err);
        throw err;
    }
}

async function activateInner(context: vscode.ExtensionContext): Promise<void> {
    process.on("unhandledRejection", (err) => Log.e("Unhandled promise rejection:", err));

    Log.setLogFilePath(context);
    Log.i("Finished activating logger");

    // Initialize our globals
    global.EXTENSION_ROOT = context.extensionPath;
    // Declared as 'any' type, but will always be assigned globalState which is a vscode.Memento
    global.EXT_GLOBAL_STATE = context.globalState;
    global.IS_THEIA = vscode.env.appName.toLowerCase().includes("theia");
    global.IS_CHE = !!process.env[Constants.CHE_WORKSPACEID_ENVVAR]

    const thisExtension = vscode.extensions.getExtension("IBM.codewind")!;
    global.EXT_VERSION = thisExtension.packageJSON.version;
    global.CODEWIND_IMAGE_TAG = thisExtension.packageJSON.codewindImageVersion;
    global.APPSODY_VERSION = thisExtension.packageJSON.appsodyVersion;

    Log.i(`Node version is ${process.version}`);
    Log.i(`Extension version is ${global.EXT_VERSION}`);
    Log.i(`Codewind image version is ${global.CODEWIND_IMAGE_TAG}`);
    Log.i(`Appsody version is ${global.APPSODY_VERSION}`);
    Log.i(`Running in Theia ? ${global.IS_THEIA}`);
    Log.i(`Running in Che ? ${global.IS_CHE}`);

    try {
        await Translator.init();
    }
    catch (err) {
        // This string can't be translated for obvious reasons :)
        const errMsg = "Error initializing i18next - placeholder strings will be used! " + (err.message || err);        // non-nls
        Log.e(errMsg, err);
        vscode.window.showErrorMessage(errMsg);
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
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc) => MCUtil.setLanguageIfCWSettings(doc)));
    setImmediate(() => {
        if (vscode.window.activeTextEditor) {
            MCUtil.setLanguageIfCWSettings(vscode.window.activeTextEditor.document);
        }
    });

    if (!global.IS_CHE && CWConfigurations.SHOW_HOMEPAGE.get()) {
        showHomePageCmd();
    }

    subscriptions.forEach((e) => {
        context.subscriptions.push(e);
    });

    CLIWrapper.initialize()
    .then(async () => {
        LocalCodewindManager.instance.setState(CodewindStates.STOPPED);
        await ConnectionManager.instance.activate();

        // Connect to local codewind if it's started, but don't start it automatically.
        await connectLocalCodewindCmd(LocalCodewindManager.instance, false);

        Log.d(`Finished async activation`);
    })
    .catch((err) => {
        Log.e(`Uncaught error in async initialize!`, err);
        vscode.window.showErrorMessage(`Unexpected error activating Codewind: ${MCUtil.errToString(err)}`);
    });

    Log.d("Finished activating");
}

// this method is called when your extension is deactivated
export function deactivate(): void {
    // nothing here
}
