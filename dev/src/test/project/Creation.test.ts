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

import { expect } from "chai";
import * as vscode from "vscode";

import TestConfig from "../TestConfig";
import { CWTemplateData, createProject } from "../../command/connection/CreateUserProjectCmd";
import Requester from "../../codewind/project/Requester";
import Log from "../../Logger";
import MCUtil from "../../MCUtil";
import TestUtil from "../TestUtil";
import Project from "../../codewind/project/Project";

import { connection } from "../local/LocalStart.test";

export const JAVA_DEBUG_EXT_ID = "vscjava.vscode-java-debug";
export let testProjects: Project[];

describe(`Project creation`, async function() {

    before(`should use the precreated connection`, function() {
        expect(connection, `The connection does not exist`).to.exist;
        expect(connection.isConnected, `The connection is not connected`).to.be.true;
    });

    let parentDir: vscode.Uri;

    before(`should obtain the directory to create projects under`, async function() {
        parentDir = (await getProjectsParentDir())!;
        expect(parentDir,
            `You must launch the Codewind for VS Code tests with a workspace directory that exists. ` +
            `See the Extension Tests launch in launch.json`).to.exist;

        Log.t(`Creating test projects under ${parentDir.fsPath}`);
    });

    let templatesToTest: CWTemplateData[] = [];

    it(`should get the list of project templates to use`, async function() {
        const allEnabledTemplates = await Requester.getTemplates(connection);
        expect(allEnabledTemplates, `No templates are enabled`).to.have.length.greaterThan(0);

        // All the templates we are interested in should be available
        // because the Codewind and Appsody sources were enabled in the TemplateSources test
        templatesToTest = TestConfig.getTemplatesToTest(allEnabledTemplates);
        expect(templatesToTest, `No templates to test were configured`).to.have.length.greaterThan(0);

        Log.t(`Testing the following templates`, templatesToTest.map((template) => `${template.label}`).join(", "));
    });

    // it would be great to have one test per project type instead of one test for all the project types
    it(`should create test projects`, async function() {
        // Long timeout because this will block subsequent tests if it fails
        this.timeout(TestUtil.ms(30, "sec"));
        this.slow(TestUtil.ms(15, "sec"));

        const nowStr = Date.now().toString();
        const timestamp = nowStr.substring(nowStr.length - 4);

        const creationResults: Array<{ projectName: string, creationErr: any }> = [];
        for (const template of templatesToTest) {
            const simplerLabel = MCUtil.slug(template.label.replace("template", "").replace("®", ""));
            const projectName = `test-${simplerLabel}-${timestamp}`;
            let creationErr;
            try {
                await createProject(connection, template, parentDir, projectName);
                // it seems to cause download errors if you create projects too quickly, so add a short delay
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
            catch (err) {
                creationErr = err;
            }
            creationResults.push({ projectName, creationErr });
        }

        creationResults.forEach((result) => {
            if (result.creationErr) {
                Log.e(`Test error creating project ${result.projectName}`, result.creationErr);
            }
            else {
                Log.t(`Creating project ${result.projectName}`);
            }
        });

        const testProjectCreationPromises = creationResults.map((creationResult) => {
            if (creationResult.creationErr != null) {
                // this project will never be created, so don't wait for it
                return Promise.resolve();
            }
            return TestUtil.waitForCondition(this, {
                label: `Waiting for ${creationResult.projectName} to be created`,
                condition: () => connection.projects.find((p) => p.name === creationResult.projectName) != null,
            });
        });

        await Promise.all(testProjectCreationPromises);
        testProjects = connection.projects.filter((proj) => creationResults.map((result) => result.projectName).includes(proj.name));

        const creationFailures = creationResults.filter((result) => result.creationErr != null);
        const failureNames = creationFailures.map((failure) => failure.projectName).join(", ");
        expect(creationFailures, `The following projects failed to be created: ${failureNames}`).to.be.empty;
    });

    it(`should have the projects build and start`, async function() {
        this.timeout(TestUtil.ms(10, "min"));
        this.slow(TestUtil.ms(5, "min"));

        expect(testProjects, `No test projects were created`).to.exist.and.have.length.greaterThan(0);

        const awaitingStartPromises = testProjects.map((testProject) => {
            return TestUtil.waitForStarted(this, testProject);
        });

        // since we've now created the projects, this is also a good time to activate the java extension if we have a java project.
        // it should be much faster than any initial project build
        awaitingStartPromises.push(activateJavaExtension());

        await Promise.all(awaitingStartPromises);
        Log.t(`${testProjects.length} test projects started successfully`);
    });
});

async function getProjectsParentDir(): Promise<vscode.Uri | undefined> {
    const wsFolders = vscode.workspace.workspaceFolders;
    if (wsFolders == null) {
        return undefined;
    }
    return wsFolders[0].uri;
}

/**
 * The java debug tests depend on the java extension being installed and active.
 * We
 */
async function activateJavaExtension(): Promise<void> {
    const javaExt = vscode.extensions.getExtension(JAVA_DEBUG_EXT_ID);
    if (javaExt == null) {
        Log.e(`Java extension is not installed - Java debug tests will fail!`);
    }
    Log.t("Activating Java debug extension...");
    await javaExt!.activate();
    Log.t(`Finished activating Java debug extension`);
}
