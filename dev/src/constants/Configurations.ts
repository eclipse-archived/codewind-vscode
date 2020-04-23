/*******************************************************************************
 * Copyright (c) 2019, 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import Log from "../Logger";

const CONFIG_SECTION = "codewind";

class CWConfiguration<T> {

    public readonly fullSection: string;

    /**
     *
     * @param subsection Must match `contributes.configuration.properties` in package.json
     * @param defaultValue
     * @param scope
     */
    constructor(
        private readonly subsection: string,
        private readonly defaultValue: T,
        private readonly scope: vscode.ConfigurationTarget,
    ) {
        this.fullSection = `${CONFIG_SECTION}.${subsection}`;
    }

    public get(): T {
        const result = vscode.workspace.getConfiguration(CONFIG_SECTION, null).get(this.subsection) as T;
        if (result == null) {
            return this.defaultValue;
        }
        return result;
    }

    public async set(newValue: T): Promise<void> {
        await vscode.workspace
            .getConfiguration(CONFIG_SECTION, null)
            .update(this.subsection, newValue, this.scope);

        Log.d(`Set ${this.subsection} to ${newValue}`);
    }
}

export const CWConfigurations = {
    SHOW_HOMEPAGE:                  new CWConfiguration("showHomePage", true, vscode.ConfigurationTarget.Global),
    AUTO_SHOW_VIEW:                 new CWConfiguration("autoShowView", true, vscode.ConfigurationTarget.Global),
    OVERVIEW_ON_CREATION:           new CWConfiguration("openOverviewOnCreation", true, vscode.ConfigurationTarget.Global),

    ALWAYS_CREATE_IN_WORKSPACE:     new CWConfiguration("alwaysCreateProjectsInWorkspace", true, vscode.ConfigurationTarget.Workspace),
    ADD_NEW_PROJECTS_TO_WORKSPACE:  new CWConfiguration("addNewProjectsToWorkspace", true, vscode.ConfigurationTarget.Workspace),
} as const;
