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
import { IRawTemplateRepo, IRepoEnablement } from "../../command/connection/ManageTemplateReposCmd";

type RequestFunc = (uri: string, options: request.RequestPromiseOptions) => request.RequestPromise<any> | Promise<any>;

const STRING_NS = StringNamespaces.REQUESTS;

namespace Requester {

    // These wrappers are exported because this class should be the only one that needs to import request.
    // By enforcing this and using these to forward all Codewind requests to the 'req' function,
    // we can inject options to abstract away required configuration like using json, handling ssl, and authentication.

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

    export async function get(url: string | vscode.Uri, options?: request.RequestPromiseOptions): Promise<any> {
        return req(request.get, url, options);
    }

    export async function post(url: string | vscode.Uri, options?: request.RequestPromiseOptions): Promise<any> {
        return req(request.post, url, options);
    }

    export async function put(url: string | vscode.Uri, options?: request.RequestPromiseOptions): Promise<any> {
        return req(request.put, url, options);
    }

    export async function patch(url: string | vscode.Uri, options?: request.RequestPromiseOptions): Promise<any> {
        return req(request.patch, url, options);
    }

    export async function delet(url: string | vscode.Uri, options?: request.RequestPromiseOptions): Promise<any> {
        return req(request.delete, url, options);
    }

    ///// Connection-specific requests

    export async function getTemplates(connection: Connection): Promise<IMCTemplateData[]> {
        const result = await doConnectionRequest(connection, MCEndpoints.TEMPLATES, Requester.get, { qs: { showEnabledOnly: true }});
        return result;
    }

    export async function getTemplateRepos(connection: Connection): Promise<IRawTemplateRepo[]> {
        return Requester.get(EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.TEMPLATE_REPOS));
    }

    export async function addTemplateRepo(connection: Connection, repoID: string, description: string): Promise<IRawTemplateRepo[]> {
        const body = {
            url: repoID,
            description,
        };
        return doConnectionRequest(connection, MCEndpoints.TEMPLATE_REPOS, Requester.post, { body });
    }

    export async function removeTemplateRepo(connection: Connection, repoID: string): Promise<IRawTemplateRepo[]> {
        const body = {
            url: repoID,
        };
        return doConnectionRequest(connection, MCEndpoints.TEMPLATE_REPOS, Requester.delet, { body });
    }

    interface IRepoEnablementReq {
        op: "enable";
        url: string;
        value: string;
    }

    export async function enableTemplateRepos(connection: Connection, enablements: IRepoEnablement): Promise<void> {
        const body: IRepoEnablementReq[] = enablements.repos.map((repo) => {
            return {
                op: "enable",
                url: repo.repoID,
                value: repo.enable ? "true" : "false",
            };
        });

        // status is always 207, we have to check the individual results for success status
        const result: [{
            status: number,
            requestedOperation: IRepoEnablementReq,
        }] = await doConnectionRequest(connection, MCEndpoints.BATCH_TEMPLATE_REPOS, Requester.patch, { body });

        const failures = result.filter((opResult) => opResult.status !== 200);
        if (failures.length > 0) {
            Log.e("Repo enablement failure", result);
            failures.forEach((failure) => {
                const failedOp = failure.requestedOperation;
                Log.e(`Failed to set ${failedOp.op}=${failedOp.value} for ${failedOp.url}: ${failure.status}`);
            });
            const errMsg = `Failed to enable/disable repositories: ${failures.map((failure) => failure.requestedOperation.url).join(", ")}`;
            vscode.window.showErrorMessage(errMsg);
        }

        // Log.d("Repo enablement result", result);
    }

    async function doConnectionRequest(
        connection: Connection, endpoint: MCEndpoints, method: RequestFunc, options?: request.RequestPromiseOptions): Promise<any> {

        if (!connection.isConnected) {
            throw new Error("Codewind is disconnected.");
        }

        const url = EndpointUtil.resolveMCEndpoint(connection, endpoint);
        Log.d(`Doing ${method.name} request to ${url}`);
        return req(method, url, options);
    }

    // Project-specific requests

    export async function requestProjectRestart(project: Project, startMode: StartModes): Promise<request.FullResponse> {
        const body = {
            startMode: startMode.toString()
        };

        const restartMsg = Translator.t(STRING_NS, "restartIntoMode", { startMode: ProjectCapabilities.getUserFriendlyStartMode(startMode) });
        return doProjectRequest(project, ProjectEndpoints.RESTART_ACTION, body, Requester.get, restartMsg);
    }

    export async function requestBuild(project: Project): Promise<void> {
        const body = {
            action: "build"         // non-nls
        };

        // return doProjectRequest(project, url, body, Requester.post, "Build");
        const buildMsg = Translator.t(STRING_NS, "build");
        await doProjectRequest(project, ProjectEndpoints.BUILD_ACTION, body, Requester.post, buildMsg);
        // await requestValidate(project, true);
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

        const response = await doProjectRequest(project, ProjectEndpoints.BUILD_ACTION, body, Requester.post, newAutoBuildUserStr);
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
        await doProjectRequest(project, endpoint, {}, Requester.put, newEnablementStr);
    }

    // Validation appears to have been removed
    // export async function requestValidate(project: Project, silent: boolean): Promise<void> {
    //     const [endpoint, body]: [Endpoint, IValidateRequestBody] = assembleValidateRequest(project, false);

    //     const userOperation = Translator.t(StringNamespaces.CMD_MISC, "validate");
    //     await doProjectRequest(project, endpoint, body, Requester.post, userOperation, silent);
    // }

    // export async function requestGenerate(project: Project): Promise<void> {
    //     const [endpoint, body]: [Endpoint, IValidateRequestBody] = assembleValidateRequest(project, true);

    //     const generateMsg = Translator.t(STRING_NS, "generateMissingFiles");

    //     await doProjectRequest(project, endpoint, body, Requester.post, generateMsg);
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
        await doProjectRequest(project, ProjectEndpoints.UNBIND, {}, Requester.post, msg, true);
    }

    export async function requestAvailableLogs(project: Project): Promise<ILogResponse> {
        if (!project.state.isEnabled) {
            // there are no logs available for disabled projects
            return {
                build: [], app: []
            };
        }
        const msg = Translator.t(STRING_NS, "checkingAvailableLogs");
        return doProjectRequest(project, ProjectEndpoints.LOGS, {}, Requester.get, msg, true);
    }

    export async function requestToggleLogs(project: Project, enable: boolean): Promise<void> {
        const method = enable ? Requester.post : Requester.delet;
        const onOrOff = enable ? "on" : "off";
        const msg = Translator.t(STRING_NS, "togglingLogs", { onOrOff });
        await doProjectRequest(project, ProjectEndpoints.LOGS, {}, method, msg, true);
    }

    export async function getCapabilities(project: Project): Promise<ProjectCapabilities> {
        const result = await doProjectRequest(project, ProjectEndpoints.CAPABILITIES, {}, Requester.get, "Getting capabilities", true);
        const metricsAvailable = await areMetricsAvailable(project);
        return new ProjectCapabilities(result.startModes, result.controlCommands, metricsAvailable);
    }

    async function areMetricsAvailable(project: Project): Promise<boolean> {
        const msg = Translator.t(STRING_NS, "checkingMetrics");
        const res = await doProjectRequest(project, ProjectEndpoints.METRICS_STATUS, {}, Requester.get, msg, true);
        return res.metricsAvailable;
    }

    /**
     * Perform a REST request of the type specified by `requestFunc` to the project endpoint for the given project.
     * Displays a message to the user that the request succeeded if userOperationName is not null.
     * Always displays a message to the user in the case of an error.
     * @param body - JSON request body for POST, PUT requests. Uses application/json content-type.
     * @param requestFunc - eg. Requester.get, Requester.post...
     * @param userOperationName - If `!silent`, a message will be displayed to the user that they are doing this operation on this project.
     * @param silent - If true, an info message will not be displayed when the request is initiated. Error messages are always displayed.
     */
    async function doProjectRequest(
            project: Project, endpoint: Endpoint, body: {},
            requestFunc: RequestFunc, userOperationName: string, silent: boolean = false): Promise<any> {

        let url: string;
        if (EndpointUtil.isProjectEndpoint(endpoint)) {
            url = EndpointUtil.resolveProjectEndpoint(project.connection, project.id, endpoint as ProjectEndpoints);
        }
        else {
            url = EndpointUtil.resolveMCEndpoint(project.connection, endpoint as MCEndpoints);
        }

        Log.i(`Doing ${userOperationName} request to ${url}`);

        try {
            const result = await requestFunc(url, { body });

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

    export async function waitForReady(cwBaseUrl: vscode.Uri): Promise<void> {
        const delay = 1000;
        let counter = 0;
        return new Promise<void>((resolve) => {
            const interval = setInterval(async () => {
                const logStatus = counter % 10 === 0;
                if (logStatus) {
                    Log.d(`Waiting for Codewind to be ready, ${counter * delay / 1000}s have elapsed`);
                }
                try {
                    // Ping Codewind's 'ready' endpoint
                    const res = await Requester.get(cwBaseUrl.with({ path: MCEndpoints.READY }));
                    if (res === true) {
                        clearInterval(interval);
                        resolve();
                    }
                }
                catch (err) {
                    if (logStatus) {
                        Log.d("Error contacting ready endpoint", err);
                    }
                }
                counter++;
            }, delay);
        });
    }
}

export default Requester;
