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

import InstallerWrapper, { InstallerCommands } from "../codewind/connection/InstallerWrapper";
import Log from "../Logger";
import MCUtil from "../MCUtil";
import CodewindManager from "../codewind/connection/CodewindManager";
import StringNamespaces from "../constants/strings/StringNamespaces";
import Translator from "../constants/strings/translator";

const STRING_NS = StringNamespaces.STARTUP;

export default async function removeImagesCmd(): Promise<void> {
    try {
        if (CodewindManager.instance.isStarted()) {
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
        await InstallerWrapper.installerExec(InstallerCommands.REMOVE);
    }
    catch (err) {
        if (!InstallerWrapper.isCancellation(err)) {
            Log.e("Error removing images", err);
            vscode.window.showErrorMessage("Error removing images: " + MCUtil.errToString(err));
        }
    }
}
