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
import * as path from "path";
import * as fs from "fs";

import Log from "../../Logger";
import Project from "../../codewind/project/Project";
import Commands from "../../constants/Commands";

import { testProjects } from "./Creation.test";
import TestUtil from "../TestUtil";
import ProjectType from "../../codewind/project/ProjectType";
import ProjectState from "../../codewind/project/ProjectState";

describe(`Project auto-build wrapper`, function() {

    before(`should use the precreated test projects`, function() {
        expect(testProjects, `No test projects were found`).to.exist.and.have.length.greaterThan(0);
    });

    // We nest the dynamically generated tests in a before() so they don't execute too soon
    // https://stackoverflow.com/a/54681623
    before(async function() {
        describe(`Project auto-build`, function() {
            testProjects.forEach((project) => {
                if (project.type.isAppsody) {
                    // Appsody does not support auto-build
                    return;
                }

                const abTimeout = TestUtil.ms(90, "sec");
                const abSlow = TestUtil.ms(45, "sec");

                it(`${project.name} should disable auto-build`, async function() {
                    this.timeout(abTimeout);
                    this.slow(abSlow);

                    expect(project.autoBuildEnabled, `${project.name} auto-build was initially disabled, but should be enabled`).to.be.true;
                    await testToggleAutobuild(this, project);

                    await TestUtil.waitForStarted(this, project);
                });

                it(`${project.name} should NOT build when a source file is edited, with auto-build off`, async function() {
                    expect(project.autoBuildEnabled, `${project.name} auto-build was unexpectedly enabled`).to.be.false;
                    this.timeout(TestUtil.ms(1, "min"));
                    this.slow(TestUtil.ms(15, "sec"));

                    let delayed = false;
                    setTimeout(() => { delayed = true; }, 10000);

                    await TestUtil.writeCommentToProjectSourceFile(project);
                    await TestUtil.waitForCondition(this, {
                        label: `Waiting briefly for ${project.name} to NOT build`,
                        condition: () => delayed,
                    }, {
                        label: `${project.name} auto-built when auto-build was disabled`,
                        condition: () => project.state.isBuilding,
                    });
                });

                it(`${project.name} should re-enable auto-build`, async function() {
                    this.timeout(abTimeout);
                    this.slow(abSlow);

                    expect(project.autoBuildEnabled, `${project.name} auto-build was unexpectedly enabled`).to.be.false;
                    await testToggleAutobuild(this, project);

                    await TestUtil.waitForStarted(this, project);
                });

                it(`${project.name} should build when a source file is edited, with auto-build on`, async function() {
                    expect(project.autoBuildEnabled, `${project.name} auto-build was unexpectedly disabled`).to.be.true;
                    this.timeout(abTimeout);
                    this.slow(abSlow);

                    await TestUtil.waitForStarted(this, project);
                    await TestUtil.writeCommentToProjectSourceFile(project);
                    await TestUtil.waitForUpdate(this, project);
                });

                let addedFilePath: string;
                it(`${project.name} should build when a source file is added, with auto-build on`, async function() {
                    expect(project.autoBuildEnabled, `${project.name} auto-build was unexpectedly disabled`).to.be.true;
                    this.timeout(abTimeout);
                    this.slow(abSlow);

                    await TestUtil.waitForStarted(this, project);
                    addedFilePath = path.join(project.localPath.fsPath, "new-file");
                    await TestUtil.writeCommentToFile(addedFilePath);
                    await TestUtil.waitForUpdate(this, project);
                });

                it(`${project.name} should build when a source file is removed, with auto-build on`, async function() {
                    expect(project.autoBuildEnabled, `${project.name} auto-build was unexpectedly disabled`).to.be.true;
                    expect(addedFilePath, "Creating new file failed").to.exist;
                    this.timeout(abTimeout);
                    this.slow(abSlow);

                    await TestUtil.waitForStarted(this, project);
                    await fs.promises.unlink(addedFilePath);
                    await TestUtil.waitForUpdate(this, project);
                });
            });
        });
    });

    it(`stub`, function() { /* stub https://stackoverflow.com/a/54681623 */ } );
});

export async function testToggleAutobuild(ctx: Mocha.Context, project: Project): Promise<void> {
    const currentAB = project.autoBuildEnabled;
    const newAB = !project.autoBuildEnabled;

    Log.t(`${project.name} auto build is ${currentAB}`);
    await vscode.commands.executeCommand(Commands.TOGGLE_AUTOBUILD, project);

    await TestUtil.waitForCondition(ctx, {
        label: `Waiting for ${project.name} auto build to be ${newAB}`,
        condition: () => project.autoBuildEnabled === newAB,
    });

    expect(project.autoBuildEnabled).to.equal(newAB);

    // Node projects also restart when autobuild is toggled, to start/stop using nodemon for auto-update.
    if (project.type.internalType === ProjectType.InternalTypes.NODE) {
        ctx.timeout(TestUtil.ms(30, "sec"));
        ctx.slow(TestUtil.ms(15, "sec"));

        await TestUtil.waitForCondition(ctx, {
            label: `Waiting for Node project ${project.name} to stop after toggling autobuild`,
            condition: () => project.state.appState === ProjectState.AppStates.STOPPED,
        });

        await TestUtil.waitForStarted(ctx, project);
    }
}
