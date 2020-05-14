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

import Project from "../../codewind/project/Project";
import Log from "../../Logger";
import DebugUtils from "../../codewind/project/DebugUtils";
import Translator from "../../constants/strings/Translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import { ProgressUpdate } from "../../codewind/Types";

const STRING_NS = StringNamespaces.DEBUG;

export default async function attachDebuggerCmd(project: Project): Promise<void> {
    try {
        await attachDebugger(project);
    }
    catch (err) {
        Log.e(`Attach debugger to ${project.name} failed`, err);
        vscode.window.showErrorMessage(`${MCUtil.errToString(err)}`);
    }
}

export async function attachDebugger(project: Project, progress?: vscode.Progress<ProgressUpdate>): Promise<void> {
    // This should be longer than the timeout we pass to VSCode through the debug config, or the default (whichever is longer).
    const debugConnectTimeoutS = 60;

    const connectingMsg = Translator.t(STRING_NS, "connectingToProject", { projectName: project.name });

    let resolveProgress: (() => void) | undefined;
    if (!progress) {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: `Attaching debugger to ${project.name}`
        }, (progress_) => {
            progress = progress_;
            return new Promise<void>((resolve) => {
                resolveProgress = resolve;
            })
        });
    }

    if (!progress) {
        throw new Error(`Error showing progress when ${connectingMsg}`);
    }

    try {
        Log.d(`${project.name} appears to be ready for debugging`);

        // will throw error if connection fails or timeout
        await MCUtil.promiseWithTimeout(DebugUtils.startDebugSession(project, progress),
            debugConnectTimeoutS * 1000,
            Translator.t(STRING_NS, "didNotConnectInTime", { timeoutS: debugConnectTimeoutS })
        );

        const successMsg = Translator.t(STRING_NS, "debuggerAttachSuccess", { projectName: project.name, debugUrl: project.debugUrl });
        vscode.window.showInformationMessage(successMsg);
        Log.i("Debugger attach success:", successMsg);
    }
    finally {
        if (resolveProgress) {
            resolveProgress();
        }
    }
}
