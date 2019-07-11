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

import ProjectType from "./ProjectType";
import Log from "../../Logger";

// non-nls-file

export enum StartModes {
    RUN = "run",
    DEBUG = "debug",
    DEBUG_NO_INIT = "debugNoInit"
}

export enum ControlCommands {
    RESTART = "restart",
}

export default class ProjectCapabilities {

    constructor(
        // from https://github.com/eclipse/codewind/blob/master/src/pfe/file-watcher/server/src/projects/constants.ts
        public readonly startModes: StartModes[],
        public readonly controlCommands: ControlCommands[],
        // metricsAvailable is not part of the interface as linked above, but is treated similarly so we use it here too
        public readonly metricsAvailable: boolean,
    ) {

    }

    public static getUserFriendlyStartMode(startMode: StartModes | string): string {
        switch (startMode) {
            case StartModes.RUN:
                return "run";
            case StartModes.DEBUG:
                // For now, debug vs debugNoInit is not exposed to the user. So in both cases it's just "Debug" to them.
                // return "debug (with initial break)";
            case StartModes.DEBUG_NO_INIT:
                return "debug";
            default:
                Log.e(`Unknown start mode "${startMode}"!`);
                return "unknown";
        }
    }

    public static get allStartModes(): StartModes[] {
        return Object.values(StartModes);
    }

    public static get allControlCommands(): ControlCommands[] {
        return Object.values(ControlCommands);
    }

    public static isDebugMode(startMode: string): boolean {
        return startMode === StartModes.DEBUG.toString() || startMode === StartModes.DEBUG_NO_INIT.toString();
    }

    public static getDefaultStartMode(debug: boolean, projectType: ProjectType.Types): StartModes {
        if (!debug) {
            return StartModes.RUN;
        }

        if (projectType === ProjectType.Types.MICROPROFILE) {
            return StartModes.DEBUG;
        }

        return StartModes.DEBUG_NO_INIT;
    }

    public get supportsDebug(): boolean {
        return this.startModes.some((mode) => ProjectCapabilities.isDebugMode(mode));
    }

    public get supportsRestart(): boolean {
        return this.controlCommands.includes(ControlCommands.RESTART);
    }

    /**
     * In case there's an error with the capabilities, we have this to fall back to.
     * This will enable the actions in the UI, though the backend could still reject the request
     */
    public static readonly ALL_CAPABILITIES: ProjectCapabilities =
        new ProjectCapabilities(ProjectCapabilities.allStartModes, ProjectCapabilities.allControlCommands, true);

    // public static readonly NO_CAPABILITIES: ProjectCapabilities = new ProjectCapabilities([], [], false);
}
