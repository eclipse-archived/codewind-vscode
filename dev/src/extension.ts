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
import "source-map-support/register";
import * as vscode from "vscode";
import * as fs from "fs-extra";

import { createCommands } from "./command/CommandUtil";
import createViews from "./view/InitViews";
import Log from "./Logger";

import Translator from "./constants/strings/Translator";
import StringNamespaces from "./constants/strings/StringNamespaces";
import connectLocalCodewindCmd from "./command/StartCodewindCmd";
import ConnectionManager from "./codewind/connection/ConnectionManager";
import LocalCodewindManager from "./codewind/connection/local/LocalCodewindManager";
import { CWConfigurations } from "./constants/Configurations";
import showHomePageCmd from "./command/HomePageCmd";
import MCUtil from "./MCUtil";
import CLIWrapper from "./codewind/cli/CLIWrapper";
import { CodewindStates } from "./codewind/connection/local/CodewindStates";
import CWExtensionContext from "./CWExtensionContext";
import Constants from "./constants/Constants";

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
    Log.i(`Node version is ${process.version}`);

    const cwContext = CWExtensionContext.init(context);
    Log.i(`Extension context is`, cwContext);

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

    if (!CWExtensionContext.get().isChe && CWConfigurations.SHOW_HOMEPAGE.get()) {
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
        const userErrMsg = `Error activating Codewind: ${MCUtil.errToString(err)}`;
        CLIWrapper.showCLIError(userErrMsg);
        CLIWrapper.cliOutputChannel.appendLine(userErrMsg);
        LocalCodewindManager.instance.setState(CodewindStates.ERR_SETUP);
    });

    deletePendingDirs();

    Log.d("Finished activating");
}

// this method is called when your extension is deactivated
export function deactivate(): void {
    // nothing here
}

async function deletePendingDirs(): Promise<void> {
    const globalState = CWExtensionContext.get().globalState;
    const toDelete = globalState.get<string>(Constants.DIR_TO_DELETE_KEY);
    try {
        if (toDelete != null) {
            await fs.remove(toDelete);
            Log.i(`Deleted ${toDelete} on activation`);
            vscode.window.showInformationMessage(`Deleted ${toDelete}`);
        }
    }
    catch (err) {
        Log.e(`Failed to directory that was pending ${toDelete}`, err);
    }
    finally {
        // always reset the extension state, so we only try to delete the dir once even if it fails.
        globalState.update(Constants.DIR_TO_DELETE_KEY, undefined);
    }
}
