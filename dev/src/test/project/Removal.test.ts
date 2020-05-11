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
import * as fs from "fs-extra";

import TestUtil from "../TestUtil";

import { testProjects } from "./Creation.test";
import Log from "../../Logger";

describe(`Project removal wrapper`, function() {

    before(`should use the precreated test projects`, function() {
        expect(testProjects, `No test projects were found`).to.exist.and.have.length.greaterThan(0);
    });

    // We nest the dynamically generated tests in a before() so they don't execute too soon
    // https://stackoverflow.com/a/54681623
    before(async function() {
        describe(`Project removal`, function() {

            // Test for missingLocalDir functionality - Delete the local dir first, then make sure the extension removes it from Codewind.
            // Do this with one random project.
            const indexToDeleteFromFs = Math.floor(Math.random() * testProjects.length);

            testProjects.forEach((project, index) => {

                if (index === indexToDeleteFromFs) {
                    it(`should delete ${project.name} from Codewind when the project directory is deleted from the filesystem`, async function() {
                        this.timeout(TestUtil.ms(30, "sec"));
                        this.slow(TestUtil.ms(20, "sec"));
                        await fs.remove(project.localPath.fsPath);
                        Log.t(`Deleted ${project.localPath.fsPath}`);

                        await TestUtil.waitForCondition(this, {
                            label: `Waiting for ${project.name} to be removed from ${project.connection.label}`,
                            condition: async () => (await project.connection.getProjectByID(project.id)) == null
                        });
                    });

                    // skip the regular removal tests for this project
                    return;
                }

                let projectPath: string;

                it(`${project.name} should be deleted from Codewind`, async function() {
                    this.timeout(TestUtil.ms(15, "sec"));
                    this.slow(TestUtil.ms(5, "sec"));

                    projectPath = project.localPath.fsPath;

                    await project.deleteFromConnection(true);

                    await TestUtil.waitForCondition(this, {
                        label: `Waiting for ${project.name} to be removed from ${project.connection.label}`,
                        condition: async () => (await project.connection.getProjectByID(project.id)) == null
                    });
                });

                it(`${project.name} should have been deleted from the filesystem`, async function() {
                    this.timeout(TestUtil.ms(15, "sec"));
                    this.slow(TestUtil.ms(5, "sec"));

                    await TestUtil.waitForCondition(this, {
                        label: `Waiting for ${projectPath} to be deleted`,
                        condition: async () => !(await fs.pathExists(projectPath)),
                    });

                    await TestUtil.waitForCondition(this, {
                        label: `Waiting for ${project.name} to be removed from the VS Code workspace`,
                        condition: async () => project.workspaceFolder != null,
                    });
                });
            });
        });
    });

    it(`stub`, function() { /* stub https://stackoverflow.com/a/54681623 */ } );
});
