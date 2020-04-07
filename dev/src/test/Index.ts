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

import Log from "../Logger";

import TestConfig from "./TestConfig";
import Constants from "../constants/Constants";

// See ./suites for suites we can put here.
let suites: string[] = [];
if (TestConfig.isJenkins()) {
    suites.push("Jenkins");
}
else {
    suites.push("Local");
}

suites = suites.map((suite) => path.join(__dirname, "suites", suite) + ".suite.js");

export async function run(): Promise<void> {

    if (TestConfig.isJenkins()) {
        // delete all the binary dirs so the tests have to test the pull each time
        (await fs.readdir(Constants.DOT_CODEWIND_DIR))
            .filter((dirname) => dirname === "latest" || /\d+\.\d+\.\d+/.test(dirname))
            .map((dir) => {
                const fullPath = path.join(Constants.DOT_CODEWIND_DIR, dir);
                Log.t(`Deleting ${fullPath} before starting tests`)
                return fs.remove(fullPath);
            });
    }

    const options: Mocha.MochaOptions = {
        ui: "bdd",
        color: !TestConfig.isJenkins(),
        reporter: "spec",
        fullStackTrace: true,
        slow: 2500,
        timeout: 5000,
    };

    Log.t(`========== Starting Codewind for VS Code tests ==========`);
    Log.t(`Launching tests with options:`, options);

    const mocha = new Mocha(options);

    // Base test always runs first, once
    mocha.addFile(path.join(__dirname, "Base.test.js"));
    suites.forEach((suite) => mocha.addFile(suite));

    Log.t(`Running test files: ${mocha.files.map((f) => path.basename(f)).join(", ")}`);

    return new Promise<void>((resolve, reject) => {
        try {
            mocha.run((failures) => {
                Log.t(`========== Finished Codewind for VS Code tests ==========`);
                if (failures > 0) {
                    return reject(`${failures} tests failed.`);
                }
                else {
                    Log.t(`All tests passed!`);
                    return resolve();
                }
            });
        }
        catch (err) {
            Log.e(`Error running tests:`, err);
            return reject(err);
        }
    });
}
