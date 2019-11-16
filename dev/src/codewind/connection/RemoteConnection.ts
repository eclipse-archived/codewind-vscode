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

import Connection from "./Connection";
import ConnectionOverview from "../../command/webview/ConnectionOverview";
import { ConnectionStates } from "./ConnectionState";
import { CLICommandRunner } from "./CLICommandRunner";
import Log from "../../Logger";
import { ConnectionMemento } from "./ConnectionMemento";
import MCUtil from "../../MCUtil";

export default class RemoteConnection extends Connection {

    private _username: string;
    private _registryUrl: string | undefined;
    private _registryUsername: string | undefined;

    private updateCredentialsPromise: Promise<void> = Promise.resolve();
    // private _username: string | undefined;
    private _accessToken: string | undefined;

    private _activeOverviewPage: ConnectionOverview | undefined;

    constructor(
        ingressUrl: vscode.Uri,
        memento: ConnectionMemento,
        password?: string,
    ) {
        super(memento.id, ingressUrl, memento.label, true);

        this._username = memento.username;
        this._registryUrl = memento.registryUrl;
        this._registryUsername = memento.registryUsername;

        if (password) {
            Log.i("Doing initial credentials update for new connection");
            this.updateCredentialsPromise = this.updateCredentials(memento.username, password);
        }
    }

    public async enable(): Promise<void> {
        try {
            await this.updateCredentialsPromise;
            const token = await this.getAccessToken();
            await super.enable();
            if (!this._socket) {
                throw new Error(`${this.label} socket was undefined after enabling`);
            }
            await this._socket.authenticate(token);
        }
        catch (err) {
            // if the initial enablement fails, we use DISABLED instead of NETWORK_ERROR
            // so the user sees the connection has to be re-connected by hand after fixing the problem
            this._state = ConnectionStates.DISABLED;
            throw err;
        }
    }

    public async disable(): Promise<void> {
        await super.disable();
        this._state = ConnectionStates.DISABLED;
    }

    public async updateCredentials(username: string, password: string): Promise<void> {
        Log.i(`Updating keyring credentials for ${this}`);
        this._username = username;
        this.updateCredentialsPromise = CLICommandRunner.updateKeyringCredentials(this.id, username, password);
        await this.updateCredentialsPromise;
        // invalidate the access token
        this._accessToken = undefined;
        Log.i("Finished updating keyring credentials");
        await ConnectionMemento.save(this.memento);
    }

    public async updateRegistry(registryUrl: string, registryUser: string, _registryPass: string): Promise<void> {
        // TODO create the secret, test the registry
        this._registryUrl = registryUrl;
        this._registryUsername = registryUser;
        Log.d(`Update registry for ${this.label}`);
        await ConnectionMemento.save(this.memento);
    }

    public async getAccessToken(): Promise<string> {
        // if a credential update is in progress, let that complete before trying to get the access token, or we'll get an invalid result
        await this.updateCredentialsPromise;

        if (this._accessToken) {
            return this._accessToken;
        }

        Log.d(`Looking up access token for user ${this._username}`);
        try {
            this._accessToken = await CLICommandRunner.getAccessToken(this.id, this._username);
            this._state = ConnectionStates.CONNECTED;
            return this._accessToken;
        }
        catch (err) {
            const errMsg = `Error authenticating for ${this.label}`;
            Log.e(errMsg, err);
            vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);

            this._accessToken = undefined;
            this._state = ConnectionStates.AUTH_ERROR;
            throw err;
        }
    }

    public get username(): string {
        return this._username;
    }

    public get memento(): ConnectionMemento {
        return {
            id: this.id,
            label: this.label,
            ingressUrl: this.url.toString(),
            username: this._username,
            registryUrl: this._registryUrl,
            registryUsername: this._registryUsername,
        };
    }

    public get activeOverviewPage(): ConnectionOverview | undefined {
        return this._activeOverviewPage;
    }

    public onOverviewOpened(overviewPage: ConnectionOverview): void {
        this._activeOverviewPage = overviewPage;
    }

    public onOverviewClosed(): void {
        if (this._activeOverviewPage) {
            this._activeOverviewPage = undefined;
        }
    }

    public tryRefreshOverview(): void {
        if (this._activeOverviewPage) {
            this._activeOverviewPage.refresh(this.memento);
        }
    }
}
