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

import { connection } from "../local/LocalStart.test";
import { CLICommandRunner } from "../../codewind/cli/CLICommandRunner";

describe.skip(`Image registries`, function() {

    before(`should use the precreated connection`, function() {
        expect(connection, `The connection does not exist`).to.exist;
        expect(connection.isConnected, `The connection is not connected`).to.be.true;
    });

    const now = Date.now().toString();
    const TEST_REGISTRY_ADDR = `fakedomain${now.substring(now.length - 4)}.io`;
    const TEST_REGISTRY_USER = "fake-user";
    const TEST_REGISTRY_PASSWD = "fake-password";

    let didAddSecret = false;

    it(`should add a registry secret`, async function() {
        const priorSecrets = await CLICommandRunner.getRegistrySecrets(connection.id);
        const newSecrets = await CLICommandRunner.addRegistrySecret(connection.id, TEST_REGISTRY_ADDR, TEST_REGISTRY_USER, TEST_REGISTRY_PASSWD);

        expect(newSecrets, `Length of secrets array did not increase by 1 after addition`).to.have.length(priorSecrets.length + 1);

        const newSecret = newSecrets.find((secret) => secret.address.includes(TEST_REGISTRY_ADDR));
        expect(newSecret, `No secret was found which included the expected address ${TEST_REGISTRY_ADDR}`).to.exist;
        expect(newSecret?.username).to.equal(TEST_REGISTRY_USER);

        didAddSecret = true;
    });

    // Obviously, branch this when there are remote tests.
    it(`should not have a push registry on the local connection`, async function() {
        if (!didAddSecret) {
            this.skip();
        }

        const pushRegistryResponse = await connection.requester.getPushRegistry();
        expect(pushRegistryResponse.imagePushRegistry).to.be.false;
        expect(pushRegistryResponse.address).to.not.exist;
    });

    it(`should remove the new registry secret`, async function() {
        if (!didAddSecret) {
            this.skip();
        }

        const priorSecrets = await CLICommandRunner.getRegistrySecrets(connection.id);
        const newSecrets = await CLICommandRunner.removeRegistrySecret(connection.id, TEST_REGISTRY_ADDR);

        expect(newSecrets, `Length of secrets array did not decrease by 1 after removal`).to.have.length(priorSecrets.length - 1);

        const match = newSecrets.find((secret) => secret.address.includes(TEST_REGISTRY_ADDR));
        expect(match, `Secret which should have been removed was still found`).to.not.exist;
    });
});
