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
import * as http from "http";
import * as https from "https";
import * as request from "request-promise-native";
import { StatusCodeError } from "request-promise-native/errors";

import Log from "../Logger";
import { AccessToken } from "./Types";

/**
 * These functions wrap all our API calls to the Codewind backend.
 * Each request is performed for either a Connection or a Project - see the subclasses.
 *
 * API doc - https://eclipse.github.io/codewind/
 */
export default class Requester {

    // tslint:disable-next-line: typedef
    protected static readonly HTTP_VERBS = {
        GET: request.get,
        POST: request.post,
        PUT: request.put,
        PATCH: request.patch,
        DELETE: request.delete,
    } as const;

    private static readonly ERR_LOGIN_PAGE: string = "Authentication required";

    // By enforcing all requests to go through this function,
    // we can inject options to abstract away required configuration like using json, handling ssl, and authentication.

    protected static async req<T>(
        verb: keyof typeof Requester.HTTP_VERBS, url: string, options: request.RequestPromiseOptions = {},
        accessToken?: AccessToken): Promise<T> {

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

        const requestFunc = Requester.HTTP_VERBS[verb];

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
            throw new Error(this.ERR_LOGIN_PAGE);
        }

        return response.body;
    }

    /**
     * Try to connect to the given URL. Returns true if any response is returned that does not have one of the `rejectedStatusCodes`.
     */
    public static async ping(url: string | vscode.Uri, timeoutS: number = 10, ...rejectStatusCodes: number[]): Promise<boolean> {
        // We treat 502, 503 as failures, because from a kube cluster it means the hostname is wrong, the ingress/route does not exist,
        // the pod pointed to by an ingress is still starting up, etc.
        rejectStatusCodes.concat([ 502, 503 ]);

        // Log.d(`Ping ${url}`);
        if (url instanceof vscode.Uri) {
            url = url.toString();
        }

        try {
            await this.req("GET", url, { timeout: timeoutS * 1000 });
            // It succeeded
            return true;
        }
        catch (err) {
            if (err.message === Requester.ERR_LOGIN_PAGE) {
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

    protected static async httpWriteStreamToFile(
        url: string, options: https.RequestOptions, protocol: typeof http | typeof https, wStream: fs.WriteStream): Promise<void> {

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
}
