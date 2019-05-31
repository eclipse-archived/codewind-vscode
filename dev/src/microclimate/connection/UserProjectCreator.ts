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
import * as request from "request-promise-native";

import Log from "../../Logger";
import Connection from "./Connection";
import EndpointUtil, { MCEndpoints } from "../../constants/Endpoints";
import SocketEvents from "./SocketEvents";

export interface IMCTemplateData {
    label: string;
    description: string;
    url: string;
    language: string;
}

interface IProjectInitializeInfo {
    language: string;
    projectType: string;
}

interface IInitializationResponse {
    status: string;
    result: IProjectInitializeInfo | { error: string; };
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

        // right now projects must be created under the microclimate-workspace so users can't cohoose the parentDir
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

        const result = creationRes.result as IProjectInitializeInfo;

        // create succeeded, now we bind
        // const bindRes = await requestBind(connection, projectName, creationRes.projectPath, result.language, result.buildType);
        await requestBind(connection, projectName, creationRes.projectPath, result.language, result.projectType);
        return { projectName, projectPath: creationRes.projectPath };
    }

    export async function validateAndBind(connection: Connection, pathToBindUri: vscode.Uri): Promise<INewProjectInfo> {
        const pathToBind = pathToBindUri.fsPath;
        Log.i("Binding to", pathToBind);

        const projectName = path.basename(pathToBind);
        const validateRes = await preBindValidate(connection, pathToBind);
        if (validateRes.status !== SocketEvents.STATUS_SUCCESS) {
            // failed
            const failedResult = (validateRes.result as { error: string });
            throw new Error(failedResult.error);
        }
        const result = validateRes.result as IProjectInitializeInfo;
        await requestBind(connection, projectName, pathToBind, result.language, result.projectType);
        return { projectName, projectPath: pathToBind };
    }

    async function preBindValidate(connection: Connection, pathToBind: string): Promise<IInitializationResponse> {
        const validateResponse = await request.post(EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.PREBIND_VALIDATE), {
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

        const creationRes = await request.post(EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.PROJECTS), {
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
        const bindRes = await request.post(bindEndpoint, {
            json: true,
            body: bindReq,
        });
        Log.d("Bind response", bindRes);

        // return bindRes;
    }
}

export default UserProjectCreator;
