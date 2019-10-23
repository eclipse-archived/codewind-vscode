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

import Log from "../Logger";
import LocalCodewindManager from "../codewind/connection/local/LocalCodewindManager";
import CLILifecycleWrapper from "../codewind/connection/local/CLILifecycleWrapper";
import MCUtil from "../MCUtil";

/**
 *
 * @param start
 *      Set to false to just connect to Codewind if it's already started, and do nothing if it's stopped.
 *      This is so that we can connect if it's already started on activation, while requiring user interaction to start the containers.
 */
export default async function connectLocalCodewindCmd(start: boolean = true): Promise<void> {
    Log.i("Connect Local Codewind Cmd");

    try {
        if (global.isTheia) {
            await LocalCodewindManager.instance.waitForCodewindToStartTheia();
            return;
        }

        const startedStatus = await CLILifecycleWrapper.getCodewindStartedStatus();

        if (startedStatus === "started-correct-version") {
            const url = await CLILifecycleWrapper.getCodewindUrl();
            Log.i("The correct version of local Codewind is already started at " + url);
            if (url == null) {
                vscode.window.showErrorMessage("Could not determine URL of started Codewind instance");
                return;
            }
            await LocalCodewindManager.instance.connect(url);
            return;
        }
        else if (startedStatus === "started-wrong-version") {
            // Force start to prompt the user to upgrade; they can reject it if they like.
            start = true;
        }

        if (start) {
            await LocalCodewindManager.instance.startCodewind();
        }
    }
    catch (err) {
        Log.e("StartCodewindCmd error", err);
        vscode.window.showErrorMessage(`Error initializing Codewind: ${MCUtil.errToString(err)}`);
    }
}
