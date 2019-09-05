/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
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
import * as path from "path";
import * as fs from "fs-extra";
import * as zlib from "zlib";

import Project from "./Project";
import ProjectCapabilities, { StartModes } from "./ProjectCapabilities";
import Log from "../../Logger";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Translator from "../../constants/strings/translator";
import MCUtil from "../../MCUtil";
import EndpointUtil, { ProjectEndpoints, Endpoint, MCEndpoints } from "../../constants/Endpoints";
import { ILogResponse } from "../connection/SocketEvents";
import { IMCTemplateData } from "../connection/UserProjectCreator";
import Connection from "../connection/Connection";

type RequestFunc = (uri: string, options: request.RequestPromiseOptions) => request.RequestPromise<any>;

const STRING_NS = StringNamespaces.REQUESTS;

namespace Requester {

    export async function get(url: string | vscode.Uri, options?: request.RequestPromiseOptions): Promise<any> {
        return req(request.get, url, options);
    }

    export async function post(url: string | vscode.Uri, options?: request.RequestPromiseOptions): Promise<any> {
        return req(request.post, url, options);
    }

    export async function put(url: string | vscode.Uri, options?: request.RequestPromiseOptions): Promise<any> {
        return req(request.put, url, options);
    }
    async function req(method: RequestFunc, url: string | vscode.Uri, options?: request.RequestPromiseOptions): Promise<any> {
        if (url instanceof vscode.Uri) {
            url = url.toString();
        }
        if (!options) {
            options = {};
        }
        // options.resolveWithFullResponse = true;
        options.json = true;
        // TODO :)
        options.rejectUnauthorized = false;
        return method(url, options);
    }

    export async function getTemplates(connection: Connection): Promise<IMCTemplateData[]> {
        const templatesUrl = EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.TEMPLATES);
        return Requester.get(templatesUrl);
    }

    export async function requestProjectRestart(project: Project, startMode: StartModes): Promise<request.FullResponse> {
        const body = {
            startMode: startMode.toString()
        };

        const restartMsg = Translator.t(STRING_NS, "restartIntoMode", { startMode: ProjectCapabilities.getUserFriendlyStartMode(startMode) });
        return doProjectRequest(project, ProjectEndpoints.RESTART_ACTION, body, request.post, restartMsg);
    }

    export async function requestBuild(project: Project): Promise<void> {
        const body = {
            action: "build"         // non-nls
        };

        // return doProjectRequest(project, url, body, request.post, "Build");
        const buildMsg = Translator.t(STRING_NS, "build");
        if (project.connection.remote) {
            const localPath = MCUtil.fsPathToContainerPath(project.localPath);
            Log.i(`Copying updated files from ${localPath} to ${project.connection.host}`);
            await requestUploadsRecursively(project.connection, project.id, localPath, localPath);
        } else {
            Log.i(`Local build from local file system at ${project.localPath}`);
        }
        await doProjectRequest(project, ProjectEndpoints.BUILD_ACTION, body, request.post, buildMsg);
    }

    export async function requestUploadsRecursively(connection: Connection, projectId: any, inputPath: string, parentPath: string): Promise<void> {
        Log.i(`requestUploadsRecursively for ${projectId} at ${inputPath}`);
        const files = fs.readdirSync(inputPath);

        for (const f of files) {
            const currentPath = `${inputPath}/${f}`;
            // Log.i("Uploading " + currentPath);
            const stats = fs.statSync(currentPath);
            if (stats.isFile()) {
                try {
                    await remoteUpload(connection, projectId, currentPath, parentPath);
                } catch (err) {
                    Log.d(err);
                }
            } else if (stats.isDirectory()) {
                await requestUploadsRecursively(connection, projectId, currentPath, parentPath);
            }
        }
    }

    async function remoteUpload(connection: Connection, projectId: string, filePath: string, parentPath: string): Promise<any> {

        const fileContent = JSON.stringify(fs.readFileSync(filePath, "utf-8"));
        const strBuffer = zlib.deflateSync(fileContent);
        const base64Compressed = strBuffer.toString("base64");
        const relativePath = path.relative(parentPath, filePath);

        const remoteBindUpload = EndpointUtil.resolveProjectEndpoint(connection, projectId, ProjectEndpoints.UPLOAD);
        const body = {
            directory: false,
            path: relativePath,
            timestamp: Date.now(),
            msg: base64Compressed,
        };

        const remoteBindRes = await Requester.put(remoteBindUpload, {
            json: true,
            body: body,
        });

        Log.i("Remote upload response", remoteBindRes);

        return remoteBindRes;
    }

    export async function requestToggleAutoBuild(project: Project): Promise<void> {
        const newAutoBuild: boolean = !project.autoBuildEnabled;

        // user-friendly action
        const autoBuildMsgKey = newAutoBuild ? "autoBuildEnable" : "autoBuildDisable";                  // non-nls
        const newAutoBuildUserStr: string = Translator.t(STRING_NS, autoBuildMsgKey);
        const newAutoBuildAction:  string = newAutoBuild ? "enableautobuild" : "disableautobuild";     // non-nls

        const body = {
            action: newAutoBuildAction
        };

        const response = await doProjectRequest(project, ProjectEndpoints.BUILD_ACTION, body, request.post, newAutoBuildUserStr);
        if (MCUtil.isGoodStatusCode(response.statusCode)) {
            Log.d("Received good status from autoBuild request, new auto build is: " + newAutoBuild);
            project.setAutoBuild(newAutoBuild);
        }
    }

    export async function requestToggleEnablement(project: Project): Promise<void> {
        const newEnablement: boolean = !project.state.isEnabled;

        const newEnablementMsgKey = newEnablement ? "projectEnable" : "projectDisable";        // non-nls
        const newEnablementStr: string = Translator.t(STRING_NS, newEnablementMsgKey);

        const endpoint = EndpointUtil.getEnablementAction(newEnablement);
        await doProjectRequest(project, endpoint, {}, request.put, newEnablementStr);
    }

    // Validation appears to have been removed
    // export async function requestValidate(project: Project, silent: boolean): Promise<void> {
    //     const [endpoint, body]: [Endpoint, IValidateRequestBody] = assembleValidateRequest(project, false);

    //     const userOperation = Translator.t(StringNamespaces.CMD_MISC, "validate");
    //     await doProjectRequest(project, endpoint, body, request.post, userOperation, silent);
    // }

    // export async function requestGenerate(project: Project): Promise<void> {
    //     const [endpoint, body]: [Endpoint, IValidateRequestBody] = assembleValidateRequest(project, true);

    //     const generateMsg = Translator.t(STRING_NS, "generateMissingFiles");

    //     await doProjectRequest(project, endpoint, body, request.post, generateMsg);
    //     // request a validate after the generate so that the validation errors go away faster
    //     await requestValidate(project, true);
    // }

    // interface IValidateRequestBody {
    //     projectType: string;
    //     projectID?: string;
    //     autoGenerate?: boolean;
    // }

    // /**
    //  * Get the URL and request body for either a Validate or Generate request, they are very similar.
    //  */
    // function assembleValidateRequest(project: Project, generate: boolean): [ProjectEndpoints, IValidateRequestBody] {
    //     const body: IValidateRequestBody = {
    //         projectType: project.type.internalType,
    //     };

    //     if (generate) {
    //         body.autoGenerate = true;
    //     }

    //     const endpoint = generate ? ProjectEndpoints.GENERATE : ProjectEndpoints.VALIDATE;
    //     return [endpoint, body];
    // }

    export async function requestUnbind(project: Project): Promise<void> {
        const msg = Translator.t(STRING_NS, "unbind");
        await doProjectRequest(project, ProjectEndpoints.UNBIND, {}, request.post, msg, true);
    }

    export async function requestAvailableLogs(project: Project): Promise<ILogResponse> {
        if (!project.state.isEnabled) {
            // there are no logs available for disabled projects
            return {
                build: [], app: []
            };
        }
        const msg = Translator.t(STRING_NS, "checkingAvailableLogs");
        return (await doProjectRequest(project, ProjectEndpoints.LOGS, {}, request.get, msg, true)).body;
    }

    export async function requestToggleLogs(project: Project, enable: boolean): Promise<void> {
        const method = enable ? request.post : request.delete;
        const onOrOff = enable ? "on" : "off";
        const msg = Translator.t(STRING_NS, "togglingLogs", { onOrOff });
        await doProjectRequest(project, ProjectEndpoints.LOGS, {}, method, msg, true);
    }

    export async function getCapabilities(project: Project): Promise<ProjectCapabilities> {
        const capabilitiesRes = (await doProjectRequest(project, ProjectEndpoints.CAPABILITIES, {}, request.get, "Getting capabilities", true)).body;
        const metricsAvailable = await areMetricsAvailable(project);
        return new ProjectCapabilities(capabilitiesRes.startModes, capabilitiesRes.controlCommands, metricsAvailable);
    }

    async function areMetricsAvailable(project: Project): Promise<boolean> {
        const msg = Translator.t(STRING_NS, "checkingMetrics");
        const res = await doProjectRequest(project, ProjectEndpoints.METRICS_STATUS, {}, request.get, msg, true);
        const available = res.body.metricsAvailable;
        return available;
    }

    /**
     * Perform a REST request of the type specified by `requestFunc` to the project endpoint for the given project.
     * Displays a message to the user that the request succeeded if userOperationName is not null.
     * Always displays a message to the user in the case of an error.
     * @param body - JSON request body for POST, PUT requests. Uses application/json content-type.
     * @param requestFunc - eg. request.get, request.post...
     * @param userOperationName - If `!silent`, a message will be displayed to the user that they are doing this operation on this project.
     * @param silent - If true, an info message will not be displayed when the request is initiated. Error messages are always displayed.
     */
    async function doProjectRequest(
            project: Project, endpoint: Endpoint, body: {},
            requestFunc: RequestFunc, userOperationName: string, silent: boolean = false): Promise<request.FullResponse> {

        let url: string;
        if (EndpointUtil.isProjectEndpoint(endpoint)) {
            url = EndpointUtil.resolveProjectEndpoint(project.connection, project.id, endpoint as ProjectEndpoints);
        }
        else {
            url = EndpointUtil.resolveMCEndpoint(project.connection, endpoint as MCEndpoints);
        }

        Log.i(`Doing ${userOperationName} request to ${url}`);

        const options: request.RequestPromiseOptions = {
            json: true,
            body,
            resolveWithFullResponse: true,
            // TODO :)
            rejectUnauthorized: false,
        };

        try {
            const result: request.FullResponse = await requestFunc(url, options);
            Log.d(`Response code ${result.statusCode} from ` +
                `${userOperationName.toLowerCase()} request for ${project.name}`);

            if (!silent) {
                vscode.window.showInformationMessage(
                    Translator.t(STRING_NS, "requestSuccess",
                    { operationName: userOperationName, projectName: project.name })
                );
            }
            return result;
        }
        catch (err) {
            Log.w(`Error doing ${userOperationName} project request for ${project.name}:`, err);

            vscode.window.showErrorMessage(
                Translator.t(STRING_NS, "requestFail",
                { operationName: userOperationName, projectName: project.name, err: MCUtil.errToString(err) })
            );
            throw err;
        }
    }
}

export default Requester;
