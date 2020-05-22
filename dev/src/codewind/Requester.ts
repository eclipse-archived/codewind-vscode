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
import * as fs from "fs-extra";
import * as path from "path";
import got, { NormalizedOptions, Response, Progress, GotError } from "got";
import * as stream from "stream";
import { promisify } from "util";

const pipeline = promisify(stream.pipeline);

import Log from "../Logger";
import { AccessToken, ProgressUpdate } from "./Types";

export type PingResult = "success" | "cancelled" | GotError;

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

    protected static async req<T>(method: HttpMethod, url: string, options: RequesterOptions = {}): Promise<T> {

        Log.d(`Doing JSON ${method} request to ${url}`); // with options:`, options);

        const response = await got<T>(url, {
            ...this.getGotOptions(method, url, options),
            responseType: "json",
        });

        return response.body;
    }

    // Some of our APIs still returns text instead of JSON - https://github.com/eclipse/codewind/issues/2435
    // Use this to access those APIs
    protected static async reqText(method: HttpMethod, url: string, options: RequesterOptions = {}): Promise<string> {

        Log.d(`Doing text ${method} request to ${url}`); // with options:`, options);

        // https://github.com/sindresorhus/got#api
        const response = await got(url, {
            ...this.getGotOptions(method, url, options),
            responseType: "text",
        });

        return response.body;
    }

    // tslint:disable-next-line: typedef - The typedef for the options accepted by Got is a total mess :)
    private static getGotOptions(verb: HttpMethod, url: string, options: RequesterOptions) {
        return {
            method: verb,
            rejectUnauthorized: false,
            json: options.body,
            searchParams: options.query,
            timeout: options.timeout || 60000,
            headers: {
                ...this.getAuthorizationHeader(url, options.accessToken),
            },
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
        };
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
     * Ping the given url but treat certain responses as failures.
     * From a kube cluster, these mean the hostname is wrong, the ingress/route does not exist,
     * the pod pointed to by an ingress is still starting up, etc.
     */
    public static async pingKube(url: string | vscode.Uri, timeoutMS: number, cancellation?: vscode.CancellationToken): Promise<PingResult> {
        const badCodes = [
            404,    // used by minikube
            502,    // used by most platforms for an ingress that points to a deleted pod/service
            503     // used by most platforms if the target is still pending/starting
        ];

        return this.ping(url, timeoutMS, badCodes, cancellation);
    }

    /**
     * Try to connect to the given URL. Returns true if any response is returned that does not have one of the `rejectedStatusCodes`.
     */
    public static async ping(url: string | vscode.Uri, timeoutMS: number, rejectStatusCodes: number[] = [],
        cancellation?: vscode.CancellationToken): Promise<PingResult> {

        Log.d(`Pinging ${url}`);
        if (url instanceof vscode.Uri) {
            url = url.toString();
        }

        try {
            const pingReq = got(url, {
                rejectUnauthorized: false,
                retry: {
                    limit: 0,
                },
                timeout: timeoutMS,
            });
            cancellation?.onCancellationRequested((_e) => {
                pingReq.cancel();
            });
            await pingReq;

            // It succeeded
            return "success";
        }
        catch (err) {
            if (err.message === Requester.ERR_LOGIN_PAGE) {
                Log.d(`Received login page when pinging ${url}`);
                return "success";
            }
            else if (err instanceof got.HTTPError) {
                const statusCode = err.response.statusCode;
                Log.i(`Received status ${statusCode} when pinging ${url}`);
                if (rejectStatusCodes.includes(statusCode)) {
                    return err;
                }
                return "success";
            }
            else if (err instanceof got.CancelError) {
                Log.d(`Ping cancelled`);
                return "cancelled";
            }
            // likely connection refused, timeout, etc.
            // so it was not reachable
            if (/Timeout awaiting '\w+' for \d+ms/i.test(err.message)) {
                // improve the timeout message since it's so common
                err.message = `Timed out trying to connect to ${url}`;
            }
            else {
                err.message = `Could not connect to ${url} - ${err.message}`;
            }
            Log.w(err.message);
            return err;
        }
    }

    /**
     * Open a stream to the given url and write out its response to destFile.
     */
    public static async httpWriteStreamToFile(
        url: string, destFile: string,
        options: {
            progress?: vscode.Progress<ProgressUpdate>,
            /**
             * When the download is finished, the progress meter will be this % full (defaults to 100)
             */
            progressEndPercent?: number,
            destFileMode?: number
        } = {},
        accessToken?: AccessToken): Promise<void> {

        Log.i(`Downloading ${url} to ${destFile}`);

        // https://github.com/sindresorhus/got#streams
        const httpStream = got.stream(url, {
            rejectUnauthorized: false,
            // timeout: 30000,
            // decompress: true,        // doesn't work?
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

        const pipelinePromise = pipeline(httpStream, fs.createWriteStream(destFile));

        let previousPercentDone = 0;
        let didLogLength = false;
        let didLogHalfDone = false;
        const progressEndPercent = options.progressEndPercent || 100;

        // https://github.com/sindresorhus/got#ondownloadprogress-progress
        httpStream.on("downloadProgress", (progressEvent: Progress) => {
            // the increment reported has to be the difference from before since vs code sums them up
            const increment = (progressEvent.percent - previousPercentDone) * progressEndPercent;

            let message;
            if (progressEvent.total) {
                // log total once
                if (!didLogLength) {
                    didLogLength = true;
                    Log.i(`Download length of ${path.basename(url)} is ${this.bytesToMB(progressEvent.total)} MB`);
                }
                if (options.progress) {
                    message = `${this.bytesToMB(progressEvent.transferred)} / ${this.bytesToMB(progressEvent.total)} MB`;
                }
            }

            if (progressEvent.percent > 50 && !didLogHalfDone) {
                Log.d(`Download of ${path.basename(url)} is 50% finished, downloaded ${this.bytesToMB(progressEvent.transferred)} MB`);
                didLogHalfDone = true;
            }

            options.progress?.report({ message, increment });
            previousPercentDone = progressEvent.percent;
        });

        await pipelinePromise;

        if (options.destFileMode) {
            await fs.chmod(destFile, options.destFileMode);
        }

        Log.d(`Finished downloading ${url}`);
    }

    private static bytesToMB(bytes: number): string {
        return (bytes / 1024 / 1024).toFixed(1);
    }
}

// namespace Requester {
export interface RequesterOptions {
    accessToken?: AccessToken;
    /**
     * Request body object.
     */
    body?: {};
    /**
     * Querystring key-values to append to the url.
     */
    query?: {};
    /**
     * In milliseconds
     */
    timeout?: number;
}
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
// }

export default Requester;
