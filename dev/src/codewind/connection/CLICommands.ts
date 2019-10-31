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
import { IInitializationResponse, IDetectedProjectType } from "./UserProjectCreator";
import Log from "../../Logger";

interface CLIConnectionData {
    readonly id: string;
    readonly label: string;
    readonly url: string;
    readonly auth: string;
    readonly realm: string;
    readonly clientid: string;
}

export class CLICommand {
    constructor(
        public readonly command: string[],
        public readonly cancellable: boolean = false,
        public readonly hasJSONOutput: boolean = true,
    ) {

    }
}

// tslint:disable-next-line: variable-name
export const ProjectCommands = {
    CREATE: new CLICommand([ "project", "create" ]),
    SYNC:   new CLICommand([ "project", "sync" ]),
    BIND:   new CLICommand([ "project", "bind" ]),
    MANAGE_CONN: new CLICommand([ "project", "connection" ]),
};

// tslint:disable-next-line: variable-name
export const ConnectionCommands = {
    ADD:    new CLICommand([ "connections", "add" ]),
    LIST:   new CLICommand([ "connections", "list" ]),
    REMOVE: new CLICommand([ "connections", "remove" ]),
};

export namespace CLICommandRunner {

    export async function createProject(projectPath: string, projectName: string, url: string): Promise<IInitializationResponse> {
        return CLIWrapper.cliExec(ProjectCommands.CREATE, [ projectPath, "--url", url ], `Creating ${projectName}...`);
    }

    /**
     * Test the path given to determine the project type Codewind should use.
     */
    export async function detectProjectType(projectPath: string, desiredType?: string): Promise<IInitializationResponse> {
        const args = [ projectPath ];
        if (desiredType) {
            args.push("--type", desiredType);
        }
        return CLIWrapper.cliExec(ProjectCommands.CREATE, args, `Processing ${projectPath}...`);
    }

    /**
     * @returns The newly created project's inf content.
     */
    export async function bindProject(
        connectionID: string, projectName: string, projectPath: string, detectedType: IDetectedProjectType): Promise<any> {

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

    /*
    export async function sync(path: string, projectID: string, lastSync: number): Promise<void> {
        await CLIWrapper.cliExec(ProjectCommands.SYNC, [
            "--path", path,
            "--id", projectID,
            "--time", lastSync.toString(),
        ]);
    }*/

    /**
     * @returns The data for the new Connection
     */
    export async function addConnection(label: string, url: string): Promise<CLIConnectionData> {
        return await CLIWrapper.cliExec(ConnectionCommands.ADD, [ "--label", label, "--url", url ]);
    }

    /**
     * @returns The data for all current connections, except Local
     */
    export async function getRemoteConnections(): Promise<CLIConnectionData[]> {
        return processConnectionList(await CLIWrapper.cliExec(ConnectionCommands.LIST, []));
    }

    /**
     *
     * @returns The data for all current connections, after removal.
     */
    export async function removeConnection(id: string): Promise<void> {
        await CLIWrapper.cliExec(ConnectionCommands.REMOVE, [ "--conid", id ]);
    }

    function processConnectionList(connectionList: any): Promise<CLIConnectionData[]> {
        // TODO the local connection is not useful
        return connectionList.connections.filter((conn: CLIConnectionData) => conn.id !== "local");
    }
}
