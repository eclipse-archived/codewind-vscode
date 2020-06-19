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

import CLIWrapper from "./CLIWrapper";
import Log from "../../Logger";
import MCUtil from "../../MCUtil";
import { CLICommands } from "./CLICommands";
import {
    CLIStatus, IInitializationResponse, IDetectedProjectType, CLIConnectionData,
    TemplateSource, AccessToken, RegistrySecret, CWTemplateData, DiagnosticsResult, NewTemplateSource } from "../Types";

export namespace CLICommandRunner {

    const daemonNotRunningMsgs = [
        "connection refused",       // unix
        "cannot connect",           // unix
        "error during connect",     // windows
    ];

    export async function status(): Promise<CLIStatus> {
        let statusResult: CLIStatus;
        try {
            statusResult = await CLIWrapper.cwctlExec(CLICommands.STATUS);
            // if there was no error then docker is running
            statusResult.isDockerRunning = true;
        }
        catch (err) {
            const isDockerRunning = !daemonNotRunningMsgs.some((notRunningMsg) =>
                // if the error message contains any of the above error message substrings, the error was probably that docker is NOT running
                err.toString().toLowerCase().includes(notRunningMsg.toLowerCase())
            );

            if (!isDockerRunning) {
                // handle this common error scenario
                Log.i(`Docker does not appear to be running locally`);
                return {
                    "installed-versions": [],
                    isDockerRunning,
                    started: [],
                };
            }
            // throw any other (unexpected) errors
            throw err;
        }

        // The CLI will leave out these fields if they are empty, but an empty array is easier to deal with.
        if (statusResult["installed-versions"] == null) {
            statusResult["installed-versions"] = [];
        }
        if (statusResult.started == null) {
            statusResult.started = [];
        }

        return statusResult;
    }

    export async function createProject(connectionID: string, projectPath: string, url: string)
        : Promise<IInitializationResponse> {

        return CLIWrapper.cwctlExec(CLICommands.PROJECT.CREATE, [
            "--conid", connectionID,
            "--path", projectPath,
            "--url", url
        ]);
    }

    /**
     * Test the path given to determine the project type Codewind should use.
     */
    export async function detectProjectType(connectionID: string, projectPath: string, desiredType?: string): Promise<IInitializationResponse> {
        const args = [
            "--conid", connectionID,
            "--path", projectPath,
        ];

        if (desiredType) {
            args.push("--type", desiredType);
        }
        return CLIWrapper.cwctlExec(CLICommands.PROJECT.VALIDATE, args, `Processing ${projectPath}...`);
    }

    /**
     * @returns The newly created project's inf content.
     */
    export async function bindProject(connectionID: string, projectName: string, projectPath: string, detectedType: IDetectedProjectType)
        : Promise<{ projectID: string, name: string }> {

        const bindRes = await CLIWrapper.cwctlExec(CLICommands.PROJECT.BIND, [
            "--conid", connectionID,
            "--name", projectName,
            "--language", detectedType.language,
            "--type", detectedType.projectType,
            "--path", projectPath,
        ]);

        if (bindRes.error_description) {
            throw new Error(bindRes.error_description);
        }
        else if (!bindRes.projectID) {
            // should never happen
            throw new Error(`Failed to bind ${projectName}; no project ID was returned.`);
        }
        Log.i(`Bound new project ${projectName} with ID ${bindRes.projectID}`);

        return bindRes;
    }

    export async function removeProject(projectID: string /*, deleteFiles: boolean */): Promise<void> {
        const removeArgs = [
            "--id", projectID,
        ];

        // deleteFiles is not used anymore because we have to delete the files well after the removal from Codewind.
        // see https://github.com/eclipse/codewind/issues/2456

        // if (deleteFiles) {
            // removeArgs.push("--delete");
        // }

        await CLIWrapper.cwctlExec(CLICommands.PROJECT.REMOVE, removeArgs);
    }

    interface WorkspaceUpgradeResult {
        readonly migrated: string[];
        readonly failed: {
            error: string,
            projectName: string
        }[];
    }

    /**
     * Perform a workspace upgrade from a version older than 0.6
     */
    export async function upgrade(): Promise<WorkspaceUpgradeResult> {
        return CLIWrapper.cwctlExec(CLICommands.UPGRADE, [
            "--ws", MCUtil.getCWWorkspacePath(),
        ]);
    }

    ///// Connection management commands

    /**
     * @returns The data for the new Connection
     */
    export async function addConnection(label: string, url: string, username: string): Promise<CLIConnectionData> {
        return await CLIWrapper.cwctlExec(CLICommands.CONNECTIONS.ADD, [
            "--label", label,
            "--url", url,
            "--username", username,
        ]);
    }

    /**
     * @returns The data for all current connections, except Local
     */
    export async function getRemoteConnections(): Promise<CLIConnectionData[]> {
        const connections = await CLIWrapper.cwctlExec(CLICommands.CONNECTIONS.LIST);
        if (!connections.connections) {
            // the local connection should at least be there
            Log.e(`Received no connections back from connections list`);
            return [];
        }
        return connections.connections.filter((conn: CLIConnectionData) => conn.id !== "local");
    }

    /**
     *
     * @returns The data for all current connections, after removal.
     */
    export async function removeConnection(id: string): Promise<void> {
        await CLIWrapper.cwctlExec(CLICommands.CONNECTIONS.REMOVE, [ "--conid", id ]);
    }

    export async function updateConnection(newData: CLIConnectionData): Promise<void> {
        await CLIWrapper.cwctlExec(CLICommands.CONNECTIONS.UPDATE, [
            "--conid", newData.id,
            "--label", newData.label,
            "--url", newData.url,
            "--username", newData.username
        ]);
    }

    export async function getTemplates(connectionID: string): Promise<CWTemplateData[]> {
        return CLIWrapper.cwctlExec(CLICommands.TEMPLATES.LIST, [
            "--conid", connectionID,
            "--showEnabledOnly"
        ]);
    }

    ///// Template source management commands - These should only be used by the TemplateSourceList

    export async function addTemplateSource(connectionID: string, newSource: NewTemplateSource): Promise<TemplateSource[]> {

        const args = [
            "--conid", connectionID,
            "--url", newSource.url,
            "--name", newSource.name,
        ];

        if (newSource.description) {
            args.push("--description", newSource.description);
        }

        if (newSource.auth) {
            if (newSource.auth.type === "credentials") {
                args.push("--username", newSource.auth.username);
                if (newSource.auth.password == null) {
                    Log.e(`No password provided for template source ${newSource.url}`);
                }
                args.push(CLICommands.PASSWORD_ARG, newSource.auth.password || "");
            }
            else if (newSource.auth.personalAccessToken) {
                args.push(CLICommands.PAT_ARG, newSource.auth.personalAccessToken);
            }
            else {
                Log.e(`Empty auth object passed for template source "${newSource.url}"`);
            }
        }

        return CLIWrapper.cwctlExec(CLICommands.TEMPLATE_SOURCES.ADD, args);
    }

    export async function getTemplateSources(connectionID: string, showProgress: boolean): Promise<TemplateSource[]> {
        const progress = showProgress ? undefined : "Fetching template sources...";

        return CLIWrapper.cwctlExec(CLICommands.TEMPLATE_SOURCES.LIST, [
            "--conid", connectionID,
        ], progress);
    }

    export async function removeTemplateSource(connectionID: string, url: string): Promise<TemplateSource[]> {
        return CLIWrapper.cwctlExec(CLICommands.TEMPLATE_SOURCES.REMOVE, [
            "--conid", connectionID,
            "--url", url
        ]);
    }

    ///// Auth/credential commands

    export async function updateKeyringCredentials(connectionID: string, username: string, password: string): Promise<void> {
        // in the success case, the output is just an OK status
        await CLIWrapper.cwctlExec(CLICommands.AUTHENTICATION.KEYRING_UPDATE, [
            "--conid", connectionID,
            "--username", username,
            CLICommands.PASSWORD_ARG, password,
        ]);
    }

    export const INVALID_CREDS_ERR = "Invalid user credentials";

    export async function getAccessToken(connectionID: string, username: string): Promise<AccessToken> {
        try {
            const result = await CLIWrapper.cwctlExec(CLICommands.AUTHENTICATION.GET_SECTOKEN, [
                "--conid", connectionID,
                "--username", username,
            ]);
            return result;
        }
        catch (err) {
            if (err.toString().includes(INVALID_CREDS_ERR)) {
                // simplify the error
                throw new Error(INVALID_CREDS_ERR);
            }
            throw err;
        }
    }

    export async function addRegistrySecret(connectionID: string, registryAddress: string, username: string, password: string)
        : Promise<RegistrySecret[]> {

        return CLIWrapper.cwctlExec(CLICommands.REGISTRY_SECRETS.ADD, [
            "--conid", connectionID,
            "--address", registryAddress,
            "--username", username,
            CLICommands.PASSWORD_ARG, password,
        ]);
    }

    export async function getRegistrySecrets(connectionID: string): Promise<RegistrySecret[]> {
        return CLIWrapper.cwctlExec(CLICommands.REGISTRY_SECRETS.LIST, [
            "--conid", connectionID
        ]);
    }

    export async function removeRegistrySecret(connectionID: string, registryAddress: string): Promise<RegistrySecret[]> {
        return CLIWrapper.cwctlExec(CLICommands.REGISTRY_SECRETS.REMOVE, [
            "--conid", connectionID,
            "--address", registryAddress
        ]);
    }


    export async function diagnostics(collectProjects: boolean, connectionID?: string): Promise<DiagnosticsResult> {
        const args: string[] = [ "collect" ];

        if (collectProjects) {
            args.push("--projects");
        }

        if (connectionID) {
            args.push("--conid", connectionID);
        }
        else {
            args.push("--all");
        }

        const result: DiagnosticsResult = await CLIWrapper.cwctlExec(
            CLICommands.DIAGNOSTICS,
            args,
            "Collecting diagnostics (this may take a few minutes)..."
        );

        // tslint:disable-next-line: no-boolean-literal-compare
        if (result.success !== true) {
            throw new Error(`Failed to collect Codewind diagnostics`);
        }

        Log.i(`Captured diagnostics to ${result.outputdir}`);
        return result;
    }

    ///// Project links

    export async function addLink(projectID: string, targetProjectID: string, envName: string): Promise<void> {
        await CLIWrapper.cwctlExec(CLICommands.PROJECT.LINK, [
            "create",
            "--id", projectID,
            "--targetID", targetProjectID,
            "--env", envName
        ]);
    }

    export async function renameLink(projectID: string, oldEnvName: string, newEnvName: string): Promise<void> {
        await CLIWrapper.cwctlExec(CLICommands.PROJECT.LINK, [
            "rename",
            "--id", projectID,
            "--env", oldEnvName,
            "--newEnv", newEnvName
        ]);
    }

    export async function removeLink(projectID: string, envName: string): Promise<void> {
        await CLIWrapper.cwctlExec(CLICommands.PROJECT.LINK, [
            "remove",
            "--id", projectID,
            "--env", envName
        ]);
    }
}
