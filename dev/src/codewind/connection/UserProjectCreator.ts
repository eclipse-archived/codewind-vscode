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

export interface ICWTemplateData {
    label: string;
    description: string;
    url: string;
    language: string;
    projectType: string;
    source?: string;
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

interface IProjectTypeQuickPickItem extends vscode.QuickPickItem {
    projectType: string;
    index: number;
}

/**
 * Functions to create or import new user projects into Codewind
 */
namespace UserProjectCreator {

    export async function createProject(connection: Connection, template: ICWTemplateData, projectName: string): Promise<INewProjectInfo> {

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
        let projectTypeInfo = validateRes.result as IProjectTypeExtendedInfo;

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

        // validate once more with detected type and subtype (if defined),
        // to run any extension defined command involving subtype
        if (projectTypeInfo.projectSubtype) {
            await requestValidate(pathToBind, projectTypeInfo.projectType + ":" + projectTypeInfo.projectSubtype);
        }

        await requestBind(connection, projectName, pathToBind, projectTypeInfo.language, projectTypeInfo.projectType);
        return { projectName, projectPath: pathToBind };
    }

    const OTHER_TYPE_OPTION = "Other (Codewind Basic Container)";

    /**
     * When detection fails, have the user select the project type that fits best.
     */
    async function promptForProjectType(connection: Connection, detected: IProjectTypeInfo): Promise<IProjectTypeExtendedInfo | undefined> {
        Log.d("Prompting user for project type");
        const projectTypes = await vscode.window.withProgress({
            cancellable: false,
            location: vscode.ProgressLocation.Notification,
            title: `Fetching project types...`,
        }, () => {
            return Requester.getProjectTypes(connection);
        });
        const projectTypeQpis: IProjectTypeQuickPickItem[] = [];
        let dockerType;
        projectTypes.forEach((type, index) => {
            if (type.projectType === ProjectType.InternalTypes.DOCKER) {
                dockerType = {
                    label: OTHER_TYPE_OPTION,
                    projectType: OTHER_TYPE_OPTION,
                    index: index
                };
            }
            else {
                let label;
                let description;

                // not codewind type if it has a label
                if (type.projectSubtypes.label) {
                    // if only 1 subtype take the label and description of that subtype
                    if (type.projectSubtypes.items.length === 1) {
                        label = type.projectSubtypes.items[0].label;
                        description = type.projectSubtypes.items[0].description;
                    }
                    else {
                        label = type.projectType;
                    }
                }
                else {
                    label = `Codewind ${type.projectType}`;
                }

                projectTypeQpis.push({
                    label,
                    projectType: type.projectType,
                    index: index,
                    description
                });
            }
        });
        projectTypeQpis.sort((a, b) => a.label.localeCompare(b.label));
        // Add "other" option last
        if (dockerType) {
            projectTypeQpis.push(dockerType);
        }

        const projectTypeRes = await vscode.window.showQuickPick(projectTypeQpis, {
            placeHolder: "Select the project type that best fits your project",
            ignoreFocusOut: true,
        });

        if (projectTypeRes == null) {
            return;
        }

        let language: string = detected.language;
        const projectType: string = projectTypeRes.projectType;

        // If project type selection did not change, there's no need to prompt for language/subtype, consider:
        // 1) changing selection of "liberty" to "liberty", it still maps to 1 language (same applies to all known project types)
        // 2) exception: selection of "other" !== "docker", this should allow for the selection of language
        // 3) selecting language is not applicable to entension project, unless selection changes from something else,
        //    in that case we prompt for the subtype
        const projectSubtypeChoices = (projectType !== detected.projectType) ? projectTypes[projectTypeRes.index].projectSubtypes : null;
        let projectSubtype: string | undefined;

        // have choices to potentially present to user
        if (projectSubtypeChoices) {

            // not really, only 1 choice
            if (projectSubtypeChoices.items.length === 1) {
                projectSubtype = projectSubtypeChoices.items[0].id;
            }
            // let's prompt user
            else {
                projectSubtype = await promptForLanguageOrSubtype(projectSubtypeChoices);
                if (projectSubtype == null) {
                    return;
                }
            }

            // if there's no custom label, we were choosing language
            if (!projectSubtypeChoices.label) {
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

    async function promptForLanguageOrSubtype(choices: IProjectSubtypesDescriptor): Promise<string | undefined> {
        Log.d("Prompting user for project language or subtype");
        const languageQpis: Array<vscode.QuickPickItem & { id: string }> = choices.items.map((choice) => {
            return {
                id: choice.id,
                label: choice.label,
                description: choice.description
            };
        });
        // remove duplicates
        languageQpis.sort((a, b) => a.label.localeCompare(b.label));
        if (!choices.label) {
            languageQpis.push({ id: "", label: OTHER_LANG_BTN });
        }

        const language = await vscode.window.showQuickPick(languageQpis, {
            placeHolder: choices.label ? `Select the ${choices.label}` : "Select the language that best fits your project",
            ignoreFocusOut: true,
        });

        if (language == null) {
            return;
        }
        else if (language.label === OTHER_LANG_BTN) {
            return await vscode.window.showInputBox({
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

        return language.id;
    }

    async function requestValidate(pathToBind: string, desiredType?: string): Promise<IInitializationResponse> {
        const validateResponse = await vscode.window.withProgress({
            title: `Processing ${pathToBind}...`,
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
        }, () => {
            return InstallerWrapper.validateProjectDirectory(pathToBind, desiredType);
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
