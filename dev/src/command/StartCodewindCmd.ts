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

// import * as vscode from "vscode";

import Log from "../Logger";
import CodewindManager from "../codewind/connection/CodewindManager";

export default async function startCodewindCmd(): Promise<void> {
    Log.i("Start Codewind Cmd");
    await CodewindManager.instance.startCodewind();
}
