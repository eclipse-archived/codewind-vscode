/*******************************************************************************
 * Copyright (c) 2018, 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import ProjectState from "./ProjectState";
import Log from "../../Logger";
import Project from "./Project";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Translator from "../../constants/strings/Translator";
import { attachDebugger } from "../../command/project/AttachDebuggerCmd";
import ProjectCapabilities, { StartModes } from "./ProjectCapabilities";
import { ProgressUpdate } from "../Types";

const STRING_NS = StringNamespaces.PROJECT;

// States that a project cycles through during a Run mode restart
const RESTART_STATES_RUN = [
    ProjectState.AppStates.STOPPED,
    ProjectState.AppStates.STARTING,
    ProjectState.AppStates.STARTED
];

const RESTART_STATES_DEBUG = [
    ProjectState.AppStates.STOPPED,
    ProjectState.AppStates.DEBUG_STARTING,
    ProjectState.AppStates.DEBUGGING
];

/**
 * Wraps a promise which resolves (see `fulfill` function) when the project restarts, fails to restart, or has its restart time out.
 * Displays a status bar message tied to the restart promise.
 * Each project should have either one or zero of these at a time. Concurrent restarts on one project does not make sense and should be prevented.
 */
export default class ProjectPendingRestart {

    // These are set in the constructor, but the compiler doesn't see that. Will never be undefined.
    // Resolves this pending restart, when it completes or fails.
    private resolve: (() => void) | undefined;
    // Shows progress of this pending restart. The progress is resolved when this.resolve() is called.
    private progress: vscode.Progress<ProgressUpdate> | undefined;

    // Restart timeout, length specified by timeoutMs constructor parameter
    private readonly timeoutID: NodeJS.Timeout;

    private readonly isDebugRestart: boolean;
    // Expect the project to go through this set of states in this order.
    // Will be set to one of the RESTART_STATES arrays above.
    private readonly expectedStates: ProjectState.AppStates[];
    // Index in expectedStates pointing to the state we expect next.
    private nextStateIndex: number = 0;

    // This promise is resolved by calling resolveRestartEvent when this project receives the projectRestartResult event
    // The restart cannot complete until this promise resolves.
    private readonly restartEventPromise: Promise<void>;
    // Like resolve above, also set in the constructor. Will never be undefined.
    private resolveRestartEvent: (() => void) | undefined;

    /**
     * Projects that shouldn't be restartable can still be restarted as part of a link operation. In that case, this will be false.
     */
    private readonly projectCanRestart: boolean;

    constructor(
        private readonly project: Project,
        private readonly startMode: StartModes,
        private readonly isLinkRestart: boolean,
    ) {
        Log.d(`${project.name}: New pendingRestart into ${startMode} mode`);

        this.isDebugRestart = ProjectCapabilities.isDebugMode(startMode);
        this.expectedStates = this.isDebugRestart ? RESTART_STATES_DEBUG : RESTART_STATES_RUN;

        this.projectCanRestart = !isLinkRestart && project.capabilities != null && project.capabilities.supportsRestart;
        if (!this.projectCanRestart && this.expectedStates[0] === ProjectState.AppStates.STOPPED) {
            // projects that cannot normally restart will not go into the stopped state.
            this.expectedStates.splice(0, 1);
        }

        this.restartEventPromise = new Promise<void>((resolve_) => {
            this.resolveRestartEvent = resolve_;
        });

        const timeoutMs = 180 * 1000;
        // Fails the restart when the timeout expires
        this.timeoutID = setTimeout(() => {
            const failReason = Translator.t(STRING_NS, "restartFailedReasonTimeout", { timeoutS: Math.round(timeoutMs / 1000) });
            Log.i("Rejecting restart: " + failReason);
            this.fulfill(false, failReason);
        }, timeoutMs);

        let restartMsg;
        if (isLinkRestart) {
            restartMsg = Translator.t(STRING_NS, "restartingStatusLinkMsg", {
                projectName: project.name,
            });
        }
        else {
            restartMsg = Translator.t(STRING_NS, "restartingStatusMsg", {
                projectName: project.name,
                startMode: ProjectCapabilities.getUserFriendlyStartMode(startMode)
            });
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: restartMsg,
        }, (progress) => {
            this.progress = progress;
            this.progress.report({ message: `Waiting for project to stop...`})

            // Resolved when the restart completes or times out.
            return new Promise<void>((resolve_) => {
                this.resolve = resolve_;
            });
        });
    }

    /**
     * Parent project object calls this in update().
     */
    public async onStateChange(currentState: ProjectState.AppStates): Promise<void> {
        if (currentState === this.expectedStates[this.nextStateIndex]) {
            this.nextStateIndex++;

            if (this.nextStateIndex === this.expectedStates.length) {
                Log.d("Reached restart terminal state");

                if (this.projectCanRestart) {
                    Log.d(`Now waiting for restart event`);
                    // Might already be resolved depending on timing
                    await this.restartEventPromise;
                    Log.d("Done waiting for restart event");
                }

                // The restart was successful
                this.fulfill(true);
            }
            else {
                const nextState = this.expectedStates[this.nextStateIndex];
                Log.d("Restart expecting next state: " + nextState);
                if (ProjectState.getStartedOrStartingStates().includes(nextState)) {
                    this.progress?.report({ message: `Waiting for project to start...` });
                }
            }
        }
    }

    /**
     * Parent Project calls this when the restartResult socket event is received.
     * Should only be called once per instance of this class (ie, per restart).
     */
    public async onReceiveRestartEvent(success: boolean, error?: string): Promise<void> {
        Log.d(`${this.project.name}: pending restart received restart event, success=${success}`);

        if (!success) {
            // The restart failed
            this.fulfill(success, error);
        }
        else if (this.isDebugRestart && !this.isLinkRestart) {
            try {
                Log.d("Attach debugger runnning as part of a restart");
                // Intermittently for restarting Microprofile projects, the debugger will try to connect too soon,
                // so add an extra delay if it's MP and Starting.
                // This doesn't really slow anything down because the server is still starting anyway.
                const libertyDelayMs = 2500;
                if (this.project.type.requiresDebugDelay && this.project.state.appState === ProjectState.AppStates.DEBUG_STARTING) {
                    Log.d(`Waiting extra ${libertyDelayMs}ms for Starting project`);

                    const delayPromise = new Promise((resolve) => setTimeout(resolve, libertyDelayMs));

                    const preDebugDelayMsg = Translator.t(StringNamespaces.DEBUG, "waitingBeforeDebugAttachStatusMsg",
                        { projectName: this.project.name }
                    );

                    this.progress?.report({ message: preDebugDelayMsg });
                    await delayPromise;
                }

                await attachDebugger(this.project, this.progress);
                this.progress?.report({ message: `Waiting for project to be ${this.expectedStates[this.expectedStates.length - 1]}...`});
            }
            catch (err) {
                Log.w("Debugger attach failed or was cancelled by user", err);
                const errMsg = err.message || err;
                vscode.window.showErrorMessage(errMsg);

                if (this.startMode === StartModes.DEBUG) {
                    // The project will fail to start because it will be waiting for the attach, which failed. So we fail the restart here
                    this.fulfill(false, Translator.t(STRING_NS, "restartFailedReasonDebugFailure"));
                }
            }
        }

        if (this.resolveRestartEvent != null) {
            Log.d("Resolving restart event promise");
            this.resolveRestartEvent();
        }
        else {
            // will never happen
            Log.e("Null resolveRestartEvent");
        }
    }

    public onDisconnectOrDisable(disconnect: boolean): void {
        const msg = disconnect ? Translator.t(STRING_NS, "restartFailedReasonDisconnect") : Translator.t(STRING_NS, "restartFailedReasonDisabled");
        this.fulfill(false, msg);
    }

    /**
     * Resolves this class's restart promise, removing the status bar item and rendering this pending restart "done".
     * Also calls onRestartFinish which removes the Project's reference to this instance.
     *
     * Displays a success or failure message to the user depending on the value of `success`.
     */
    private fulfill(success: boolean, error?: string): void {
        Log.d(`Fulfilling pending restart for ${this.project.name}, success=${success}${error ? ", error=" + error : ""}`);

        if (this.resolve == null || this.timeoutID == null) {
            // will never happen
            Log.e("Cannot fulfill pending restart because of an initialization failure");
            return;
        }

        this.resolve();
        clearTimeout(this.timeoutID);
        if (success) {
            let successMsg;
            if (this.isLinkRestart) {
                successMsg = Translator.t(STRING_NS, "restartLinkSuccess", {
                    projectName: this.project.name
                });
            }
            else {
                successMsg = Translator.t(STRING_NS, "restartSuccess", {
                    projectName: this.project.name, startMode: ProjectCapabilities.getUserFriendlyStartMode(this.startMode)
                });
            }

            Log.i(successMsg);
            vscode.window.showInformationMessage(successMsg);
        }
        else {
            let failMsg: string;
            if (error != null) {
                failMsg = Translator.t(STRING_NS, "restartFailureWithReason",
                    { projectName: this.project.name, startMode: ProjectCapabilities.getUserFriendlyStartMode(this.startMode), reason: error }
                );
            }
            else {
                failMsg = Translator.t(STRING_NS, "restartFailure",
                    { projectName: this.project.name, startMode: ProjectCapabilities.getUserFriendlyStartMode(this.startMode) }
                );
            }

            Log.w(failMsg);
            vscode.window.showErrorMessage(failMsg);
        }

        this.project.onRestartFinish();
    }
}
