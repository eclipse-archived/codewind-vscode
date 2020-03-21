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

import { runTests } from 'vscode-test';
import * as path from 'path';

// tslint:disable: no-console

async function main(): Promise<number> {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './Index.js');

    console.log(`Running extension tests from ${extensionTestsPath}`);
    // Download VS Code, unzip it and run the integration test
    return await runTests({ extensionDevelopmentPath, extensionTestsPath });
}

main()
.then((exitCode) => {
    process.exit(exitCode);
})
.catch((err) => {
    console.error("Failed to run tests", err);
    process.exit(2);
});
