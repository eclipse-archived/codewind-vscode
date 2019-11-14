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

import { CodewindStates } from "./CodewindStates";
import { CLICommand } from "../CLICommandRunner";

const TAG_PLACEHOLDER = `$tag$`;

export class CLILifecycleCommand extends CLICommand {
    constructor(
        public readonly command: string[],
        public readonly userActionName: string,
        public readonly usesTag: boolean,
        /**
         * The states that the Codewind tree item goes through when this command runs
         */
        public readonly transitionStates?: {
            during?: CodewindStates | undefined,
            after?: CodewindStates | undefined,
            onError?: CodewindStates | undefined,
        },
        censorOutput: boolean = false,
    ) {
        super(command, { cancellable: true, hasJSONOutput: false, censorOutput });
    }

    public getUserActionName(tag: string): string {
        const actionName = this.userActionName;
        if (this.usesTag) {
            return actionName.replace(TAG_PLACEHOLDER, tag);
        }
        return actionName;
    }
}

// tslint:disable-next-line: variable-name
export const CLILifecycleCommands = {
    INSTALL:
        new CLILifecycleCommand([ "install" ], `Pulling Codewind ${TAG_PLACEHOLDER} Docker images`, true, {
            during: CodewindStates.INSTALLING,
            onError: CodewindStates.ERR_INSTALLING,
        }, true),
    START:
        new CLILifecycleCommand([ "start" ], `Starting Codewind ${TAG_PLACEHOLDER}`, true, {
            during: CodewindStates.STARTING,
            onError: CodewindStates.ERR_STARTING,
            after: CodewindStates.STARTED,
        }),
    STOP:
        new CLILifecycleCommand([ "stop-all" ], "Stopping Codewind", false, {
            during: CodewindStates.STOPPING,
            onError: CodewindStates.STARTED,
            after: CodewindStates.STOPPED,
        }),
    REMOVE:
        new CLILifecycleCommand([ "remove" ], `Removing Codewind ${TAG_PLACEHOLDER} and project images`, true),
};
