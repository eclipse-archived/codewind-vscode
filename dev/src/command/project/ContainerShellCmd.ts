/*******************************************************************************
 * Copyright (c) 2018, 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import Project from "../../codewind/project/Project";
import Translator from "../../constants/strings/Translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Log from "../../Logger";
import MCUtil from "../../MCUtil";

export default async function containerShellCmd(project: Project): Promise<void> {
    // true for pod (remote), false for container (local)
    const usePod = project.connection.isRemote;
    const podOrContainerID = usePod ? project.podName : project.containerID;

    if (!podOrContainerID) {
        const podOrContainer = usePod ? "pod" : "container";
        const msg = Translator.t(StringNamespaces.CMD_MISC, "noContainerForShell", { projectName: project.name, podOrContainer });
        Log.i(msg)
        vscode.window.showWarningMessage(msg);
        return;
    }

    // exec bash if it's installed, else exec sh
    // prefix the path with extra slash to work around https://github.com/eclipse/codewind/issues/823 (no effect on unix-like)
    const inContainerExec = `//usr/bin/env sh -c "if type bash > /dev/null; then bash; else sh; fi"`;      // non-nls

    const options: vscode.TerminalOptions = {
        name: `${project.name} shell`,        // non-nls
    };

    let textToSendToTerminal;
    if (usePod) {
        const command = await MCUtil.getKubeClient();
        if (command == null) {
            Log.i(`Container shell failed to find kube client`);
            // getKubeclient will show the error message
            return;
        }

        if (usePod && !project.connection.namespace) {
            const noNamespaceMsg = `Cannot open container shell for ${project.name}: No namespace set for ${project.connection}`;
            Log.e(noNamespaceMsg);
            vscode.window.showErrorMessage(noNamespaceMsg);
            return;
        }

        textToSendToTerminal = `${command} exec -n ${project.connection.namespace} -it ${podOrContainerID} -- ${inContainerExec}`;
    }
    else {
        textToSendToTerminal = `docker exec -it ${podOrContainerID} ${inContainerExec}`
    }

    const term: vscode.Terminal = vscode.window.createTerminal(options);
    term.sendText(textToSendToTerminal, true);     // non-nls
    term.show();
    Log.d(`Showing container shell for ${project.name}`);
}
