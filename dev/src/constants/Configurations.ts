/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

class CWConfiguration<T> {
    constructor(
        private readonly section: string,
        private readonly defaultValue: T
    ) {

    }

    public get(): T {
        const result = vscode.workspace.getConfiguration("codewind", null).get(this.section) as T;
        if (result == null) {
            return this.defaultValue;
        }
        return result;
    }
}

// tslint:disable-next-line: variable-name
export const CWConfigurations = {
    AUTO_SHOW_VIEW:             new CWConfiguration("autoShowView", true),
    OVERVIEW_ON_CREATION:       new CWConfiguration("openOverviewOnCreation", true),
    ALWAYS_CREATE_IN_WORKSPACE: new CWConfiguration("alwaysCreateProjectsInWorkspace", false),
} as const;
