/*******************************************************************************
 * Copyright (c) 2019, 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import Log from "../../Logger";
import Connection from "./Connection";
import Requester from "../Requester";
import MCUtil from "../../MCUtil";
import ConnectionOverviewWrapper from "../../command/webview/ConnectionOverviewPageWrapper";
import { ConnectionStates, ConnectionState } from "./ConnectionState";
import { CLICommandRunner } from "../cli/CLICommandRunner";
import { CreateFileWatcher, FileWatcher } from "codewind-filewatcher";
import { FWAuthToken } from "codewind-filewatcher/lib/FWAuthToken";
import { ConnectionMemento } from "./ConnectionMemento";
import { AccessToken, CLIConnectionData } from "../Types";

type ToggleOperation = "connecting" | "disconnecting" | undefined;

export default class RemoteConnection extends Connection {

    private _username: string;

    private updateCredentialsPromise: Promise<void> = Promise.resolve();
    // private _username: string | undefined;
    private _accessToken: AccessToken | undefined;

    private _activeOverviewPage: ConnectionOverviewWrapper | undefined;

    /**
     * Do not allow toggling (enabling or disabling) the connection when a toggle is already in progress
     */
    private currentToggleOperation: ToggleOperation;

    constructor(
        ingressUrl: vscode.Uri,
        cliData: CLIConnectionData,
    ) {
        super(cliData.id, ingressUrl, cliData.label, true);
        this._username = cliData.username;
    }

    public async enable(): Promise<void> {
        if (!this.changeTogglingEnablement("connecting")) {
            return;
        }

        try {
            await this.enableInner();
        }
        catch (err) {
            throw err;
        }
        finally {
            this.changeTogglingEnablement(undefined);
        }
    }

    private async enableInner(): Promise<void> {
        Log.d(`${this.label} starting remote enable`);

        // Make sure the ingress is reachable before trying anything else
        // https://github.com/eclipse/codewind/issues/1547
        let canPing = false;
        try {
            canPing = await Requester.pingKube(this.url, 5000);
        }
        catch (err) {
            // ping failed
        }

        if (!canPing) {
            this.setState(ConnectionStates.NETWORK_ERROR);
            throw new Error(`Failed to connect to ${this.url}. Make sure the Codewind instance is running, and reachable from your machine.`);
        }

        if ((await this.getAccessToken()) == null) {
            this.setState(ConnectionStates.AUTH_ERROR);
            throw new Error(`Authentication error. Make sure your credentials are correct, ` +
                `and that "${this.username}" has access to this Codewind instance.`);
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

        this.setState(ConnectionStates.READY);
        Log.d(`${this} finished remote enable`);
    }

    public async disable(): Promise<void> {
        if (!this.changeTogglingEnablement("disconnecting")) {
            return;
        }

        try {
            await super.disable();
            this._accessToken = undefined;
            this.setState(ConnectionStates.DISABLED);
        }
        catch (err) {
            throw err;
        }
        finally {
            this.changeTogglingEnablement(undefined);
        }
    }

    public async dispose(): Promise<void> {
        this.overviewPage?.dispose();
        await super.dispose();
    }

    public async onConnect(): Promise<void> {
        if (!this._socket) {
            // Not possible because onConnect is invoked by the socket
            Log.e(`${this.label} socket was undefined in onConnect`);
            return;
        }

        try {
            const token = (await this.getAccessToken()).access_token;
            await this._socket.authenticate(token);
        }
        catch (err) {
            this.setState(ConnectionStates.AUTH_ERROR);
            vscode.window.showErrorMessage(`Error connecting to ${this.label}: ${MCUtil.errToString(err)}`);
        }
        finally {
            await super.onConnect();
        }
    }

    public async onDisconnect(): Promise<void> {
        this._accessToken = undefined;
        await super.onDisconnect();
    }

    protected async createFileWatcher(cliPath: string): Promise<FileWatcher> {
        return CreateFileWatcher(this.url.toString(), cliPath, Log.getLogDir, undefined, {
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
     * @returns if the toggle operation was successfully changed.
     */
    private changeTogglingEnablement(toggleOperation: ToggleOperation): boolean {
        if (toggleOperation != null && this.currentToggleOperation) {
            vscode.window.showWarningMessage(`${this.label} is already ${this.currentToggleOperation}.`);
            return false;
        }
        this.currentToggleOperation = toggleOperation;
        this._activeOverviewPage?.onToggleStatusChanged();
        return true;
    }

    /**
     * Returns true if there IS currently an enable/disable operation in progress.
     * If there is one, shows a message, and enable/disable should be blocked by the caller.
     */
    public isTogglingEnablement(): boolean {
        if (this.currentToggleOperation) {
            return true;
        }
        return false;
    }

    protected setState(newState: ConnectionState): void {
        super.setState(newState);
        this.tryRefreshOverview();
    }

    public async updateCredentials(username: string, password: string): Promise<void> {
        Log.i(`Start updateCredentials for ${this}`);

        this._username = username;
        await ConnectionMemento.save(this.cliData);

        // Just in case there are multiple quick credentials updates
        await this.updateCredentialsPromise;

        // Invalidate the old access token which used the old credentials
        this._accessToken = undefined;
        this.updateCredentialsPromise = CLICommandRunner.updateKeyringCredentials(this.id, username, password);
        await this.updateCredentialsPromise;
        Log.i("Finished updating keyring credentials");

        try {
            if (this.state !== ConnectionStates.DISABLED) {
                Log.d(`Refreshing access token after credentials update`);
                await this.getAccessToken();
            }
        }
        finally {
            this.tryRefreshOverview();
            Log.d(`Finished updateCredentials`);
        }
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
            if (this.state === ConnectionStates.AUTH_ERROR) {
                this.setState(ConnectionStates.READY);
                await this.refresh();
            }
            return this._accessToken;
        }
        catch (err) {
            this._accessToken = undefined;
            this.setState(ConnectionStates.AUTH_ERROR);
            throw err;
        }
    }

    public get username(): string {
        return this._username;
    }

    public get cliData(): CLIConnectionData {
        return {
            id: this.id,
            label: this.label,
            url: this.url.toString(),
            username: this._username,
        };
    }

    public async refresh(): Promise<void> {
        if (this.isConnected) {
            await super.refresh();
            return;
        }
        if (this.isTogglingEnablement()) {
            return;
        }
        await this.disable();
        await this.enable();
    }

    public get overviewPage(): ConnectionOverviewWrapper | undefined {
        return this._activeOverviewPage;
    }

    public onDidOpenOverview(overviewPage: ConnectionOverviewWrapper): void {
        this._activeOverviewPage = overviewPage;
    }

    public onDidCloseOverview(): void {
        if (this._activeOverviewPage) {
            this._activeOverviewPage = undefined;
        }
    }

    public tryRefreshOverview(): void {
        if (this._activeOverviewPage) {
            this._activeOverviewPage.refresh();
        }
    }
}
