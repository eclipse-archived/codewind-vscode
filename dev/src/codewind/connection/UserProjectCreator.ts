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
import { ProjectType, IProjectSubtypesDescriptor } from "../project/ProjectType";
import MCUtil from "../../MCUtil";
import InstallerWrapper from "./InstallerWrapper";

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

interface IProjectTypeExtendedInfo extends IProjectTypeInfo {
    projectSubtype: string | undefined;
}

export interface IInitializationResponse {
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

        // right now projects must be created under the codewind workspace so users can't choose the parentDir
        // abs path on user system under which the project will be created
        const userParentDir = connection.workspacePath;

        const projectPath = path.join(userParentDir.fsPath, projectName);

        const creationRes = await vscode.window.withProgress({
            cancellable: false,
            location: vscode.ProgressLocation.Notification,
            title: `Creating ${projectName}...`,
        }, () => {
            return InstallerWrapper.createProject(projectPath, template.url);
        });

        if (creationRes.status !== SocketEvents.STATUS_SUCCESS) {
            // failed
            const failedResult = (creationRes.result as { error: string });
            throw new Error(failedResult.error);
        }

        // const result = creationRes.result as IProjectInitializeInfo;
        // const targetDir = vscode.Uri.file(creationRes.projectPath);
        const targetDir = creationRes.projectPath;

        // create succeeded, now we bind
        await requestBind(connection, projectName, targetDir, template.language, template.projectType);
        return { projectName, projectPath: creationRes.projectPath };
    }

    export async function validateAndBind(connection: Connection, pathToBindUri: vscode.Uri): Promise<INewProjectInfo | undefined> {
        const pathToBind = pathToBindUri.fsPath;
        Log.i("Binding to", pathToBind);

        const projectName = path.basename(pathToBind);
        const validateRes = await requestValidate(pathToBind);
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
            const userProjectType = await promptForProjectType(connection, projectTypeInfo);
            if (userProjectType == null) {
                return;
            }
            projectTypeInfo = userProjectType;
        }

        await requestBind(connection, projectName, pathToBind, projectTypeInfo.language, projectTypeInfo.projectType);
        return { projectName, projectPath: pathToBind };
    }

    const OTHER_TYPE_OPTION = "Other (Basic Container)";

    /**
     * When detection fails, have the user select the project type that fits best.
     */
    async function promptForProjectType(connection: Connection, detected: IProjectTypeInfo): Promise<IProjectTypeExtendedInfo | undefined> {
        Log.d("Prompting user for project type");
        const projectTypes = await Requester.getProjectTypes(connection);
        const projectSubtypes: { [t: string]: IProjectSubtypesDescriptor } = {};
        const projectTypeQpis: Array<vscode.QuickPickItem & { language: string }> = [];
        for (const type of projectTypes) {

            if (type.projectType === ProjectType.InternalTypes.DOCKER) {
                projectSubtypes[OTHER_TYPE_OPTION] = type.projectSubtypes;
                // this option is handled specially below; Docker type shows up as "Other"
                continue;
            }
            else {
                projectSubtypes[type.projectType] = type.projectSubtypes;
            }

            projectTypeQpis.push({
                label: type.projectType,
                language: "any"
            });
        }
        projectTypeQpis.sort();
        // Add "other" option last
        projectTypeQpis.push({
            label: OTHER_TYPE_OPTION,
            language: "any"             // this will be replaced below
        });

        const projectTypeRes = await vscode.window.showQuickPick(projectTypeQpis, {
            placeHolder: "Select the project type that best fits your project",
            ignoreFocusOut: true,
        });

        if (projectTypeRes == null) {
            return;
        }

        const projectType: string = projectTypeRes.label;
        let language: string = detected.language;

        // If project type selection did not change, there's no need to prompt for language/subtype, consider:
        // 1) changing selection of "liberty" to "liberty", it still maps to 1 language (same applies to all known project types)
        // 2) exception: selection of "other" !== "docker", this should allow for the selection of language
        // 3) selecting language is not applicable to entension project, unless selection changes from something else,
        //    in that case we prompt for the subtype
        const projectSubtypeChoices = (projectType !== detected.projectType) ? projectSubtypes[projectType] : null;
        let projectSubtype: string | undefined;

        // have choices to potentially present to user
        if (projectSubtypeChoices) {

            // not really, only 1 choice
            if (projectSubtypeChoices.items.length === 1) {
                projectSubtype = projectSubtypeChoices.items[0].id;
            }
            // let's prompt user
            else {
                const templates = await Requester.getTemplates(connection);
                projectSubtype = await promptForLanguage(templates);
                if (projectSubtype == null) {
                    return;
                }
            }

            // check if selected value is actually a language
            if ((Object as any).values(ProjectType.Languages).includes(projectSubtype)) {
                language = projectSubtype;
                projectSubtype = undefined;
            }
        }

        return {
            language,
            // map the 'other' back to the docker type
            projectType: projectType === OTHER_TYPE_OPTION ? ProjectType.InternalTypes.DOCKER : projectType,
            projectSubtype
        };
    }

    const OTHER_LANG_BTN = "Other";

    async function promptForLanguage(templates: IMCTemplateData[]): Promise<string | undefined> {
        Log.d("Prompting user for project language");
        let languageQpis = templates.map((template) => template.language);
        // remove duplicates
        languageQpis = [ ... new Set(languageQpis) ];
        languageQpis.sort();
        languageQpis.push(OTHER_LANG_BTN);

        let language = await vscode.window.showQuickPick(languageQpis, {
            placeHolder: "Select the language that best fits your project",
            ignoreFocusOut: true,
        });

        if (language == null) {
            return;
        }
        else if (language === OTHER_LANG_BTN) {
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

    async function requestValidate(pathToBind: string): Promise<IInitializationResponse> {
        const validateResponse = await vscode.window.withProgress({
            title: `Processing ${pathToBind}...`,
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
        }, () => {
            return InstallerWrapper.validateProjectDirectory(pathToBind);
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

    async function requestBind(connection: Connection, projectName: string, dirToBindFsPath: string, language: string, projectType: string)
        : Promise<void> {

        const containerPath = MCUtil.fsPathToContainerPath(dirToBindFsPath);

        const bindReq = {
            name: projectName,
            language,
            projectType,
            path: containerPath,
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
