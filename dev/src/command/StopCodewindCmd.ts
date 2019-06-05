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
import CodewindManager, { CodewindStates } from "../microclimate/connection/CodewindManager";

export default async function stopCodewindCmd(): Promise<void> {
    try {
        Log.i("Stopping Codewind");
        await InstallerWrapper.installerExec(InstallerCommands.STOP_ALL);
        CodewindManager.instance.state = CodewindStates.STOPPED;
    }
    catch (err) {
        if (!InstallerWrapper.isCancellation(err)) {
            Log.e("Error stopping codewind", err);
            vscode.window.showErrorMessage("Error stopping Codewind: " + MCUtil.errToString(err));
        }
    }
}
