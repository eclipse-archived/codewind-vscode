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

import * as vscode from "vscode";
import * as fs from "fs";
import got, { NormalizedOptions, Response } from "got";
import * as stream from "stream";
import { promisify } from "util";

const pipeline = promisify(stream.pipeline);

import Log from "../Logger";
import { AccessToken } from "./Types";

/**
 * These functions wrap all our API calls to the Codewind backend.
 * Each request is performed for either a Connection or a Project - see the subclasses.
 *
 * API doc - https://eclipse.github.io/codewind/
 */
export class Requester {

    private static readonly ERR_LOGIN_PAGE: string = "Authentication required";

    // By enforcing all requests to go through this function,
    // we can inject options to abstract away required configuration like using json content-type, handling insecure ssl, and authentication.

    protected static async req<T>(verb: HttpVerb, url: string, options: RequesterOptions = {}, accessToken?: AccessToken): Promise<T> {

        Log.d(`Doing ${verb} request to ${url}`); // with options:`, options);

        // https://github.com/sindresorhus/got#api
        const response = await got<T>(url, {
            method: verb,
            responseType: "json",
            rejectUnauthorized: false,
            json: options.body,
            searchParams: options.query,
            timeout: options.timeout || 30000,
            headers: this.getAuthorizationHeader(url, accessToken),
            retry: {
                // https://github.com/sindresorhus/got#retry
                // Retry on no status codes -> only on network errors.
                errorCodes: [],
            },
            hooks: {
                beforeRedirect: [
                    this.detectAuthBeforeRedirect
                ]
            }
        });

        return response.body;
    }

    private static getAuthorizationHeader(url: string, accessToken?: AccessToken): { Authorization: string } | undefined {
        if (!accessToken) {
            return undefined;
        }
        if (!url.startsWith("https")) {
            throw new Error(`Refusing to send access token to non-secure URL ${url}`);
        }

        return { Authorization: "Bearer " + accessToken.access_token };
    }

    /**
     * When redirected, check if it's to our openid login page, and throw an error if so.
     */
    private static readonly detectAuthBeforeRedirect = (_options: NormalizedOptions, redirectResponse: Response): void => {
        if (redirectResponse.statusCode === 302 &&
            redirectResponse.headers.location &&
            redirectResponse.headers.location.includes("openid-connect/auth")) {

            throw new Error(Requester.ERR_LOGIN_PAGE);
        }
    }

    /**
     * Ping the given url but treat 502 and 503 responses as failures.
     * From a kube cluster, these mean the hostname is wrong, the ingress/route does not exist,
     * the pod pointed to by an ingress is still starting up, etc.
     */
    public static async pingKube(url: string | vscode.Uri, timeoutMS: number): Promise<boolean> {
        return this.ping(url, timeoutMS, 502, 503);
    }

    /**
     * Try to connect to the given URL. Returns true if any response is returned that does not have one of the `rejectedStatusCodes`.
     */
    public static async ping(url: string | vscode.Uri, timeoutMS: number, ...rejectStatusCodes: number[]): Promise<boolean> {
        // Log.d(`Ping ${url}`);
        if (url instanceof vscode.Uri) {
            url = url.toString();
        }

        try {
            await this.req("GET", url, { timeout: timeoutMS });
            // It succeeded
            return true;
        }
        catch (err) {
            if (err.message === Requester.ERR_LOGIN_PAGE) {
                Log.d(`Received login page when pinging ${url}`);
                return true;
            }
            else if (err instanceof got.HTTPError) {
                Log.d(`Received status ${err.code} when pinging ${url}`);
                if (rejectStatusCodes.includes(Number(err.code))) {
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

    public static async httpWriteStreamToFile(url: string, destFile: string, accessToken?: AccessToken): Promise<void> {
        // https://github.com/sindresorhus/got#streams
        const httpStream = got.stream(url, {
            rejectUnauthorized: false,
            timeout: 30000,
            headers: this.getAuthorizationHeader(url, accessToken),
            retry: {
                // https://github.com/sindresorhus/got#retry
                // Retry on no status codes -> only on network errors.
                errorCodes: [],
            },
            hooks: {
                beforeRedirect: [
                    this.detectAuthBeforeRedirect
                ]
            }
        });

        await pipeline(httpStream, fs.createWriteStream(destFile));
    }
}

// namespace Requester {
export interface RequesterOptions {
    body?: {};
    query?: {};
    timeout?: number;
}
export type HttpVerb = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
// }

export default Requester;
