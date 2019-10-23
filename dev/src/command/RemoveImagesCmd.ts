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

import CLIWrapper from "../codewind/connection/CLIWrapper";
import Log from "../Logger";
import MCUtil from "../MCUtil";
import StringNamespaces from "../constants/strings/StringNamespaces";
import Translator from "../constants/strings/translator";
import LocalCodewindManager from "../codewind/connection/local/LocalCodewindManager";
import CLILifecycleWrapper from "../codewind/connection/local/CLILifecycleWrapper";

const STRING_NS = StringNamespaces.STARTUP;

export default async function removeImagesCmd(): Promise<void> {
    try {
        if (LocalCodewindManager.instance.isStarted) {
            vscode.window.showWarningMessage(Translator.t(STRING_NS, "removeImagesBlockedStillRunning"));
            return;
        }

        const positiveResponse = "Remove Images";
        const response = await vscode.window.showWarningMessage(Translator.t(STRING_NS, "removeImagesModalWarning"),
            { modal: true }, positiveResponse
        );

        if (response !== positiveResponse) {
            return;
        }

        Log.i("Removing Codewind images");
        await CLILifecycleWrapper.removeAllImages();
    }
    catch (err) {
        if (!CLIWrapper.isCancellation(err)) {
            Log.e("Error removing images", err);
            vscode.window.showErrorMessage("Error removing images: " + MCUtil.errToString(err));
        }
    }
}
