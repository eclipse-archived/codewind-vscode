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
import { CLICommandRunner } from "../../codewind/cli/CLICommandRunner";
import Log from "../../Logger";
import stopLocalCodewindCmd from "../../command/StopCodewindCmd";
import removeImagesCmd from "../../command/RemoveImagesCmd";
import LocalCodewindManager from "../../codewind/connection/local/LocalCodewindManager";

describe(`Stop Local Codewind wrapper`, function() {

    before(async function() {
        describe("Local Codewind - Stop", function() {
            it(`should stop and uninstall if present`, async function() {
                this.timeout(TestUtil.ms(2, "min"));
                this.slow(TestUtil.ms(1, "min"));

                const preStatus = await CLICommandRunner.status();
                Log.t(`Status at the start of local stop tests`, preStatus);

                // if (lcwm.isStarted) {
                await stopLocalCodewindCmd();
                expect(LocalCodewindManager.instance.isStarted).to.be.false;
                expect(LocalCodewindManager.instance.localConnection).to.be.undefined;
                // }

                await removeImagesCmd(LocalCodewindManager.instance, true);

                const postStatus = await CLICommandRunner.status();
                expect(postStatus["installed-versions"]).to.be.empty;
                expect(postStatus.started).to.be.empty;
            });
        });
    });

    it(`stub`, function() { /* stub */ });
});
