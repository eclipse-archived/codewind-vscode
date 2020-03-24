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

import TestUtil from "../TestUtil";
import LocalCodewindManager from "../../codewind/connection/local/LocalCodewindManager";
import connectLocalCodewindCmd from "../../command/StartCodewindCmd";
import Connection from "../../codewind/connection/Connection";

export let connection: Connection;

describe(`Start Local Codewind`, function() {

    this.bail(true);

    const lcwm = LocalCodewindManager.instance;

    it(`should install, start, and connect`, async function() {
        this.timeout(TestUtil.ms(5, "min"));
        this.slow(TestUtil.ms(3, "min"));

        await connectLocalCodewindCmd();
        expect(lcwm.isStarted).to.be.true;
        expect(lcwm.localConnection).to.exist;
    });

    it(`should be ready to receive requests and have a socket connection`, async function() {
        this.timeout(TestUtil.ms(30, "sec"));
        this.slow(TestUtil.ms(5, "sec"));

        await TestUtil.waitForCondition(this,
            {
                label: `Waiting for the local connection to be ready`,
                condition: () => lcwm.localConnection != null && lcwm.localConnection.isConnected,
            }
        );

        // localConnection was verified to be non-null above.
        connection = lcwm.localConnection!;
    });
});
