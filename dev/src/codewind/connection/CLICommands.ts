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
import Project from "../project/Project";

interface CLIConnectionData {
    readonly active: string;
    readonly deployments: [{
        readonly id: string,
        readonly label: string,
        readonly url: string,
        readonly auth: string,
        readonly realm: string,
        readonly clientid: string
    }];
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
    MANAGE_CONNECTION: new CLICommand([ "project", "deployments" ]),
};

// tslint:disable-next-line: variable-name
export const ConnectionCommands = {
    ADD:    new CLICommand([ "deployments add" ]),
    LIST:   new CLICommand([ "deployments list" ]),
    REMOVE: new CLICommand([ "deployments remove" ]),
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

    /*
    export async function bindProject(
        connectionID: string, projectName: string, projectPath: string, detectedType: IDetectedProjectType): Promise<string> {

        const bindRes = await cliExec("bind", [
            "--depid", connectionID,
            "--name", projectName,
            "--language", detectedType.language,
            "--type", detectedType.projectType,
            "--path", projectPath,
        ]);

        return bindRes.projectID;
    }
    */

    export async function sync(project: Project): Promise<void> {
        await CLIWrapper.cliExec(ProjectCommands.SYNC, [
            "--path", project.localPath.fsPath,
            "--id", project.id,
            "--time", project.lastSync.toString()
        ]);
    }

    // export async function setActiveConnection(id: string): Promise<CLIConnectionData> {
    //     return CLIWrapper.cliExec(CLICommands.CONNECTIONS, [ "target", id ]);
    // }

    export async function addConnection(id: string, label: string, url: string): Promise<CLIConnectionData> {
        return CLIWrapper.cliExec(ConnectionCommands.ADD, [ id, "--label", label, "--url", url ]);
    }

    export async function getConnections(): Promise<CLIConnectionData> {
        return CLIWrapper.cliExec(ConnectionCommands.LIST, []);
    }

    export async function removeConnection(id: string): Promise<CLIConnectionData> {
        return CLIWrapper.cliExec(ConnectionCommands.REMOVE, [ "--depid", id ]);
    }
}
