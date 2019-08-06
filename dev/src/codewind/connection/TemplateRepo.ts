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

import Log from "../../Logger";

/**
 * Template repository data as provided by the backend
 */
export interface IRawTemplateRepo {
    readonly url: string;
    readonly name: string;
    readonly description: string;
    readonly enabled: boolean;
}

/**
 * Template repository data wrapped in an object which implements QPI
 */
export class TemplateRepo implements vscode.QuickPickItem {

    public static build(rawRepo: IRawTemplateRepo): TemplateRepo {
        return new TemplateRepo(rawRepo.url, rawRepo.name, rawRepo.description, true);
    }

    private constructor(
        public readonly url: string,
        public readonly name: string,
        public readonly description: string,
        public readonly enabled: boolean,
    ) {
        for (const [k, v] of Object.entries(this)) {
            if (v == null) {
                Log.e("TemplateRepo is missing expected field:", k);
            }
        }
        Log.d("Created TemplateRepo", this);
    }

    public get label(): string {
        return this.name;
    }

    // public get description(): string {
    //     return this.description;
    // }

    public get detail(): string {
        return this.url;
    }

    public get picked(): boolean {
        return this.enabled;
    }
}
