/*******************************************************************************
 * Copyright (c) 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs-extra";

import Log from "../../Logger";
import Project from "./Project";
import ProjectRequester from "./ProjectRequester";
import SocketEvents from "../connection/SocketEvents";
import ProjectType from "./ProjectType";
import { LoadRunFinishedStatus, LoadRunnerStatus, ProgressUpdate, LoadRunDownloadableStatus } from "../Types";
import MCUtil from "../../MCUtil";

interface LoadRun {
    readonly resolveProgress: () => void;
    readonly progress: vscode.Progress<ProgressUpdate>;
    status: LoadRunnerStatus;
    hasDownloaded: boolean;
}

export default class LoadRunnerTracker implements vscode.Disposable {

    private currentLoadRun: LoadRun | undefined;

    constructor(
        private readonly project: Project,
        private readonly requester: ProjectRequester,
    ) {

    }

    public async onLoadRunnerStatusEvent(event: SocketEvents.LoadRunnerStatusEvent): Promise<void> {
        if (event.status === this.currentLoadRun?.status) {
            return;
        }

        Log.d(`${this.project.name} load runner status changed to "${event.status}"`, event);

        if (!this.currentLoadRun) {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                // cancellable: true,
                cancellable: false,
                title: `Executing load test on ${this.project.name}`,
            }, (progress, _cancellation) => {
                // cancellation.onCancellationRequested(() => this.cancelLoadRun());

                return new Promise<void>((resolve) => {
                    this.currentLoadRun = {
                        status: event.status,
                        hasDownloaded: false,
                        progress: progress,
                        resolveProgress: resolve,
                    };
                });
            });
        }

        if (this.currentLoadRun == null) {
            // impossible; satisfies the compiler that it's not null.
            Log.e(`Current load run is null after it should have been initialized`);
            return;
        }

        this.currentLoadRun.status = event.status;

        if ((Object.values(LoadRunFinishedStatus) as string[]).includes(event.status)) {
            // Load run completed
            this.reportProgress(MCUtil.uppercaseFirstChar(event.status));

            let completionTries = 0;
            // show the completed status briefly before resolving (and therefore hiding) the progress.
            const completionInterval = setInterval(() => {
                if (this.currentLoadRun) {
                    // The download should finish very quickly but we don't want to resolve the progress until it is done, or after a timeout
                    if (this.currentLoadRun.hasDownloaded || completionTries > 20) {
                        Log.d(`Completing load run`);
                        this.currentLoadRun.resolveProgress();
                        this.currentLoadRun = undefined;
                        clearInterval(completionInterval);
                    }
                    else {
                        Log.d(`Load run has completed but download has not`);
                        completionTries++;
                    }
                }
                else {
                    Log.e(`Load run finished but there is no current load run`);
                    clearInterval(completionInterval);
                }
            }, 1000);
        }
        else if ((Object.values(LoadRunDownloadableStatus) as string[]).includes(event.status)) {
            // The load test is completed but we still have to download the data
            this.reportProgress(`Downloading profiling data...`);
            try {
                await this.downloadProfilingData(event);
            }
            catch (err) {
                const errMsg = `Error downloading profiling data for ${this.project.name}`;
                Log.e(errMsg, err);
                vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
            }
            this.currentLoadRun.hasDownloaded = true;
        }
        else {
            // the load run is in progress, just report the progress
            let statusToReport = MCUtil.uppercaseFirstChar(event.status);
            if (statusToReport.endsWith("ing")) {
                statusToReport += "...";
            }
            this.reportProgress(statusToReport);
        }
    }

    private reportProgress(status: string, increment?: number): void {
        if (!this.currentLoadRun) {
            Log.e(`${this.project.name} has load runner status ${status} but no current load runn progress`);
            return;
        }
        this.currentLoadRun.progress.report({ message: status, increment });
    }

    private async downloadProfilingData(event: SocketEvents.LoadRunnerStatusEvent): Promise<void> {
        Log.d(`Load test completed on ${this.project.name}`)

        // the 'data ready' events must have a timestamp
        if (event.timestamp == null) {
            throw new Error(`No timestamp provided by performance dashboard`);
        }
        const timestampDirPath = path.join(this.project.localPath.fsPath, "load-test", event.timestamp);

        let fileName = "";
        if (this.project.language.toLowerCase() === ProjectType.Languages.JAVA) {
            fileName = "profiling.hcd";
        }
        else if (this.project.language.toLowerCase() === ProjectType.Languages.NODE) {
            fileName = "profiling.json";
        }
        else {
            // should not be possible because the load test should not have run in the first place
            Log.e(`Project language ${this.project.language} not supported for profiling`);
            return;
        }

        const profilingOutPath = path.join(timestampDirPath, fileName);
        Log.i(`Saving ${this.project.name} profiling data to ${profilingOutPath}`);
        try {
            await fs.ensureDir(timestampDirPath);
        }
        catch (err) {
            Log.e(`Error creating directory ${timestampDirPath}`, err);
            vscode.window.showErrorMessage(`Could not create directory at ${timestampDirPath}: ${MCUtil.errToString(err)}`);
            return;
        }

        await this.requester.receiveProfilingData(event.timestamp, profilingOutPath);
    }

    public dispose(): void {
        if (this.currentLoadRun) {
            this.currentLoadRun.resolveProgress();
            this.currentLoadRun = undefined;
        }
    }
}
