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
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import * as crypto from "crypto";
import * as tar from "tar";
import got from "got";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

import Log from "../../Logger";
import Constants from "../../constants/Constants";
import MCUtil from "../../MCUtil";
import Requester from "../Requester";

namespace CLISetup {
    const DOT_CODEWIND_PATH = path.join(os.homedir(), Constants.DOT_CODEWIND_DIR);
    /**
     * Eg ~/.codewind/0.9.0
     */
    export const BINARIES_TARGET_DIR = path.join(DOT_CODEWIND_PATH, Constants.CODEWIND_IMAGE_VERSION);

    export const CWCTL_DOWNLOAD_NAME = "cwctl";
    const CWCTL_BASENAME = MCUtil.getOS() === "windows" ? "cwctl.exe" : "cwctl";

    export const APPSODY_DOWNLOAD_NAME = "appsody";
    const APPSODY_BASENAME = MCUtil.getOS() === "windows" ? "appsody.exe" : "appsody";

    export const CWCTL_FINAL_PATH = path.join(BINARIES_TARGET_DIR, CWCTL_BASENAME);
    export const APPSODY_FINAL_PATH = path.join(BINARIES_TARGET_DIR, APPSODY_BASENAME);

    /**
     * Ensures that the BINARIES_TARGET_DIR exists.
     * @returns True if it already existed, false if it was created.
     */
    export async function doesBinariesTargetDirExist(): Promise<boolean> {
        let existed = true;

        // fails on windows, see note about electron https://github.com/nodejs/node/issues/24698#issuecomment-486405542
        // await promisify(fs.mkdir)(binaryTargetDir, { recursive: true });
        try {
            await fs.promises.access(DOT_CODEWIND_PATH);
        }
        catch (err) {
            await fs.promises.mkdir(DOT_CODEWIND_PATH);
            Log.d(`Created ${DOT_CODEWIND_PATH}`);
            existed = false;
        }

        try {
            if (existed) {
                await fs.promises.access(BINARIES_TARGET_DIR);
            }
        }
        catch (err) {
            existed = false;
        }
        finally {
            if (!existed) {
                await fs.promises.mkdir(BINARIES_TARGET_DIR);
                Log.d(`Created ${BINARIES_TARGET_DIR}`);
            }
        }

        return existed;
    }

    /**
     * Returns if cwctl is found at the expected path, is executable, and matches the latest shasum from the download site.
     */
    export async function isCwctlSetup(): Promise<boolean> {
        try {
            await fs.promises.access(CWCTL_FINAL_PATH, fs.constants.X_OK);
        }
        catch (err) {
            Log.d(`${CWCTL_FINAL_PATH} was not found or not executable`);
            return false;
        }

        Log.d(`${CWCTL_FINAL_PATH} exists and is executable`);

        if (!!process.env[Constants.ENV_CWCTL_DEVMODE]) {
            Log.i(`cwctl devmode is enabled; skipping sha check`);
            return true;
        }

        const [ expectedHash, actualHash ]: string[] = await Promise.all([
            getLatestCwctlSha1(),
            getOnDiskCwctlSha1(),
        ]);

        if (expectedHash !== actualHash) {
            Log.i(`Latest CLI hash ${expectedHash} did not match CLI on disk ${actualHash}; an update is required.`);
            // Delete the invalid executable
            await fs.promises.unlink(CWCTL_FINAL_PATH);
            return false;
        }

        Log.i(`cwctl matches latest from download site.`);
        return true;
    }

    /**
     * Returns if appsody is found at the expect path, is executable, and matches the expected version.
     */
    export async function isAppsodySetup(): Promise<boolean> {
        try {
            await fs.promises.access(APPSODY_FINAL_PATH, fs.constants.X_OK);
        }
        catch (err) {
            Log.d(`${APPSODY_FINAL_PATH} was not found or not executable`);
            return false;
        }

        Log.d(`${APPSODY_FINAL_PATH} exists and is executable`);

        if (!!process.env[Constants.ENV_APPSODY_DEVMODE]) {
            Log.i(`appsody devmode is enabled; skipping version check`);
            return true;
        }

        let versionOutput;
        try {
            versionOutput = await execFileAsync(APPSODY_FINAL_PATH, [ "version" ]);
        }
        catch (err) {
            Log.w(`Unexpected error running "${APPSODY_FINAL_PATH} version"`, err);
            return false;
        }

        if (versionOutput.stderr) {
            Log.e(`Unexpected error output from appsody version`, versionOutput.stderr);
        }

        // The output is eg "appsody 0.5.9"
        const currentVersion = versionOutput.stdout.trim().split(" ")[1];
        const isCorrectVersion = currentVersion === Constants.APPSODY_VERSION;

        if (isCorrectVersion) {
            Log.i(`Appsody binary is the correct version`);
        }
        else {
            Log.i(`Appsody version "${currentVersion}" doesn't match expected "${Constants.APPSODY_VERSION}"`);
            // Delete the invalid executable
            await fs.promises.unlink(APPSODY_FINAL_PATH);
        }
        return isCorrectVersion;
    }

    /**
     * @returns The download site directory that contains the cwctl builds that this version of the extension should use.
     */
    function getCwctlDirectoryUrl(): string {
        let cliBranch = Constants.CODEWIND_IMAGE_VERSION;
        if (cliBranch === Constants.CODEWIND_IMAGE_VERSION_DEV) {
            cliBranch = "master";
        }
        return `https://download.eclipse.org/codewind/codewind-installer/${cliBranch}/latest/`;
    }

    /**
     * @returns The sha1 of the latest cwctl build for this OS according to the download site.
     */
    async function getLatestCwctlSha1(): Promise<string> {
        // check that it is the most up-to-date binary
        const cliDownloadBaseUrl = getCwctlDirectoryUrl();
        const propertiesFileUrl = cliDownloadBaseUrl + "build_info.properties";

        const latestCLIProperties = (await got.get(propertiesFileUrl, {
            responseType: "text",
        })).body;

        Log.d(`CLI properties from ${propertiesFileUrl}:\n`, latestCLIProperties);

        const propertiesLines = latestCLIProperties.split("\n");

        const shaProperty = `build_info.${getCwctlOS()}.SHA-1=`;
        const osLine = propertiesLines.find((line) => line.startsWith(shaProperty));
        if (osLine == null) {
            throw new Error(`Properties file did not match expected format; ${shaProperty} was not found.`);
        }
        const sha1 = osLine.substring(shaProperty.length).trim();
        return sha1;
    }

    /**
     * The build site uses slightly different operating system names from this extension.
     */
    function getCwctlOS(): "win" | "macos" | "linux" {
        const ourOS = MCUtil.getOS();
        if (ourOS === "windows") {
            return "win";
        }
        else if (ourOS === "darwin") {
            return "macos";
        }
        else if (ourOS !== "linux") {
            Log.e(`Unrecognized operating system ${ourOS}`);
        }
        return "linux";
    }

    /**
     * @returns The sha1 of the cwctl currently on disk.
     */
    async function getOnDiskCwctlSha1(): Promise<string> {
        const sha1 = crypto.createHash("sha1");

        return new Promise<string>((resolve, reject) => {
            fs.createReadStream(CWCTL_FINAL_PATH)
            .on("error", (err) => {
                reject(err);
            })
            .on("data", (data) => {
                sha1.update(data);
            })
            .on("close", () => {
                const hash = sha1.digest("hex");
                resolve(hash.toString());
            });
        });
    }

    /**
     * @returns The binary name for this OS on the download site, eg "cwctl-win.exe"
     */
    function getCwctlDownloadBinaryName(): string {
        const cwctlOS = getCwctlOS();
        const extension = cwctlOS === "win" ? ".exe" : "";
        return `${CWCTL_DOWNLOAD_NAME}-${cwctlOS}${extension}`;
    }

    /**
     * @returns The url to the cwctl zip file download.
     */
    export function getCwctlZipDownloadUrl(): string {
        // eg http://download.eclipse.org/codewind/codewind-installer/master/latest/zips/cwctl-win.exe.zip
        return getCwctlDirectoryUrl() + "zips/" + getCwctlDownloadBinaryName() + ".zip";
    }

    const EXECUTABLES_MODE = 0o755;

    /**
     * Download cwctl.zip, unzip it, move it to the expected location, and give it the required permissions.
     */
    export async function downloadCwctl(): Promise<string> {
        Log.i(`Downloading cwctl`);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: `Downloading the Codewind CLI`,
        }, async (progress) => {
            const cwctlZipDownloadUrl = getCwctlZipDownloadUrl();
            const cwctlZipTargetPath = path.join(BINARIES_TARGET_DIR, path.basename(cwctlZipDownloadUrl));

            await Requester.httpWriteStreamToFile(cwctlZipDownloadUrl, cwctlZipTargetPath, {
                destFileMode: EXECUTABLES_MODE,
                progress,
                progressEndPercent: 90,
            });

            progress.report({ message: `Extracting ${cwctlZipTargetPath}`, increment: 5 });
            const extracted = await MCUtil.extractZip(cwctlZipTargetPath, BINARIES_TARGET_DIR);
            const extractCwctlFilename = extracted.find((file) => file.startsWith(CWCTL_DOWNLOAD_NAME));
            if (!extractCwctlFilename) {
                throw new Error("Did not find cwctl after extracting cwctl archive");
            }
            const extractCwctlPath = path.join(BINARIES_TARGET_DIR, extractCwctlFilename);

            progress.report({ message: `Finishing up`, increment: 5 });

            await Promise.all([
                fs.promises.rename(extractCwctlPath, CWCTL_FINAL_PATH)
                .then(() => {
                    fs.promises.chmod(CWCTL_FINAL_PATH, EXECUTABLES_MODE);
                }),
                fs.promises.unlink(cwctlZipTargetPath),
            ]);
        });

        Log.i("Finished cwctl setup");

        return CWCTL_FINAL_PATH;
    }

    /**
     * @returns The URL to the Appsody tar.gz for this OS on the GitHub releases site.
     */
    export function getAppsodyDownloadUrl(): string {
        // appsody uses the same OS's as us, but suffixes "amd64" to non-windows builds.
        const ourOS = MCUtil.getOS();
        const appsodyOS = ourOS === "windows" ? ourOS : `${ourOS}-amd64`;

        // eg https://github.com/appsody/appsody/releases/download/0.5.9/appsody-0.5.9-darwin-amd64.tar.gz
        return `https://github.com/appsody/appsody/releases/download/` +
            `${Constants.APPSODY_VERSION}/${APPSODY_DOWNLOAD_NAME}-${Constants.APPSODY_VERSION}-${appsodyOS}.tar.gz`;
    }

    /**
     * Download appsody, unzip it, move it to the expected location, and give it the required permissions.
     */
    export async function downloadAppsody(): Promise<string> {
        Log.i(`Downloading Appsody`);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: `Downloading the Appsody CLI`,
        }, async (progress) => {
            const appsodyDownloadUrl = getAppsodyDownloadUrl();
            const appsodyArchiveFile = path.join(BINARIES_TARGET_DIR, path.basename(appsodyDownloadUrl));

            await Requester.httpWriteStreamToFile(appsodyDownloadUrl, appsodyArchiveFile, {
                destFileMode: EXECUTABLES_MODE,
                progress,
                progressEndPercent: 90,
            });

            Log.i(`Extracting ${appsodyArchiveFile}`);

            progress.report({ message: `Extracting ${appsodyArchiveFile}`, increment: 5 });
            await tar.extract({
                file: appsodyArchiveFile,
                cwd: path.dirname(APPSODY_FINAL_PATH),
                filter: (file, _stat): boolean => {
                    const extractThisFile = file === APPSODY_BASENAME;
                    // Log.d(`Extract "${file}" ? ${doExtract}`);
                    return extractThisFile;
                },
            });

            progress.report({ message: `Finishing up`, increment: 5 });

            await Promise.all([
                fs.promises.chmod(APPSODY_FINAL_PATH, EXECUTABLES_MODE),
                fs.promises.unlink(appsodyArchiveFile),
            ]);
        });

        Log.d(`Finished appsody setup`);

        return APPSODY_FINAL_PATH;
    }

    export async function lsBinariesTargetDir(): Promise<void> {
        const files = await fs.promises.readdir(BINARIES_TARGET_DIR, { withFileTypes: true });
        Log.d(`Contents of ${BINARIES_TARGET_DIR}: ${files.map((f) => f.name).join(" ")}`);
    }
}

export default CLISetup;
