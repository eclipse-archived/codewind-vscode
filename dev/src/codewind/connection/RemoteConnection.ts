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
import ConnectionOverview from "../../command/webview/ConnectionOverviewPageWrapper";
import { ConnectionStates, ConnectionState } from "./ConnectionState";
import { CLICommandRunner, AccessToken } from "./CLICommandRunner";
import Log from "../../Logger";
import { ConnectionMemento } from "./ConnectionMemento";
import { CreateFileWatcher, FileWatcher } from "codewind-filewatcher";
import { FWAuthToken } from "codewind-filewatcher/lib/FWAuthToken";

export default class RemoteConnection extends Connection {

    private _username: string;

    private updateCredentialsPromise: Promise<void> = Promise.resolve();
    // private _username: string | undefined;
    private _accessToken: AccessToken | undefined;

    private _activeOverviewPage: ConnectionOverview | undefined;

    /**
     * Do not allow toggling (enabling or disabling) the connection when a toggle is already in progress
     */
    private currentToggleOperation: "connecting" | "disconnecting" | undefined;

    constructor(
        ingressUrl: vscode.Uri,
        memento: ConnectionMemento,
        password?: string,
    ) {
        super(memento.id, ingressUrl, memento.label, true);

        this._username = memento.username;

        if (password) {
            Log.i("Doing initial credentials update for new connection");
            this.updateCredentialsPromise = this.updateCredentials(memento.username, password);
        }
    }

    public async enable(): Promise<void> {
        if (!this.shouldToggle()) {
            return;
        }
        this.currentToggleOperation = "connecting";
        try {
            await this.enableInner();
        }
        catch (err) {
            throw err;
        }
        finally {
            this.currentToggleOperation = undefined;
        }
    }

    private async enableInner(): Promise<void> {
        Log.d(`${this.label} starting remote enable`);

        let token: string;
        try {
            token = (await this.getAccessToken()).access_token;
        }
        catch (err) {
            this.setState(ConnectionStates.AUTH_ERROR);
            throw err;
        }

        try {
            await super.enable();
            if (!this._socket) {
                throw new Error(`${this.label} socket was undefined after enabling appeared to succeed`);
            }
        }
        catch (err) {
            this.setState(ConnectionStates.DISABLED);
            throw err;
        }

        try {
            await this._socket.authenticate(token);
        }
        catch (err) {
            this.setState(ConnectionStates.AUTH_ERROR);
            throw err;
        }

        this.setState(ConnectionStates.READY);
        Log.d(`${this} finished remote enable`);
    }

    public async disable(): Promise<void> {
        if (!this.shouldToggle()) {
            return;
        }
        this.currentToggleOperation = "disconnecting";
        try {
            await super.disable();
            this.setState(ConnectionStates.DISABLED);
        }
        catch (err) {
            throw err;
        }
        finally {
            this.currentToggleOperation = undefined;
        }
    }

    public async dispose(): Promise<void> {
        if (this.overviewPage) {
            this.overviewPage.dispose();
        }
        if (this.sourcesPage) {
            this.sourcesPage.dispose();
        }
        if (this.registriesPage) {
            this.registriesPage.dispose();
        }
        await super.dispose();
    }

    protected async createFileWatcher(cliPath: string): Promise<FileWatcher> {
        return CreateFileWatcher(this.url.toString(), Log.getLogDir, undefined, cliPath, {
            getLatestAuthToken: (): FWAuthToken | undefined => {
                if (!this._accessToken) {
                    return undefined;
                }
                return new FWAuthToken(this._accessToken.access_token, this._accessToken.token_type);
            },
            informReceivedInvalidAuthToken: () => {
                this._accessToken = undefined;
                // Invalidate and retart the process of getting a new access token
                this.getAccessToken();
            }
        });
    }

    /**
     * Returns true if there is NOT currently an enable/disable operation in progress.
     * If there is one, shows a message, and enable/disable should be blocked by the caller.
     */
    private shouldToggle(): boolean {
        if (this.currentToggleOperation) {
            vscode.window.showWarningMessage(`${this.label} is already ${this.currentToggleOperation}.`);
            return false;
        }
        return true;
    }

    protected setState(newState: ConnectionState): void {
        super.setState(newState);
        this.tryRefreshOverview();
    }

    public async updateCredentials(username: string, password: string): Promise<void> {
        Log.i(`Updating keyring credentials for ${this}`);
        this._username = username;
        await ConnectionMemento.save(this.memento);
        // Invalidate the old access token which used the old credentials
        this.updateCredentialsPromise = CLICommandRunner.updateKeyringCredentials(this.id, username, password);
        this._accessToken = undefined;

        if (this.state !== ConnectionStates.DISABLED) {
            try {
                Log.d(`Refreshing access token after credentials update`);
                await this.getAccessToken();
            }
            catch (err) {
                // Nothing, getAccessToken will display the error
            }
        }
        Log.i("Finished updating keyring credentials");
        this.tryRefreshOverview();
    }

    public async getAccessToken(): Promise<AccessToken> {

        // if a credential update is in progress, let that complete before trying to get the access token, or we'll get an invalid result
        await this.updateCredentialsPromise;

        if (this._accessToken) {
            return this._accessToken;
        }

        Log.d(`${this.label} looking up access token for user "${this._username}"`);
        try {
            this._accessToken = await CLICommandRunner.getAccessToken(this.id, this._username);
            if (this._socket && this._socket.isConnected && !this._socket.isAuthorized) {
                await this._socket.authenticate(this._accessToken.access_token);
            }
            if (this.state === ConnectionStates.AUTH_ERROR) {
                this.setState(ConnectionStates.READY);
            }
            return this._accessToken;
        }
        catch (err) {
            const errMsg = `Error getting access token for ${this.label}`;
            Log.e(errMsg, err);
            // vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);

            this._accessToken = undefined;
            this.setState(ConnectionStates.AUTH_ERROR);
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
        };
    }

    public async refresh(): Promise<void> {
        if (this.isConnected) {
            await super.refresh();
            return;
        }
        if (!this.shouldToggle()) {
            return;
        }
        await this.disable();
        await this.enable();
    }

    public get overviewPage(): ConnectionOverview | undefined {
        return this._activeOverviewPage;
    }

    public onDidOpenOverview(overviewPage: ConnectionOverview): void {
        this._activeOverviewPage = overviewPage;
    }

    public onDidCloseOverview(): void {
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
