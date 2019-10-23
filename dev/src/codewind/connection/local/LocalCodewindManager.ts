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

import { CodewindStates } from "./CodewindStates";
import CLIWrapper from "../CLIWrapper";
import MCUtil from "../../../MCUtil";
import Log from "../../../Logger";
import Requester from "../../project/Requester";
import Resources from "../../../constants/Resources";
import Connection from "../Connection";
import { CLILifecycleWrapper } from "./CLILifecycleWrapper";
import CodewindEventListener from "../CodewindEventListener";
import ConnectionManager from "../ConnectionManager";

const CHE_CW_URL = "https://localhost:9090";

/**
 * The Local Codewind connection also has the responsibility of managing the local Codewind containers' lifecycle
 */
export default class LocalCodewindManager {

    private static _instance: LocalCodewindManager;

    private _localConnection: Connection | undefined;
    private _state: CodewindStates = CodewindStates.STOPPED;

    public static get instance(): LocalCodewindManager {
        if (this._instance == null) {
            this._instance = new this();
        }
        return this._instance;
    }

    public get localConnection(): Connection | undefined {
        return this._localConnection;
    }

    public get isStarted(): boolean {
        return this._state === CodewindStates.STARTED || this._state === CodewindStates.STOPPING;
    }

    public get state(): CodewindStates {
        return this._state;
    }

    ///// Start/Stop Codewind /////

    public async startCodewind(): Promise<void> {
        let cwUrl: vscode.Uri;
        try {
            cwUrl = await this.startCodewindInner();
        }
        catch (err) {
            if (!CLIWrapper.isCancellation(err)) {
                vscode.window.showErrorMessage(MCUtil.errToString(err));
            }
            return;
        }

        this.connect(cwUrl);
    }

    public async connect(cwUrl: vscode.Uri): Promise<void> {
        try {
            this._localConnection = await ConnectionManager.instance.connectLocal(cwUrl);
            this.changeState(CodewindStates.STARTED);
        }
        catch (err) {
            Log.e("Error connecting to Codewind after it should have started", err);
            this.changeState(CodewindStates.ERR_CONNECTING);
            vscode.window.showErrorMessage(MCUtil.errToString(err));
        }
    }

    /**
     * Installs and starts Codewind, if required. Will exit immediately if already started.
     * @returns The URL to the running Codewind instance, or undefined if it did not appear to start successfully.
     */
    private async startCodewindInner(): Promise<vscode.Uri> {
        await CLILifecycleWrapper.installAndStart();

        let cwUrl: vscode.Uri | undefined;
        try {
            cwUrl = await CLILifecycleWrapper.getCodewindUrl();
            if (!cwUrl) {
                throw new Error("Could not determine Codewind URL");
            }

        }
        catch (err) {
            Log.e("Error getting URL after Codewind should have started", err);
            this.changeState(CodewindStates.ERR_CONNECTING);
            throw err;
        }
        Log.i("Codewind appears to have started at " + cwUrl);
        return cwUrl;
    }

    public async stopCodewind(): Promise<void> {
        await CLILifecycleWrapper.stop();
        this._localConnection = undefined;
    }

    public changeState(newState: CodewindStates): void {
        Log.d(`Codewind state changing from ${this._state} to ${newState}`);
        this._state = newState;
        CodewindEventListener.onChange(this);
    }

    /**
     * Theia Only -
     * For the theia case where we do not control CW's lifecycle, we simply wait for it to start
     */
    public async waitForCodewindToStartTheia(): Promise<void> {
        // In the che case, we do not start codewind. we just wait for it to come up
        this.changeState(CodewindStates.STARTING);
        Log.i(`In theia; waiting for Codewind to come up on ${CHE_CW_URL}`);
        const cheCwUrl = vscode.Uri.parse(CHE_CW_URL);

        const waitingForReadyProm = Requester.waitForReady(cheCwUrl);
        vscode.window.setStatusBarMessage(`${Resources.getOcticon(Resources.Octicons.sync, true)}` +
            `Waiting for Codewind to start...`, waitingForReadyProm);

        await waitingForReadyProm;
        await this.connect(cheCwUrl);
    }
}
