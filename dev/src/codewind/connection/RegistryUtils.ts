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

import Connection from "./Connection";
import manageRegistriesCmd from "../../command/connection/ManageRegistriesCmd";
import InputUtil from "../../InputUtil";
import Requester from "../project/Requester";
import Log from "../../Logger";
import MCUtil from "../../MCUtil";

export class ContainerRegistry {
    private _isPushRegistry: boolean = false;

    constructor(
        public readonly address: string,
        public readonly username: string,
        private _namespace: string = "",
    ) {

    }

    public toString(): string {
        return `${this.username}@${this.fullAddress}`;
    }

    public get isPushRegistry(): boolean {
        return this._isPushRegistry;
    }

    public set isPushRegistry(isPushRegistry: boolean) {
        this._isPushRegistry = isPushRegistry;
    }

    public get namespace(): string {
        return this._namespace;
    }

    public set namespace(ns: string) {
        this._namespace = ns;
    }

    public get fullAddress(): string {
        return `${this.address}/${this.namespace}`;
    }
}

namespace RegistryUtils {

    /**
     * Returns if this connection MUST set up a push registry before it can build a project of this type.
     *
     * If the project type requires a push registry and the connection does not have a push registry,
     * shows an error message and returns true.
     */
    export async function doesNeedPushRegistry(projectType: string, connection: Connection): Promise<boolean> {
        // The local (non-kube) connection never needs a push registry because the images are run locally
        if (doesUsePushRegistry(projectType) && await connection.needsPushRegistry()) {
            const manageRegistriesBtn = "Image Registry Manager";

            vscode.window.showErrorMessage(`Codewind style projects on Kubernetes require an Image Push Registry to be configured. ` +
                `Add a push registry using the Image Registry Manager.`,
                manageRegistriesBtn
            )
            .then((res) => {
                if (res === manageRegistriesBtn) {
                    manageRegistriesCmd(connection);
                }
            });
            return true;
        }
        return false;
    }

    function doesUsePushRegistry(projectType: string): boolean {
        // these two extension types do not require a push registry
        return projectType !== "appsodyExtension" && projectType !== "odo";
    }

    const newRegistryWizardSteps: InputUtil.InputStep[] = [
        {
            promptGenerator: () => `Enter the registry's base address (domain). Do not specify a namespace.`,
            placeholder: `docker.io`,
            // validator: RegistryUtils.validateAddress,
        },
        {
            promptGenerator: (address) => `Enter the username for ${address}.`,
        },
        {
            promptGenerator: (address, username) => `Enter the password or an API key for ${username} @ ${address}.`,
            password: true,
            allowEmpty: true,
        },
    ];

    export async function addNewRegistry(connection: Connection, existingRegistries: ContainerRegistry[]): Promise<void> {
        const wizardTitle = "Sign in to a new Image Registry";

        newRegistryWizardSteps[0].validator = (input: string) => {
            return validateAddress(input, existingRegistries.map((reg) => reg.address));
        };

        const inputResult: string[] | undefined = await InputUtil.runMultiStepInput(wizardTitle, newRegistryWizardSteps);
        if (inputResult == null) {
            return;
        }
        const [ address, username, password ]: string[] = inputResult;

        const isFirstRegistry = existingRegistries.length === 0;
        let setAsPushRegistry: boolean;
        if (isFirstRegistry) {
            setAsPushRegistry = true;
        }
        else {
            const setAsPushOption: vscode.QuickPickItem = {
                label: `Set ${address} as your image push registry`,
                detail: `Codewind-style project images will be pushed to this registry.`
            };
            const dontSetAsPushOption: vscode.QuickPickItem = {
                label: `Don't set ${address} as image push registry`,
                detail: `This registry can still be used to pull private images.`
            };

            const response = await vscode.window.showQuickPick([
                setAsPushOption, dontSetAsPushOption,
            ], {
                canPickMany: false,
                ignoreFocusOut: true,
                placeHolder: `Would you like to push your built project images to this registry?`
            });

            if (response == null) {
                return;
            }
            setAsPushRegistry = response === setAsPushOption;
        }

        const newRegistry = await vscode.window.withProgress({
            cancellable: false,
            location: vscode.ProgressLocation.Notification,
            title: `Creating registry secret for ${username} @ ${address}...`,
        }, async () => {
            const newRegistry_ = await Requester.addRegistrySecret(connection, address, username, password);
            Log.i(`Successfully added image registry ${address}`);
            return newRegistry_;
        });


        if (newRegistry == null) {
            Log.e(`New registry secret appeared to be created but was null`);
        }

        if (setAsPushRegistry) {
            if (newRegistry == null) {
                throw new Error(`Unknown error creating new registry secret`);
            }

            let didSetPush = false;
            try {
                didSetPush = (await setPushRegistry(connection, newRegistry, false)) != null;
            }
            catch (err) {
                const errMsg = `Failed to set push registry to ${newRegistry.fullAddress} after adding`;
                Log.e(errMsg, err);
                vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
            }

            if (!didSetPush && isFirstRegistry) {
                vscode.window.showWarningMessage(`You added a registry secret, but did not set it as your image push registry. ` +
                    `Codewind-style projects will be unable to build until you add a push registry.`);
            }
        }
    }

    export async function setPushRegistry(connection: Connection, pushRegistry: ContainerRegistry, showProgress: boolean)
        : Promise<ContainerRegistry | undefined> {

        // the secret for this registry must already have been created

        /*
        const yesBtn = "Test";

        const doTestResponse = await vscode.window.showInformationMessage(
            `Would you like to test deploying a Hello World image to ${pushRegistry.fullAddress} as ${pushRegistry.username} right now?`,
            yesBtn
        );

        // Log.d("doTestResponse", doTestResponse);

        if (doTestResponse === yesBtn) {
            const testResult = await testRegistry(connection, pushRegistry);
            if (!testResult) {
                // user did not get a successful test
                return;
            }
            else if (testResult === "retry") {
                return setPushRegistry(connection, pushRegistry);
            }
            // else test succeeded, or they selected to override the failed test
        }
        */

        const namespace = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: pushRegistry.username,
            prompt: `Enter the namespace to push to ${pushRegistry.address} under. ` +
                `The namespace may be empty. For example, to push to docker.io/eclipse, the namespace is "eclipse".` ,
            validateInput: validateIsOnlyUrlChars,
        });

        if (namespace == null) {
            return undefined;
        }
        pushRegistry.namespace = namespace;

        const setPushProm = Requester.setPushRegistry(connection, pushRegistry);
        if (showProgress) {
            await vscode.window.withProgress({
                cancellable: false,
                location: vscode.ProgressLocation.Notification,
                title: `Setting image push registry to ${pushRegistry.fullAddress}...`,
            }, async () => {
                await setPushProm;
            });
        }
        else {
            await setPushProm;
        }

        Log.i(`Push registry set successfully for ${connection.url} to ${pushRegistry.fullAddress}`);
        return pushRegistry;
    }

    /*
    async function testRegistry(connection: Connection, registry: ContainerRegistry): Promise<boolean | "retry"> {
        const testResult = await vscode.window.withProgress({
            title: `Pushing a test image to ${registry}...`,
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
        }, () => {
            try {
                return Requester.testPushRegistry(connection, registry);
            }
            catch (err) {
                Log.e("Error testing registry", err);
                return Promise.resolve({ imagePushRegistryTest: false, msg: MCUtil.errToString(err) });
            }
        });

        // tslint:disable-next-line: no-boolean-literal-compare
        if (testResult.imagePushRegistryTest === true) {
            vscode.window.showInformationMessage("Deployment registry test succeeded");
            return true;
        }

        const tryAgainBtn = "Try Again";
        const overrideBtn = "Set Anyway";
        const pushFailedRes = await vscode.window.showWarningMessage(
            `Pushing to "${registry.fullAddress}" failed`,
            { modal: true },
            tryAgainBtn,
            overrideBtn,
        );

        if (pushFailedRes == null) {
            return false;
        }
        else if (pushFailedRes === tryAgainBtn) {
            return testRegistry(connection, registry);
        }
        else {
            // override
            return true;
        }
    }*/

    export function validateIsOnlyUrlChars(input: string): string | undefined {
        const legal = /^[A-Za-z0-9-._~:/?#\[\]@!\$&'\(\)\*\+;%=,]*$/;
        if (!legal.test(input)) {
            return `Invalid input: "${input}" contains illegal characters.`;
        }
        return undefined;
    }

    const PROTOCOL_SEP = "://";

    export function validateAddress(input: string, existingAddresses: string[]): string | undefined {
        const illegalCharsMsg = validateIsOnlyUrlChars(input);
        if (illegalCharsMsg) {
            return illegalCharsMsg;
        }

        if (input.includes(PROTOCOL_SEP)) {
            return "Don't include a protocol in your registry address.";
        }

        const existing = existingAddresses
            .map((addr) => {
                // The backend may have added a protocol.
                const protocolIndex = addr.search(PROTOCOL_SEP);
                if (protocolIndex > 0) {
                    return addr.substring(protocolIndex + PROTOCOL_SEP.length);
                }
                return addr;
            })
            .find(((addr) => addr === input));

        if (existing) {
            return `You already have a registry at ${existing}. You can only have one login for a given registry at a time. Remove the existing registry to add a new one at the same address.`;
        }

        return undefined;
    }
}

export default RegistryUtils;
