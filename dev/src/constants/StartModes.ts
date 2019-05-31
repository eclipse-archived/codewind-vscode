/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import ProjectType from "../microclimate/project/ProjectType";
import Log from "../Logger";

// non-nls-file

// from https://github.ibm.com/dev-ex/microclimate/blob/master/docker/file-watcher/server/src/projects/constants.ts

namespace StartModes {

    export enum Modes {
        RUN = "run",
        DEBUG = "debug",
        DEBUG_NO_INIT = "debugNoInit"
    }

    export function getUserFriendlyStartMode(startMode: Modes | string): string {
        switch (startMode) {
            case Modes.RUN:
                return "run";
            case Modes.DEBUG:
                // For now, debug vs debugNoInit is not exposed to the user. So in both cases it's just "Debug" to them.
                // return "debug (with initial break)";
            case Modes.DEBUG_NO_INIT:
                return "debug";
            default:
                Log.e(`Unknown start mode "${startMode}"!`);
                return "unknown";
        }
    }

    export function allStartModes(): string[] {
        return [
            Modes.RUN,
            Modes.DEBUG,
            Modes.DEBUG_NO_INIT
        ];
    }

    export function isDebugMode(startMode: string): boolean {
        return startMode === Modes.DEBUG.toString() || startMode === Modes.DEBUG_NO_INIT.toString();
    }

    export function getDefaultStartMode(debug: boolean, projectType: ProjectType.Types): Modes {
        if (!debug) {
            return Modes.RUN;
        }

        if (projectType === ProjectType.Types.MICROPROFILE) {
            return Modes.DEBUG;
        }

        return Modes.DEBUG_NO_INIT;
    }
}

export default StartModes;
