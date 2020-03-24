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

interface CLICommandOptions {
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

export namespace CLICommands {
    export const STATUS = new CLICommand([ "status" ]);
    export const UPGRADE = new CLICommand([ "upgrade" ]);

    // command 'families'
    const PROJECT_CMD = "project";
    const CONNECTIONS_CMD = "connections";
    const TEMPLATES_CMD = "templates";
    // we call them 'sources' cwctl calls them 'repos'
    const SOURCES_CMD = "repos";
    const REGISTRY_SECRETS_CMD = "registrysecrets";

    export const PROJECT = {
        CREATE: new CLICommand([ PROJECT_CMD, "create" ]),
        SYNC:   new CLICommand([ PROJECT_CMD, "sync" ]),
        VALIDATE: new CLICommand([PROJECT_CMD, "validate"]),
        BIND:   new CLICommand([ PROJECT_CMD, "bind" ]),
        MANAGE_CONN: new CLICommand([ PROJECT_CMD, "connection" ]),
        REMOVE: new CLICommand([ PROJECT_CMD, "remove" ], { hasJSONOutput: false }),
    };

    export const CONNECTIONS = {
        ADD:    new CLICommand([ CONNECTIONS_CMD, "add" ]),
        LIST:   new CLICommand([ CONNECTIONS_CMD, "list" ]),
        REMOVE: new CLICommand([ CONNECTIONS_CMD, "remove" ]),
        UPDATE: new CLICommand([ CONNECTIONS_CMD, "update" ], { hasJSONOutput: false })
    };

    export const TEMPLATE_SOURCES = {
        ADD:    new CLICommand([ TEMPLATES_CMD, SOURCES_CMD, "add" ]),
        LIST:   new CLICommand([ TEMPLATES_CMD, SOURCES_CMD, "list" ]),
        REMOVE: new CLICommand([ TEMPLATES_CMD, SOURCES_CMD, "remove" ]),
    };

    export const AUTHENTICATION = {
        KEYRING_UPDATE: new CLICommand([ "seckeyring", "update" ]),
        // KEYRING_VALIDATE: new CLICommand([ "seckeyring", "validate" ]),
        GET_SECTOKEN: new CLICommand([ "sectoken", "get" ], { censorOutput: true }),
    };

    export const REGISTRY_SECRETS = {
        ADD: new CLICommand([ REGISTRY_SECRETS_CMD, "add" ]),
        LIST: new CLICommand([ REGISTRY_SECRETS_CMD, "list" ]),
        REMOVE: new CLICommand([ REGISTRY_SECRETS_CMD, "remove" ]),
    }
}
