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
import Requester, { RequesterOptions, HttpMethod } from "../Requester";
import Connection from "./Connection";
import EndpointUtil, { MCEndpoints } from "../../constants/Endpoints";
import { PFEProjectData, RawCWEnvData, CWTemplateData, SourceEnablement, PFELogLevels } from "../Types";
import { IProjectTypeDescriptor } from "../project/ProjectType";
import ContainerRegistry from "./ContainerRegistry";
import SocketEvents from "./SocketEvents";

interface IRepoEnablementReq {
    op: "enable";
    url: string;
    value: string;
}

interface IRepoEnablementResult {
    status: number;
    requestedOperation: IRepoEnablementReq;
}

interface RegistrySecretResponse {
    readonly address: string;
    readonly username: string;
}

export default class ConnectionRequester extends Requester {

    constructor(
        public readonly connection: Connection
    ) {
        super();
    }

    private async doConnectionRequest<T>(
        endpoint: MCEndpoints, method: HttpMethod, json: boolean, options?: RequesterOptions): Promise<T> {

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
        return this.doConnectionRequest<PFEProjectData[]>(MCEndpoints.PROJECTS, "GET", true);
    }

    public async getRawEnvironment(): Promise<RawCWEnvData> {
        return this.doConnectionRequest<RawCWEnvData>(MCEndpoints.ENVIRONMENT, "GET", true);
    }

    public async getTemplates(): Promise<CWTemplateData[]> {
        const result = await this.doConnectionRequest<CWTemplateData[]>(MCEndpoints.TEMPLATES, "GET", true, { query: { showEnabledOnly: true }});
        if (result == null) {
            return [];
        }
        return result;
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
        const result = await this.doConnectionRequest<IRepoEnablementResult[]>(MCEndpoints.BATCH_TEMPLATE_REPOS, "PATCH", true, { body });

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
        const result = await this.doConnectionRequest<IProjectTypeDescriptor[]>(MCEndpoints.PROJECT_TYPES, "GET", true);
        if (result == null) {
            return [];
        }
        return result;
    }

    private asContainerRegistry(response: RegistrySecretResponse): ContainerRegistry {
        if (!response.address || !response.username) {
            Log.e(`Received unexpected container registry response:`, response);
        }
        return new ContainerRegistry(response.address, response.username);
    }

    public async getImageRegistries(): Promise<ContainerRegistry[]> {
        const response = await this.doConnectionRequest<RegistrySecretResponse[]>(MCEndpoints.REGISTRY_SECRETS, "GET", true);

        // Log.d(`Container registry response:`, response);
        const registries = response.map((reg) => this.asContainerRegistry(reg));

        const pushRegistryRes = await this.getPushRegistry();
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

    public async addRegistrySecret(address: string, username: string, password: string)
        : Promise<ContainerRegistry> {

        const credentialsPlain = { username, password };
        const credentialsEncoded = Buffer.from(JSON.stringify(credentialsPlain)).toString("base64");

        const body = {
            address,
            credentials: credentialsEncoded,
        };

        const response = await this.doConnectionRequest<RegistrySecretResponse[]>(MCEndpoints.REGISTRY_SECRETS, "POST", true, { body });
        const match = response.find((reg) => reg.address === address);
        if (match == null) {
            Log.e("Got success response when adding new registry secret, but was not found in api response");
            throw new Error(`Error adding new registry secret`);
        }
        return this.asContainerRegistry(match);
    }

    public async removeRegistrySecret(toRemove: ContainerRegistry): Promise<ContainerRegistry[]> {
        const body = {
            address: toRemove.address,
        };

        if (toRemove.isPushRegistry) {
            await this.doConnectionRequest(MCEndpoints.PUSH_REGISTRY, "DELETE", true, { body });
        }

        const response = await this.doConnectionRequest<RegistrySecretResponse[]>(MCEndpoints.REGISTRY_SECRETS, "DELETE", true, { body });
        const registriesAfterDelete = response.map(this.asContainerRegistry);
        return registriesAfterDelete;
    }

    public async getPushRegistry(): Promise<{ imagePushRegistry: boolean, address?: string, namespace?: string }> {
        return this.doConnectionRequest(MCEndpoints.PUSH_REGISTRY, "GET", true);
    }

    public async setPushRegistry(registry: ContainerRegistry): Promise<void> {
        const body = {
            operation: "set",
            address: registry.address,
            namespace: registry.namespace,
        };

        await this.doConnectionRequest(MCEndpoints.PUSH_REGISTRY, "POST", true, { body });
    }

    /*
    public async testPushRegistry(registry: ContainerRegistry): Promise<SocketEvents.IPushRegistryStatus> {
        const body = {
            operation: "test",
            address: registry.address,
            namespace: registry.namespace,
        };

        return this.doConnectionRequest<SocketEvents.IPushRegistryStatus>(MCEndpoints.PUSH_REGISTRY, "POST", true, { body });
    }
    */

    public async getPFELogLevels(): Promise<PFELogLevels> {
        return this.doConnectionRequest<PFELogLevels>(MCEndpoints.LOGGING, "GET", true);
    }

    public async setPFELogLevel(level: string): Promise<void> {
        const body = { level };
        await this.doConnectionRequest<string>(MCEndpoints.LOGGING, "PUT", false, { body });
    }

    /**
     * Repeatedly ping the given this.connection's 'ready' endpoint. The connection should not be used until that endpoint returns true.
     */
    public async waitForReady(timeoutS: number): Promise<boolean> {
        const READY_DELAY_S = 2;

        const isCWReadyInitially = await this.isCodewindReady(false, READY_DELAY_S);
        if (isCWReadyInitially) {
            Log.i(`${this.connection} was ready on first ping`);
            return true;
        }

        const maxTries = timeoutS / READY_DELAY_S;
        let tries = 0;
        return new Promise<boolean>((resolve) => {
            const interval = setInterval(async () => {
                const logStatus = tries % 10 === 0;
                if (logStatus) {
                    Log.d(`Waiting for ${this.connection.label} to be ready, ${tries * READY_DELAY_S}s have elapsed`);
                }
                const ready = await this.isCodewindReady(logStatus, READY_DELAY_S);
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
            const res = await this.doConnectionRequest<string>(MCEndpoints.READY, "GET", false, { timeout: timeoutS * 1000 });

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
