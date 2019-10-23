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
import LocalCodewindManager from "../codewind/connection/local/LocalCodewindManager";

export default async function stopLocalCodewindCmd(): Promise<void> {
    try {
        Log.i("Stopping Local Codewind");
        await LocalCodewindManager.instance.stopCodewind();
    }
    catch (err) {
        if (!CLIWrapper.isCancellation(err)) {
            Log.e("Error stopping codewind", err);
            vscode.window.showErrorMessage("Error stopping Codewind: " + MCUtil.errToString(err));
        }
    }
}
