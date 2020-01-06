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

import CLIWrapper from "./CLIWrapper";
import Log from "../../Logger";
import MCUtil from "../../MCUtil";
import { TemplateSource } from "./TemplateSourceList";

export interface CLIConnectionData {
    readonly id: string;
    readonly label: string;
    readonly url: string;
    readonly auth: string;
    readonly realm: string;
    readonly clientid: string;
}

export interface IDetectedProjectType {
    language: string;
    projectType: string;
    projectSubtype?: string;
}

export interface IInitializationResponse {
    status: string;
    result: IDetectedProjectType | string | { error: string };
    projectPath?: string;
}

export interface CLIStatus {
    // status: "uninstalled" | "stopped" | "started";
    "installed-versions": string[];
    started: string[];
    url?: string;   // only set when started
}

export interface AccessToken {
    readonly access_token: string;
    readonly expires_in: number;
    readonly token_type: string;
}

export interface CLICommandOptions {
    cancellable?: boolean;
    hasJSONOutput?: boolean;
    censorOutput?: boolean;
}

export class CLICommand {

    public readonly cancellable: boolean = false;
    public readonly hasJSONOutput: boolean = true;
    public readonly censorOutput: boolean = false;

    constructor(
        public readonly command: string[],
        options?: CLICommandOptions,
    ) {
        if (options) {
            if (options.cancellable != null) {
                this.cancellable = options.cancellable;
            }
            if (options.hasJSONOutput != null) {
                this.hasJSONOutput = options.hasJSONOutput;
            }
            if (options.censorOutput != null) {
                this.censorOutput = options.censorOutput;
            }
        }
    }
}

const STATUS = new CLICommand([ "status" ]);
const UPGRADE = new CLICommand([ "upgrade" ]);

// tslint:disable-next-line: variable-name
const ProjectCommands = {
    CREATE: new CLICommand([ "project", "create" ]),
    SYNC:   new CLICommand([ "project", "sync" ]),
    BIND:   new CLICommand([ "project", "bind" ]),
    MANAGE_CONN: new CLICommand([ "project", "connection" ]),
};

// tslint:disable-next-line: variable-name
const ConnectionCommands = {
    ADD:    new CLICommand([ "connections", "add" ]),
    LIST:   new CLICommand([ "connections", "list" ]),
    REMOVE: new CLICommand([ "connections", "remove" ]),
};

// tslint:disable-next-line: variable-name
const TemplateRepoCommands = {
    ADD: new CLICommand([ "templates", "repos", "add" ]),
    LIST: new CLICommand([ "templates", "repos", "list" ]),
    REMOVE: new CLICommand([ "templates", "repos", "remove" ]),
};

// tslint:disable-next-line: variable-name
const AuthCommands = {
    KEYRING_UPDATE: new CLICommand([ "seckeyring", "update" ]),
    // KEYRING_VALIDATE: new CLICommand([ "seckeyring", "validate" ]),
    GET_SECTOKEN: new CLICommand([ "sectoken", "get" ], { censorOutput: true }),
};

export namespace CLICommandRunner {

    export async function status(): Promise<CLIStatus> {
        const statusObj = await CLIWrapper.cliExec(STATUS);
        // The CLI will leave out these fields if they are empty, but an empty array is easier to deal with.
        if (statusObj["installed-versions"] == null) {
            statusObj["installed-versions"] = [];
        }
        if (statusObj.started == null) {
            statusObj.started = [];
        }
        return statusObj;
    }

    export async function createProject(connectionID: string, projectPath: string, url: string)
        : Promise<IInitializationResponse> {

        return CLIWrapper.cliExec(ProjectCommands.CREATE, [
            projectPath,
            "--conid", connectionID,
            "--url", url
        ]);
    }

    /**
     * Test the path given to determine the project type Codewind should use.
     */
    export async function detectProjectType(connectionID: string, projectPath: string, desiredType?: string): Promise<IInitializationResponse> {
        const args = [
            projectPath,
            "--conid", connectionID,
        ];

        if (desiredType) {
            args.push("--type", desiredType);
        }
        return CLIWrapper.cliExec(ProjectCommands.CREATE, args, `Processing ${projectPath}...`);
    }

    /**
     * @returns The newly created project's inf content.
     */
    export async function bindProject(connectionID: string, projectName: string, projectPath: string, detectedType: IDetectedProjectType)
        : Promise<{ projectID: string, name: string }> {

        const bindRes = await CLIWrapper.cliExec(ProjectCommands.BIND, [
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

    interface WorkspaceUpgradeResult {
        readonly migrated: string[];
        readonly failed: Array<{
            error: string,
            projectName: string
        }>;
    }

    /**
     * Perform a workspace upgrade from a version older than 0.6
     */
    export async function upgrade(): Promise<WorkspaceUpgradeResult> {
        return CLIWrapper.cliExec(UPGRADE, [
            "--ws", MCUtil.getCWWorkspacePath(),
        ]);
    }

    ///// Connection management commands

    /**
     * @returns The data for the new Connection
     */
    export async function addConnection(label: string, url: string, username: string): Promise<CLIConnectionData> {
        return await CLIWrapper.cliExec(ConnectionCommands.ADD, [
            "--label", label,
            "--url", url,
            "--username", username,
        ]);
    }

    /**
     * @returns The data for all current connections, except Local
     */
    export async function getRemoteConnections(): Promise<CLIConnectionData[]> {
        const connections = await CLIWrapper.cliExec(ConnectionCommands.LIST);
        if (!connections.connections) {
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
        await CLIWrapper.cliExec(ConnectionCommands.REMOVE, [ "--conid", id ]);
    }

    ///// Template source management commands - These should only be used by the TemplateSourceList

    export async function addTemplateSource(connectionID: string, url: string, name: string, descr?: string): Promise<TemplateSource[]> {
        const args = [
            "--conid", connectionID,
            "--url", url,
            "--name", name,
        ];

        if (descr) {
            args.push("--description", descr);
        }

        return CLIWrapper.cliExec(TemplateRepoCommands.ADD, args);
    }

    export async function getTemplateSources(connectionID: string, showProgress: boolean): Promise<TemplateSource[]> {
        const progress = showProgress ? undefined : "Fetching template sources...";

        return CLIWrapper.cliExec(TemplateRepoCommands.LIST, [
            "--conid", connectionID,
        ], progress);
    }

    export async function removeTemplateSource(connectionID: string, url: string): Promise<TemplateSource[]> {
        return CLIWrapper.cliExec(TemplateRepoCommands.REMOVE, [
            "--conid", connectionID,
            "--url", url
        ]);
    }

    ///// Auth/credential commands

    export async function updateKeyringCredentials(connectionID: string, username: string, password: string): Promise<void> {
        // in the success case, the output is just an OK status
        await CLIWrapper.cliExec(AuthCommands.KEYRING_UPDATE, [
            "--conid", connectionID,
            "--username", username,
            "--password", password
        ]);
    }

    export const INVALID_CREDS_ERR = "Invalid user credentials";

    export async function getAccessToken(connectionID: string, username: string): Promise<AccessToken> {
        try {
            const result = await CLIWrapper.cliExec(AuthCommands.GET_SECTOKEN, [
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
}
