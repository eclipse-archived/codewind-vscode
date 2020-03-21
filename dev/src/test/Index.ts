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
import * as fs from "fs";

import Log from "../Logger";
import CLISetup from "../codewind/cli/CLISetup";

import TestConfig from "./TestConfig";

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

    // delete the binaries so the tests have to test the pull each time
    await deleteBinaries();

    const options: Mocha.MochaOptions = {
        ui: "bdd",
        useColors: !TestConfig.isJenkins(),
        reporter: "spec",
        fullStackTrace: true,
        slow: 2500,
        timeout: 5000,
    };

    Log.t(`Launching tests with options:`, options);

    const mocha = new Mocha(options);

    // Base test always runs first, once
    mocha.addFile(path.join(__dirname, "Base.test.js"));
    suites.forEach((suite) => mocha.addFile(suite));

    Log.t(`Running test files: ${mocha.files.map((f) => path.basename(f)).join(", ")}`);

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
            Log.e(`Error running tests:`, err);
            return err(err);
        }
    });
}

async function deleteBinaries(): Promise<void> {
    let binaries;
    try {
        binaries = await fs.promises.readdir(CLISetup.BINARIES_TARGET_DIR);
    }
    catch (err) {
        if (err.code !== "ENOENT") {
            Log.w(`Unexpected error reading ${CLISetup.BINARIES_TARGET_DIR}`, err);
        }
        Log.t(`${CLISetup.BINARIES_TARGET_DIR} did not exist`);
        return;
    }

    await Promise.all(binaries.map(async (file) => {
        try {
            file = path.join(CLISetup.BINARIES_TARGET_DIR, file);
            await fs.promises.unlink(file);
            Log.t(`Deleted ${file}`);
        }
        catch (err) {
            if (err.code !== "ENOENT") {
                Log.w(`Unexpected error deleting ${file}`, err);
            }
        }
    }));
}
