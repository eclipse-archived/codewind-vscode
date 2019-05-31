/*******************************************************************************
 * Copyright (c) 2018 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as i18next from "i18next";
import * as i18nextBackend from "i18next-node-fs-backend";
import * as path from "path";

import Log from "../../Logger";
import StringNamespaces from "./StringNamespaces";

export default class Translator {

    private static _t: i18next.TranslationFunction;

    /**
     * Use i18next to translate the given string as "$namespace.key".
     * Must explicitly call init before calling this.
     */
    public static t(namespace: StringNamespaces, key: string, options?: i18next.TranslationOptions): string {
        const hasNamespace = namespace != null && namespace.length > 0;
        const fullKey = hasNamespace ? `${namespace}.${key}` : key;

        if (this._t == null) {
            // init has not been called, or there was an init error
            Log.e(`i18next was not initialized, returning key "${fullKey}"`);
            return fullKey;
        }

        // _t returns 'any', but seems to always be string. Handle that here so that caller can assume it's a string.
        const tResult = this._t(fullKey, options);

        if (typeof tResult === typeof "") {
            if (tResult === fullKey) {
                Log.e(`Did not find string with key: ${fullKey}`);
            }
            return tResult as string;
        }
        else {
            // Don't think this will ever happen
            Log.e(`Unexpected result from translation function, type is ${typeof tResult}, result is:`, tResult);
            return fullKey;
        }
    }

    /**
     * Must call this before calling t
     */
    public static init(): Promise<i18next.TranslationFunction> {
        return new Promise<i18next.TranslationFunction>( (resolve, reject) => {
            i18next
                .use(i18nextBackend)        // required so we can load strings from filesystem
                .init({
                    // only support english
                    lng: "en",
                    fallbackLng: "en",
                    // debug: true,
                    saveMissing: true,
                    backend: {
                        loadPath: path.join(__dirname, "strings-{{lng}}.json")
                    }
                }, (err: any, translationFn: i18next.TranslationFunction) => {
                    if (err != null) {
                        return reject(err);
                    }
                    else {
                        Log.i("i18next initialized");
                        this._t = translationFn;
                        return resolve(translationFn);
                    }
                });
        });
    }
}
