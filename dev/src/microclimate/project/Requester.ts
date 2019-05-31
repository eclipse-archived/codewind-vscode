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
import StartModes from "../../constants/StartModes";
import Log from "../../Logger";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Translator from "../../constants/strings/translator";
import * as MCUtil from "../../MCUtil";
import EndpointUtil, { ProjectEndpoints, Endpoint, MCEndpoints } from "../../constants/Endpoints";
import { ILogResponse } from "../connection/SocketEvents";

const STRING_NS = StringNamespaces.REQUESTS;

namespace Requester {

    export async function requestProjectRestart(project: Project, startMode: StartModes.Modes): Promise<request.FullResponse> {
        const body = {
            startMode: startMode.toString()
        };

        const restartMsg = Translator.t(STRING_NS, "restartIntoMode", { startMode: StartModes.getUserFriendlyStartMode(startMode) });
        return doProjectRequest(project, ProjectEndpoints.RESTART_ACTION, body, request.post, restartMsg);
    }

    export async function requestBuild(project: Project): Promise<void> {
        const body = {
            action: "build"         // non-nls
        };

        // return doProjectRequest(project, url, body, request.post, "Build");
        const buildMsg = Translator.t(STRING_NS, "build");
        await doProjectRequest(project, ProjectEndpoints.BUILD_ACTION, body, request.post, buildMsg);
        // This is a workaround for the Build action not refreshing validation state.
        // Will be fixed by https://github.ibm.com/dev-ex/iterative-dev/issues/530
        // await requestValidate(project, true);
    }

    export async function requestToggleAutoBuild(project: Project): Promise<void> {
        const newAutoBuild: boolean = !project.autoBuildEnabled;

        // user-friendly action
        const autoBuildMsgKey = newAutoBuild ? "autoBuildEnable" : "autoBuildDisable";                  // non-nls
        const newAutoBuildUserStr: string = Translator.t(STRING_NS, autoBuildMsgKey);

        // action we'll put into the request body   https://github.ibm.com/dev-ex/portal/wiki/API:-Build
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

    export async function requestSettingChange(
        project: Project, settingName: string, settingKey: string, newValue: string | number, isNumber: boolean): Promise<void> {

        const updateMsg = Translator.t(STRING_NS, "updatingSetting", { settingName });

        if (isNumber) {
            newValue = Number(newValue);
            if (isNaN(newValue)) {
                throw new Error(`Failed to convert ${newValue} to number; ${settingName} must be a number.`);
            }
        }

        const body = {
            [settingKey]: newValue,
        };
        await doProjectRequest(project, ProjectEndpoints.PROPERTES, body, request.post, updateMsg);
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

    export async function areMetricsAvailable(project: Project): Promise<boolean> {
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
            requestFunc: (uri: string, options: request.RequestPromiseOptions) => request.RequestPromise<any>,
            userOperationName: string, silent: boolean = false): Promise<request.FullResponse> {

        let url: string;
        if (EndpointUtil.isProjectEndpoint(endpoint)) {
            url = EndpointUtil.resolveProjectEndpoint(project.connection, project.id, endpoint as ProjectEndpoints);
        }
        else {
            url = EndpointUtil.resolveMCEndpoint(project.connection, endpoint as MCEndpoints);
        }

        Log.i(`Doing ${userOperationName} request to ${url}`);

        const options = {
            json: true,
            body,
            resolveWithFullResponse: true,
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
