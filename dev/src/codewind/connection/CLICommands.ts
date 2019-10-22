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

export class CLICommand {
    constructor(
        public readonly command: string[],
        public readonly cancellable: boolean,
        public readonly hasJSONOutput: boolean
    ) {

    }
}

// tslint:disable-next-line: variable-name
export const CLICommands = {
    CREATE: new CLICommand([ "project", "create" ], false, true),
    SYNC: new CLICommand([ "project", "sync" ], false, false),
    BIND: new CLICommand([ "project", "bind" ], false, true)
};

export const ARG_PROJECT_CREATE = "create";
