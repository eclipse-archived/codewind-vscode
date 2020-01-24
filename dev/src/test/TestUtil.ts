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

import { expect } from "chai";
import * as vscode from "vscode";

import Log from "../Logger";
import Project from "../codewind/project/Project";
import ProjectState from "../codewind/project/ProjectState";

namespace TestUtil {

    export function ms(num: number, unit: "min" | "sec") {
        let result = num * 1000;
        if (unit === "min") {
            result *= 60;
        }
        return result;
    }

    export async function assertProjectInState(project: Project, ...states: ProjectState.AppStates[]): Promise<void> {
        if (states.length === 0) {
            Log.e("No states passed to assertProjectInState");
        }
        Log.t(`Assert project ${project.name} is one of ${JSON.stringify(states)}`);

        const failMsg = `assertProjectInState failure: ` +
            `Project ${project.name} is not in any of states: ${JSON.stringify(states)}, is instead ${project.state.appState}`;

        expect(states, failMsg).to.include(project.state.appState);

        Log.t(`Assert passed, state is ${project.state.appState}`);
    }

    export function expectSuccessStatus(statusCode: number, failMsg?: string): void {
        if (failMsg == null) {
            failMsg = "Expected statusCode between [200, 400) but received " + statusCode;
        }

        expect(statusCode, failMsg).to.be.greaterThan(199).and.lessThan(400);
    }

    export function expect400Status(statusCode: number, failMsg?: string): void {
        if (failMsg == null) {
            failMsg = "Expected statusCode between [400, 500) but received " + statusCode;
        }

        expect(statusCode, failMsg).to.be.greaterThan(399).and.lessThan(500);
    }

    /**
     * Await on this function to pause for the given duration.
     * Make sure you set the timeout in the calling test to be at least this long.
     */
    export async function wait(msWait: number, reason?: string): Promise<void> {
        const msg: string = `Waiting ${msWait}ms` + (reason != null ? ": " + reason : "");
        Log.t(msg);
        return new Promise<void> ((resolve) => setTimeout(resolve, msWait));
    }

    /**
     * Await on this to suspend the test. Useful for debugging tests through the VSCode test instance.
     *
     * **Be careful to not push code that calls this**, or you'll hang the tests!
     */
    export async function waitForever(testContext: Mocha.Suite): Promise<void> {
        testContext.timeout(0);
        return new Promise<void> (() => { /* never resolves */ } );
    }

    /*
    export async function killAllDebugSessions(): Promise<void> {
        let counter = 0;
        while (vscode.debug.activeDebugSession != null) {
            await killActiveDebugSession();
            counter++;
        }
        if (counter > 0) {
            Logger.test(`Killed ${counter} active debug sessions`);
        }
    }*/

    // Doesn't appear to work for java any more, though it definitely used to.
    export async function killActiveDebugSession(): Promise<void> {
        const activeDbSession = vscode.debug.activeDebugSession;
        if (activeDbSession != null) {
            Log.t("Attempting to disconnect active debug session " + activeDbSession.name);

            // These parameters are not documented, see the code linked below for Java. Seems to work for Node too.
            // tslint:disable-next-line:max-line-length
            // https://github.com/Microsoft/java-debug/blob/master/com.microsoft.java.debug.core/src/main/java/com/microsoft/java/debug/core/protocol/Requests.java#L169
            await activeDbSession.customRequest("disconnect", { terminateDebuggee: false, restart: false })
            .then(
                () => Log.t(`Disconnected debug session "${activeDbSession.name}"`),
                // Sometimes this will fail, don't worry about it
                (err) => Log.t(`Error disconnecting from debug session ${activeDbSession.name}:`, err.message || err)
            );
        }
    }

    interface Condition {
        readonly label: string;
        readonly condition: () => boolean | Promise<boolean>;
    }

    export async function waitForCondition(
            ctx: Mocha.Context,
            success: Condition,
            failure?: Condition
        ): Promise<void> {

        Log.t(`${success.label}...`);

        const testIntervalMs = 250;
        const intervalsPerSec = 1000 / testIntervalMs;
        const logInterval = 10 * intervalsPerSec;
        let tries = 0;

        return new Promise<void>((resolve) => {
            const interval = setInterval(async () => {
                tries++;

                const succeeded = await evaluate(success);

                if (succeeded) {
                    Log.t(`${success.label} completed after ${getSecsElapsed(intervalsPerSec, tries)}s`);
                    clearInterval(interval);
                    return resolve();
                }
                else if (failure != null) {
                    const failed = await evaluate(failure);

                    if (failed) {
                        Log.t(`${success.label} failed after ${getSecsElapsed(intervalsPerSec, tries)}s: ${failure.label}`);
                        clearInterval(interval);
                        return resolve();
                    }
                }

                if (tries % logInterval === 0) {
                    Log.t(`${success.label}, ${getSecsElapsed(intervalsPerSec, tries)}s elapsed`);
                }
                // if test is done, clear interval
                if (!ctx.test?.isPending || ctx.test?.timedOut) {
                    clearInterval(interval);
                }
            }, testIntervalMs);
        });
    }

    function getSecsElapsed(intervalsPerSec: number, tries: number): number {
        return tries / intervalsPerSec;
    }

    async function evaluate(condition: Condition): Promise<boolean> {
        let result = false;
        if (condition.condition instanceof Promise) {
            result = await condition.condition();
        }
        else {
            result = (condition.condition as () => boolean)();
        }
        return result;
    }

    export function waitForStarted(ctx: Mocha.Context, project: Project): Promise<void> {
        return TestUtil.waitForCondition(ctx, {
                label: `Waiting for ${project.name} to be Started`,
                condition: () => project.state.isStarted,
            }, {
                label: `${project.name} build failed`,
                condition: () => project.state.buildState === ProjectState.BuildStates.BUILD_FAILED,
            }
        );
    }
}

export default TestUtil;
