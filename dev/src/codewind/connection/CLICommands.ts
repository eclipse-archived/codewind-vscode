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
import { IInitializationResponse } from "./UserProjectCreator";

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

    export async function detectProjectType(projectPath: string, desiredType?: string): Promise<IInitializationResponse> {
        const args = [ "create", projectPath ];
        if (desiredType) {
            args.push("--type", desiredType);
        }
        return CLIWrapper.cliExec(ProjectCommands.CREATE, args, `Processing ${projectPath}...`);
    }

    /**
     * @returns The newly created project's ID.
     */
    // export async function bindProject(
    //     connectionID: string, projectName: string, projectPath: string, detectedType: IDetectedProjectType): Promise<string> {

    //     const bindRes = await CLIWrapper.cliExec(ProjectCommands.BIND, [
    //         "--conid", connectionID,
    //         "--name", projectName,
    //         "--language", detectedType.language,
    //         "--type", detectedType.projectType,
    //         "--path", projectPath,
    //     ]);

    //     return bindRes.projectID;
    // }

    export async function sync(path: string, projectID: string, lastSync: number): Promise<void> {
        await CLIWrapper.cliExec(ProjectCommands.SYNC, [
            "--path", path,
            "--id", projectID,
            "--time", lastSync.toString(),
        ]);
    }

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
    export async function removeConnection(id: string): Promise<CLIConnectionData[]> {
        return processConnectionList(await CLIWrapper.cliExec(ConnectionCommands.REMOVE, [ "--conid", id ]));
    }

    function processConnectionList(connectionList: any): Promise<CLIConnectionData[]> {
        // TODO the local connection is not useful
        return connectionList.connections.filter((conn: CLIConnectionData) => conn.id !== "local");
    }
}
