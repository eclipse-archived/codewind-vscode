/*******************************************************************************
 * Copyright (c) 2019, 2020 IBM Corporation and others.
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
import Log from "../../Logger";
import MCUtil from "../../MCUtil";
import ProjectType from "../project/ProjectType";
import ContainerRegistry from "./ContainerRegistry";

namespace RegistryUtils {

    /**
     * Returns if this connection MUST set up a push registry before it can build a project of this type.
     *
     * If the project type requires a push registry and the connection does not have a push registry,
     * shows an error message and returns true.
     */
    export async function doesNeedPushRegistry(internalType: string, connection: Connection): Promise<boolean> {
        if (doesUsePushRegistry(internalType) && await connection.needsPushRegistry()) {
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
        const isExtensionType = [
            ProjectType.InternalTypes.EXTENSION_APPSODY,
            ProjectType.InternalTypes.EXTENSION_ODO,
        ]
        .map((type) => type.toString())
        .includes(projectType);

        // these extension types do NOT require a push registry
        return !isExtensionType;
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

    /**
     * Run the Add New Image Registry wizard.
     * @returns true if a new registry was successfully added, false if the user cancelled.
     */
    export async function addNewRegistry(connection: Connection, existingRegistries: ContainerRegistry[]): Promise<boolean> {
        const wizardTitle = "Sign in to a new Image Registry";

        newRegistryWizardSteps[0].validator = (input: string) => {
            return validateAddress(input, existingRegistries.map((reg) => reg.address));
        };

        const inputResult: string[] | undefined = await InputUtil.runMultiStepInput(wizardTitle, newRegistryWizardSteps);
        if (inputResult == null) {
            return false;
        }
        const [ address, username, password ]: string[] = inputResult;

        // https://github.com/eclipse/codewind/issues/1469
        const hasPushRegistry = existingRegistries.some((registry) => registry.isPushRegistry);
        const needsPushRegistry = !hasPushRegistry && await connection.templateSourcesList.hasCodewindSourceEnabled();

        let setAsPushRegistry: boolean | undefined;
        let namespace: string | undefined;
        if (needsPushRegistry) {
            Log.d(`Push registry is required`);
            setAsPushRegistry = true;
        }
        else {
            setAsPushRegistry = await promptSetAsPushRegistry(address);
            if (setAsPushRegistry == null) {
                Log.d(`Push registry prompt cancelled; not adding registry.`);
                // cancel
                return false;
            }
        }

        if (setAsPushRegistry) {
            namespace = await promptForNamespace(address, username);
            if (namespace == null) {
                Log.d(`Namespace prompt cancelled; not adding registry.`);
                // cancel
                return false;
            }
        }

        const newRegistry = await vscode.window.withProgress({
            cancellable: false,
            location: vscode.ProgressLocation.Notification,
            title: `Creating registry secret for ${username} @ ${address}...`,
        }, async () => {
            const newRegistry_ = await connection.requester.addRegistrySecret(address, username, password);
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
                const currentPushRegistry = existingRegistries.find((reg) => reg.isPushRegistry);
                didSetPush = (await setPushRegistry(connection, currentPushRegistry, newRegistry, false, namespace)) != null;
            }
            catch (err) {
                const errMsg = `Failed to set push registry to ${newRegistry.fullAddress} after adding`;
                Log.e(errMsg, err);
                vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
            }

            if (!didSetPush && needsPushRegistry) {
                vscode.window.showWarningMessage(`You added a registry secret, but did not set it as your image push registry. ` +
                    `Codewind-style projects will be unable to build until you add a push registry.`);
            }
        }

        return true;
    }

    async function promptSetAsPushRegistry(address: string): Promise<boolean | undefined> {
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
            placeHolder: `Would you like to push your built Codewind project images to this registry?`
        });

        if (response == null) {
            return undefined;
        }

        return response === setAsPushOption;
    }

    async function promptForNamespace(registryAddress: string, registryUsername: string): Promise<string | undefined> {
        const namespace = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: registryUsername,
            prompt: `Enter the namespace to push to ${registryAddress} under, or leave the namespace empty. ` +
                `For example, to push to docker.io/eclipse, enter the "eclipse" namespace.`,
            validateInput: validateIsOnlyUrlChars,
        });

        return namespace;
    }

    export async function setPushRegistry(
        connection: Connection, currentPushRegistry: ContainerRegistry | undefined, newPushRegistry: ContainerRegistry,
        showProgress: boolean, namespace?: string): Promise<ContainerRegistry | undefined> {

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

        if (currentPushRegistry) {
            const confirmBtn = "Change Push Registry";
            const confirmRes = await vscode.window.showInformationMessage(
                `Codewind project images will not be pushed to ${newPushRegistry.fullAddress} until the next build. ` +
                `\nAlso note that if you wish to switch your push registry back, you will have to re-enter the namespace.`,
                { modal: true },
                confirmBtn);

            if (confirmRes !== confirmBtn) {
                return;
            }
        }

        Log.d(`Setting push registry to ${newPushRegistry.address}`);

        if (namespace == null) {
            namespace = await promptForNamespace(newPushRegistry.address, newPushRegistry.username);
            if (namespace == null) {
                return undefined;
            }
        }
        newPushRegistry.namespace = namespace;

        const setPushProm = connection.requester.setPushRegistry(newPushRegistry);
        if (showProgress) {
            await vscode.window.withProgress({
                cancellable: false,
                location: vscode.ProgressLocation.Notification,
                title: `Setting image push registry to ${newPushRegistry.fullAddress}...`,
            }, async () => {
                await setPushProm;
            });
        }
        else {
            await setPushProm;
        }

        Log.i(`Push registry set successfully for ${connection.url} to ${newPushRegistry.fullAddress}`);
        return newPushRegistry;
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
