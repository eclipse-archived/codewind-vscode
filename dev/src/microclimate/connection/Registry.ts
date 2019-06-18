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

import * as vscode from "vscode";
import * as fs from "fs";
import { promisify } from "util";

import Log from "../../Logger";
import Requester from "../project/Requester";
import EndpointUtil, { MCEndpoints } from "../../constants/Endpoints";
import Connection from "./Connection";
import SocketEvents from "./SocketEvents";
import Constants from "../../constants/Constants";

let registryIsSet: boolean = global.isTheia;            // no registry required in local case

export function isRegistrySet(): boolean {
    return registryIsSet;
}

export async function setRegistry(connection: Connection): Promise<void> {
    Log.i(`Setting deployment registry, is currently set? ${registryIsSet}`);

    const registryStatus: {
        workspaceSettings: {
            deploymentRegistry: boolean;
            msg?: string;
        }
    } = await Requester.get(EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.REGISTRY));

    // tslint:disable-next-line: no-boolean-literal-compare
    if (registryStatus.workspaceSettings.deploymentRegistry === true) {
        registryIsSet = true;
    }
    else {
        registryIsSet = await setRegistryInner(connection);
    }
}

async function setRegistryInner(connection: Connection): Promise<boolean> {
    const registry = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        value: `docker-registry.default.svc:5000/eclipse-che`,
        prompt: `Please enter a deployment registry location. ` +
            `Examples of a registry hosts include Dockerhub, Quay, Artifactory or your cluster's internal registry.`,
        validateInput: validateRegistry,
    });

    if (registry == null) {
        return false;
    }

    const yesBtn = "Yes";
    const noBtn = "No";

    const doTestResponse = await vscode.window.showInformationMessage(
        `Would you like to test deploying a Hello World image to ${registry} right now?`,
        { modal: true },
        yesBtn, noBtn
    );

    if (doTestResponse == null) {
        return false;
    }
    else if (doTestResponse === yesBtn) {
        const testResult = await testRegistry(connection, registry);
        // user did not get a successful test
        if (!testResult) {
            return false;
        }
    }

    try {
        await writeRegistry(registry);
    }
    catch (err) {
        vscode.window.showErrorMessage("Error updating registry: " + err.toString());
        return false;
    }
    vscode.window.showInformationMessage(`The deployment registry has been set to ${registry}`);

    return true;
}

async function writeRegistry(registry: string): Promise<void> {
    const configFile = Constants.CW_CONFIG_FILE;
    const toWrite = JSON.stringify({
        deploymentRegistry: registry
    });
    return promisify(fs.writeFile)(configFile, toWrite);
}

async function testRegistry(connection: Connection, registry: string): Promise<boolean> {
    const testResult: SocketEvents.IRegistryStatusEvent
        = await Requester.post(EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.REGISTRY));

    // tslint:disable-next-line: no-boolean-literal-compare
    if (testResult.deploymentRegistryTest === true) {
        vscode.window.showInformationMessage("Deployment registry test succeeded");
        return true;
    }
    const enterNewBtn = "Enter New Registry";
    const tryAgainBtn = "Try Again";
    const overrideBtn = "Set Anyway";
    const pushFailedRes = await vscode.window.showWarningMessage(
        `Pushing to "${registry}" failed`,
        { modal: true },
        enterNewBtn,
        tryAgainBtn,
        overrideBtn,
    );
    if (pushFailedRes == null) {
        return false;
    }
    else if (pushFailedRes === enterNewBtn) {
        return setRegistryInner(connection);
    }
    else if (pushFailedRes === tryAgainBtn) {
        return testRegistry(connection, registry);
    }
    else {
        // override
        return true;
    }
}

function validateRegistry(reg: string): string | undefined {
    // hostname validation - https://regex101.com/r/2rWkU4/1/tests
    const rx = /^[A-Za-z0-9-._~:/?#\[\]@!\$&'\(\)\*\+;%=,]+$/;
    const match = reg.match(rx);
    if (match == null || match[0] !== reg) {
        return `"${reg}" is not a valid registry location. The format is <hostname>:<port>/<path>. ` +
            `Port and path are optional, and do not provide a protocol (such as "http").`;
    }
    return undefined;
}
