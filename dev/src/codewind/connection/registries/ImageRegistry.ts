/*******************************************************************************
 * Copyright (c) 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

export default class ImageRegistry {
    private _isPushRegistry: boolean = false;

    constructor(
        public readonly address: string,
        public readonly username: string,
        private _namespace: string = "",
    ) {

    }

    public toString(): string {
        return `${this.username}@${this.fullAddress}`;
    }

    public get isPushRegistry(): boolean {
        return this._isPushRegistry;
    }

    public set isPushRegistry(isPushRegistry: boolean) {
        this._isPushRegistry = isPushRegistry;
    }

    public get namespace(): string {
        return this._namespace;
    }

    public set namespace(ns: string) {
        this._namespace = ns;
    }

    public get fullAddress(): string {
        if (this.namespace) {
            return `${this.address}/${this.namespace}`;
        }
        return this.address;
    }
}
