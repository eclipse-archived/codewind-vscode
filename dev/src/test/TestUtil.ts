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

import Log from "../Logger";
import ProjectType from "../codewind/project/ProjectType";
import Project from "../codewind/project/Project";
import Connection from "../codewind/connection/Connection";
import ProjectObserver from "./ProjectObserver";
import ProjectState from "../codewind/project/ProjectState";
import UserProjectCreator, { ICWTemplateData } from "../codewind/connection/UserProjectCreator";
import TestConfig from "./TestConfig";

namespace TestUtil {

    export function getMinutes(mins: number): number {
        return mins * 60 * 1000;
    }

    const PROJECT_PREFIX = "test";

    export async function createProject(connection: Connection, type: ProjectType): Promise<Project> {
        // acquireProject below will only look for projects starting with the project prefix
        const projectName: string = PROJECT_PREFIX + type.type.toLowerCase().replace(".", "") + Date.now().toString().slice(-4);
        Log.t(`Create project of type ${type} at ${connection.url} named ${projectName}`);

        try {
            // turn our internal project type into a user project type which we can pass to the project creator
            const typeForCreation: ICWTemplateData = {
                url: TestConfig.getUrl(type),
                language: type.language,
                projectType: type.internalType,
                // label and description are displayed to user but not used by the test.
                description: "",
                label: ""
            };
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders == null) {
                throw new Error("No active workspace folder!");
            }
            await UserProjectCreator.createProject(connection, typeForCreation, projectName);
        }
        catch (err) {
            Log.t("Create project failure!", err);
            throw err;
        }

        Log.t("Awaiting project creation");
        const projectID = await ProjectObserver.instance.awaitCreate(projectName);

        const createdProject: Project | undefined = await connection.getProjectByID(projectID);
        expect(createdProject, `Failed to get newly created project ${projectName}`).to.exist;
        if (createdProject == null) {
            throw new Error("CreatedProject can't be null after here");
        }

        expect(createdProject).to.exist;
        expect(createdProject.id).to.equal(projectID);
        expect(createdProject.name).to.equal(projectName);
        Log.t(`Created project ${createdProject.name} successfully with ID ${createdProject.id}`);

        return createdProject;
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
    export async function wait(ms: number, reason?: string): Promise<void> {
        const msg: string = `Waiting ${ms}ms` + (reason != null ? ": " + reason : "");
        Log.t(msg);
        return new Promise<void> ( (resolve) => setTimeout(resolve, ms));
    }

    /**
     * Await on this to suspend the test. Useful for debugging tests through the VSCode test instance.
     *
     * **Be careful to not push code that calls this**, or you'll hang the tests!
     */
    export async function waitForever(testContext:
            Mocha.ITestCallbackContext  |
            Mocha.ISuiteCallbackContext |
            Mocha.IBeforeAndAfterContext
        ): Promise<void> {

        testContext.timeout(0);

        return new Promise<void> ( () => { /* never resolves */ } );
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

    // Doesn't appear to work for java any more, thought it definitely used to.
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
}

export default TestUtil;
