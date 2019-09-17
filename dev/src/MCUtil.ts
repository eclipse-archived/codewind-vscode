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
import * as path from "path";
import { promisify } from "util";
import * as fs from "fs";

import Log from "./Logger";

namespace MCUtil {

    /**
     * Returns the last segment of the given path, with no starting slash.
     * Trailing slash is kept if present.
     *
     * lastPathSegment("/home/tim/test/dir/") -> "dir/"
     */
    export function lastPathSegment(p: string): string {
        return p.substr(p.lastIndexOf(path.sep) + 1);
    }

    export function uppercaseFirstChar(input: string): string {
        return input.charAt(0).toUpperCase() + input.slice(1);
    }

    /**
     * Returns a wrapper promise which runs the given promise with the given timeout.
     * If the timeout expires before the given promise is fulfilled, the wrapper promise rejects with the given message.
     *
     * If the promise resolves or rejects before the timeout,
     * the wrapper promise resolves or rejects with the same result as the inner promise.
     */
    export function promiseWithTimeout<T>(promise: Promise<T>, timeoutMS: number, rejectMsg: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            setTimeout(() => reject(rejectMsg), timeoutMS);

            promise
            .then((result: T) => resolve(result))
            .catch((err: any) => reject(err));
        });
    }

    export function isGoodDate(date: Date): boolean {
        return !isNaN(date.valueOf());
    }

    export function isGoodStatusCode(statusCode: number | undefined): boolean {
        return statusCode != null && !isNaN(statusCode) && statusCode >= 200 && statusCode < 400;
    }

    /**
     * Extract the hostname from a URL with authority hostname:9090, for example.
     * If there's no port, return the whole authority.
     */
    export function getHostnameFrom(url: vscode.Uri): string {
        const authority = url.authority;
        const colonIndex: number = authority.indexOf(":");      // non-nls
        if (colonIndex === -1) {
            return authority;
        }
        return authority.substring(0, colonIndex);
    }

    export function isGoodPort(port: number | undefined): boolean {
        return port != null && !isNaN(port) && Number.isInteger(port) && port > 0 && port < 65536;
    }

    export function errToString(err: any, isOidc: boolean = false): string {
        if (err.toString() === err) {
            // string errors don't need any change
            return err.toString();
        }

        if (isOidc) {
            return err.error_description || err.error || err.message || JSON.stringify(err);
        }

        if (err.error) {
            if (err.error.info) {
                const infoMsg = err.error.info.message;
                if (infoMsg) {
                    return infoMsg;
                }
            }
            return err.error.msg || err.error.message || JSON.stringify(err.error);
        }

        return err.message || JSON.stringify(err);
    }

    const charsToRemove = "·/_,:;";
    const toRemoveRx = new RegExp(charsToRemove.split("").join("|"), "g");

    /**
     * Not a 'normal' slug function, but makes strings look nice and normal and kebab-cased.
     * Replace url-unfriendly characters, spaces and '.'s with '-'.
     *
     * Inspired by https://medium.com/@mhagemann/the-ultimate-way-to-slugify-a-url-string-in-javascript-b8e4a0d849e1
     */
    export function slug(s: string): string {
        return s.toLowerCase()
            .replace(/\s+/g, "-")           // spaces to -
            .replace(/\./g, "-")            // literal . to -
            .replace(toRemoveRx, "")        // remove other special chars
            // .replace(/[^\w\-]+/g, "")    // remove all non-words
            .replace(/\-\-+/g, "-")         // replace multiple - with single
            .replace(/^-+/, "")             // trim - from start
            .replace(/-+$/, "");            // trim - from end
    }

    export function getOS(): "windows" | "darwin" | "linux" {
        const platf = process.platform;
        // https://nodejs.org/api/process.html#process_process_platform
        if (platf === "win32") {
            return "windows";
        }
        else if (platf === "darwin") {
            return "darwin";
        }
        else if (platf !== "linux") {
            Log.w("Potentially unsupported platform: " + platf);
        }
        // there are a few other possibilities, but let's just hope they're linux-like
        return "linux";
    }

    /**
     * C:\\Users\\... -> /C/Users/
     */
    export function fsPathToContainerPath(fsPath: vscode.Uri | string): string {
        const pathStr: string = fsPath instanceof vscode.Uri ? fsPath.fsPath : fsPath;
        if (getOS() !== "windows") {
            return pathStr;
        }
        const driveLetter = pathStr.charAt(0);
        // we have to convert C:\<path> to /C/<path>
        const containerPath = pathStr.substring(2).replace(/\\/g, "/");
        return `/${driveLetter}${containerPath}`;
    }

    /**
     * /C/Users/... -> C:/Users/
     */
    export function containerPathToFsPath(containerPath: string): string {
        if (getOS() !== "windows") {
            return containerPath;
        }
        let deviceLetter: string;
        if (containerPath.startsWith("/")) {
            deviceLetter = containerPath.substring(1, 2);
        }
        else {
            deviceLetter = containerPath.charAt(0);
        }
        return `${deviceLetter}:${containerPath.substring(2)}`;
    }

    /**
     * List of files whose presence indicates we are in a CW workspace or project.
     * This should match this list in the workspaceContains activation events in package.json.
     */
    const CW_FILES = [
        // workspace files
        ".idc",
        ".projects",
        ".extensions",
        // project files
        ".cw-settings",
    ];

    /**
     * Returns true if any of the user's workspace folders look like a Codewind workspace, or a Codewind project,
     * by checking for existence of the CW_FILES.
     */
    export async function isUserInCwWorkspaceOrProject(): Promise<boolean> {
        const wsFolders = vscode.workspace.workspaceFolders;
        if (wsFolders == null || wsFolders.length === 0) {
            return false;
        }
        const checkWsFolderPromises = wsFolders.map((wsFolder) => isCwWorkspaceOrProject(wsFolder.uri.fsPath));
        return (await Promise.all(checkWsFolderPromises)).some((result) => result);
    }

    async function isCwWorkspaceOrProject(dirPath: string): Promise<boolean> {
        return (await promisify(fs.readdir)(dirPath))
            .some((file) => CW_FILES.includes(file.toString()));
    }
}

export default MCUtil;
