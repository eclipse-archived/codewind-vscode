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

import InstallerWrapper, { InstallerCommands } from "../microclimate/connection/InstallerWrapper";
import Log from "../Logger";
import * as MCUtil from "../MCUtil";
import CodewindManager from "../microclimate/connection/CodewindManager";

export default async function removeImagesCmd(): Promise<void> {
    try {
        Log.i("Removing Codewind images");
        if (CodewindManager.instance.isStarted()) {
            vscode.window.showWarningMessage("You cannot remove images if Codewind is still running");
            return;
        }

        const positiveResponse = "Remove Images";
        const response = await vscode.window.showWarningMessage(
            "Are you sure you want to remove all Codewind Docker images? They must be downloaded before you can start Codewind again.",
            { modal: true }, positiveResponse);

        if (response !== positiveResponse) {
            return;
        }

        await InstallerWrapper.installerExec(InstallerCommands.REMOVE);
    }
    catch (err) {
        if (!InstallerWrapper.isCancellation(err)) {
            Log.e("Error removing images", err);
            vscode.window.showErrorMessage("Error removing images: " + MCUtil.errToString(err));
        }
    }
}
