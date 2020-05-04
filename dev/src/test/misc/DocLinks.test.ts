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
import got from "got";

import CWDocs from "../../constants/CWDocs";
import Log from "../../Logger";
import TestUtil from "../TestUtil";

describe("Doc links test", function() {

    it(`should not have any broken links to the Codewind docs`, async function() {
        this.timeout(TestUtil.ms(10, "sec"));
        this.slow(TestUtil.ms(5, "sec"));

        const errors: string[] = [];

        await Promise.all(Object.values(CWDocs).map(async (doc) => {
            Log.t(`GET doclink ${doc.uri.toString()}`);

            try {
                await got.get(doc.uri.toString());
            }
            catch (err) {
                Log.t(`Error testing doclink ${doc.uri.toString()}:`, err);
                errors.push(`${doc.uri.toString()} ${err.message}`);
            }
        }));

        expect(errors, `${errors.length} doc links were broken:\n${errors.join("\n")}\n`).to.be.empty;
    });
});
