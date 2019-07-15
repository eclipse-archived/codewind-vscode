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
// import * as vscode from "vscode";

import Project from "../Project";
import MCLog from "./MCLog";
import Log from "../../../Logger";
import Requester from "../Requester";
import SocketEvents, { ILogResponse } from "../../connection/SocketEvents";

export default class MCLogManager {

    private readonly _logs: MCLog[] = [];
    public readonly initPromise: Promise<void>;

    private readonly managerName: string;

    constructor(
        private readonly project: Project,
    ) {
        this.initPromise = this.initialize();
        this.managerName = `${this.project.name} LogManager`;
    }

    private async initialize(): Promise<void> {
        if (this._logs.length > 0) {
            Log.e(this.managerName + " logs have already been initialized");
            return;
        }
        // Log.d("Initializing logs");
        try {
            const availableLogs = await Requester.requestAvailableLogs(this.project);
            this.onLogsListChanged(availableLogs);
            Log.i(`${this.managerName} has finished initializing logs: ${this.logs.map((l) => l.displayName).join(", ") || "<none>"}`);
        }
        catch (err) {
            // requester will show the error
            return;
        }
    }

    public toString(): string {
        return this.managerName;
    }

    public onLogsListChanged(logs: ILogResponse): void {
        const appLogs = logs.app || [];
        const buildLogs = logs.build || [];

        appLogs.concat(buildLogs).forEach((newLogData) => {
            // skip useless container log
            if (newLogData.logName === "-" || newLogData.logName === "container") {
                return;
            }

            const existingIndex = this.logs.findIndex((l) => l.logName === newLogData.logName);
            const existed = existingIndex !== -1;
            let openOnCreate = false;
            if (existed) {
                // destroy the old log and replace it with this one
                const existingLog = this.logs.splice(existingIndex, 1)[0];
                openOnCreate = existingLog.isOpen;
                existingLog.destroy();
            }

            const newLog = new MCLog(this.project.name, newLogData.logName, newLogData.workspathLogPath);
            this.logs.push(newLog);
            if (openOnCreate) {
                newLog.showOutput();
            }
        });
    }

    /**
     * @param enable `true` to refresh (ie, restart) all logs for this project, `false` to stop streaming all logs for this project
     */
    public async toggleLogStreaming(enable: boolean): Promise<void> {
        Log.d(`${this.managerName} log streaming now ${enable}`);
        await Requester.requestToggleLogs(this.project, enable);
    }

    public onNewLogs(event: SocketEvents.ILogUpdateEvent): void {
        if (event.projectID !== this.project.id) {
            Log.e(`${this.managerName} received logs for other project ${event.projectName}`);
            return;
        }
        const existingLog = this.logs.find((log) => log.logName === event.logName);
        if (existingLog != null) {
            existingLog.onNewLogs(event.reset, event.logs);
        }
    }

    public onReconnectOrEnable(): void {
        // Log.d(`${this.managerName} onReconnectOrEnable`);
        // refresh all streams
        this.toggleLogStreaming(true);
    }

    public onDisconnectOrDisable(disconnect: boolean): void {
        // Log.d(`${this.managerName} onDisconnectOrDisable`);
        this.logs.forEach((log) => log.onDisconnectOrDisable(disconnect));
    }

    public get logs(): MCLog[] {
        return this._logs;
    }

    public destroyAllLogs(): void {
        this.logs.forEach((log) => log.destroy());
    }
}
