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

// Adapted from https://github.com/microsoft/vscode-extension-samples/blob/master/helloworld-test-sample/src/test/suite/index.ts

import Mocha from "mocha";
import * as path from "path";
import * as fs from "fs-extra";

import CLISetup from "../codewind/cli/CLISetup";

// tslint:disable: no-console

const SUITES_TO_RUN = [
    "Local.suite.js"
]
.map((suite) => path.join(__dirname, "suites", suite));

export async function run(): Promise<void> {

    // delete the binaries so the tests have to test the pull each time
    await fs.remove(CLISetup.BINARIES_TARGET_DIR);

    const mocha = new Mocha({
        ui: "bdd",
        color: true,
        reporter: "spec",
        fullStackTrace: true,
        slow: 2500,
        timeout: 5000,
    });

    // Base test always runs first, once
    mocha.addFile(path.join(__dirname, "Base.test.js"));
    SUITES_TO_RUN.forEach((suite) => mocha.addFile(suite));

    return new Promise<void>((cb, err) => {
        try {
            mocha.run((failures) => {
                if (failures > 0) {
                    return err(`${failures} tests failed.`);
                }
                cb();
            });
        }
        catch (err) {
            console.error(err);
            return err(err);
        }
    });
}
