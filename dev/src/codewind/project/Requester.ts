/*******************************************************************************
 * Copyright (c) 2018, 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as vscode from "vscode";
import * as request from "request-promise-native";
import { StatusCodeError } from "request-promise-native/errors";

import Project from "./Project";
import ProjectCapabilities, { StartModes } from "./ProjectCapabilities";
import Log from "../../Logger";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Translator from "../../constants/strings/translator";
import MCUtil from "../../MCUtil";
import EndpointUtil, { ProjectEndpoints, MCEndpoints } from "../../constants/Endpoints";
import SocketEvents, { ILogResponse } from "../connection/SocketEvents";
import Connection from "../connection/Connection";
import { IProjectTypeDescriptor } from "./ProjectType";
import { RawCWEnvData } from "../connection/CWEnvironment";
import RemoteConnection from "../connection/RemoteConnection";
import { SourceEnablement } from "../../command/webview/SourcesPageWrapper";
import { CWTemplateData } from "../../command/connection/CreateUserProjectCmd";
import { ContainerRegistry } from "../connection/RegistryUtils";
import { AccessToken } from "../connection/CLICommandRunner";
import { PFEProjectData } from "../Types";

// tslint:disable-next-line: variable-name
const HttpVerbs = {
    GET: request.get,
    POST: request.post,
    PUT: request.put,
    PATCH: request.patch,
    DELETE: request.delete,
} as const;

const STRING_NS = StringNamespaces.REQUESTS;

/**
 * These functions wrap all our API calls to the Codewind backend.
 *
 * Each request is perform for either a Connection or a Project - see doConnectionRequest and doProjectRequest.
 *
 * API doc - https://eclipse.github.io/codewind/
 */
namespace Requester {

    ///// Connection-specific requests

    export async function getProjects(connection: Connection): Promise<PFEProjectData[]> {
        return doConnectionRequest(connection, MCEndpoints.PROJECTS, "GET");
    }

    export async function getRawEnvironment(connection: Connection): Promise<RawCWEnvData> {
        return doConnectionRequest(connection, MCEndpoints.ENVIRONMENT, "GET");
    }

    export async function getTemplates(connection: Connection): Promise<CWTemplateData[]> {
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

    /**
     * Change the 'enabled' state of the given set of template sources.
     * Should only be called by TemplateSourceList to ensure it is refreshed appropriately.
     */
    export async function toggleSourceEnablement(connection: Connection, enablements: SourceEnablement): Promise<void> {
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

    export async function getProjectTypes(connection: Connection): Promise<IProjectTypeDescriptor[]> {
        const result = await doConnectionRequest(connection, MCEndpoints.PROJECT_TYPES, "GET");
        if (result == null) {
            return [];
        }
        return result;
    }

    interface RegistrySecretResponse {
        readonly address: string;
        readonly username: string;
    }

    function asContainerRegistry(response: RegistrySecretResponse): ContainerRegistry {
        if (!response.address || !response.username) {
            Log.e(`Received unexpected container registry response:`, response);
        }
        return new ContainerRegistry(response.address, response.username);
    }

    export async function getImageRegistries(connection: Connection): Promise<ContainerRegistry[]> {
        const response: RegistrySecretResponse[] = await doConnectionRequest(connection, MCEndpoints.REGISTRY_SECRETS, "GET");
        // Log.d(`Container registry response:`, response);
        const registries = response.map((reg) => asContainerRegistry(reg));

        const pushRegistryRes = await getPushRegistry(connection);
        // Log.d(`Image push registry response`, pushRegistryRes);

        // tslint:disable-next-line: no-boolean-literal-compare
        if (pushRegistryRes.imagePushRegistry === true) {
            const pushRegistry = registries.find((reg) => reg.address === pushRegistryRes.address);
            if (!pushRegistry) {
                Log.e(`Push registry response was ${JSON.stringify(pushRegistryRes)} but no registry with a matching address was found`);
            }
            else {
                pushRegistry.isPushRegistry = true;
                pushRegistry.namespace = pushRegistryRes.namespace || "";
                Log.i(`Push registry is ${pushRegistry.address}`);
            }
        }
        else {
            Log.d(`No image push registry is set`);
        }
        return registries;
    }

    export async function addRegistrySecret(connection: Connection, address: string, username: string, password: string)
        : Promise<ContainerRegistry> {

        const credentialsPlain = { username, password };
        const credentialsEncoded = Buffer.from(JSON.stringify(credentialsPlain)).toString("base64");

        const body = {
            address,
            credentials: credentialsEncoded,
        };

        const response: RegistrySecretResponse[] = await doConnectionRequest(connection, MCEndpoints.REGISTRY_SECRETS, "POST", { body });
        const match = response.find((reg) => reg.address === address);
        if (match == null) {
            Log.e("Got success response when adding new registry secret, but was not found in api response");
            throw new Error(`Error adding new registry secret`);
        }
        return asContainerRegistry(match);
    }

    export async function removeRegistrySecret(connection: Connection, toRemove: ContainerRegistry): Promise<ContainerRegistry[]> {
        const body = {
            address: toRemove.address,
        };

        if (toRemove.isPushRegistry) {
            await doConnectionRequest(connection, MCEndpoints.PUSH_REGISTRY, "DELETE", { body });
        }

        const response: RegistrySecretResponse[] = await doConnectionRequest(connection, MCEndpoints.REGISTRY_SECRETS, "DELETE", { body });
        const registriesAfterDelete = response.map(asContainerRegistry);
        return registriesAfterDelete;
    }

    export async function getPushRegistry(connection: Connection): Promise<{ imagePushRegistry: boolean, address?: string, namespace?: string }> {
        return doConnectionRequest(connection, MCEndpoints.PUSH_REGISTRY, "GET");
    }

    export async function setPushRegistry(connection: Connection, registry: ContainerRegistry): Promise<void> {
        const body = {
            operation: "set",
            address: registry.address,
            namespace: registry.namespace,
        };

        await doConnectionRequest(connection, MCEndpoints.PUSH_REGISTRY, "POST", { body });
    }

    export async function testPushRegistry(connection: Connection, registry: ContainerRegistry): Promise<SocketEvents.IPushRegistryStatus> {

        const body = {
            operation: "test",
            address: registry.address,
            namespace: registry.namespace,
        };

        return doConnectionRequest(connection, MCEndpoints.PUSH_REGISTRY, "POST", { body });
    }

    // From https://github.com/eclipse/codewind/blob/master/src/pfe/portal/modules/utils/Logger.js#L38
    export interface PFELogLevels {
        readonly currentLevel: string;
        readonly defaultLevel: string;
        readonly allLevels: string[];
    }

    export async function getPFELogLevels(connection: Connection): Promise<PFELogLevels> {
        return doConnectionRequest(connection, MCEndpoints.LOGGING, "GET");
    }

    export async function setPFELogLevel(connection: Connection, level: string): Promise<void> {
        const body = { level };
        return doConnectionRequest(connection, MCEndpoints.LOGGING, "PUT", { body });
    }

    // Project-specific requests

    /**
     * @returns If the restart was accepted by the server
     */
    export async function requestProjectRestart(project: Project, startMode: StartModes): Promise<boolean> {
        const body = {
            startMode: startMode.toString()
        };

        const restartMsg = Translator.t(STRING_NS, "restartIntoMode", { startMode: ProjectCapabilities.getUserFriendlyStartMode(startMode) });
        const response = await doProjectRequest(project, ProjectEndpoints.RESTART_ACTION, body, "POST", restartMsg, false);
        return response != null;
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
        return new ProjectCapabilities(result.startModes, result.controlCommands);
    }

    export async function requestToggleInjectMetrics(project: Project): Promise<void> {
        const newInjectMetrics: boolean = !project.isInjectingMetrics;

        const autoInjectMetricsMsgKey = newInjectMetrics ? "autoInjectMetricsEnable" : "autoInjectMetricsDisable";      // non-nls
        const newAutoInjectMetricsUserStr: string = Translator.t(STRING_NS, autoInjectMetricsMsgKey);

        const body = {
            enable: newInjectMetrics
        };

        await doProjectRequest(project, ProjectEndpoints.METRICS_INJECTION, body, "POST", newAutoInjectMetricsUserStr);
        await project.setInjectMetrics(newInjectMetrics);
    }

    export async function getProfilingData(project: Project, url: string, filePath: string): Promise<void> {
        let protocol;
        let options;
        if (project.connection instanceof RemoteConnection) {
            if (!url.startsWith("https")) {
                throw new Error(`Refusing to send access token to non-secure URL ${url}`);
            }
            const accessToken = await project.connection.getAccessToken();
            options = {
                agent: new https.Agent({rejectUnauthorized: false}),
                headers: {
                    Authorization: ` Bearer ${accessToken.access_token}`
                }
            } as https.RequestOptions;
            protocol = https;
        } else {
            protocol = http;
        }
        const wStream = fs.createWriteStream(filePath);
        return await httpWriteStreamToFile(url, options, protocol, wStream);
    }

    async function httpWriteStreamToFile(url: string, options: https.RequestOptions | undefined, protocol: any,
                                         wStream: fs.WriteStream): Promise<void> {
        return new Promise((resolve, reject) => {
            const newRequest = protocol.request(url, options, (res: any) => {
                res.on("error", (err: any) => {
                    return reject(err);
                });
                res.on("data", (data: any) => {
                    wStream.write(data);
                });
                res.on("end", () => {
                    return resolve();
                });
                res.on("aborted", () => {
                    return reject();
                });
            }).on("error", (err: any) => {
                return reject(err);
            });
            newRequest.end();
        });
    }

    /**
     * Try to connect to the given URL. Returns true if any response is returned that does not have one of the `rejectedStatusCodes`.
     */
    export async function ping(url: string | vscode.Uri, timeoutS: number = 10, ...rejectStatusCodes: number[]): Promise<boolean> {
        // We treat 502, 503 as failures, because from a kube cluster it means the hostname is wrong, the ingress/route does not exist,
        // the pod pointed to by an ingress is still starting up, etc.
        rejectStatusCodes.concat([ 502, 503 ]);

        // Log.d(`Ping ${url}`);
        if (url instanceof vscode.Uri) {
            url = url.toString();
        }

        try {
            await req("GET", url, { timeout: timeoutS * 1000 });
            // It succeeded
            return true;
        }
        catch (err) {
            if (err.message === ERR_LOGIN_PAGE) {
                Log.d(`Received login page when pinging ${url}`);
                return true;
            }
            else if (err instanceof StatusCodeError) {
                Log.d(`Received status ${err.statusCode} when pinging ${url}`);
                if (rejectStatusCodes.includes(err.statusCode)) {
                    return false;
                }
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
                    Log.d(`Waiting for ${connection.label} to be ready, ${tries * READY_DELAY_S}s have elapsed`);
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
                Log.i(`${connection.label} was ready after ${tries * READY_DELAY_S}s`);
            }
            else {
                Log.i(`${connection.label} was NOT ready after ${tries * READY_DELAY_S}s`);
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

    async function req(verb: keyof typeof HttpVerbs, url: string, options: request.RequestPromiseOptions = {}, accessToken?: AccessToken)
        : Promise<any> {

        const optionsCopy = Object.assign({}, options);
        optionsCopy.json = true;
        // we resolve with full response so we can look out for redirects below
        optionsCopy.resolveWithFullResponse = true;
        optionsCopy.followRedirect = false;
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
                bearer: accessToken.access_token,
            };
        }

        const response = await requestFunc(url, optionsCopy) as request.FullResponse;
        if (response.statusCode === 302 && response.headers.location && response.headers.location.includes("openid-connect/auth")) {
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
        project: Project, endpoint: ProjectEndpoints, body: {},
        verb: keyof typeof HttpVerbs, userOperationName: string, silent: boolean = false): Promise<any> {

        const url = EndpointUtil.resolveProjectEndpoint(project.connection, project.id, endpoint as ProjectEndpoints);

        // Log.i(`Doing ${userOperationName} request to ${url}`);

        const options: request.RequestPromiseOptions = {
            body,
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
            Log.e(`Error doing ${userOperationName} project request for ${project.name}:`, err);

            vscode.window.showErrorMessage(
                Translator.t(STRING_NS, "requestFail",
                { operationName: userOperationName, projectName: project.name, err: MCUtil.errToString(err) })
            );

            return undefined;
        }
    }
}

export default Requester;
