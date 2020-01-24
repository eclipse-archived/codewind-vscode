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

import Log from "../../Logger";
import Project from "../../codewind/project/Project";
import Commands from "../../constants/Commands";
import ProjectType from "../../codewind/project/ProjectType";

import { testProjects } from "./Creation.test";
import TestUtil from "../TestUtil";

describe(`Project auto-build wrapper`, function() {

    before(`should use the precreated test projects`, function() {
        expect(testProjects, `No test projects were found`).to.exist.and.have.length.greaterThan(0);
    });

    // We nest the dynamically generated tests in a before() so they don't execute too soon
    // https://stackoverflow.com/a/54681623
    before(async function() {
        describe(`Project auto-build`, function() {
            testProjects.forEach((project) => {
                if (project.type.internalType === ProjectType.InternalTypes.EXTENSION_APPSODY) {
                    // Appsody projects don't support auto-build.
                    Log.t(`Skipping auto-build tests for ${project.name}`);
                    return;
                }

                it(`${project.name} should disable and re-enable auto-build`, async function() {
                    Log.t(`${project.name}: Testing auto build toggle`);
                    expect(project.autoBuildEnabled).to.be.true;

                    // Disable auto build
                    await testAutobuild(this, project);
                    // Enable auto build
                    await testAutobuild(this, project);
                });

                // TODO edit a source file and watch build
            });
        });
    });

    it.skip(`stub`, function() { /* stub https://stackoverflow.com/a/54681623 */ } );
});

export async function testAutobuild(ctx: Mocha.Context, project: Project): Promise<void> {
    const currentAB = project.autoBuildEnabled;
    const newAB = !project.autoBuildEnabled;

    Log.t(`${project.name} auto build is ${currentAB}`);
    await vscode.commands.executeCommand(Commands.TOGGLE_AUTOBUILD, project);

    await TestUtil.waitForCondition(ctx, {
        label: `Waiting for ${project.name} auto build to be ${newAB}`,
        condition: () => project.autoBuildEnabled === newAB,
    });

    expect(project.autoBuildEnabled).to.equal(newAB);
}
