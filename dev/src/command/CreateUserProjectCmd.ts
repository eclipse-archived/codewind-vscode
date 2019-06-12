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

import { promptForConnection } from "./CommandUtil";
import Log from "../Logger";
import Connection from "../microclimate/connection/Connection";
import * as MCUtil from "../MCUtil";
import UserProjectCreator, { IMCTemplateData } from "../microclimate/connection/UserProjectCreator";
import EndpointUtil, { MCEndpoints } from "../constants/Endpoints";
import Requester from "../microclimate/project/Requester";

const CREATE_PROJECT_WIZARD_TITLE = "Create a New Project";
const CREATE_PROJECT_WIZARD_NO_STEPS = 2;
const BACK_BTN_MSG = "Back button";

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
        let template: IMCTemplateData | undefined;
        let projectName: string | undefined;
        while (!template || !projectName) {
            template = await promptForTemplate(connection);
            if (template == null) {
                return;
            }
            try {
                projectName = await promptForProjectName(template);
                if (projectName == null) {
                    return;
                }
            }
            catch (err) {
                if (err !== BACK_BTN_MSG) {
                    // unexpected error
                    throw err;
                }
                // else user clicked back, return to top of loop
            }
        }

        const response = await UserProjectCreator.createProject(connection, template, projectName);
        if (!response) {
            // user cancelled
            return;
        }
        vscode.window.showInformationMessage(`Created project ${response.projectName} at ${response.projectPath}`);
    }
    catch (err) {
        const errMsg = "Error creating new project: ";
        Log.e(errMsg, err);
        vscode.window.showErrorMessage(errMsg + MCUtil.errToString(err));
    }
}

async function promptForTemplate(connection: Connection): Promise<IMCTemplateData | undefined> {
    const templatesUrl = EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.TEMPLATES);
    const templates: IMCTemplateData[] = (await Requester.get(templatesUrl, { json: true })).body;

    const templateQpis: Array<vscode.QuickPickItem & IMCTemplateData> = templates.map((type) => {
        return {
            ...type,
            detail: type.language,
            extension: type.url,
        };
    });

    const qp = vscode.window.createQuickPick();
    qp.placeholder = "Select the project type to create";
    qp.matchOnDetail = true;
    qp.canSelectMany = false;
    qp.items = templateQpis;
    qp.step = 1;
    qp.totalSteps = CREATE_PROJECT_WIZARD_NO_STEPS;
    qp.title = CREATE_PROJECT_WIZARD_TITLE;

    const selected = await new Promise<readonly vscode.QuickPickItem[] | undefined>((resolve) => {
        qp.show();
        qp.onDidHide((_e) => {
            resolve(undefined);
        });
        qp.onDidAccept((_e) => {
            resolve(qp.selectedItems);
        });
    })
    .finally(() => qp.dispose());

    // there are either 1 or 0 items selected because canSelectMany is false
    if (selected == null || selected.length === 0) {
        return undefined;
    }

    // map the selected QPI back to the template it represents
    const selectedProjectType = templateQpis.find((type) => selected[0].label === type.label);
    if (selectedProjectType == null) {
        throw new Error(`Could not find template ${selected[0].label}`);
    }
    return selectedProjectType;
}

async function promptForProjectName(template: IMCTemplateData): Promise<OptionalString> {
    const ib = vscode.window.createInputBox();
    ib.title = CREATE_PROJECT_WIZARD_TITLE;
    ib.step = 2;
    ib.totalSteps = CREATE_PROJECT_WIZARD_NO_STEPS;
    ib.buttons = [ vscode.QuickInputButtons.Back ];
    ib.placeholder = `my-${template.language}-project`;
    ib.prompt = `Enter a name for your new ${template.language} project`;

    ib.onDidChangeValue((projName) => {
        ib.validationMessage = validateProjectName(projName);
    });

    return new Promise<string | undefined>((resolve, reject) => {
        ib.show();
        ib.onDidHide((_e) => {
            resolve(undefined);
        });
        ib.onDidAccept((_e) => {
            resolve(ib.value);
        });
        ib.onDidTriggerButton((_btn) => {
            // back button is the only button
            reject(BACK_BTN_MSG);
        });
    })
    .finally(() => ib.dispose());
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
