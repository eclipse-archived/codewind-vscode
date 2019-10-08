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
import * as path from "path";

import Log from "../../Logger";
import Requester from "../project/Requester";
import EndpointUtil, { MCEndpoints } from "../../constants/Endpoints";
import Connection from "./Connection";
// import SocketEvents from "./SocketEvents";
import Constants, { CWDocs } from "../../constants/Constants";
import SocketEvents from "./SocketEvents";
import { setRegistryCmd } from "../../command/connection/SetRegistryCmd";
import Commands from "../../constants/Commands";

// let registryIsSet: boolean = global.isTheia;            // no registry required in local case
let registryIsSet: boolean = false;

export async function isRegistrySet(connection: Connection): Promise<boolean> {
    if (!global.isTheia || registryIsSet) {
        // if not in theia, no registry
        // else it is still set, so we don't have to check
        return true;
    }

    const registryStatus: { deploymentRegistry: boolean } = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        cancellable: false,
        title: "Checking deployment registry status..."
    }, () => {
        return getRegistryStatus(connection);
    });

    registryIsSet = registryStatus.deploymentRegistry;
    Log.d("Registry is now set ? " + registryIsSet);
    return registryIsSet;
}

function getRegistryStatus(connection: Connection): Promise<{ deploymentRegistry: boolean }> {
    return Requester.get(EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.REGISTRY));
}

export async function onRegistryNotSet(connection: Connection): Promise<void> {
    const setRegistryBtn = "Set Registry";
    const moreInfoBtn = "More Info";
    const res = await vscode.window.showErrorMessage(
        "You must set a deployment registry before creating or adding a project. Run the Set Deployment Registry command.",
        setRegistryBtn, moreInfoBtn
    );
    if (res === setRegistryBtn) {
        setRegistryCmd(connection);
    }
    else if (res === moreInfoBtn) {
        const moreInfoUrl = CWDocs.getDocLink(CWDocs.DOCKER_REGISTRY);
        vscode.commands.executeCommand(Commands.VSC_OPEN, moreInfoUrl);
    }
}

export async function setRegistry(connection: Connection): Promise<boolean> {
    Log.i(`Setting deployment registry, is currently set? ${registryIsSet}`);
    const registry = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        // valueSelection doesn't work in theia
        value: `docker-registry.default.svc:5000/eclipse-che`,
        prompt: `Enter a deployment registry location such as Dockerhub or your cluster's internal registry.`,
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

    // Log.d("doTestResponse", doTestResponse);

    if (doTestResponse == null) {
        return false;
    }
    else if (doTestResponse === yesBtn) {
        const testResult = await testRegistry(connection, registry);
        if (!testResult) {
            // user did not get a successful test
            return false;
        }
        else if (testResult === "retry") {
            return setRegistry(connection);
        }
        // else test succeeded, or they selected to override the failed test
    }
    // if they selected noBtn just continue and write

    const configFilePath = path.join(connection.workspacePath.fsPath, Constants.CW_CONFIG_FILE);
    try {
        await writeRegistry(configFilePath, registry);

        Log.i("Waiting for deployment registry to be set...");
        await vscode.window.withProgress({
            cancellable: false,
            title: `Setting deployment registry to ${registry}...`,
            location: vscode.ProgressLocation.Notification,
        }, () => {
            return new Promise((resolve, reject) => {
                const intervalLen = 1000;
                let count = 0;
                const interval = setInterval(async () => {
                    count++;
                    const regStatus = await getRegistryStatus(connection);
                    if (regStatus.deploymentRegistry) {
                        clearInterval(interval);
                        resolve();
                    }
                    else if (count > 10) {
                        clearInterval(interval);
                        reject(`Failed to update registry within ${count}s; Please try setting the registry again.`);
                    }
                }, intervalLen);
            });
        });

        Log.i("Deployment registry set successfully");
        vscode.window.showInformationMessage(`The deployment registry ${registry} has been saved to ${configFilePath}. ` +
            `You can now build Codewind projects.`
        );
        registryIsSet = true;
    }
    catch (err) {
        vscode.window.showErrorMessage("Error updating registry: " + err.toString());
        return false;
    }

    return true;
}

async function writeRegistry(configFilePath: string, registry: string): Promise<void> {
    let config: { [key: string]: string };
    try {
        const configContents = (await promisify(fs.readFile)(configFilePath)).toString();
        config = JSON.parse(configContents);
    }
    catch (err) {
        config = {};
    }
    config.deploymentRegistry = registry;

    const toWrite = JSON.stringify(config, undefined, 2);
    Log.i(`Saving registry ${registry} to ${configFilePath}`);
    return promisify(fs.writeFile)(configFilePath, toWrite);
}

async function testRegistry(connection: Connection, registry: string): Promise<boolean | "retry"> {
    const testResult: SocketEvents.IRegistryStatusEvent = await vscode.window.withProgress({
        title: `Pushing a test image to ${registry}...`,
        location: vscode.ProgressLocation.Notification,
        cancellable: false,
    }, (_progress) => {
        try {
            return Requester.post(EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.REGISTRY), {
                body: {
                    deploymentRegistry: registry,
                }
            });
        }
        catch (err) {
            Log.e("Error testing registry", err);
            return Promise.resolve({ deploymentRegistryTest: false });
        }
    });

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
        return "retry";
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
    // list of legal URL characters
    const rx = /^[A-Za-z0-9-._~:/?#\[\]@!\$&'\(\)\*\+;%=,]+$/;
    const match = reg.match(rx);
    if (match == null || match[0] !== reg) {
        return `"${reg}" is not a valid registry location. The format is <hostname>:<port>/<path>. ` +
            `Port and path are optional, and do not provide a protocol (such as "http").`;
    }
    return undefined;
}
