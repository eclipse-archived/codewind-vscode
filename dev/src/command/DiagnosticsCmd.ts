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

import ConnectionManager from "../codewind/connection/ConnectionManager";
import MCUtil from "../MCUtil";
import CLIWrapper from "../codewind/cli/CLIWrapper";
import { CLICommandRunner } from "../codewind/cli/CLICommandRunner";
import Log from "../Logger";

export default async function diagnosticsCommand(): Promise<void> {

    const connectedConnections = ConnectionManager.instance.connections.filter((conn) => conn.isConnected);

    let confirmPromptMsg;
    if (connectedConnections.length === 0) {
        confirmPromptMsg = "There are no enabled connections to capture diagnostics for. "
            + "Diagnostics can still be run to collect the VS Code logs.";
    }
    else if (connectedConnections.length === 1) {
        confirmPromptMsg = `Diagnostics will be collected for ${connectedConnections[0].label}.\nThe VS Code logs are always collected.`;
    }
    else {
        confirmPromptMsg = `Diagnostics will be collected for ${MCUtil.joinList(connectedConnections.map((conn) => conn.label), "and")}.\n` +
            `The VS Code logs are always collected.`;
    }

    const continueBtn = "Continue";
    const confirmRes = await vscode.window.showInformationMessage(confirmPromptMsg, { modal: true }, continueBtn);
    if (confirmRes !== continueBtn) {
        return;
    }

    const includeProjectsQPIs: vscode.QuickPickItem[] = [{
        label: `Don't include projects`,
    }, {
        label: `Include projects`,
        detail: `Capture your current Codewind project folders, and any project container/pod logs.`,
    }];

    const includeProjectsRes = await vscode.window.showQuickPick(includeProjectsQPIs, {
        ignoreFocusOut: true,
        placeHolder: `Select whether or not to include projects in the diagnostics.`
    });

    if (includeProjectsRes == null) {
        // cancelled
        return;
    }

    try {
        const diagnosticsResult = await CLICommandRunner.diagnostics(includeProjectsRes === includeProjectsQPIs[1])
        const openFolderBtn = `Open Folder`;

        const hadWarnings = diagnosticsResult.warnings_encountered.length > 0;
        if (hadWarnings) {
            CLIWrapper.cliOutputChannel.show();
        }

        vscode.window.showInformationMessage(
            `Diagnostics collection succeeded${hadWarnings ? " (with warnings)" : ""} to ${diagnosticsResult.outputdir}`,
            openFolderBtn
        ).then(async (res) => {
            if (res === openFolderBtn) {
                MCUtil.revealDirInOS(diagnosticsResult.outputdir);
            }
        });
    }
    catch (err) {
        if (!CLIWrapper.isCancellation(err)) {
            Log.e(`Error collecting diagnostics`, err);
            CLIWrapper.showCLIError(`Error collecting diagnostics`);
        }
    }
}
