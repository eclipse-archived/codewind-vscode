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
import activateConnection from "./connection/ActivateConnectionCmd";

export default async function startCodewindCmd(): Promise<void> {
    Log.i("Starting Codewind");
    try {
        await CodewindManager.instance.startCodewind();
        await activateConnection();
    }
    catch (err) {
        if (!InstallerWrapper.isCancellation(err)) {
            Log.e("Error starting codewind", err);
            vscode.window.showErrorMessage(MCUtil.errToString(err));
        }
    }
}
