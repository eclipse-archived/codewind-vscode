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

import Log from "../Logger";
import { CWTemplateData } from "../codewind/Types";

namespace TestConfig {

    // Use GetProjectTypes.js to get values you can put here
    const TEST_PROJECT_TYPES = {
        codewind: [
            "nodeExpressTemplate",
            "goTemplate",
            "springJavaTemplate",               // https://github.com/eclipse/codewind/issues/1877
            // "javaMicroProfileTemplate",      // very slow
        ],
        appsody: [
            "nodejs-express",
            "python-flask",
        ]
    };

    export function getTemplatesToTest(allTemplates: CWTemplateData[]): CWTemplateData[] {
        const templatesToTest: CWTemplateData[] = [];
        TEST_PROJECT_TYPES.codewind.forEach((testTemplateName) => {
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

        TEST_PROJECT_TYPES.appsody.forEach((testStackName) => {
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

        return templatesToTest;
    }

    /*
    function splitByComma(s: string): string[] {
        return s.split(",").map((s_) => s_.toLowerCase().trim());
    }
    */
}

export default TestConfig;
