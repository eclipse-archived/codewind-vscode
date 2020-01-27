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

import * as path from "path";

import { CWTemplateData } from "../command/connection/CreateUserProjectCmd";
import Log from "../Logger";

export const ATTN_GRABBER = "*".repeat(10);

namespace TestConfig {

    const ENVVAR_TEST_APPSODY = "CWTEST_APPSODY";

    // Use GetProjectTypes.js to get values you can put here, and in the appsody stacks.
    const DEFAULT_CW_TEMPLATES = [
        "nodeExpressTemplate",
        "goTemplate",
        // "springJavaTemplate",            // https://github.com/eclipse/codewind/issues/1877
        // "javaMicroProfileTemplate",      // takes forever
    ];

    const DEFAULT_APPSODY_STACKS = [
        "nodejs-express",
        "python-flask"
    ];

    export function areAppsodyTestsEnabled(): boolean {
        return !!process.env[ENVVAR_TEST_APPSODY];
    }

    export function getTemplatesToTest(allTemplates: CWTemplateData[]): CWTemplateData[] {
        const templatesToTest: CWTemplateData[] = [];
        DEFAULT_CW_TEMPLATES.forEach((testTemplateName) => {
            const match = allTemplates
                .filter((template) => path.basename(template.url) === testTemplateName);

            if (match.length === 1) {
                templatesToTest.push(match[0]);
            }
            else if (match.length === 0) {
                Log.t(`Error - Could not find a template that matched the test template name ${testTemplateName}`);
            }
            else {
                Log.t(`Error - Found multiple templates that matched the test template name ${testTemplateName}: ${JSON.stringify(match)}`);
            }
        });

        if (areAppsodyTestsEnabled()) {
            DEFAULT_APPSODY_STACKS.forEach((testStackName) => {
                const match = allTemplates
                    .filter((stack) => {
                        const tarName = path.basename(stack.url);
                        // tarName looks like "incubator.java-spring-boot2.v0.3.22.templates.default.tar.gz"
                        // we select the "simple" or "default" one, for the stacks that have variants.
                        const tarStackName = tarName.split(".")[1];
                        return tarStackName === testStackName && (tarName.includes("simple") || tarName.includes("default"));
                    });

                if (match.length === 1) {
                    templatesToTest.push(match[0]);
                }
                else if (match.length === 0) {
                    Log.t(`Error - Could not find an stack that matched the test stack name ${testStackName}`);
                }
                else {
                    Log.t(`Error - Found multiple stacks that matched the test stack name ${testStackName}: ${JSON.stringify(match)}`);
                }
            });
        }

        return templatesToTest;
    }

    /*
    function splitByComma(s: string): string[] {
        return s.split(",").map((s_) => s_.toLowerCase().trim());
    }
    */
}

export default TestConfig;
