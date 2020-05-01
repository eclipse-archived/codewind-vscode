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
import * as os from "os";
import * as path from "path";
import * as tar from "tar";
import commandExists from "command-exists";

import Log from "./Logger";
import Constants from "./constants/Constants";

namespace MCUtil {

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
            const msg = err.error.msg || err.error.message;
            if (msg) {
                return msg;
            }
            const jsoErr = JSON.stringify(err.error);
            if (jsoErr !== "{}") {
                return jsoErr;
            }
        }

        if (err.message) {
            return err.message;
        }

        return "Unknown error";
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
            .replace(/\(|\)/g, "")           // remove ( and )
            .replace(toRemoveRx, "")        // remove other special chars
            // .replace(/[^\w\-]+/g, "")    // remove all non-words
            .replace(/\-\-+/g, "-")         // replace multiple - with single
            .replace(/^-+/, "")             // trim - from start
            .replace(/-+$/, "");            // trim - from end
    }

    export type OS = "windows" | "darwin" | "linux";
    let currentOS: OS | undefined;

    export function getOS(): OS {
        // Get OS once, then cache it
        if (currentOS) {
            return currentOS;
        }

        const platf = process.platform;
        // https://nodejs.org/api/process.html#process_process_platform
        if (platf === "win32") {
            currentOS = "windows";
        }
        else if (platf === "darwin") {
            currentOS = "darwin";
        }
        else if (platf === "linux") {
            currentOS = "linux";
        }
        else {
            Log.w("Potentially unsupported platform: " + platf);
            // our 'best guess' is linux
            currentOS = "linux";
        }
        return currentOS;
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
        Constants.PROJ_SETTINGS_FILE_NAME,
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
        return (await fs.readdir(dirPath)).some((file) => CW_FILES.includes(file.toString()));
    }

    export function getCWWorkspacePath(): string {
        if (MCUtil.getOS() === "windows") {
            return "C:\\codewind-workspace";
        }
        return path.join(os.homedir(), "codewind-workspace");
    }

    export function getCWDataPath(): string {
        if (MCUtil.getOS() === "windows") {
            return "C:\\codewind-data";
        }
        return path.join(os.homedir(), "codewind-data");
    }

    /**
     * Joins a string array into a user-friendly list.
     * Eg, `joinList([ "tim", "erin", "john" ], "and")` => "tim, erin and john" (no oxford comma because it doesn't work with 'or')
     */
    export function joinList(strings_: readonly string[], andOrOr: "and" | "or"): string {
        const strings = Array.from(strings_);
        // remove undefined/empty
        strings.filter((s) => {
            if (!s) {
                Log.w(`Refusing to join empty or undefined string`);
                return false;
            }
            return true;
        });

        // separate the last string from the others since we have to prepend andOrOr to it
        const lastString = strings.splice(strings.length - 1, 1)[0];

        let joined: string = strings.join(", ");
        if (strings.length > 0) {
            joined = `${joined} ${andOrOr} ${lastString}`
        }
        else {
            joined = lastString;
        }
        return joined;
    }

    export function isDevEnv(): boolean {
        return process.env[Constants.CW_ENV_VAR] === Constants.CW_ENV_DEV;
    }

    export function isTestEnv(): boolean {
        return process.env[Constants.CW_ENV_VAR] === Constants.CW_ENV_TEST;
    }

    let previousProjectDir: vscode.Uri | undefined;

    export async function promptForProjectDir(btnLabel: string): Promise<vscode.Uri | undefined> {
        let defaultUri: vscode.Uri | undefined;

        // The default location is either the previously selected one, or the single workspace folder if there is just one.
        if (!previousProjectDir) {
            if (vscode.workspace.workspaceFolders) {
                if (vscode.workspace.workspaceFolders.length === 1) {
                    defaultUri = vscode.workspace.workspaceFolders[0].uri;
                }
            }
        }

        const selectedDirs = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: btnLabel,
            defaultUri,
        });

        if (selectedDirs == null || selectedDirs[0] == null) {
            return undefined;
        }
        // canSelectMany is false so we just use [0]
        const selectedDir = selectedDirs[0];

        const cwDataPath = MCUtil.getCWDataPath();
        if (selectedDir.fsPath.startsWith(cwDataPath)) {
            vscode.window.showErrorMessage(`You cannot create or add a project under ${cwDataPath}. Select a different directory.`);
            return undefined;
        }
        previousProjectDir = selectedDir;
        return selectedDir;
    }

    /**
     * Append pathAndQuery to baseURL with exactly one slash separating them
     */
    export function appendUrl(baseURL: string, pathAndQuery: string): string {
        const baseEndsWithSlash = baseURL.endsWith("/");
        const pathStartsWithSlash = pathAndQuery.startsWith("/");
        if (!baseEndsWithSlash && !pathStartsWithSlash) {
            baseURL = baseURL + "/";
        }
        else if (baseEndsWithSlash && pathStartsWithSlash) {
            // prevent double slash
            baseURL = baseURL.substring(0, baseURL.length - 1);
        }
        return baseURL + pathAndQuery;
    }

    export async function extractTar(tarFilePath: string, targetDir: string, filenamesToExtract?: string[]): Promise<string[]> {
        Log.d(`Extracting ${tarFilePath} into ${targetDir}`);
        const extractedPaths: string[] = [];

        await tar.extract({
            file: tarFilePath,
            cwd: targetDir,
            filter: (filePath, _entry) => {
                if (!filenamesToExtract || filenamesToExtract.includes(filePath)) {
                    extractedPaths.push(filePath);
                    return true;
                }
                return false;
            },
        });

        Log.d(`Extracted ${extractedPaths.length} file${extractedPaths.length !== 1 ? "s" : ""}`);
        return extractedPaths;
    }

    /**
     * Configures json as the language of the given file, if it is a codewind settings file.
     */
    export function setLanguageIfCWSettings(doc: vscode.TextDocument): void {
        // sometimes the path has .git appended, see https://github.com/Microsoft/vscode/issues/22561
        // since we are using the uri, the path separator will always be a forward slash.
        if ((doc.uri.scheme === "file" && doc.uri.path.endsWith(`/${Constants.PROJ_SETTINGS_FILE_NAME}`)) ||
            doc.uri.scheme === "git" && doc.uri.path.endsWith(`/${Constants.PROJ_SETTINGS_FILE_NAME}.git`)) {
            vscode.languages.setTextDocumentLanguage(doc, "json");
        }
    }

    export async function delay(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    const KUBE_CLIENTS: string[] = [
        "kubectl", "oc",
    ];

    let kubeClient: string | undefined;

    export async function getKubeClient(): Promise<string | undefined> {
        if (kubeClient) {
            return kubeClient;
        }

        for (const client of KUBE_CLIENTS) {
            let exists = false;
            try {
                await commandExists(client);
                exists = true;
            }
            catch (err) {
                /* it doesn't exist */
            }

            if (exists) {
                kubeClient = client;
                return client;
            }
        }

        Log.w(`No kubernetes client found, options were ${KUBE_CLIENTS.join(", ")}`);
        const errMsg = `No Kubernetes command-line client was found. ` +
            `Please install the Kubernetes CLI (kubectl) or OpenShift CLI (oc) to use this feature.`;
        vscode.window.showErrorMessage(errMsg);
        return undefined;
    }
}

export default MCUtil;
