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

/**
 * The data that is displayed and editable in the Connection Overview
 */
export interface IRemoteCodewindInfo {
    readonly label: string;
    readonly ingressHost?: string;
    readonly username?: string;
    readonly registryUrl?: string;
    readonly registryUsername?: string;
}

/**
 * The remote connection has all the same behaviour as the local one,
 * plus some extra data fields and functions to modify those.
 */
export default class RemoteConnection extends Connection {

    public static readonly REMOTE_CODEWIND_PROTOCOL: string = "http";

    private _activeOverviewPage: ConnectionOverview | undefined;

    constructor(
        public readonly url: vscode.Uri,
        public readonly label: string,
        // TODO username should not be optional
        private _username?: string,
        private _registryUrl?: string,
        private _registryUsername?: string,
    ) {
        super(url, label, true);
    }

    public async enable(): Promise<void> {
        await super.enable();
    }

    public async disable(): Promise<void> {
        await super.disable();
        this._state = ConnectionStates.DISABLED;
    }

    public set username(username: string | undefined) {
        this._username = username;
    }

    // TODO username should not be optional
    public get username(): string | undefined {
        return this._username;
    }

    public set registryUrl(url: string | undefined) {
        // ask user if they wish to test the registry
        // Requester.setRegistry(this, url);
        this._registryUrl = url;
    }

    public get registryUrl(): string | undefined {
        return this._registryUrl;
    }

    public set registryUsername(registryUsername: string | undefined) {
        // TODO communicate the changed registry username to the cli
        this._registryUsername = registryUsername;
    }

    public get registryUsername(): string | undefined {
        return this._registryUsername;
    }

    public getRemoteInfo(): IRemoteCodewindInfo {
        return {
            label: this.label,
            registryUrl: this.registryUrl,
            registryUsername: this.registryUsername,
            ingressHost: this.url.authority,
            username: this.username,
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
            this._activeOverviewPage.refresh(this.getRemoteInfo());
        }
    }
}
