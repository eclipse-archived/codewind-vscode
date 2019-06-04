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

import * as vscode from "vscode";
import * as request from "request-promise-native";

import InstallerWrapper, { InstallerCommands } from "../microclimate/connection/InstallerWrapper";
import Log from "../Logger";
import * as MCUtil from "../MCUtil";
import ConnectionManager from "../microclimate/connection/ConnectionManager";

export const CW_URL = vscode.Uri.parse("http://localhost:9090");

export default async function startCodewindCmd(): Promise<void> {
    try {
        await startCodewind();
        // force tree refresh
        setTimeout(() => ConnectionManager.instance.onChange(undefined), 1000);
    }
    catch (err) {
        if (!InstallerWrapper.isCancellation(err)) {
            Log.e("Error starting codewind", err);
            vscode.window.showErrorMessage(MCUtil.errToString(err));
        }
    }
}

/**
 * Installs and starts Codewind, if required. Will exit immediately if already started.
 * Throws errors so we wrap this in the the command handler
 */
export async function startCodewind(): Promise<void> {
    if (await isCodewindActive()) {
        // nothing to do
        Log.i("Codewind is already started");
        return;
    }

    Log.i("Initial Codewind ping failed");

    if (InstallerWrapper.isInstallerRunning()) {
        throw new Error("Please wait for the current operation to finish.");
    }

    if (await InstallerWrapper.isInstallRequired()) {
        Log.i("Codewind is not installed");
        const installAffirmBtn = "Install";
        const moreInfoBtn = "More Info";

        let response;
        if (process.env.CW_ENV === "test") {
            response = installAffirmBtn;
        }
        else {
            Log.d("Prompting for install confirm");
            response = await vscode.window.showInformationMessage(
                `The Codewind backend needs to be installed before the extension can be used. ` +
                `This downloads the Codewind Docker images, which are about 1GB in size.`,
                { modal: true }, installAffirmBtn, moreInfoBtn,
            );
        }

        if (response === installAffirmBtn) {
            await InstallerWrapper.installerExec(InstallerCommands.INSTALL);
        }
        else {
            if (response === moreInfoBtn) {
                vscode.window.showInformationMessage("More info not implemented");
            }
            throw new Error("Codewind cannot be used until the backend is installed.");
        }
    }
    await InstallerWrapper.installerExec(InstallerCommands.START);

    Log.i("Codewind should have started, getting ENV data now");
    vscode.window.showInformationMessage("Codewind was started successfully");
}

async function isCodewindActive(): Promise<boolean> {
    // TODO use proper health endpoint
    try {
        await request.get(CW_URL.with({ path: "api/v1/projects" }).toString(), {
            timeout: 1000,
        });
        Log.i("Good response from healthcheck");
        return true;
    }
    catch (err) {
        Log.d("Health error response", err);
        return false;
    }
}
