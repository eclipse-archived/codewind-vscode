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

describe(`Project removal wrapper`, function() {

    before(`should use the precreated test projects`, function() {
        expect(testProjects, `No test projects were found`).to.exist.and.have.length.greaterThan(0);
    });

    // We nest the dynamically generated tests in a before() so they don't execute too soon
    // https://stackoverflow.com/a/54681623
    before(async function() {
        describe(`Project removal`, function() {
            testProjects.forEach((project) => {

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
