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
import Translator from "../../constants/strings/translator";
import { attachDebugger } from "../../command/project/AttachDebuggerCmd";
import ProjectCapabilities, { StartModes } from "./ProjectCapabilities";
import { getOcticon, Octicons } from "../../constants/CWImages";

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

    // This is set in the constructor, but the compiler doesn't see that. Will never be undefined.
    private resolve: (() => void) | undefined;

    // Restart timeout, length specified by timeoutMs constructor parameter
    private readonly timeoutID: NodeJS.Timeout;

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

    constructor(
        private readonly project: Project,
        private readonly startMode: StartModes,
        timeoutMs: number = 180 * 1000,
    ) {
        Log.d(`${project.name}: New pendingRestart into ${startMode} mode`);

        this.expectedStates = ProjectCapabilities.isDebugMode(startMode) ? RESTART_STATES_DEBUG : RESTART_STATES_RUN;

        // Resolved when the restart completes or times out. Displayed in the status bar.
        const restartPromise = new Promise<void>((resolve_) => {
            this.resolve = resolve_;
        });

        this.restartEventPromise = new Promise<void>((resolve_) => {
            this.resolveRestartEvent = resolve_;
        });

        // Fails the restart when the timeout expires
        this.timeoutID = setTimeout(() => {
            const failReason = Translator.t(STRING_NS, "restartFailedReasonTimeout", { timeoutS: timeoutMs / 1000 });
            Log.i("Rejecting restart: " + failReason);
            this.fulfill(false, failReason);
        }, timeoutMs);

        const restartMsg = Translator.t(STRING_NS, "restartingStatusMsg", {
            projectName: project.name,
            startMode: ProjectCapabilities.getUserFriendlyStartMode(startMode)
        });
        const restartStatusItem = `${getOcticon(Octicons.sync, true)} ${restartMsg}`;

        vscode.window.setStatusBarMessage(restartStatusItem, restartPromise);
    }

    /**
     * Parent project object calls this in update().
     */
    public async onStateChange(currentState: ProjectState.AppStates): Promise<void> {
        if (currentState === this.expectedStates[this.nextStateIndex]) {
            this.nextStateIndex++;
            if (this.nextStateIndex === this.expectedStates.length) {
                Log.d("Reached restart terminal state");

                Log.d(`Now waiting for restart event`);
                // Might already be resolved depending on timing
                await this.restartEventPromise;
                Log.d("Done waiting for restart event");

                // The restart was successful
                this.fulfill(true);
            }
            else {
                Log.d("Restart expecting next state: " + this.expectedStates[this.nextStateIndex]);
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
        else if (ProjectCapabilities.isDebugMode(this.startMode)) {
            try {
                await attachDebugger(this.project, true);
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
            const successMsg = Translator.t(STRING_NS, "restartSuccess",
                { projectName: this.project.name, startMode: ProjectCapabilities.getUserFriendlyStartMode(this.startMode) }
            );

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
