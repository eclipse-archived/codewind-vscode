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

import Project from "../../codewind/project/Project";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";

export default async function containerShellCmd(project: Project): Promise<void> {
    const containerID = project.containerID;
    if (!containerID) {
        vscode.window.showWarningMessage(Translator.t(StringNamespaces.CMD_MISC, "noContainerForShell", { projectName: project.name }));
        return;
    }

    // exec bash if it's installed, else exec sh
    const toExec = `sh -c "if type bash > /dev/null; then bash; else sh; fi"`;      // non-nls

    // const env = convertNodeEnvToTerminalEnv(process.env);

    const options: vscode.TerminalOptions = {
        name: `${project.name} shell`,        // non-nls

        // Passing through environment variables is not actually useful,
        // since we'll lose them once we exec into the container anyway.
        // env: env
    };

    const term: vscode.Terminal = vscode.window.createTerminal(options);
    term.sendText(`docker exec -it ${containerID} /usr/bin/env ${toExec}`);     // non-nls
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
