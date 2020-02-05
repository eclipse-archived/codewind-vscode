/*******************************************************************************
 * Copyright (c) 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import { HomePageWrapper } from "./webview/HomePageWrapper";
import Log from "../Logger";
import MCUtil from "../MCUtil";

export default async function showHomePageCmd(): Promise<void> {
    try {
        if (HomePageWrapper.instance) {
            HomePageWrapper.instance.reveal();
        }
        else {
            new HomePageWrapper().reveal();
        }
    }
    catch (err) {
        const errMsg = `Error showing Codewind homepage`;
        Log.e(errMsg, err);
        vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
    }
}
