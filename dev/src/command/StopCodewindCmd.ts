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

import InstallerWrapper from "../codewind/connection/InstallerWrapper";
import Log from "../Logger";
import MCUtil from "../MCUtil";
import CodewindManager from "../codewind/connection/CodewindManager";

export default async function stopCodewindCmd(): Promise<void> {
    try {
        Log.i("Stopping Codewind");
        await CodewindManager.instance.stopCodewind();
    }
    catch (err) {
        if (!InstallerWrapper.isCancellation(err)) {
            Log.e("Error stopping codewind", err);
            vscode.window.showErrorMessage("Error stopping Codewind: " + MCUtil.errToString(err));
        }
    }
}
