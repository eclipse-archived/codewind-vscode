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
import * as request from "request-promise-native";

import { promptForConnection } from "./CommandUtil";
import Log from "../Logger";
import Connection from "../microclimate/connection/Connection";
import * as MCUtil from "../MCUtil";
import UserProjectCreator, { IMCTemplateData } from "../microclimate/connection/UserProjectCreator";
import EndpointUtil, { MCEndpoints } from "../constants/Endpoints";

/**
 * @param create true for Create page, false for Import page
 */
export default async function createProject(connection: Connection): Promise<void> {
    if (connection == null) {
        const selected = await promptForConnection(true);
        if (selected == null) {
            Log.d("User cancelled prompt for resource");
            // user cancelled
            return;
        }
        connection = selected;
    }

    try {
        const template = await promptForTemplate(connection);
        if (template == null) {
            return;
        }
        const projectName = await promptForProjectName(template);
        if (projectName == null) {
            return;
        }
        const response = await UserProjectCreator.createProject(connection, template, projectName);
        if (!response) {
            // user cancelled
            return;
        }
        vscode.window.showInformationMessage(`Created project ${response.projectName} at ${response.projectPath}`);
    }
    catch (err) {
        const errMsg = "Error creating project from template: ";
        Log.e(errMsg, err);
        vscode.window.showErrorMessage(errMsg + MCUtil.errToString(err));
    }
}


async function promptForTemplate(connection: Connection): Promise<IMCTemplateData | undefined> {
    const templatesUrl = EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.TEMPLATES);
    const templates: IMCTemplateData[] = await request.get(templatesUrl, { json: true });

    const projectTypeQpis: Array<(vscode.QuickPickItem & IMCTemplateData)> = templates.map((type) => {
        return {
            ...type,
            detail: type.language,
            extension: type.url,
        };
    });

    return vscode.window.showQuickPick(projectTypeQpis, {
        placeHolder: "Select the project type to create",
        // matchOnDescription: true,
        matchOnDetail: true,
    });
}

async function promptForProjectName(template: IMCTemplateData): Promise<OptionalString> {
    return await vscode.window.showInputBox({
        placeHolder: `Enter a name for your new ${template.language} project`,
        validateInput: validateProjectName,
    });
}

const ILLEGAL_CHARS = [
    `"`, "/", "\\", "?", "%", "*", ":", "|", "<", ">", "&", " "
];

function validateProjectName(projectName: string): OptionalString {
    const firstIllegalChar = [...projectName].find((c) => ILLEGAL_CHARS.includes(c));

    if (firstIllegalChar != null) {
        return `Invalid project name "${projectName}". Project names may not contain "${firstIllegalChar}"`;
    }

    // const matches: boolean = /^[a-z0-9_.-]+$/.test(projectName);
    // if (!matches) {
    // tslint:disable-next-line: max-line-length
    //     return `Invalid project name "${projectName}". Project name can only contain numbers, lowercase letters, periods, hyphens, and underscores.`;
    // }
    return undefined;
}
