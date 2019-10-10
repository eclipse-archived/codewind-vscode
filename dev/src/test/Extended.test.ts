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

import { expect } from "chai";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

import * as Base from "./Base.test";

import TestConfig from "./TestConfig";
import Commands from "../constants/Commands";
import ProjectObserver from "./ProjectObserver";
import ProjectState from "../codewind/project/ProjectState";
import Log from "../Logger";
import TestUtil from "./TestUtil";
import Project from "../codewind/project/Project";
import SocketTestUtil from "./SocketTestUtil";
import SocketEvents from "../codewind/connection/SocketEvents";
import { removeProject } from "../command/project/RemoveProjectCmd";

describe(`Extended tests`, async function() {

    before("Check initialization", function() {
        expect(Base.initializeSucceeded, "Initialize failed in base test").to.be.true;
        expect(Base.testConnection, "Test Connection is null").to.exist;

        if (!TestConfig.isScopeEnabled("extended")) {
            Log.t("SKIPPING EXTENDED TESTS");
            this.skip();
        }
    });

    for (const testType of TestConfig.getProjectTypesToTest()) {
        let project: Project;

        it(`${testType.projectType} - should be able to acquire the test project we created, and wait for it to be Started`, async function() {
            Log.t(`Acquiring project of type ${testType.projectType}`);
            const project_ = await Base.testConnection.getProjectByID(testType.projectID!);
            expect(project_, "Failed to get test project").to.exist;

            project = project_!;

            // Extra long timeout because it can take a long time for project to start the first time as the image builds
            this.timeout(TestUtil.getMinutes(10));

            await ProjectObserver.instance.awaitProjectStarted(project.id);
            await TestUtil.assertProjectInState(project, ...ProjectState.getStartedStates());
            Log.t(`Acquisition of project ${project.name} succeeded`);
        });

        it(`${testType.projectType} - should kick off a project build manually`, async function() {
            expect(project, "Failed to get test project").to.exist;
            this.timeout(TestUtil.getMinutes(5));

            Log.t("Requesting a build for " + project.name);
            await vscode.commands.executeCommand(Commands.REQUEST_BUILD, project);

            await SocketTestUtil.expectSocketEvent({
                eventType: SocketEvents.Types.PROJECT_STATUS_CHANGED,
                projectID: project.id,
                expectedData: { key: SocketEvents.Keys.BUILD_STATE, value: "inProgress" }
            });

            Log.t(project.name + " is building");
            await SocketTestUtil.expectSocketEvent({
                eventType: SocketEvents.Types.PROJECT_STATUS_CHANGED,
                projectID: project.id,
                expectedData: { key: SocketEvents.Keys.BUILD_STATE, value: "success" }
            });

            await ProjectObserver.instance.awaitProjectStarted(project.id);
            Log.t(project.name + " restarted after a build request");
        });

        it(`${testType.projectType} - should disable and re-enable auto-build`, async function() {
            if (testType.projectType.internalType === "appsodyExtension") {
                  this.skip();
            }

            expect(project, "Failed to get test project").to.exist;
            this.timeout(TestUtil.getMinutes(1));

            Log.t(`${project.name}: Testing auto build toggle`);
            expect(project.autoBuildEnabled).to.be.true;

            // Disable auto build
            await testAutobuild(project);
            // Enable auto build
            await testAutobuild(project);
        });

        it(`${testType.projectType} - should disable and re-enable a project`, async function() {
            expect(project, "Failed to get test project").to.exist;
            this.timeout(TestUtil.getMinutes(5));

            Log.t("Disabling " + project.name);
            await vscode.commands.executeCommand(Commands.DISABLE_PROJECT, project);
            await ProjectObserver.instance.awaitAppState(project.id, ProjectState.AppStates.DISABLED);

            Log.t("Enabling " + project.name);
            await vscode.commands.executeCommand(Commands.ENABLE_PROJECT, project);
            await ProjectObserver.instance.awaitAppState(project.id, ...ProjectState.getEnabledStates());
        });

        let validatorWorked = false;
        it.skip(`${testType.projectType} - should have a validation error after deleting the Dockerfile`, async function() {
            expect(project, "Failed to get test project").to.exist;
            this.timeout(TestUtil.getMinutes(1));

            Log.t(`${project.name}: Deleting Dockerfile`);
            const existingDiagnostics = vscode.languages.getDiagnostics(project.localPath);
            if (existingDiagnostics.length !== 0) {
                Log.t(`Project ${project.name} has existing diagnostics`, existingDiagnostics);
            }

            const dockerfilePath = getDockerfilePath(project);
            Log.t("Deleting " + dockerfilePath);
            fs.unlinkSync(dockerfilePath);

            await vscode.commands.executeCommand(Commands.VALIDATE, project);
            await TestUtil.wait(2500, "Waiting for validation");

            const diagnostics = vscode.languages.getDiagnostics(project.localPath);
            Log.t(`${project.name} diagnostics after deleting Dockerfile are:`, diagnostics);

            const newDiagnosticIndex = existingDiagnostics.length;
            expect(diagnostics, "New diagnostic was not created").to.have.length(newDiagnosticIndex + 1);

            const diagnostic = diagnostics[newDiagnosticIndex];
            expect(diagnostic, "New diagnostic is missing").to.exist;
            expect(diagnostic!.source!.toLowerCase(), "Diagnostic did not have the right source").to.equal("codewind");
            validatorWorked = true;
        });

        it.skip(`${testType.projectType} - should be able to regenerate the removed Dockerfile`, async function() {
            expect(project, "Failed to get test project").to.exist;
            expect(validatorWorked, "Precondition failed").to.be.true;
            this.timeout(TestUtil.getMinutes(1));

            Log.t(`${project.name}: Testing generating Dockerfile and removing validation error`);

            const existingDiagnostics = vscode.languages.getDiagnostics(project.localPath);
            Log.t(`${project.name} has ${existingDiagnostics.length} diagnostics`);

            // TODO
            // await Requester.requestGenerate(project);
            await TestUtil.wait(2500, "Waiting for Dockerfile to be regenerated");

            const dockerfilePath = getDockerfilePath(project);
            expect(fs.existsSync(dockerfilePath), `Dockerfile does not exist at ${dockerfilePath} after generation`).to.be.true;
            Log.t("Dockerfile was regenerated successfully");

            const diagnostics = vscode.languages.getDiagnostics(project.localPath);
            if (diagnostics.length > 0) {
                Log.t("New diagnostics:", diagnostics);
            }
            expect(diagnostics, "Diagnostic was not removed").to.have.length(existingDiagnostics.length - 1);
        });

        it(`should clean up the test project`, async function() {
            if (TestConfig.isScopeEnabled("restart")) {
                this.skip();
            }
            if (project != null) {
                try {
                    await removeProject(project, false);
                    ProjectObserver.instance.onDelete(project.id);
                }
                catch (err) {
                    Log.t(`Error deleting project ${project.name}:`, err);
                }
            }
            else {
                Log.t("Project creation failed; nothing to clean up");
            }
        });

    }
});

async function testAutobuild(project: Project): Promise<void> {
    const currentEnablement = project.autoBuildEnabled;
    const newEnablement = !project.autoBuildEnabled;

    Log.t(`${project.name}: auto build is ${currentEnablement}`);
    await vscode.commands.executeCommand(Commands.TOGGLE_AUTOBUILD, project);
    Log.t(`${project.name}: waiting for auto build to be ${newEnablement}`);

    // Relies on calling test timeout to terminate
    await new Promise<void>( (resolve) => {
        setInterval( () => {
            if (project.autoBuildEnabled === newEnablement) {
                return resolve();
            }
        }, 5000);
    });

    expect(project.autoBuildEnabled).to.equal(newEnablement);
    Log.t(`${project.name}: auto build is now ${newEnablement}`);
}

function getDockerfilePath(project: Project): string {
    return path.join(project.localPath.fsPath, "Dockerfile");
}
