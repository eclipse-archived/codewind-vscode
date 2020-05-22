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

import * as vscode from "vscode";

import Log from "../../Logger";
import Requester, { RequesterOptions, HttpMethod, PingResult } from "../Requester";
import Connection from "./Connection";
import EndpointUtil, { CWEndpoints } from "../../constants/Endpoints";
import { PFEProjectData, RawCWEnvData, SourceEnablement, PFELogLevels, PushRegistryResponse } from "../Types";
import { IProjectTypeDescriptor } from "../project/ProjectType";
import ImageRegistry from "./registries/ImageRegistry";

interface IRepoEnablementReq {
    op: "enable";
    url: string;
    value: string;
}

interface IRepoEnablementResult {
    status: number;
    requestedOperation: IRepoEnablementReq;
}

export default class ConnectionRequester extends Requester {

    constructor(
        public readonly connection: Connection
    ) {
        super();
    }

    private async doConnectionRequest<T>(
        endpoint: CWEndpoints, method: HttpMethod, json: boolean, options?: RequesterOptions): Promise<T> {

        const url = EndpointUtil.resolveMCEndpoint(this.connection, endpoint);

        const accessToken = await this.connection.getAccessToken();
        if (json) {
            return Requester.req<T>(method, url, { ...options, accessToken });
        }
        else {
            // danger - T must be string!
            return Requester.reqText(method, url, { ...options, accessToken }) as unknown as T;
        }
    }

    public async getProjects(): Promise<PFEProjectData[]> {
        return this.doConnectionRequest<PFEProjectData[]>(CWEndpoints.PROJECTS, "GET", true);
    }

    public async getRawEnvironment(): Promise<RawCWEnvData> {
        return this.doConnectionRequest<RawCWEnvData>(CWEndpoints.ENVIRONMENT, "GET", true);
    }

    /**
     * Change the 'enabled' state of the given set of template sources.
     * Should only be called by TemplateSourceList to ensure it is refreshed appropriately.
     */
    public async toggleSourceEnablement(enablements: SourceEnablement): Promise<void> {
        const body: IRepoEnablementReq[] = enablements.repos.map((repo) => {
            return {
                op: "enable",
                url: repo.repoID,
                value: repo.enable ? "true" : "false",
            };
        });

        // status is always 207, we have to check the individual results for success status
        const result = await this.doConnectionRequest<IRepoEnablementResult[]>(CWEndpoints.BATCH_TEMPLATE_REPOS, "PATCH", true, { body });

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

    public async getProjectTypes(): Promise<IProjectTypeDescriptor[]> {
        const result = await this.doConnectionRequest<IProjectTypeDescriptor[]>(CWEndpoints.PROJECT_TYPES, "GET", true);
        if (result == null) {
            return [];
        }
        return result;
    }

    public async getPushRegistry(): Promise<PushRegistryResponse> {
        return this.doConnectionRequest(CWEndpoints.PUSH_REGISTRY, "GET", true);
    }

    public async setPushRegistry(registry: ImageRegistry): Promise<void> {
        const body = {
            operation: "set",
            address: registry.address,
            namespace: registry.namespace,
        };

        await this.doConnectionRequest(CWEndpoints.PUSH_REGISTRY, "POST", true, { body });
    }

    public async deletePushRegistry(address: string): Promise<void> {
        return this.doConnectionRequest(CWEndpoints.PUSH_REGISTRY, "DELETE", true, { body: { address } });
    }

    /*
    public async testPushRegistry(registry: ImageRegistry): Promise<SocketEvents.IPushRegistryStatus> {
        const body = {
            operation: "test",
            address: registry.address,
            namespace: registry.namespace,
        };

        return this.doConnectionRequest<SocketEvents.IPushRegistryStatus>(MCEndpoints.PUSH_REGISTRY, "POST", true, { body });
    }
    */

    public async getPFELogLevels(): Promise<PFELogLevels> {
        return this.doConnectionRequest<PFELogLevels>(CWEndpoints.LOGGING, "GET", true);
    }

    public async setPFELogLevel(level: string): Promise<void> {
        const body = { level };
        await this.doConnectionRequest<string>(CWEndpoints.LOGGING, "PUT", false, { body });
    }

    /**
     * Repeatedly ping the given this.connection's 'ready' endpoint. The connection should not be used until that endpoint returns true.
     */
    public async waitForReady(timeoutS: number, cancellation: vscode.CancellationToken): Promise<PingResult | "failure"> {
        const READY_DELAY_S = 2;

        const isCWReadyInitially = await this.isCodewindReady(false, READY_DELAY_S);
        if (isCWReadyInitially) {
            Log.i(`${this.connection} was ready on first ping`);
            return "success";
        }

        const maxTries = timeoutS / READY_DELAY_S;
        let tries = 0;
        return new Promise<PingResult | "failure">((resolve) => {
            const interval = setInterval(async () => {
                const logStatus = tries % 10 === 0;
                if (logStatus) {
                    Log.d(`Waiting for ${this.connection.label} to be ready, ${tries * READY_DELAY_S}s have elapsed`);
                }
                const ready = await this.isCodewindReady(logStatus, READY_DELAY_S);
                tries++;
                if (ready) {
                    clearInterval(interval);
                    resolve("success");
                }
                else if (tries > maxTries) {
                    clearInterval(interval);
                    resolve("failure");
                }
                else if (cancellation.isCancellationRequested) {
                    clearInterval(interval);
                    resolve("cancelled");
                }
            }, READY_DELAY_S * 1000);
        }).then((result) => {
            if (result === "success") {
                Log.i(`${this.connection.label} was ready after ${tries * READY_DELAY_S}s`);
            }
            else {
                Log.i(`${this.connection.label} was NOT ready after ${tries * READY_DELAY_S}s`);
            }
            return result;
        });
    }

    private async isCodewindReady(logStatus: boolean, timeoutS: number): Promise<boolean> {
        try {
            const res = await this.doConnectionRequest<string>(CWEndpoints.READY, "GET", false, { timeout: timeoutS * 1000 });

            if (res === "true") {
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
}
