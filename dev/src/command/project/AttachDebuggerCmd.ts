/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import MCUtil from "../../MCUtil";

import { getOcticon, Octicons } from "../../constants/CWImages";
import Project from "../../codewind/project/Project";
import Log from "../../Logger";
import DebugUtils from "../../codewind/project/DebugUtils";
import Translator from "../../constants/strings/Translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";

const STRING_NS = StringNamespaces.DEBUG;

export default async function attachDebuggerCmd(project: Project): Promise<void> {
    try {
        await attachDebugger(project);
    }
    catch (err) {
        Log.e(`Attach debugger to ${project.name} failed`, err);
        vscode.window.showErrorMessage(MCUtil.errToString(err));
    }
}

export async function attachDebugger(project: Project): Promise<void> {
    // This should be longer than the timeout we pass to VSCode through the debug config, or the default (whichever is longer).
    const debugConnectTimeoutS = 60;

    Log.d(`${project.name} appears to be ready for debugging`);
    const startDebugWithTimeout = MCUtil.promiseWithTimeout(DebugUtils.startDebugSession(project),
        debugConnectTimeoutS * 1000,
        Translator.t(STRING_NS, "didNotConnectInTime", { timeoutS: debugConnectTimeoutS })
    );

    const connectingMsg = Translator.t(STRING_NS, "connectingToProject", { projectName: project.name });
    vscode.window.setStatusBarMessage(`${getOcticon(Octicons.bug, true)} ${connectingMsg}`, startDebugWithTimeout);

    // will throw error if connection fails or timeout
    await startDebugWithTimeout;

    const successMsg = Translator.t(STRING_NS, "debuggerAttachSuccess", { projectName: project.name, debugUrl: project.debugUrl });
    Log.i("Debugger attach success:", successMsg);
    vscode.window.showInformationMessage(successMsg);
}
