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
        public readonly hasChildrenInTree: boolean,
        public readonly asString: string,
    ) {

    }

    public toString(): string {
        return this.asString;
    }
}

// tslint:disable-next-line: variable-name
export const ConnectionStates = {
    INITIALIZING:   new ConnectionState(false, true, "Connecting..."),
    CONNECTED:      new ConnectionState(true, true, "Connected"),
    NETWORK_ERROR:  new ConnectionState(false, true, "Network Error"),
    // Explicitly disabled by user - only applies to remote connections
    DISABLED:       new ConnectionState(false, false, "Disabled"),
    // REGISTRY_ERROR: new ConnectionState(true, true),
    AUTH_ERROR:     new ConnectionState(false, true, "Auth Error"),
};
