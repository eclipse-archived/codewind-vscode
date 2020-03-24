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

import Connection from "../Connection";
import manageRegistriesCmd from "../../../command/connection/ManageRegistriesCmd";
import ProjectType from "../../project/ProjectType";
import Log from "../../../Logger";
import ImageRegistry from "./ImageRegistry";
import { CLICommandRunner } from "../../cli/CLICommandRunner";
import { RegistrySecret } from "../../Types";

namespace ImageRegistryUtils {

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

    function asContainerRegistry(registrySecret: RegistrySecret): ImageRegistry {
        if (!registrySecret.address || !registrySecret.username) {
            Log.e(`Received unexpected container registry response:`, registrySecret);
        }
        return new ImageRegistry(registrySecret.address, registrySecret.username);
    }

    export async function getImageRegistries(connection: Connection): Promise<ImageRegistry[]> {
        const response = await CLICommandRunner.getRegistrySecrets(connection.id);

        // Log.d(`Container registry response:`, response);
        const registries = response.map((reg) => asContainerRegistry(reg));

        if (!connection.isKubeConnection) {
            // skip the push registry local for local connection
            return registries;
        }

        const pushRegistryRes = await connection.requester.getPushRegistry();
        // Log.d(`Image push registry response`, pushRegistryRes);

        // tslint:disable-next-line: no-boolean-literal-compare
        if (pushRegistryRes && pushRegistryRes.imagePushRegistry === true) {
            const pushRegistry = registries.find((reg) => reg.address === pushRegistryRes.address);
            if (!pushRegistry) {
                Log.e(`Push registry response was ${JSON.stringify(pushRegistryRes)} but no registry with a matching address was found`);
            }
            else {
                pushRegistry.isPushRegistry = true;
                pushRegistry.namespace = pushRegistryRes.namespace || "";
                Log.i(`Push registry is ${pushRegistry.address}`);
            }
        }
        else {
            Log.d(`No image push registry is set`);
        }
        return registries;
    }

    export async function addRegistrySecret(connection: Connection, address: string, username: string, password: string)
        : Promise<ImageRegistry> {

        const response = await CLICommandRunner.addRegistrySecret(connection.id, address, username, password);
        const match = response.find((reg) => {
            // on the local connection, PFE remaps 'docker.io' to 'index.docker.io'
            return reg.address === address || (address.includes("docker.io") && reg.address.includes("docker.io"));
        });

        if (match == null) {
            Log.e("Got success response when adding new registry secret, but was not found in api response");
            throw new Error(`Unexpected response when adding new registry secret`);
        }
        return asContainerRegistry(match);
    }

    export async function removeRegistrySecret(connection: Connection, toRemove: ImageRegistry): Promise<ImageRegistry[]> {
        if (toRemove.isPushRegistry) {
            await connection.requester.deletePushRegistry(toRemove.address);
        }

        const registriesAfterDelete = await CLICommandRunner.removeRegistrySecret(connection.id, toRemove.address);
        return registriesAfterDelete.map(asContainerRegistry);
    }
}

export default ImageRegistryUtils;
