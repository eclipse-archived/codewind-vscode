/*******************************************************************************
 * Copyright (c) 2018, 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import i18next, { TFunction, TOptions } from "i18next";
import * as path from "path";
import * as fs from "fs-extra";

import Log from "../../Logger";
import StringNamespaces from "./StringNamespaces";

namespace Translator {

    let _t: TFunction;

    /**
     * Use i18next to translate the given string as "$namespace.key".
     * Must explicitly call init before calling this.
     */
    export function t(namespace: StringNamespaces, key: string, options?: TOptions): string {
        const hasNamespace = namespace != null && namespace.length > 0;
        const fullKey = hasNamespace ? `${namespace}.${key}` : key;

        if (_t == null) {
            // init has not been called, or there was an init error
            Log.e(`i18next was not initialized, returning key "${fullKey}"`);
            return fullKey;
        }

        return _t(fullKey, options);
    }

    /**
     * Must call this before calling t
     */
    export async function init(): Promise<TFunction> {
        const defaultStringsFile = path.resolve(global.__extRoot, "translations", "en.json");
        const defaultStringsFileContents = await fs.readFile(defaultStringsFile);
        const defaultStrings: {
            [key: string]: string;
        } = JSON.parse(defaultStringsFileContents.toString());

        const ns = "codewind";

        _t = await i18next.init({
            // only support english
            lng: "en",
            fallbackLng: "en",
            ns,
            defaultNS: ns,
            // debug: true,
            saveMissing: true,
            resources: {
                en: {
                    [ns]: defaultStrings
                }
            }
        });

        return _t;
    }
}

export default Translator;
