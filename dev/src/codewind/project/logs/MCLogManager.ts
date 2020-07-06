/*******************************************************************************
 * Copyright (c) 2019, 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import Project from "../Project";
import MCLog from "./MCLog";
import Log from "../../../Logger";
import SocketEvents from "../../connection/SocketEvents";
import MCUtil from "../../../MCUtil";
import { ILogResponse, ILogObject } from "../../Types";
import ProjectRequester from "../ProjectRequester";

export enum LogTypes {
    APP = "app", BUILD = "build"
}

/**
 * If this is set to 'background', new logs are added to the Output view but not revealed as they become available.
 * If 'foreground', they are added brought to the front of the Output view.
 * If not set, new logs are not revealed until the user uses one of the log showing actions.
 */
type ShowingAllState = "background" | "foreground" | undefined;

export default class MCLogManager {

    private _logs: MCLog[] = [];
    public readonly initPromise: Promise<void> = Promise.resolve();

    private readonly managerName: string;

    private isShowingAll: ShowingAllState;

    constructor(
        private readonly project: Project,
        private readonly requester: ProjectRequester,
        doInitialize: boolean,
    ) {
        if (doInitialize) {
            this.initPromise = this.initialize();
        }
        this.managerName = `${this.project.name} LogManager`;
    }

    private async initialize(): Promise<void> {
        if (this._logs.length > 0) {
            Log.e(this.managerName + " logs have already been initialized");
            return;
        }
        // Log.d("Initializing logs");
        try {
            const availableLogs = await this.requester.requestAvailableLogs();
            await this.onLogsListChanged(availableLogs);
            Log.i(`${this.managerName} has finished initializing ${this.logs.length} logs`);
        }
        catch (err) {
            Log.e(`Failed to get logs for ${this.project.name}`, err);
            vscode.window.showErrorMessage(`Failed to fetch logs for ${this.project.name}: ${MCUtil.errToString(err)}`);
        }
    }

    public toString(): string {
        return this.managerName;
    }

    public async onLogsListChanged(logs: ILogResponse): Promise<void> {
        let didOpenNewLog = false;
        logs.app?.forEach((log) => {
            didOpenNewLog = this.addLog(log, LogTypes.APP) || didOpenNewLog;
        });
        logs.build?.forEach((log) => {
            didOpenNewLog = this.addLog(log, LogTypes.BUILD) || didOpenNewLog;
        });

        if (didOpenNewLog) {
            await this.toggleLogStreaming(true);
        }
        this.project.onChange();
    }

    /**
     * Adds the given log to this manager to track it.
     * The log is shown in the UI if we're showing all, or if it is a new instance of one we're already showing.
     * @returns If a new log was shown (opened).
     */
    private addLog(logData: ILogObject, logType: LogTypes): boolean {
        // skip useless container log
        if (logData.logName === "-" || logData.logName === "container") {
            return false;
        }

        const existingIndex = this.logs.findIndex((l) => l.logName === logData.logName);
        const existed = existingIndex !== -1;
        // open the log on creation if we're showing all, or if replacing an existing log
        let openOnCreate = this.isShowingAll != null;
        if (existed) {
            // destroy the old log and replace it with this one
            const existingLog = this.logs.splice(existingIndex, 1)[0];
            openOnCreate = existingLog.isOpen;
            existingLog.removeOutput();
        }

        const newLog = new MCLog(this.project.name, logData.logName, logType, logData.workspaceLogPath);
        this.logs.push(newLog);
        if (openOnCreate) {
            Log.d(`Revealing ${newLog.outputName}`);
            newLog.createOutput(this.isShowingAll === "foreground");
        }
        return openOnCreate;
    }

    public async showAll(type: "background" | "foreground"): Promise<void> {
        Log.d(`Showing all logs for ${this.project.name} in the ${type}`);
        this.isShowingAll = type;
        this.logs.forEach((log) => log.createOutput(true));
        if (this.logs.length > 0) {
            await this.toggleLogStreaming(true);
        }
    }

    /**
     * Shows the given logs. If hideOthers === true, hides any logs that are not in toShow.
     */
    public async showSome(toShow: MCLog[], hideOthers: boolean): Promise<void> {
        if (toShow.length === 0) {
            await this.hideAll();
            return;
        }

        this.isShowingAll = undefined;

        // if at least one new log is being shown, we restart streaming for this project
        let restartStreaming = false;
        this.logs.forEach((log) => {
            if (toShow.includes(log)) {
                if (log.isOpen) {
                    log.show();
                }
                else {
                    restartStreaming = true;
                    log.createOutput(true);
                }
            }
            else if (hideOthers) {
                log.removeOutput();
            }
            // else, ignore it.
        });

        if (restartStreaming) {
            await this.toggleLogStreaming(true);
        }
    }

    public async hideAll(): Promise<void> {
        Log.d("Hiding all logs for " + this.project.name);
        this.isShowingAll = undefined;
        this.logs.forEach((log) => log.removeOutput());
        await this.toggleLogStreaming(false);
    }

    /**
     * @param enable `true` to refresh (ie, restart) all logs for this project, `false` to stop streaming all logs for this project
     */
    private async toggleLogStreaming(enable: boolean): Promise<void> {
        // Log.d(`${this.managerName} log streaming now ${enable}`);
        try {
            await this.requester.requestToggleLogs(enable);
        }
        catch (err) {
            const errMsg = `Error toggling logs ${enable ? "on" : "off"} for ${this.project.name}`;
            Log.e(errMsg, err);
            vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
        }
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
        if (this.logs.some((log) => log.isOpen)) {
            this.toggleLogStreaming(true);
        }
    }

    public onDisconnect(): void {
        // Log.d(`${this.managerName} onDisconnectOrDisable`);
        this.logs.forEach((log) => log.onDisconnect());
    }

    public get logs(): MCLog[] {
        return this._logs;
    }

    public destroyAllLogs(): void {
        this.isShowingAll = undefined;
        this.logs.forEach((log) => log.removeOutput());
        this._logs = [];
    }
}
