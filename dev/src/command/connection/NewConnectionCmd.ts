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
import ConnectionOverviewWrapper from "../webview/ConnectionOverviewPageWrapper";

const NEW_CONNECTION_TITLE = "New Codewind Connection";

export default async function newRemoteConnectionCmd(openToSide: boolean = false): Promise<void> {

    const connectionLabel = await getConnectionLabel();
    if (!connectionLabel) {
        return;
    }
    ConnectionOverviewWrapper.showForNewConnection(connectionLabel, openToSide);
}

async function getConnectionLabel(): Promise<string | undefined> {
    const labelIb = vscode.window.createInputBox();
    labelIb.ignoreFocusOut = true;
    labelIb.placeholder = "My Cluster";
    labelIb.prompt = `Enter a label for your new remote Codewind connection.`;
    labelIb.title = NEW_CONNECTION_TITLE;
    labelIb.onDidChangeValue((input) => {
        if (!input || input.trim() === "") {
            labelIb.validationMessage = "The label cannot be empty or contain only whitespace.";
        }
        else {
            labelIb.validationMessage = undefined;
        }
    });
    // labelIb.buttons = [ vscode.QuickInputButtons.Back ];
    labelIb.show();

    return new Promise<string | undefined>((resolve) => {
        // labelIb.onDidTriggerButton((btn) => {
        //     if (btn === vscode.QuickInputButtons.Back) {
        //         reject(BACK_BTN_MSG);
        //     }
        // });
        labelIb.onDidHide(() => resolve(undefined));
        labelIb.onDidAccept(async () => {
            if (labelIb.validationMessage) {
                // prevent saving invalid
                return;
            }
            resolve(labelIb.value.trim());
        });
    })
    .finally(() => labelIb.hide());
}
