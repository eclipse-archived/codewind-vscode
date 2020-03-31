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

// https://github.com/microsoft/vscode-extension-samples/blob/master/helloworld-test-sample/src/test/runTest.ts

import * as vscodeTest from "vscode-test";
import { TestOptions } from "vscode-test/out/runTest";

import * as os from "os";
import * as path from "path";
import * as fs from "fs-extra";

// tslint:disable: no-console

async function main(): Promise<number> {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './Index.js');

    const workspaceEnv = process.env.CODE_TESTS_WORKSPACE;

    let workspaceDir;
    if (workspaceEnv) {
        workspaceDir = workspaceEnv;
    }
    else {
        workspaceDir = path.join(os.homedir(), "codewind-vscode-tests-workspace");
    }

    console.log(`Workspace dir is ${workspaceDir}`);

    await fs.ensureDir(workspaceDir);

    const vscodeExecutablePath = await vscodeTest.downloadAndUnzipVSCode();

    const options: TestOptions = {
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: [ workspaceDir ],
        vscodeExecutablePath,
    }

    console.log(`Running extension tests with options:`, options);

    // Download VS Code, unzip it and run the integration tests
    return await vscodeTest.runTests(options);
}

/*
// For some reason, this hangs in Jenkins.
async function installJavaDebugExtension(vscodePath) {
    const args = [ "--install-extension", "vscjava.vscode-java-debug", "--force" ];
    console.log(`Executing ${executablePath} ${args.join(" ")}`)

    await new Promise((resolve, reject) => {
        let tries = 0;
        const interval = setInterval(() => {
            console.log(`After ${10 * tries}s we are still waiting`);
            tries++;
        }, 10000);

        execFile(executablePath, args, (err, stdout, stderr) => {
            console.log("it exited");
            if (stdout) {
                console.log("Output:", stdout.trim());
            }
            if (stderr) {
                console.error("Error:", stderr.trim());
            }

            clearInterval(interval);
            if (err) {
                return reject(err);
            }
            return resolve();
        })
        .on("close", () => console.log("close"))
        .on("error", (err) => console.error("error", err))
        .on("exit", () => console.log("exit"))
        .on("message", (msg) => console.log("message", msg))
        .on("disconnect", () => console.log("disconnect"));
    });

    console.log("Finished installing Java Debug extension");
}
*/

main()
.then((exitCode) => {
    process.exit(exitCode);
})
.catch((err) => {
    console.error("Failed to run tests", err);
    process.exit(2);
});
