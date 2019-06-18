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

import Connection from "../microclimate/connection/Connection";
import { setRegistry } from "../microclimate/connection/Registry";
import * as MCUtil from "../MCUtil";
import Log from "../Logger";

export async function setRegistryCmd(connection: Connection): Promise<void> {
    try {
        await setRegistry(connection);
    }
    catch (err) {
        Log.e("Error doing setRegistryCmd", err);
        vscode.window.showErrorMessage(MCUtil.errToString(err));
    }
}
