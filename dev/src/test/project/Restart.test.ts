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

import Project from "../../codewind/project/Project";
import Log from "../../Logger";
import ProjectState from "../../codewind/project/ProjectState";

import { testProjects } from "./Creation.test";
import TestUtil from "../TestUtil";
import Commands from "../../constants/Commands";
import restartProjectCmd from "../../command/project/RestartProjectCmd";

describe(`Restart tests wrapper`, async function() {

    before(`should use the precreated test projects`, function() {
        expect(testProjects, `No test projects were found`).to.exist.and.have.length.greaterThan(0);
    });

    // We nest the dynamically generated tests in a before() so they don't execute too soon
    // https://stackoverflow.com/a/54681623
    before(async function() {
        describe(`Project restart and debug`, function() {

            before(`should have the Java Debug extension installed`, async function() {
                await TestUtil.activateJavaExtension();
            });

            testProjects.forEach((project) => {

                it(`${project.name} should have capabilities`, async function() {
                    expect(project.capabilities).to.exist;
                });

                if (!project.capabilities?.supportsRestart) {
                    // skip these tests for this project
                    return;
                }

                it(`${project.name} should restart in Run mode`, async function() {
                    this.timeout(TestUtil.ms(3, "min"));
                    this.slow(TestUtil.ms(2, "min"));

                    await TestUtil.waitForStarted(this, project);

                    await testRestart(this, project, false);
                });

                if (!project.capabilities.supportsDebug) {
                    // skip the debug tests
                    return;
                }

                let debugRestartSuccess = false;

                it(`${project.name} should restart in Debug mode`, async function() {
                    this.timeout(TestUtil.ms(3, "min"));
                    this.slow(TestUtil.ms(2, "min"));

                    await TestUtil.waitForStarted(this, project);

                    await testRestart(this, project, true);

                    debugRestartSuccess = true;
                });

                it(`${project.name} should have an active debug session`, async function() {
                    if (!debugRestartSuccess) {
                        // The project failed to restart into debug mode so this test can't run.
                        this.skip();
                    }
                    this.timeout(TestUtil.ms(30, "sec"));
                    this.slow(TestUtil.ms(10, "sec"));

                    try {
                        await TestUtil.waitForCondition(this, {
                            label: `Waiting for a debug session to be active`,
                            condition: () => vscode.debug.activeDebugSession != null
                        });

                        await assertDebugSessionExists(project.name);
                        Log.t("Debugger connect succeeded");
                    }
                    finally {
                        await TestUtil.killActiveDebugSession();
                    }
                });

                it(`should be able to re-attach the debugger to ${project.name}`, async function() {
                    if (!debugRestartSuccess) {
                        // The project failed to restart into debug mode so this test can't run.
                        this.skip();
                    }
                    this.timeout(TestUtil.ms(30, "sec"));
                    this.slow(TestUtil.ms(10, "sec"));
                    // this.retries(2);

                    try {
                        await vscode.commands.executeCommand(Commands.ATTACH_DEBUGGER, project);
                        await TestUtil.waitForCondition(this, {
                            label: `Waiting for a new debug session to be active`,
                            condition: () => vscode.debug.activeDebugSession != null
                        });

                        await assertDebugSessionExists(project.name);
                        Log.t("Debugger connect succeeded again");
                    }
                    finally {
                        await TestUtil.killActiveDebugSession();
                    }
                });
            });
        });
    });

    it(`stub`, function() { /* stub https://stackoverflow.com/a/54681623 */ } );
});

export async function testRestart(ctx: Mocha.Context, project: Project, debug: boolean): Promise<void> {
    Log.t(`Testing restart debug=${debug} on project ${project.name}`);

    const restartCmdResult = await restartProjectCmd(project, debug);
    expect(restartCmdResult, "Restart command returned failure").to.be.true;

    expect(restartCmdResult, `Restart failed`).to.equal(true);

    if (!restartCmdResult) {
        // If the restart failed, the test is over, whether or not we expected it to fail.
        return;
    }

    await TestUtil.waitForCondition(ctx, {
        label: `Waiting for ${project.name} to stop`,
        condition: () => project.state.appState === ProjectState.AppStates.STOPPED,
    });

    const startingState = debug ? ProjectState.AppStates.DEBUG_STARTING : ProjectState.AppStates.STARTING;
    await TestUtil.waitForCondition(ctx, {
        label: `Waiting for ${project.name} to be ${startingState} during restart`,
        condition: () => project.state.appState === startingState,
    });

    const terminalState = debug ? ProjectState.AppStates.DEBUGGING : ProjectState.AppStates.STARTED;
    await TestUtil.waitForCondition(ctx, {
        label: `Waiting for ${project.name} to be ${terminalState} during restart`,
        condition: () => project.state.appState === terminalState,
    });

    // this is required or the next restart may fail due to timing issues
    await TestUtil.waitForCondition(ctx, {
        label: `Waiting for ${project.name} to finish restarting`,
        condition: () => !project.isRestarting
    });
}

export async function assertDebugSessionExists(projectName: string): Promise<void> {
    Log.t("assertDebugSessionExists containing name " + projectName);

    const debugSession_ = vscode.debug.activeDebugSession;
    expect(debugSession_, `${projectName} There should be an active debug session`).to.exist;

    const debugSession = debugSession_!;
    Log.t(`Active debug session is ${debugSession.name}`);
    expect(debugSession!.name).to.contain(projectName, `Active debug session is not for this project, is: ${debugSession.name}`);

    const threads = (await debugSession.customRequest("threads"))["threads"];
    Log.t(`There are ${threads.length} threads`);
    // only 1 thread for node projects
    expect(threads, "Debug session existed but has no threads").to.exist.and.not.be.empty;
}
