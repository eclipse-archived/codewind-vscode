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
    ) {

    }
}

// tslint:disable-next-line: variable-name
export const ConnectionStates = {
    CONNECTED:      new ConnectionState(true, true),
    NETWORK_ERROR:  new ConnectionState(false, true),
    // Explicitly disabled by user - only applies to remote connections
    DISABLED:       new ConnectionState(false, false),
    // REGISTRY_ERROR: new ConnectionState(true, true),
    AUTH_ERROR:     new ConnectionState(false, true),
};
