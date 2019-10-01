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
import ConnectionOverview from "../webview/ConnectionOverview";

const NEW_CONNECTION_TITLE = "New Codewind Connection";
// const NEW_CONNECTION_NO_STEPS = 2;
// const BACK_BTN_MSG = "back-button-msg";

// const CW_INGRESS_PROTOCOL = "http";         // WILL CHANGE to https

export async function newRemoteConnectionCmd(): Promise<void> {

    /*
    let ingressUrlStr: string | undefined;
    let userLabel: string | undefined;
    while (ingressUrlStr == null || userLabel == null) {
        ingressUrlStr = await getIngressUrl(ingressUrlStr);
        if (ingressUrlStr == null) {
            return;
        }

        try {
            userLabel = await getConnectionLabel(ingressUrlStr);
            if (userLabel == null) {
                return;
            }
        }
        catch (err) {
            if (err === BACK_BTN_MSG) {
                continue;
            }
            throw err;
        }
    }
    */

    const connectionLabel = await getConnectionLabel();
    if (!connectionLabel) {
        return;
    }
    ConnectionOverview.showForNewConnection(connectionLabel);
}

async function getConnectionLabel(): Promise<string | undefined> {
    const labelIb = vscode.window.createInputBox();
    labelIb.ignoreFocusOut = true;
    labelIb.placeholder = "My IBM Cloud";
    labelIb.prompt = `Enter a label for your new remote Codewind connection.`;
    // labelIb.step = 2;
    // labelIb.totalSteps = NEW_CONNECTION_NO_STEPS;
    labelIb.title = NEW_CONNECTION_TITLE;
    labelIb.onDidChangeValue((input) => {
        if (!input) {
            labelIb.validationMessage = "The label cannot be empty.";
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
            resolve(labelIb.value);
        });
    })
    .finally(() => labelIb.hide());
}

/*
async function getIngressUrl(previousValue: string | undefined): Promise<string | undefined> {
    const ingressIb = vscode.window.createInputBox();
    ingressIb.ignoreFocusOut = true;
    ingressIb.placeholder = "codewind-workspace-mycluster.nip.io";
    if (previousValue) {
        ingressIb.value = previousValue;
    }
    ingressIb.prompt = `Enter the URL to the Codewind ingress you wish to connect to. The protocol is assumed to be ${CW_INGRESS_PROTOCOL}.`;
    ingressIb.step = 1;
    ingressIb.totalSteps = NEW_CONNECTION_NO_STEPS;
    ingressIb.title = NEW_CONNECTION_TITLE;
    ingressIb.onDidChangeValue((input) => {
        ingressIb.validationMessage = validateCwIngress(input);
    });
    ingressIb.show();

    return new Promise<string | undefined>((resolve) => {
        ingressIb.onDidHide(() => resolve(undefined));
        ingressIb.onDidAccept(async () => {
            const inputWithProtocol = prependProtocol(ingressIb.value);
            const pingable = await Requester.ping(inputWithProtocol);
            if (pingable) {
                resolve(inputWithProtocol);
            }
            else {
                ingressIb.validationMessage =
                    `Failed to contact "${inputWithProtocol}". Please check the URL and ensure it is reachable from your machine.`;
            }
        });
    })
    .finally(() => ingressIb.hide());
}

function prependProtocol(input: string): string {
    if (!input.startsWith(CW_INGRESS_PROTOCOL)) {
        input = CW_INGRESS_PROTOCOL + "://" + input;
    }
    return input;
}

function validateCwIngress(input: string): string | undefined {
    if (!input) {
        return "The ingress URL cannot be empty.";
    }
    input = prependProtocol(input);
    let url;
    try {
        url = new URL(input);
        Log.d("Got a good ingress url " + url);
    }
    catch (err) {
        return `"${input}" is not a valid URL`;
    }
    return undefined;
}
*/
