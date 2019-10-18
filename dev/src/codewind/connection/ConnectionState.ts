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

export class ConnectionState {
    constructor(
        public readonly isConnected: boolean,
    ) {

    }
}

// tslint:disable-next-line: variable-name
export const ConnectionStates = {
    CONNECTED:      new ConnectionState(true),
    DISCONNECTED:   new ConnectionState(false),
};

// The RemoteConnectionStates are a superset of ConnectionStates
// tslint:disable-next-line: variable-name
export const RemoteConnectionStates = Object.assign(ConnectionStates, {
    DISABLED:       new ConnectionState(false),
    // REGISTRY_ERROR: new ConnectionState(true, "Registry error"),
    AUTH_ERROR:     new ConnectionState(false),
});
