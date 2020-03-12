
/*******************************************************************************
 * Copyright (c) 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

// import * as vscode from "vscode";
// import * as fs from "fs";

import Requester, { HttpMethod, RequesterOptions } from "../Requester";
import Project from "./Project";
import EndpointUtil, { ProjectEndpoints } from "../../constants/Endpoints";
import ProjectCapabilities, { StartModes, ControlCommands } from "./ProjectCapabilities";
import { ILogResponse } from "../Types";
import Log from "../../Logger";

export default class ProjectRequester extends Requester {

    constructor(
        private readonly project: Project
    ) {
        super();
    }

    /**
     *
     * @param json - If this is true, the response is expected to be JSON. Pass a generic parameter to indicate the response body's type.
     *  If `json = false`, the response will be of type `string`.
     */
    private async doProjectRequest<T>(
        endpoint: ProjectEndpoints, method: HttpMethod, json: boolean, options?: RequesterOptions): Promise<T> {

        const url = EndpointUtil.resolveProjectEndpoint(this.project.connection, this.project.id, endpoint as ProjectEndpoints);

        const accessToken = await this.project.connection.getAccessToken();
        if (json) {
            return Requester.req<T>(method, url, { ...options, accessToken });
        }
        else {
            // danger - T must be string!
            return Requester.reqText(method, url, { ...options, accessToken }) as unknown as T;
        }
    }

    public async requestProjectRestart(startMode: StartModes): Promise<void> {
        const body = {
            startMode: startMode.toString()
        };

        await this.doProjectRequest(ProjectEndpoints.RESTART_ACTION, "POST", false, { body });
    }

    public async requestBuild(): Promise<void> {
        const body = {
            action: "build"         // non-nls
        };

        await this.doProjectRequest(ProjectEndpoints.BUILD_ACTION, "POST", false, { body });
    }

    public async requestToggleAutoBuild(newAutoBuild: boolean): Promise<void>    {
        const newAutoBuildAction = newAutoBuild ? "enableautobuild" : "disableautobuild";     // non-nls

        const body = {
            action: newAutoBuildAction
        };

        await this.doProjectRequest(ProjectEndpoints.BUILD_ACTION, "POST", false, { body });
    }

    public async requestToggleInjectMetrics(newInjectMetrics: boolean): Promise<void> {
        const body = {
            enable: newInjectMetrics
        };

        await this.doProjectRequest(ProjectEndpoints.METRICS_INJECTION, "POST", false, { body });
    }

    public async requestToggleEnablement(newEnablement: boolean): Promise<void> {
        const endpoint = EndpointUtil.getEnablementAction(newEnablement);
        await this.doProjectRequest(endpoint, "PUT", false);
    }

    public async requestUnbind(): Promise<void> {
        await this.doProjectRequest(ProjectEndpoints.UNBIND, "POST", false);
    }

    public async requestAvailableLogs(): Promise<ILogResponse> {
        if (!this.project.state.isEnabled) {
            // there are no logs available for disabled projects
            return {
                build: [], app: []
            };
        }
        return this.doProjectRequest(ProjectEndpoints.LOGS, "GET", true);
    }

    public async requestToggleLogs(enable: boolean): Promise<void> {
        const verb = enable ? "POST" : "DELETE";
        await this.doProjectRequest(ProjectEndpoints.LOGS, verb, true);
    }


    public async getCapabilities(): Promise<ProjectCapabilities> {
        // https://eclipse.github.io/codewind/#/paths/~1api~1v1~1projects~1{id}~1capabilities/get
        const result = await
            this.doProjectRequest<{ startModes: StartModes[], controlCommands: ControlCommands[] }>(ProjectEndpoints.CAPABILITIES, "GET", true);

        return new ProjectCapabilities(result.startModes, result.controlCommands);
    }

    public async receiveProfilingData(timestamp: string, profilingOutPath: string): Promise<void> {
        const endpoint = ProjectEndpoints.PROFILING.toString().concat(`/${timestamp}`);
        const url = EndpointUtil.resolveProjectEndpoint(this.project.connection, this.project.id, endpoint as ProjectEndpoints);

        await Requester.httpWriteStreamToFile(url, profilingOutPath);
        Log.d(`Saved profiling data to project ${this.project.name} at ${profilingOutPath}`);
    }
}
