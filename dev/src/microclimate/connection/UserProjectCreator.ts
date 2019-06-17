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
import * as path from "path";

import Log from "../../Logger";
import Connection from "./Connection";
import EndpointUtil, { MCEndpoints } from "../../constants/Endpoints";
import SocketEvents from "./SocketEvents";
import Requester from "../project/Requester";
import ProjectType from "../project/ProjectType";
// import * as MCUtil from "../../MCUtil";

export interface IMCTemplateData {
    label: string;
    description: string;
    url: string;
    language: string;
    projectType: string;
}

interface IProjectTypeInfo {
    language: string;
    projectType: string;
}

interface IInitializationResponse {
    status: string;
    result: IProjectTypeInfo | { error: string; };
    projectPath: string;
}

interface INewProjectInfo {
    projectName: string;
    projectPath: string;
}

/**
 * Functions to create or import new user projects into Codewind
 */
namespace UserProjectCreator {

    export async function createProject(connection: Connection, template: IMCTemplateData, projectName: string): Promise<INewProjectInfo> {

        // right now projects must be created under the codewind workspace so users can't cohoose the parentDir
        const parentDirUri = connection.workspacePath;
        // abs path on user system under which the project will be created
        const userParentDir = parentDirUri.fsPath;

        // caller must handle errors
        const creationRes = await requestCreate(connection, template, projectName, userParentDir);
        if (creationRes.status !== SocketEvents.STATUS_SUCCESS) {
            // failed
            const failedResult = (creationRes.result as { error: string });
            throw new Error(failedResult.error);
        }

        // const result = creationRes.result as IProjectInitializeInfo;

        // create succeeded, now we bind
        await requestBind(connection, projectName, creationRes.projectPath, template.language, template.projectType);
        return { projectName, projectPath: creationRes.projectPath };
    }

    export async function validateAndBind(connection: Connection, pathToBindUri: vscode.Uri): Promise<INewProjectInfo | undefined> {
        const pathToBind = pathToBindUri.fsPath;
        Log.i("Binding to", pathToBind);

        const projectName = path.basename(pathToBind);
        const validateRes = await requestValidate(connection, pathToBind);
        if (validateRes.status !== SocketEvents.STATUS_SUCCESS) {
            // failed
            const failedResult = (validateRes.result as { error: string });
            throw new Error(failedResult.error);
        }
        let projectTypeInfo = validateRes.result as IProjectTypeInfo;

        // if the detection returned the fallback type, or if the user says the detection is wrong
        let detectionFailed: boolean = false;
        if (projectTypeInfo.projectType === ProjectType.InternalTypes.DOCKER) {
            detectionFailed = true;
        }
        else {
            const yesBtn = "Yes";
            const noBtn = "No";

            const confirmRes = await vscode.window.showInformationMessage(
                `Please confirm the project type for ${projectName}:\n` +
                `Type: ${projectTypeInfo.projectType}\n` +
                `Language: ${projectTypeInfo.language}`,
                { modal: true }, yesBtn, noBtn,
            );

            if (confirmRes == null) {
                return;
            }
            else if (confirmRes === noBtn) {
                detectionFailed = true;
            }
            // else they picked 'yes'
        }

        if (detectionFailed) {
            const userProjectType = await promptForProjectType(connection);
            if (userProjectType == null) {
                return;
            }
            projectTypeInfo = userProjectType;
        }

        await requestBind(connection, projectName, pathToBind, projectTypeInfo.language, projectTypeInfo.projectType);
        return { projectName, projectPath: pathToBind };
    }

    const OTHER_OPTION = "Other";

    /**
     * When detection fails, have the user select the project type that fits best.
     */
    async function promptForProjectType(connection: Connection): Promise<IProjectTypeInfo | undefined> {
        Log.d("Prompting user for project type");
        const templates = await Requester.getTemplates(connection);

        let projectTypeQpis: Array<vscode.QuickPickItem & { language: string }> = [];
        for (const template of templates) {
            if (template.projectType === ProjectType.InternalTypes.DOCKER) {
                // this option is handled specially below; Docker type shows up as "Other"
                continue;
            }
            if (projectTypeQpis.find((type) => type.label === template.projectType)) {
                // Skip to avoid adding duplicates
                continue;
            }

            projectTypeQpis.push({
                label: template.projectType,
                language: template.language,
            });
        }
        // remove duplicates
        projectTypeQpis = [ ...new Set(projectTypeQpis) ];
        projectTypeQpis.sort();
        // Add "other" option last
        projectTypeQpis.push({
            label: OTHER_OPTION,
            language: "any"             // this will be replaced below
        });

        const projectTypeRes = await vscode.window.showQuickPick(projectTypeQpis, {
            placeHolder: "Select the project type that best fits your project",
            ignoreFocusOut: true,
        });

        if (projectTypeRes == null) {
            return;
        }

        let projectType: string = projectTypeRes.label;
        let language: string;
        if (projectType !== OTHER_OPTION) {
            language = projectTypeRes.language;
        }
        else {
            // map the 'other' back to the docker type
            projectType = ProjectType.InternalTypes.DOCKER;
            const languageRes = await promptForLanguage(templates);
            if (languageRes == null) {
                return;
            }
            language = languageRes;
        }

        return { projectType, language };
    }

    async function promptForLanguage(templates: IMCTemplateData[]): Promise<string | undefined> {
        Log.d("Prompting user for project language");
        let languageQpis = templates.map((template) => template.language);
        // remove duplicates
        languageQpis = [ ... new Set(languageQpis) ];
        languageQpis.sort();
        languageQpis.push(OTHER_OPTION);

        let language = await vscode.window.showQuickPick(languageQpis, {
            placeHolder: "Select the language that best fits your project",
            ignoreFocusOut: true,
        });

        if (language == null) {
            return;
        }
        else if (language === OTHER_OPTION) {
            language = await vscode.window.showInputBox({
                ignoreFocusOut: true,
                prompt: "Enter the programming language for your project",
                validateInput: (input) => {
                    const matchResult = input.match(/^[a-zA-Z0-9\s]+$/);
                    if (matchResult == null) {
                        return `The programming language cannot be empty, and can only contain alphanumeric characters and spaces.`;
                    }
                    return undefined;
                }
            });
        }

        return language;
    }

    async function requestValidate(connection: Connection, pathToBind: string): Promise<IInitializationResponse> {
        const validateResponse = await Requester.post(EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.PREBIND_VALIDATE), {
            json: true,
            body: {
                projectPath: pathToBind,
            }
        });
        Log.d("validate response", validateResponse);
        return validateResponse;
    }

    export async function promptForDir(btnLabel: string, defaultUri: vscode.Uri): Promise<vscode.Uri | undefined> {
        // if (!defaultUri && vscode.workspace.workspaceFolders != null) {
        //     defaultUri = vscode.workspace.workspaceFolders[0].uri;
        // }

        const selectedDirs = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: btnLabel,
            defaultUri
        });
        if (selectedDirs == null) {
            return;
        }
        // canSelectMany is false
        return selectedDirs[0];
    }

    async function requestCreate(
        connection: Connection, projectTypeSelected: IMCTemplateData, projectName: string, projectLocation: string)
        : Promise<IInitializationResponse> {

        const payload = {
            projectName: projectName,
            url: projectTypeSelected.url,
            parentPath: projectLocation,
        };

        Log.d("Creation request", payload);

        const creationRes = await Requester.post(EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.PROJECTS), {
            json: true,
            body: payload,
        });

        Log.d("Creation response", creationRes);
        return creationRes;
    }

    async function requestBind(connection: Connection, projectName: string, dirToBind: string, language: string, projectType: string)
        : Promise<void> {

        const bindReq = {
            name: projectName,
            language,
            projectType,
            path: dirToBind,
        };

        Log.d("Bind request", bindReq);

        const bindEndpoint = EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.BIND);
        const bindRes = await Requester.post(bindEndpoint, {
            json: true,
            body: bindReq,
        });
        Log.d("Bind response", bindRes);

        // return bindRes;
    }
}

export default UserProjectCreator;
