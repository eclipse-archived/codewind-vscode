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
import SocketEvents, { ILogResponse } from "../connection/SocketEvents";
import { ICWTemplateData } from "../connection/UserProjectCreator";
import Connection from "../connection/Connection";
import { IRepoEnablement } from "../../command/connection/ManageTemplateReposCmd";
import { StatusCodeError } from "request-promise-native/errors";
import { IProjectTypeDescriptor } from "./ProjectType";
import { RawCWEnvData } from "../connection/CWEnvironment";
import RemoteConnection from "../connection/RemoteConnection";

// tslint:disable-next-line: variable-name
const HttpVerbs = {
    GET: request.get,
    POST: request.post,
    PUT: request.put,
    PATCH: request.patch,
    DELETE: request.delete,
} as const;

const STRING_NS = StringNamespaces.REQUESTS;

namespace Requester {

    ///// Connection-specific requests

    export async function getProjects(connection: Connection): Promise<any[]> {
        return doConnectionRequest(connection, MCEndpoints.PROJECTS, "GET");
    }

    export async function getRawEnvironment(connection: Connection): Promise<RawCWEnvData> {
        return doConnectionRequest(connection, MCEndpoints.ENVIRONMENT, "GET");
    }

    export async function getTemplates(connection: Connection): Promise<ICWTemplateData[]> {
        const result = await doConnectionRequest(connection, MCEndpoints.TEMPLATES, "GET", { qs: { showEnabledOnly: true }});
        if (result == null) {
            return [];
        }
        return result;
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
        }] = await doConnectionRequest(connection, MCEndpoints.BATCH_TEMPLATE_REPOS, "PATCH", { body });

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

    export async function isRegistrySet(connection: Connection): Promise<boolean> {
        try {
            const registryStatus: { deploymentRegistry: boolean } = await doConnectionRequest(connection, MCEndpoints.REGISTRY, "GET");
            return registryStatus.deploymentRegistry;
        }
        catch (err) {
            Log.e("Error checking registry status", err);
            return false;
        }
    }

    export async function configureRegistry(connection: Connection, operation: "set" | "test", deploymentRegistry: string)
        : Promise<SocketEvents.IRegistryStatus> {

        const body = {
            deploymentRegistry,
            operation,
        };

        return doConnectionRequest(connection, MCEndpoints.REGISTRY, "POST", { body });
    }

    export async function getProjectTypes(connection: Connection): Promise<IProjectTypeDescriptor[]> {
        const result = await doConnectionRequest(connection, MCEndpoints.PROJECT_TYPES, "GET");
        if (result == null) {
            return [];
        }
        return result;
    }

    // Project-specific requests

    export async function requestProjectRestart(project: Project, startMode: StartModes): Promise<request.FullResponse> {
        const body = {
            startMode: startMode.toString()
        };

        const restartMsg = Translator.t(STRING_NS, "restartIntoMode", { startMode: ProjectCapabilities.getUserFriendlyStartMode(startMode) });
        return doProjectRequest(project, ProjectEndpoints.RESTART_ACTION, body, "POST", restartMsg, false, true);
    }

    export async function requestBuild(project: Project): Promise<void> {
        const body = {
            action: "build"         // non-nls
        };

        // return doProjectRequest(project, url, body, post, "Build");
        const buildMsg = Translator.t(STRING_NS, "build");
        await doProjectRequest(project, ProjectEndpoints.BUILD_ACTION, body, "POST", buildMsg);
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

        // const response = await doProjectRequest(project, ProjectEndpoints.BUILD_ACTION, body, post, newAutoBuildUserStr);
        await doProjectRequest(project, ProjectEndpoints.BUILD_ACTION, body, "POST", newAutoBuildUserStr);
        project.setAutoBuild(newAutoBuild);
    }

    export async function requestToggleEnablement(project: Project): Promise<void> {
        const newEnablement: boolean = !project.state.isEnabled;

        const newEnablementMsgKey = newEnablement ? "projectEnable" : "projectDisable";        // non-nls
        const newEnablementStr: string = Translator.t(STRING_NS, newEnablementMsgKey);

        const endpoint = EndpointUtil.getEnablementAction(newEnablement);
        await doProjectRequest(project, endpoint, {}, "PUT", newEnablementStr);
    }

    // Validation appears to have been removed
    // export async function requestValidate(project: Project, silent: boolean): Promise<void> {
    //     const [endpoint, body]: [Endpoint, IValidateRequestBody] = assembleValidateRequest(project, false);

    //     const userOperation = Translator.t(StringNamespaces.CMD_MISC, "validate");
    //     await doProjectRequest(project, endpoint, body, post, userOperation, silent);
    // }

    // export async function requestGenerate(project: Project): Promise<void> {
    //     const [endpoint, body]: [Endpoint, IValidateRequestBody] = assembleValidateRequest(project, true);

    //     const generateMsg = Translator.t(STRING_NS, "generateMissingFiles");

    //     await doProjectRequest(project, endpoint, body, post, generateMsg);
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
        await doProjectRequest(project, ProjectEndpoints.UNBIND, {}, "POST", msg, true);
    }

    export async function requestAvailableLogs(project: Project): Promise<ILogResponse> {
        if (!project.state.isEnabled) {
            // there are no logs available for disabled projects
            return {
                build: [], app: []
            };
        }
        const msg = Translator.t(STRING_NS, "checkingAvailableLogs");
        return doProjectRequest(project, ProjectEndpoints.LOGS, {}, "GET", msg, true);
    }

    export async function requestToggleLogs(project: Project, enable: boolean): Promise<void> {
        const verb = enable ? "POST" : "DELETE";
        const onOrOff = enable ? "on" : "off";
        const msg = Translator.t(STRING_NS, "togglingLogs", { onOrOff });
        await doProjectRequest(project, ProjectEndpoints.LOGS, {}, verb, msg, true);
    }

    export async function getCapabilities(project: Project): Promise<ProjectCapabilities> {
        const result = await doProjectRequest(project, ProjectEndpoints.CAPABILITIES, {}, "GET", "Getting capabilities", true);
        const metricsAvailable = await areMetricsAvailable(project);
        return new ProjectCapabilities(result.startModes, result.controlCommands, metricsAvailable);
    }

    async function areMetricsAvailable(project: Project): Promise<boolean> {
        const msg = Translator.t(STRING_NS, "checkingMetrics");
        const res = await doProjectRequest(project, ProjectEndpoints.METRICS_STATUS, {}, "GET", msg, true);
        return res.metricsAvailable;
    }

    /**
     * Try to connect to the given URL. Returns true if _any_ response is returned.
     */
    export async function ping(url: string | vscode.Uri): Promise<boolean> {
        Log.d(`Ping ${url}`);
        if (url instanceof vscode.Uri) {
            url = url.toString();
        }
        try {
            await req("GET", url, { timeout: 10000 });
            // It succeeded
            return true;
        }
        catch (err) {
            if (err.message === ERR_LOGIN_PAGE || err instanceof StatusCodeError) {
                // it was reachable, but returned a bad status
                return true;
            }
            // likely connection refused, socket timeout, etc.
            // so it was not reachable
            Log.e(`Error pinging ${url}: ${err.message}`);
            return false;
        }
    }

    /**
     * Repeatedly ping the given connection's 'ready' endpoint. The connection should not be used until that endpoint returns true.
     */
    export async function waitForReady(connection: Connection, timeoutS: number): Promise<boolean> {
        const READY_DELAY_S = 2;

        const isCWReadyInitially = await isCodewindReady(connection, false, READY_DELAY_S);
        if (isCWReadyInitially) {
            Log.i(`${connection} was ready on first ping`);
            return true;
        }

        const maxTries = timeoutS / READY_DELAY_S;
        let tries = 0;
        return new Promise<boolean>((resolve) => {
            const interval = setInterval(async () => {
                const logStatus = tries % 10 === 0;
                if (logStatus) {
                    Log.d(`Waiting ${connection} to be ready, ${tries * READY_DELAY_S}s have elapsed`);
                }
                const ready = await isCodewindReady(connection, logStatus, READY_DELAY_S);
                tries++;
                if (ready) {
                    clearInterval(interval);
                    resolve(true);
                }
                else if (tries > maxTries) {
                    clearInterval(interval);
                    resolve(false);
                }
            }, READY_DELAY_S * 1000);
        }).then((result) => {
            if (result) {
                Log.i(`Codewind was ready after ${tries} tries`);
            }
            else {
                Log.i(`Codewind was NOT ready after ${tries} tries`);
            }
            return result;
        });
    }

    async function isCodewindReady(connection: Connection, logStatus: boolean, timeoutS: number): Promise<boolean> {
        try {
            const res = await doConnectionRequest(connection, MCEndpoints.READY, "GET", { timeout: timeoutS * 1000 });

            if (res === true) {
                return true;
            }
        }
        catch (err) {
            if (logStatus) {
                Log.d("Error contacting ready endpoint", err);
            }
        }
        return false;
    }

    export const ERR_LOGIN_PAGE = "Authentication required";

    // By enforcing all requests to go through this function,
    // we can inject options to abstract away required configuration like using json, handling ssl, and authentication.

    async function req(verb: keyof typeof HttpVerbs, url: string, options: request.RequestPromiseOptions = {}, accessToken?: string): Promise<any> {
        const optionsCopy = Object.assign({}, options);
        optionsCopy.json = true;
        // we resolve with full response so we can look out for redirects below
        optionsCopy.resolveWithFullResponse = true;
        // TODO ...
        optionsCopy.rejectUnauthorized = false;
        if (!optionsCopy.timeout) {
            optionsCopy.timeout = 60000;
        }

        const requestFunc = HttpVerbs[verb];

        Log.d(`Doing ${verb} request to ${url}`); // with options:`, options);

        if (accessToken) {
            if (!url.startsWith("https")) {
                throw new Error(`Refusing to send access token to non-secure URL ${url}`);
            }
            optionsCopy.auth = {
                bearer: accessToken,
            };
        }

        const response = await requestFunc(url, optionsCopy) as request.FullResponse;
        if (response.request.path.startsWith("/auth/")) {
            throw new Error(ERR_LOGIN_PAGE);
        }

        const body = response.body;
        // Log.d(`Response body is:`, body);
        if (options.resolveWithFullResponse) {
            // Return the full response if it was originally requested in the options
            return response;
        }
        return body;
    }

    async function doConnectionRequest(
        connection: Connection, endpoint: MCEndpoints, verb: keyof typeof HttpVerbs, options?: request.RequestPromiseOptions): Promise<any> {

        // Re-enable once remote socket works
        // if (!connection.isConnected) {
        //     throw new Error("Can't do API call: Codewind is disconnected.");
        // }

        const url = EndpointUtil.resolveMCEndpoint(connection, endpoint);

        let accessToken;
        if (connection instanceof RemoteConnection) {
            accessToken = await connection.getAccessToken();
        }

        return req(verb, url, options, accessToken);
    }

    /**
     * Perform a REST request of the type specified by `requestFunc` to the project endpoint for the given project.
     * Displays a message to the user that the request succeeded if userOperationName is not null.
     * Always displays a message to the user in the case of an error.
     * @param body - JSON request body for POST, PUT, PATCH requests. Uses application/json content-type.
     * @param silent - If true, the `userOptionName` will not be displayed when the request is initiated. Error messages are always displayed.
     */
    async function doProjectRequest(
        project: Project, endpoint: Endpoint, body: {},
        verb: keyof typeof HttpVerbs, userOperationName: string, silent: boolean = false, returnFullRes: boolean = false): Promise<any> {

        let url: string;
        if (EndpointUtil.isProjectEndpoint(endpoint)) {
            url = EndpointUtil.resolveProjectEndpoint(project.connection, project.id, endpoint as ProjectEndpoints);
        }
        else {
            url = EndpointUtil.resolveMCEndpoint(project.connection, endpoint as MCEndpoints);
        }

        Log.i(`Doing ${userOperationName} request to ${url}`);

        const options: request.RequestPromiseOptions = {
            body,
            resolveWithFullResponse: returnFullRes,
        };

        try {
            let accessToken;
            if (project.connection instanceof RemoteConnection) {
                accessToken = await project.connection.getAccessToken();
            }
            const result = await req(verb, url, options, accessToken);

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
        }
    }
}

export default Requester;
