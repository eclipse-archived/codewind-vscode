/*******************************************************************************
 * Copyright (c) 2018 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import { ProjectState } from "../microclimate/project/ProjectState";
import { promptForProject } from "./CommandUtil";
import Project from "../microclimate/project/Project";
import { Log } from "../Logger";
import { ProjectType } from "../microclimate/project/ProjectType";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

export default async function containerShellCmd(project: Project): Promise<void> {
    Log.d("containerBashCmd invoked");
    if (project == null) {
        const selected = await promptForProject(...ProjectState.getEnabledStates());
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    if (project.containerID == null || project.containerID === "") {
        vscode.window.showWarningMessage(Translator.t(StringNamespaces.CMD_MISC, "noContainerForShell", { projectName: project.name }));
        return;
    }

    // annoyingly, only python project containers seem to not have bash installed.
    // TODO We could check what's installed by doing docker exec through child_process, if that's worth the trouble.
    const toExec: string = project.type.type === ProjectType.Types.PYTHON ? "sh" : "bash";      // non-nls
    // const env = convertNodeEnvToTerminalEnv(process.env);

    const options: vscode.TerminalOptions = {
        name: `${toExec} - ${project.name}`,        // non-nls

        // Passing through environment variables is not actually useful,
        // since we'll lose them once we exec into the container anyway.
        // env: env
    };

    const term: vscode.Terminal = vscode.window.createTerminal(options);
    term.sendText(`docker exec -it ${project.containerID} /usr/bin/env ${toExec}`);     // non-nls
    term.show();
}

/*
async function getExistingTerminals(name: string): Promise<vscode.Terminal[] | undefined> {
    //const matchingTerms: vscode.Terminal[] = vscode.window.terminals.filter( (term) => term.name === name);
    return vscode.window.terminals.filter( (term) => term.name === name);
}*/

/*
// The format required for environment variables to be passed a vscode terminal
interface TerminalEnv {
    [key: string]: string | null;
}*/

/**
 * Convert a NodeJS.ProcessEnv to the slightly different format VSCode requires -
 * This actually only consists of replacing 'undefined' values with 'null'.
 */
/*
function convertNodeEnvToTerminalEnv(nodeEnv: NodeJS.ProcessEnv): TerminalEnv {
    // Create an empty object, then loop over the key/values of the NodeEnv.
    // If the value is not undefined, set the new k/v into the new object.
    // if it is undefined, set key=null into the new object. Then return that reconstructed object.

    return Object.keys(nodeEnv).reduce( (result: TerminalEnv, key): {} => {
        let value: string | null = nodeEnv[key] || null;
        if (value === undefined) {
            // Replace 'undefined' with 'null' because that is what TerminalOptions requires
            value = null;
        }
        result[key] = value;
        return result;
    }, {});
}*/
