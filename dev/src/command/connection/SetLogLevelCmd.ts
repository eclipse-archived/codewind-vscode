

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

import Connection from "../../codewind/connection/Connection";
import MCUtil from "../../MCUtil";
import Log from "../../Logger";
import { PFELogLevels } from "../../codewind/Types";

export async function setLogLevelCmd(connection: Connection): Promise<void> {
    let levelsResponse: PFELogLevels;
    try {
        levelsResponse = await connection.requester.getPFELogLevels();
    }
    catch (err) {
        const errMsg = `Failed to retrieve log levels`;
        Log.e(errMsg, err);
        vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
        return;
    }

    try {
        // The levels are given lowest (error) to highest (trace). They should be displayed with trace at the top.
        // If you change this, also change the message below which specifies the highest level
        const levelsSorted = levelsResponse.allLevels.reverse();

        const levelOptions: (vscode.QuickPickItem & { index: number })[] = levelsSorted.map((level, index) => {
            const userFriendlyLevel = MCUtil.uppercaseFirstChar(level);
            const isSelectedLevel = levelsResponse.currentLevel === level;

            return {
                label: userFriendlyLevel,
                description: isSelectedLevel ? "(Current level)" : undefined,
                picked: isSelectedLevel,
                index,
            };
        });

        const selected = await vscode.window.showQuickPick(levelOptions, {
            canPickMany: false,
            ignoreFocusOut: false,
            placeHolder: `Select the new logging level. ${levelOptions[0].label} is the highest level (has the most output).`,
        });
        if (selected == null) {
            return;
        }
        // look up the selected level by index to get the level we can send back to PFE
        const selectedLevel = levelsSorted[selected.index];
        await connection.requester.setPFELogLevel(selectedLevel);
        vscode.window.showInformationMessage(`Set server logging level for ${connection.label} to ${selected.label}`);
    }
    catch (err) {
        const errMsg = `Failed to set log level`;
        Log.e(errMsg, err);
        vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
    }
}
