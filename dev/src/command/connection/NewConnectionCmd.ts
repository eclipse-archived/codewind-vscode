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

import Log from "../../Logger";
import Connection from "../../codewind/connection/Connection";
import CWEnvironment from "../../codewind/connection/CWEnvironment";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import { CWConfigurations } from "../../constants/Configurations";
import MCUtil from "../../MCUtil";
import openWorkspaceCmd from "../OpenWorkspaceCmd";
import ConnectionManager from "../../codewind/connection/ConnectionManager";
import { URL } from "url";
import Requester from "../../codewind/project/Requester";

const STRING_NS = StringNamespaces.STARTUP;

const NEW_CONNECTION_TITLE = "New Codewind Connection";
const NEW_CONNECTION_NO_STEPS = 2;
const BACK_BTN_MSG = "back-button-msg";

const CW_INGRESS_PROTOCOL = "http";         // WILL CHANGE to https

export async function newRemoteConnectionCmd(): Promise<void> {

    let ingressUrl: string | undefined;
    let userLabel: string | undefined;
    while (ingressUrl == null || userLabel == null) {
        ingressUrl = await getIngressUrl(ingressUrl);
        if (ingressUrl == null) {
            return;
        }

        try {
            userLabel = await getConnectionLabel(ingressUrl);
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

    Log.i(`Creating new remote connection ${userLabel} to ${ingressUrl}`);
    const asUri = vscode.Uri.parse(ingressUrl);

    await createConnection(asUri, false, userLabel);
}

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

async function getConnectionLabel(ingressUrl: string): Promise<string | undefined> {
    const labelIb = vscode.window.createInputBox();
    labelIb.ignoreFocusOut = true;
    labelIb.placeholder = "My IBM Cloud";
    labelIb.prompt = `Enter a label for the connection to ${ingressUrl}.`;
    labelIb.step = 2;
    labelIb.totalSteps = NEW_CONNECTION_NO_STEPS;
    labelIb.title = NEW_CONNECTION_TITLE;
    labelIb.onDidChangeValue((input) => {
        if (!input) {
            labelIb.validationMessage = "The label cannot be empty.";
        }
        else {
            labelIb.validationMessage = undefined;
        }
    });
    labelIb.buttons = [ vscode.QuickInputButtons.Back ];
    labelIb.show();

    return new Promise<string | undefined>((resolve, reject) => {
        labelIb.onDidTriggerButton((btn) => {
            if (btn === vscode.QuickInputButtons.Back) {
                reject(BACK_BTN_MSG);
            }
        });
        labelIb.onDidHide(() => resolve(undefined));
        labelIb.onDidAccept(async () => {
            resolve(labelIb.value);
        });
    })
    .finally(() => labelIb.hide());
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

export async function createConnection(url: vscode.Uri, isLocalConnection: boolean, userLabel: string): Promise<Connection> {
    Log.i("Creating connection to " + url);
    const envData = await CWEnvironment.getEnvData(url);
    Log.i("Massaged env data:", envData);

    const connection = await ConnectionManager.instance.connect(url, envData, isLocalConnection, userLabel);
    await connection.initPromise;

    onConnectSuccess(connection);
    return connection;
}

/**
 * Show a 'connection succeeded' message and provide a button to open the connection's workspace. Doesn't need to be awaited.
 */
async function onConnectSuccess(connection: Connection): Promise<void> {
    Log.i("Successfully connected to codewind at " + connection.url);

    if (!await MCUtil.isUserInCwWorkspaceOrProject()) {
        // Provide a button to change their workspace to the codewind-workspace if they wish, and haven't disabled this feature.
        let promptOpenWs = vscode.workspace.getConfiguration().get(CWConfigurations.PROMPT_TO_OPEN_WORKSPACE);
        if (promptOpenWs == null) {
            promptOpenWs = true;
        }
        if (!promptOpenWs) {
            return;
        }

        const openWsBtn = "Open Workspace";
        const dontShowAgainBtn = "Hide This Message";
        const openWsRes = await vscode.window.showInformationMessage(Translator.t(STRING_NS, "openWorkspacePrompt"),
            { modal: true }, openWsBtn, dontShowAgainBtn
        );

        if (openWsRes === openWsBtn) {
            openWorkspaceCmd(connection);
        }
        else if (openWsRes === dontShowAgainBtn) {
            vscode.window.showInformationMessage(
                `You can re-enable the Open Workspace prompt by setting "${CWConfigurations.PROMPT_TO_OPEN_WORKSPACE}" in the Preferences.`
            );
            vscode.workspace.getConfiguration().update(CWConfigurations.PROMPT_TO_OPEN_WORKSPACE, false, vscode.ConfigurationTarget.Global);
        }
    }
}
