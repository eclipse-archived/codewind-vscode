/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************
 */

import Log from "../../Logger";
import { CodewindTreeItem } from "../../view/CodewindTree";

export type OnChangeCallbackArgs = CodewindTreeItem | undefined;

export default class CodewindEventListener {

    private static readonly listeners: Array<( (changed: OnChangeCallbackArgs) => void )> = [];

    public static addOnChangeListener(callback: (changed: OnChangeCallbackArgs) => void): void {
        Log.i("Adding onChangeListener " + callback.name);
        CodewindEventListener.listeners.push(callback);
    }

    /**
     * Call this whenever a connection is added, removed, or changed.
     * Pass the item that changed (Connection or Project) or undefined for the tree's root.
     */
    public static onChange = (changed: OnChangeCallbackArgs): void => {
        // Log.d(`There was a change, notifying ${this.listeners.length} listeners`);
        CodewindEventListener.listeners.forEach((cb) => cb(changed));
    }
}
