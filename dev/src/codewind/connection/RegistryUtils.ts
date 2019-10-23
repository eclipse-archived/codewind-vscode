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

import Log from "../../Logger";
import Requester from "../project/Requester";
import Connection from "./Connection";
import { CWDocs } from "../../constants/Constants";
import { setRegistryCmd } from "../../command/connection/SetRegistryCmd";
import Commands from "../../constants/Commands";
import MCUtil from "../../MCUtil";

namespace RegistryUtils {
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
            vscode.commands.executeCommand(Commands.VSC_OPEN, CWDocs.getDocLink(CWDocs.DOCKER_REGISTRY));
        }
    }

    export async function setRegistry(connection: Connection): Promise<boolean> {
        Log.i(`Setting deployment registry`);
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

        try {
            await connection.setRegistry(registry);
            Log.i(`Deployment registry set successfully for ${connection.url}`);
            vscode.window.showInformationMessage(`The deployment registry ${registry} has been saved. ` +
                `You can now build Codewind projects.`
            );
        }
        catch (err) {
            vscode.window.showErrorMessage(`Error updating registry: ${MCUtil.errToString(err)}`);
            return false;
        }

        return true;
    }

    async function testRegistry(connection: Connection, registry: string): Promise<boolean | "retry"> {
        const testResult = await vscode.window.withProgress({
            title: `Pushing a test image to ${registry}...`,
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
        }, (_progress) => {
            try {
                return Requester.configureRegistry(connection, "test", registry);
            }
            catch (err) {
                Log.e("Error testing registry", err);
                return Promise.resolve({ deploymentRegistryTest: false, msg: MCUtil.errToString(err) });
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

}

export default RegistryUtils;
