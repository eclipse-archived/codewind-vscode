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
import EndpointUtil, { MCEndpoints, ProjectEndpoints } from "../../constants/Endpoints";
import SocketEvents from "./SocketEvents";
import Requester from "../project/Requester";
import ProjectType from "../project/ProjectType";
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

        const projectTypeInfo = creationRes.result as IProjectTypeInfo;
        // const targetDir = vscode.Uri.file(creationRes.projectPath);
        const targetDir = creationRes.projectPath;

        // create succeeded, now we bind
        await bind(connection, projectName, targetDir, projectTypeInfo);
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
            const userProjectType = await promptForProjectType(connection);
            if (userProjectType == null) {
                return;
            }
            projectTypeInfo = userProjectType;
        }

        return bind(connection, projectName, pathToBind, projectTypeInfo);
    }

    async function bind(connection: Connection, projectName: string,
                        pathToBind: string, projectTypeInfo: IProjectTypeInfo):
                        Promise<INewProjectInfo | undefined> {
        if (connection.remote) {
            return bindRemote(connection, projectName, pathToBind, projectTypeInfo);
        } else {
            return bindLocal(connection, projectName, pathToBind, projectTypeInfo);
        }
    }

    async function bindLocal(connection: Connection, projectName: string,
                             pathToBind: string, projectTypeInfo: IProjectTypeInfo):
                             Promise<INewProjectInfo | undefined> {

        await requestLocalBind(connection, projectName, pathToBind, projectTypeInfo.language, projectTypeInfo.projectType);
        return { projectName, projectPath: pathToBind };
    }

    async function bindRemote(connection: Connection, projectName: string,
                              pathToBind: string, projectTypeInfo: IProjectTypeInfo):
                              Promise<INewProjectInfo | undefined> {
        const syncTime = Date.now();
        const projectInfo = await requestRemoteBindStart(connection, projectName, pathToBind, projectTypeInfo.language, projectTypeInfo.projectType);
        const projectID = projectInfo.projectID;
        await Requester.requestUploadsRecursively(connection, projectID, pathToBind, pathToBind, 0);

        await requestRemoteBindEnd(connection, projectID);
        const project = await connection.getProjectByID(projectID);
        // Set the last sync time on the project so we don't upload
        // all the files again on the first build.
        if (project !== undefined) {
            project._lastSync = syncTime;
        }
        Log.i(`Initial project upload complete for ${projectInfo.name} to ${connection.host} in ${Date.now() - syncTime}ms`);
        return { projectName, projectPath: pathToBind };
    }

    const OTHER_TYPE_OPTION = "Other (Basic Container)";

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

        let projectType: string = projectTypeRes.label;
        let language: string;
        // If the project type selected has a language that it always is, use that language, else have the user select it
        const typesWithCorrespondingLanguage = ProjectType.getRecognizedInternalTypes()
            .map((type) => type.toString())
            // Remove generic type because it can be any language
            .filter((type) => type !== OTHER_TYPE_OPTION);

        if (typesWithCorrespondingLanguage.includes(projectType)) {
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

    async function requestLocalBind(connection: Connection, projectName: string, dirToBindFsPath: string, language: string, projectType: string)
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

    async function requestRemoteBindStart(connection: Connection, projectName: string,
                                          dirToBindContainerPath: string,
                                          language: string, projectType: string): Promise<any> {

        const bindReq = {
            name: projectName,
            language,
            projectType,
            path: dirToBindContainerPath,
        };

        Log.d("Remote Bind request", bindReq);

        const remoteBindStartEndpoint = EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.REMOTE_BIND_START);
        const remoteBindRes = await Requester.post(remoteBindStartEndpoint, {
            json: true,
            body: bindReq,
        });

        Log.i("Remote Bind response", remoteBindRes);

        return remoteBindRes;
    }

    async function requestRemoteBindEnd(connection: Connection, projectID: string): Promise<void> {

        Log.i(`Remote Bind End request for ${projectID}`);

        const remoteBindStartEndpoint = EndpointUtil.resolveProjectEndpoint(connection, projectID, ProjectEndpoints.REMOTE_BIND_END);
        const remoteBindRes = await Requester.post(remoteBindStartEndpoint);

        Log.i("Remote Bind response", remoteBindRes);
    }

}

export default UserProjectCreator;
