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

import * as MCUtil from "../MCUtil";
import { promptForProject } from "../command/CommandUtil";
import Resources from "../constants/Resources";
import Project from "../microclimate/project/Project";
import ProjectState from "../microclimate/project/ProjectState";
import Log from "../Logger";
import ProjectType from "../microclimate/project/ProjectType";
import DebugUtils from "../microclimate/project/DebugUtils";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

const STRING_NS = StringNamespaces.DEBUG;

/**
 * Attach the debugger to the given project. Returns if we attached the debugger successfully.
 *
 * NOTE: Do not throw or reject from this function in case this command is invoked directly - vscode won't handle the rejection.
 * Show the user our error message here instead, and return a success status since we're also calling this function from the restart project code.
 */
export default async function attachDebuggerCmd(project: Project, isRestart: boolean = false): Promise<boolean> {
    if (project == null) {
        const selected = await promptForProject(...ProjectState.getDebuggableStates());
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return false;
        }
        project = selected;
    }

    try {
        if (isRestart) {
            Log.d("Attach debugger runnning as part of a restart");
            // Intermittently for restarting Microprofile projects, the debugger will try to connect too soon,
            // so add an extra delay if it's MP and Starting.
            // This doesn't really slow anything down because the server is still starting anyway.
            const libertyDelayMs = 2500;
            if (project.type.type === ProjectType.Types.MICROPROFILE && project.state.appState === ProjectState.AppStates.DEBUG_STARTING) {
                Log.d(`Waiting extra ${libertyDelayMs}ms for Starting Liberty project`);

                const delayPromise: Promise<void> = new Promise( (resolve) => setTimeout(resolve, libertyDelayMs));

                const preDebugDelayMsg = Translator.t(STRING_NS, "waitingBeforeDebugAttachStatusMsg", { projectName: project.name });
                vscode.window.setStatusBarMessage(`${Resources.getOcticon(Resources.Octicons.bug, true)} ${preDebugDelayMsg}`, delayPromise);
                await delayPromise;
            }
        }

        // This should be longer than the timeout we pass to VSCode through the debug config, or the default (whichever is longer).
        const debugConnectTimeoutS = 60;

        Log.d(`${project.name} appears to be ready for debugging`);
        const startDebugWithTimeout = MCUtil.promiseWithTimeout(DebugUtils.startDebugSession(project),
            debugConnectTimeoutS * 1000,
            Translator.t(STRING_NS, "didNotConnectInTime", { timeoutS: debugConnectTimeoutS })
        );

        const connectingMsg = Translator.t(STRING_NS, "connectingToProject", { projectName: project.name });
        vscode.window.setStatusBarMessage(`${Resources.getOcticon(Resources.Octicons.bug, true)} ${connectingMsg}`,     // non-nls
                startDebugWithTimeout);

        // will throw error if connection fails or timeout
        const success = await startDebugWithTimeout;

        if (success) {
            const successMsg = Translator.t(STRING_NS, "debuggerAttachSuccess", { projectName: project.name, debugUrl: project.debugUrl });
            Log.i("Debugger attach success:", successMsg);
            vscode.window.showInformationMessage(successMsg);
        }
        else {
            onFailure(project);
        }
        return success;
    }
    catch (err) {
        onFailure(project, err);
        return false;
    }
}

function onFailure(project: Project, err?: Error): void {
    const debugUrl = project.debugUrl;
    let failMsg;
    if (debugUrl != null) {
        failMsg = Translator.t(STRING_NS, "failedToAttachWithUrl", { projectName: project.name, debugUrl });
    }
    else {
        failMsg = Translator.t(STRING_NS, "failedToAttach", { projectName: project.name });
    }

    if (err) {
        const extraErrMsg: string = err.message ? err.message : "";         // non-nls
        if (extraErrMsg) {
            failMsg += Translator.t(STRING_NS, "errDetailSeparator") + extraErrMsg;
        }
    }

    Log.e(failMsg, err);
    vscode.window.showErrorMessage(failMsg);
}
