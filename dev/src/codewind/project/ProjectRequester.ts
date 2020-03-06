
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

import Requester, { HttpVerb } from "../Requester";
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

    private async doProjectRequest<T = void>(
        endpoint: ProjectEndpoints, verb: HttpVerb, body?: {}): Promise<T> {

        const url = EndpointUtil.resolveProjectEndpoint(this.project.connection, this.project.id, endpoint as ProjectEndpoints);

        const accessToken = await this.project.connection.getAccessToken();
        const result = await Requester.req<T>(verb, url, { body }, accessToken);
        return result;
    }

    /**
     * @returns If the restart was accepted by the server
     */
    public async requestProjectRestart(startMode: StartModes): Promise<void> {
        const body = {
            startMode: startMode.toString()
        };

        await this.doProjectRequest(ProjectEndpoints.RESTART_ACTION, "POST", body);
    }

    public async requestBuild(): Promise<void> {
        const body = {
            action: "build"         // non-nls
        };

        await this.doProjectRequest(ProjectEndpoints.BUILD_ACTION, "POST", body);
    }

    public async requestToggleAutoBuild(newAutoBuild: boolean): Promise<void>    {
        const newAutoBuildAction = newAutoBuild ? "enableautobuild" : "disableautobuild";     // non-nls

        const body = {
            action: newAutoBuildAction
        };

        await this.doProjectRequest(ProjectEndpoints.BUILD_ACTION, "POST", body);
    }

    public async requestToggleInjectMetrics(newInjectMetrics: boolean): Promise<void> {
        const body = {
            enable: newInjectMetrics
        };

        await this.doProjectRequest(ProjectEndpoints.METRICS_INJECTION, "POST", body);
    }

    public async requestToggleEnablement(newEnablement: boolean): Promise<void> {
        const endpoint = EndpointUtil.getEnablementAction(newEnablement);
        await this.doProjectRequest(endpoint, "PUT");
    }

    public async requestUnbind(): Promise<void> {
        await this.doProjectRequest(ProjectEndpoints.UNBIND, "POST");
    }

    public async requestAvailableLogs(): Promise<ILogResponse> {
        if (!this.project.state.isEnabled) {
            // there are no logs available for disabled projects
            return {
                build: [], app: []
            };
        }
        return this.doProjectRequest(ProjectEndpoints.LOGS, "GET");
    }

    public async requestToggleLogs(enable: boolean): Promise<void> {
        const verb = enable ? "POST" : "DELETE";
        await this.doProjectRequest(ProjectEndpoints.LOGS, verb);
    }

    public async getCapabilities(): Promise<ProjectCapabilities> {
        // https://eclipse.github.io/codewind/#/paths/~1api~1v1~1projects~1{id}~1capabilities/get
        const result = await this.doProjectRequest<{ startModes: StartModes[], controlCommands: ControlCommands[] }>(ProjectEndpoints.CAPABILITIES, "GET");
        return new ProjectCapabilities(result.startModes, result.controlCommands);
    }

    public async receiveProfilingData(timestamp: string, profilingOutPath: string): Promise<void> {
        const endpoint = ProjectEndpoints.PROFILING.toString().concat(`/${timestamp}`);
        const url = EndpointUtil.resolveProjectEndpoint(this.project.connection, this.project.id, endpoint as ProjectEndpoints);

        await Requester.httpWriteStreamToFile(url, profilingOutPath, await this.project.connection.getAccessToken());
        Log.d(`Saved profiling data to project ${this.project.name} at ${profilingOutPath}`);
    }
}
