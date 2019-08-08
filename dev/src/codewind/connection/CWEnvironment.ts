

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
import * as reqErrors from "request-promise-native/errors";

import { MCEndpoints } from "../../constants/Endpoints";
import Requester from "../project/Requester";
import Log from "../../Logger";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";

// From https://github.com/eclipse/codewind/blob/master/src/pfe/portal/routes/environment.route.js
export interface ICWEnvData {
    devops_available: boolean;
    editor_url: string;
    codewind_version: string;
    os_platform: string;
    running_on_icp: boolean;
    socket_namespace?: string;
    user_string?: string;
    workspace_location: string;
    tekton_dashboard_url: string;
}

namespace CWEnvironment {

    /**
     * Get the environment data for a Codewind instance at the given url.
     * Separate from normal Requester code because we do not yet have a Connection instance at this point.
     */
    export async function getEnvData(url: Uri): Promise<ICWEnvData> {
        const envUri: Uri = url.with({ path: MCEndpoints.ENVIRONMENT });
        const connectTimeout = 2500;

        try {
            const result = await Requester.get(envUri.toString(), { timeout: connectTimeout });
            return result;
        }
        catch (err) {
            Log.i(`Connection ENV Request fail - ${err}`);
            // With the new install/start being abstracted away from the user, they should not have to see this message.
            if (err instanceof reqErrors.RequestError) {
                throw new Error(Translator.t(StringNamespaces.DEFAULT, "connectFailed", { uri: url }));
            }
            throw err;
        }
    }

    // const INTERNAL_BUILD_RX: RegExp = /^\d{4}_M\d+_[EI]/;

    /**
     * Parses a version number out of the given env data. If it's a development build, returns Number.MAX_SAFE_INTEGER.
     *
     * **Throws an error** if the version is not supported.
     */
    export function getVersionNumber(_envData: ICWEnvData): number {
        // TODO when we have versioning in codewind
        return Number.MAX_SAFE_INTEGER;

        // if (rawVersion === "latest") {      // non-nls
        //     // This means it's being hosted by an internal MC dev.
        //     // There's nothing we can do here but assume they have all the features we need.
        //     Log.i("Dev version");
        //     return Number.MAX_SAFE_INTEGER;
        // }
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
            const year = Math.floor(versionNum / 100);
            const month = versionNum % 100;
            return `${year}.${month < 10 ? "0" + month : month}`;
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
