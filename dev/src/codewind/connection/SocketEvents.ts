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

// non-nls-file

namespace SocketEvents {

    export const STATUS_SUCCESS: string = "success";

    // from https://github.com/eclipse/codewind/blob/master/src/pfe/file-watcher/server/src/projects/actions.ts - "restart" function
    export interface IProjectRestartedEvent {
        operationID: string;
        projectID: string;
        status: string;
        errorMsg?: string;
        startMode?: string;
        ports?: {
            exposedPort: string;
            internalPort: string;
            exposedDebugPort?: string;
            internalDebugPort?: string;
        };
        containerId?: string;
    }

    // from https://github.com/eclipse/codewind/blob/master/src/pfe/file-watcher/server/src/projects/Validator.ts
    export interface IValidationResult {
        // severity: Severity;
        severity: string;
        filename: string;
        filepath: string;
        // type: ProblemType
        label: string;
        details: string;
        quickfix?: {
            fixID: string,
            name: string,
            description: string
        };
    }

    // From FileWatcher's Project.ts
    export interface IProjectSettingsEvent {
        readonly operationId: string;
        readonly projectID: string;
        readonly name: string;
        readonly status: string;
        readonly ports?: {
            readonly internalPort?: string;
            readonly internalDebugPort?: string;
        };
        readonly error?: string;
        readonly contextRoot?: string;
        readonly healthCheck?: string;
    }

    export interface ILogUpdateEvent {
        readonly projectName: string;
        readonly projectID: string;
        readonly logType: string;
        readonly logName: string;
        // this is the empty string for container logs (they have no file)
        readonly logPath: string;
        readonly logs: string;
        readonly reset: boolean;
    }

    export type ILogsListChangedEvent = { projectID: string } & ILogResponse;

    export interface IRegistryStatus {
        readonly deploymentRegistryTest: boolean;
        readonly msg: string;
    }

    /**
     * Socket events we listen for from Portal
     * See MCSocket
     */
    export enum Types {
        PROJECT_CHANGED = "projectChanged",
        PROJECT_STATUS_CHANGED = "projectStatusChanged",
        PROJECT_CLOSED = "projectClosed",
        PROJECT_DELETION = "projectDeletion",
        PROJECT_RESTART_RESULT = "projectRestartResult",
        PROJECT_SETTING_CHANGED = "projectSettingsChanged",
        LOG_UPDATE = "log-update",
        LOGS_LIST_CHANGED = "projectLogsListChanged",
        PROJECT_VALIDATED = "projectValidated",
        PROJECT_CREATED = "projectCreation",
        PROJECT_BOUND = "projectBind",
        REGISTRY_STATUS = "deploymentRegistryStatus",
    }

    /**
     * Property keys we check in socket events
     */
    export enum Keys {
        APP_STATE = "appStatus",
        BUILD_STATE = "buildStatus",
        CLOSED_STATE = "state",
        START_MODE = "startMode",
        BUILD_DETAIL = "detailedBuildStatus",
    }
}

export interface ILogResponse {
    readonly build?: ILogObject[];
    readonly app?: ILogObject[];
}

export interface ILogObject {
    readonly logName: string;
    readonly workspaceLogPath?: string;
}

export default SocketEvents;
