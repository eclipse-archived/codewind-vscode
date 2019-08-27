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

const TAG_PLACEHOLDER = `$tag$`;

export enum InstallerCommands {
    INSTALL = "install",
    START = "start",
    // STOP = "stop",
    STOP_ALL = "stop-all",
    REMOVE = "remove",
    // "status" is treated differently, see getInstallerState()
}

// const INSTALLER_COMMANDS: { [key: string]: { action: string, userActionName: string, cancellable: boolean } } = {
export const INSTALLER_COMMANDS: {
    [key in InstallerCommands]: {
        action: string,
        userActionName: string,
        cancellable: boolean,
        usesTag: boolean,
        states?: {
            during?: CodewindStates | undefined,
            after?: CodewindStates | undefined,
            onError?: CodewindStates | undefined,
        }
    }
} = {
    install: {
            action: "install",
            userActionName: `Pulling Codewind ${TAG_PLACEHOLDER} Docker images`,
            cancellable: true,
            usesTag: true,
            states: {
                during: CodewindStates.INSTALLING,
                onError: CodewindStates.ERR_INSTALLING,
            }
        },
    start: {
        action: "start",
        userActionName: `Starting Codewind ${TAG_PLACEHOLDER}`,
        cancellable: true,
        usesTag: true,
        states: {
            during: CodewindStates.STARTING,
            onError: CodewindStates.ERR_STARTING,
            after: CodewindStates.STARTED,
        }
    },
    // stop:
    //     { action: "stop", userActionName: "Stopping Codewind", cancellable: true, usesTag: false },
    "stop-all": {
            action: "stop-all",
            userActionName: "Stopping Codewind",
            cancellable: true,
            usesTag: false,
            states: {
                during: CodewindStates.STOPPING,
                onError: CodewindStates.STARTED,
                after: CodewindStates.STOPPED,
            }
        },
    remove: {
            action: "remove",
            userActionName: `Removing Codewind ${TAG_PLACEHOLDER} and project images`,
            cancellable: true,
            usesTag: true,
        },
    // status:     { action: "status", userActionName: "Checking if Codewind is running" },
};

export function getUserActionName(cmd: InstallerCommands, tag: string): string {
    const actionName = INSTALLER_COMMANDS[cmd].userActionName;
    if (doesUseTag(cmd)) {
        return actionName.replace(TAG_PLACEHOLDER, tag);
    }
    return actionName;
}

export function doesUseTag(cmd: InstallerCommands): boolean {
    return INSTALLER_COMMANDS[cmd].usesTag;
}
