/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import ProjectType from "../microclimate/project/ProjectType";
import Log from "../Logger";

namespace TestConfig {
    interface ITestableProjectType {
        projectType: ProjectType;
        // The name of this project type's extension in Microclimate.
        // Undefined for node
        url: string;
        // We want to tests projects that can't be restarted too,
        // so tell the test whether or not the restart should succeed here.
        canRestart: boolean;

        // Set this after the project is created
        projectID?: string;
    }


    const testableProjectTypes: ITestableProjectType[] = [
        {
            projectType: new ProjectType(ProjectType.InternalTypes.NODE, ProjectType.Languages.NODE),
            canRestart: true,
            url: "https://github.com/microclimate-dev2ops/nodeExpressTemplate",
        },
        {
            projectType: new ProjectType(ProjectType.InternalTypes.SPRING, ProjectType.Languages.JAVA),
            canRestart: true,
            url: "https://github.com/microclimate-dev2ops/springJavaTemplate",
        },
        {
            projectType: new ProjectType(ProjectType.InternalTypes.MICROPROFILE, ProjectType.Languages.JAVA),
            canRestart: true,
            url: "https://github.com/microclimate-dev2ops/javaMicroProfileTemplate",
        },
        {
            projectType: new ProjectType(ProjectType.InternalTypes.SWIFT, ProjectType.Languages.SWIFT),
            canRestart: false,
            url: "https://github.com/microclimate-dev2ops/swiftTemplate",
        },
        {
            projectType: new ProjectType(ProjectType.InternalTypes.DOCKER, ProjectType.Languages.PYTHON),
            canRestart: false,
            url: "https://github.com/microclimate-dev2ops/SVTPythonTemplate",
        },
        {
            projectType: new ProjectType(ProjectType.InternalTypes.DOCKER, ProjectType.Languages.GO),
            canRestart: false,
            url: "https://github.com/microclimate-dev2ops/microclimateGoTemplate",
        }
    ];

    export function getUrl(projectType: ProjectType): string {
        const found = testableProjectTypes.find((tpt) => tpt.projectType === projectType);
        if (!found) {
            // The templates we use for tests are expected to always exist in Microclimate
            throw new Error("Did not find template corresponding to " + projectType);
        }
        return found.url;
    }

    const TYPES_ENV_VAR = "test_project_types";
    const SCOPE_ENV_VAR = "test_scope";
    const DEFAULT_TYPES = "node.js, spring, go";

    export function getProjectTypesToTest(): ITestableProjectType[] {
        if (!process.env[TYPES_ENV_VAR]) {
            Log.w(`No project types set! Using default`);
            process.env[TYPES_ENV_VAR] = DEFAULT_TYPES;
        }
        const projectTypes = process.env[TYPES_ENV_VAR]!;

        const rawTypes = splitByComma(projectTypes);
        return testableProjectTypes.filter((type) => {
            return rawTypes.includes(type.projectType.toString().toLowerCase());
        });
    }

    export function isScopeEnabled(scope: string): boolean {
        const envScope = process.env[SCOPE_ENV_VAR];
        if (!envScope) {
            // Log.w(`${SCOPE_ENV_VAR} environment variable is not set`);
            // if nothing is set, run all scopes
            return true;
        }

        return splitByComma(envScope).includes(scope);
    }

    function splitByComma(s: string): string[] {
        return s.split(",").map((s_) => s_.toLowerCase().trim());
    }
}

export default TestConfig;
