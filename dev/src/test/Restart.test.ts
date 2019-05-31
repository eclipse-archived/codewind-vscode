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

import { expect } from "chai";
import * as vscode from "vscode";

import * as Base from "./Base.test";
// Import Extended tests so Restart tests execute after Extended.
import * as Extended from "./Extended.test";
Extended;

import Project from "../microclimate/project/Project";
import Log from "../Logger";
import ProjectState from "../microclimate/project/ProjectState";
import Commands from "../constants/Commands";

import TestUtil from "./TestUtil";
import ProjectObserver from "./ProjectObserver";
import SocketTestUtil from "./SocketTestUtil";
import SocketEvents from "../microclimate/connection/SocketEvents";
import TestConfig from "./TestConfig";
import MiscProjectActions from "../microclimate/project/MiscProjectActions";

describe(`Restart tests`, async function() {

    before("Check initialization", async function() {
        if (!TestConfig.isScopeEnabled("restart")) {
            Log.t("SKIPPING RESTART TESTS");
            this.skip();
        }

        expect(Base.initializeSucceeded, "Initialize failed in base test").to.be.true;
        expect(Base.testConnection, "Test Connection is null").to.exist;
    });

    before("Check that the Java Debug extension is installed if necessary", async function() {
        if (!TestConfig.getProjectTypesToTest().some((type) => type.projectType.language.toLowerCase() === "java")) {
            return;
        }
        this.timeout(TestUtil.getMinutes(2));

        const javaDebugExt = "vscjava.vscode-java-debug";
        const javaExt = vscode.extensions.getExtension(javaDebugExt);
        expect(javaExt, `Java debug extension must be installed`).to.exist;
        Log.t("Activating Java debug extension...");
        await javaExt!.activate();
    });

    for (const testType of TestConfig.getProjectTypesToTest()) {
        // These can't be set here because the base test has to execute first
        let project: Project;
        const canRestart: boolean = testType.canRestart;

        it(`${testType.projectType} - should be able to acquire the test project we created, and wait for it to be Started`, async function() {
            Log.t(`Acquiring project of type ${testType.projectType}`);
            const project_ = await Base.testConnection.getProjectByID(testType.projectID!);
            expect(project_, "Failed to get test project").to.exist;

            project = project_!;
            Log.t(`Project name is ${project.name} and projectID is ${project.id}`);

            // Extra long timeout because it can take a long time for project to start the first time as the image builds
            this.timeout(TestUtil.getMinutes(10));

            await ProjectObserver.instance.awaitProjectStarted(project.id);
            await TestUtil.assertProjectInState(project, ...ProjectState.getStartedStates());
            Log.t(`Acquisition of project ${project.name} succeeded`);
        });

        it(`${testType.projectType} - should ${canRestart ? "" : "NOT "}be able to restart the project in Run mode`, async function() {
            expect(project, "Failed to get test project").to.exist;
            Log.t(`Using ${testType.projectType} project ${project.name}`);
            await TestUtil.assertProjectInState(project, ...ProjectState.getStartedStates());

            this.timeout(TestUtil.getMinutes(5));

            const success = await testRestart(project, false, canRestart);
            const failMsg = canRestart ? "Restart unexpectedly failed" : "Restart succeeded, but should have failed!";
            Log.t(`Restart into run mode ${success ? "succeeded" : "failed"}`);
            expect(success, failMsg).to.equal(canRestart);
            Log.t(`${testType.projectType} - restart into Run mode test passed`);
        });

        // There's no point in running the next test if this one fails, so track that with this variable.
        let debugReady = false;
        const debugDelay = 10000;

        it(`${testType.projectType} - should ${canRestart ? "" : "NOT "}be able to restart the project in Debug mode`, async function() {
            expect(project.id, "Failed to get test project").to.exist;
            await TestUtil.assertProjectInState(project, ...ProjectState.getStartedStates());
            this.timeout(TestUtil.getMinutes(5));

            Log.t(`Using ${testType.projectType} project ${project.name}`);

            const success = await testRestart(project, true, canRestart);

            const failMsg = canRestart ? "Restart unexpectedly failed" : "Restart succeeded, but should have failed!";
            expect(success, failMsg).to.equal(canRestart);
            if (!success) {
                Log.t("Restart into debug mode failed");
                // if we expected it to fail, the test is over here.
                return;
            }

            Log.t("Restart into debug mode succeeded.");
            debugReady = true;

            // Now wait for it to enter Debugging state (much slower for Liberty)
            await ProjectObserver.instance.awaitAppState(project.id, ProjectState.AppStates.DEBUGGING);
            Log.t("Debug restart test passed");
        });

        if (canRestart) {
            it(`${testType.projectType} - should have an active debug session`, async function() {
                expect(project, "Failed to get test project").to.exist;
                expect(debugReady, "Restart into debug mode failed, so we can't attach the debugger.").to.be.true;

                this.timeout(TestUtil.getMinutes(1));
                this.retries(2);

                // Wait briefly, this helps resolve some timing issues with debugger connection
                await TestUtil.wait(debugDelay, "Giving debugger connect a chance to complete");
                await assertDebugSessionExists(project.name);
                Log.t("Debugger connect succeeded");
                await TestUtil.killActiveDebugSession();
            });
        }

        if (canRestart) {
            it(`${testType.projectType} - should be able to attach the debugger to the same Debugging project`, async function() {
                expect(project, "Failed to get test project").to.exist;
                expect(debugReady, "Restart into debug mode failed, so we can't attach the debugger.").to.be.true;

                this.timeout(TestUtil.getMinutes(1));
                this.retries(2);

                // It should have reached Debugging state in the previous test, so this should be fast
                await ProjectObserver.instance.awaitAppState(project.id, ProjectState.AppStates.DEBUGGING);

                await vscode.commands.executeCommand(Commands.ATTACH_DEBUGGER, project);
                await TestUtil.wait(debugDelay, "Giving debugger connect a chance to complete again");
                await assertDebugSessionExists(project.name);

                Log.t("Debugger connect succeeded again");

                await TestUtil.killActiveDebugSession();
            });
        }

        it(`should clean up the test project`, async function() {
            if (project != null) {
                try {
                    await MiscProjectActions.unbind(project, false);
                    ProjectObserver.instance.onDelete(project.id);
                }
                catch (err) {
                    Log.t(`Error deleting project ${project.name}:`, err);
                }
            }
            else {
                Log.t("Project creation failed; nothing to clean up");
            }
            // don't bother asserting deletion; it won't affect our results.
        });
    }
});

export async function testRestart(project: Project, debug: boolean, shouldSucceed: boolean): Promise<boolean> {
    Log.t(`Testing restart debug=${debug} on project ${project.name}. should be restartable? ${shouldSucceed}`);

    const restartCmdResult: any = await vscode.commands.executeCommand(debug ? Commands.RESTART_DEBUG : Commands.RESTART_RUN, project);
    expect(restartCmdResult, "Restart command returned null").to.exist;
    // the result here is the request response
    Log.t("Restart response is", restartCmdResult);
    expect(restartCmdResult, "Restart did not fail or succeed as expected").to.equal(shouldSucceed);

    if (!restartCmdResult) {
        // If the restart failed, the test is over, whether or not we expected it to fail.
        return false;
    }

    Log.t("Restart result matched expected; waiting now for Restart Result event");

    const socketData = await SocketTestUtil.expectSocketEvent({
        eventType: SocketEvents.Types.PROJECT_RESTART_RESULT,
        projectID: project.id
    });

    expect(socketData["status"], "Microclimate failed to restart project!").to.equal("success");

    Log.t("Received good Restart Result event, waiting now for project restart state changes");

    // I have seen timing issues here if the project exits the Starting state really quickly.
    // const startingState = debug ? ProjectState.AppStates.DEBUG_STARTING : ProjectState.AppStates.STARTING;
    // await ProjectObserver.instance.awaitProjectState(project.id, startingState);

    const terminalState = debug ? ProjectState.AppStates.DEBUGGING : ProjectState.AppStates.STARTED;
    await ProjectObserver.instance.awaitAppState(project.id, terminalState);
    Log.t("Project restart was successful");

    const state = project.state;
    expect(state.appState, `Project restart appeared to succeed, but project is not ${terminalState}, is instead ${state}`).to.equal(terminalState);

    Log.t(`Done testing restart for ${project.name} into ${terminalState} mode`);
    return true;
}

export async function assertDebugSessionExists(projectName: string): Promise<void> {
    Log.t("assertDebugSessionExists containing name " + projectName);
    const debugSession = vscode.debug.activeDebugSession;
    Log.t(`Active debug session is ${debugSession ? debugSession.name : "undefined"}`);
    expect(debugSession, `${projectName} There should be an active debug session`).to.exist;
    expect(debugSession!.name).to.contain(projectName, "Active debug session is not for this project, is: " + debugSession);
    const threads = (await debugSession!.customRequest("threads"))["threads"];
    Log.t(`There are ${threads.length} threads`);
    // only 1 thread for node projects
    expect(threads, "Debug session existed but has no threads").to.exist.and.not.be.empty;
}
