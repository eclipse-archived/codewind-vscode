

/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import { Uri } from "vscode";

import { MCEndpoints } from "../../constants/Endpoints";
import Requester from "../project/Requester";
import Log from "../../Logger";

// From https://github.com/eclipse/codewind/blob/master/src/pfe/portal/routes/environment.route.js
interface RawCWEnvData {
    readonly devops_available: boolean;
    readonly codewind_version: string;
    readonly os_platform: string;
    readonly running_in_k8s: boolean;
    readonly socket_namespace?: string;
    readonly user_string?: string;
    // readonly workspace_location?: string;
    readonly tekton_dashboard: TektonStatus;
}

/**
 * Massaged env data, which the plugin is actually interested in
 */
export interface CWEnvData {
    // readonly workspace: string;
    readonly socketNamespace: string;
    readonly version: string;
    readonly tektonStatus: TektonStatus;
}

export interface TektonStatus {
    readonly status: boolean;
    readonly message: string;       // error message or "not-installed" if status is false
    readonly url: string;           // empty if status is false
}

namespace CWEnvironment {
    /**
     * Get the environment data for a Codewind instance at the given url.
     * Separate from normal Requester code because we do not yet have a Connection instance at this point.
     */
    export async function getEnvData(url: Uri): Promise<CWEnvData> {
        const envUri: Uri = url.with({ path: MCEndpoints.ENVIRONMENT });
        const connectTimeout = 2500;

        const result = await Requester.get(envUri.toString(), { timeout: connectTimeout });
        Log.d("Raw env data:", result);
        const massaged = massageEnv(result);
        Log.i("Massaged ENV data", massaged);
        return massaged;
    }

    function massageEnv(rawEnv: RawCWEnvData): CWEnvData {
        // const rawWorkspace = rawEnv.workspace_location;
        const rawSocketNS = rawEnv.socket_namespace || "";

        // if (rawVersion == null) {
            // throw new Error("No version information was provided by Codewind.");
        // }
        // if (!rawWorkspace) {
            // throw new Error("No workspace information was provided by Codewind.");
        // }
        // const workspace = MCUtil.containerPathToFsPath(rawWorkspace);
        const version = rawEnv.codewind_version || "Unknown";

        // normalize namespace so it doesn't start with '/'
        const socketNamespace = rawSocketNS.startsWith("/") ? rawSocketNS.substring(1, rawSocketNS.length) : rawSocketNS;

        return {
            // workspace,
            version,
            socketNamespace,
            tektonStatus: rawEnv.tekton_dashboard,
        };
    }

    // const INTERNAL_BUILD_RX: RegExp = /^\d{4}_M\d+_[EI]/;

    /**
     * Parses a version number out of the given env data. If it's a development build, returns Number.MAX_SAFE_INTEGER.
     *
     * **Throws an error** if the version is not supported.
     */
    export function getVersionNumber(envData: RawCWEnvData): number {
        if (envData.codewind_version === "latest") {      // non-nls
            // This means it's being hosted by an internal MC dev.
            // There's nothing we can do here but assume they have all the features we need.
            Log.i("Dev version");
            return Number.MAX_SAFE_INTEGER;
        }
        return Number(envData.codewind_version);
        // else if (rawVersion.match(INTERNAL_BUILD_RX) != null) {
        //     Log.i("Internal version");
        //     return Number.MAX_SAFE_INTEGER;
        // }
        // else {
        //     const versionNum = Number(rawVersion);
        //     if (isNaN(versionNum)) {
        //         Log.e("Couldn't convert provided version to Number, version is: " + rawVersion);
        //         throw new Error(Translator.t(STRING_NS, "versionNotRecognized", { rawVersion: rawVersion, requiredVersion: REQUIRED_VERSION_STR}));
        //     }
        //     else if (versionNum < REQUIRED_VERSION) {
        //         Log.e(`Backend version ${versionNum} is too old.`);
        //         throw new Error(Translator.t(STRING_NS, "versionTooOld", { rawVersion: rawVersion, requiredVersion: REQUIRED_VERSION_STR}));
        //     }
        //     return versionNum;
        // }
    }

    export function getVersionAsString(versionNum: number): string {
        if (versionNum === Number.MAX_SAFE_INTEGER) {
            return "latest";
        }
        else {
            // add this back when we switch back to yy.mm
            /*
            const year = Math.floor(versionNum / 100);
            const month = versionNum % 100;
            return `${year}.${month < 10 ? "0" + month : month}`;
            */
            return versionNum.toString();
        }
    }

    /**
     * @returns If the given Connection matches the given environment data for fields the tools are interested in.
     */
    // export function envMatches(connection: Connection, envData: IMCEnvData): boolean {
    //     let newVersionNumber;
    //     try {
    //         newVersionNumber = getVersionNumber(envData);
    //     }
    //     catch (err) {
    //         Log.w(err);
    //         return false;
    //     }

    //     return connection.version === newVersionNumber;
    //         // should check workspace too, but need to consider platform when comparing paths
    //         // more to check once we support ICP
    //         // envData.user_string
    // }
}

export default CWEnvironment;
