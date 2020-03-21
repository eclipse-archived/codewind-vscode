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

import * as vscode from "vscode";
import { expect } from "chai";

import TestUtil from "../TestUtil";
import Log from "../../Logger";
import Commands from "../../constants/Commands";

import { testProjects } from "./Creation.test";

describe(`Project enablement (enable/disable)`, function() {

    before(`should use the precreated test projects`, function() {
        expect(testProjects, `No test projects were found`).to.exist.and.have.length.greaterThan(0);
    });

    // We nest the dynamically generated tests in a before() so they don't execute too soon
    // https://stackoverflow.com/a/54681623
    before(async function() {
        describe(`Project enablement`, function() {
            testProjects.forEach((project) => {

                it(`${project.name} should be disabled and re-enabled`, async function() {
                    this.timeout(TestUtil.ms(10, "min"));
                    this.slow(TestUtil.ms(3, "min"));

                    Log.t("Disabling " + project.name);
                    await vscode.commands.executeCommand(Commands.DISABLE_PROJECT, project);
                    await TestUtil.waitForCondition(this, {
                        label: `Waiting for ${project.name} to disable`,
                        condition: () => !project.state.isEnabled,
                    });
                    await vscode.commands.executeCommand(Commands.ENABLE_PROJECT, project);

                    await TestUtil.waitForCondition(this, {
                        label: `Waiting for ${project.name} to enable`,
                        condition: () => project.state.isEnabled,
                    });

                    await TestUtil.waitForStarted(this, project);
                });
            });
        });
    });

    it(`stub`, function() { /* stub https://stackoverflow.com/a/54681623 */ } );
});
