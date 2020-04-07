/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/


// non-nls-file

// This allows extending the Global namespace so we can have our own global variables.
// The only reason to add stuff here is if we can set it once in extension.activate,
// and then never modify it again (only read).
declare namespace NodeJS {
    export interface Global {
        // Hold the path to the plugin's root folder,
        // so files don't each have to write their own logic to locate it using relative paths.
        // This is the folder which contains /src and /res, for example.
        EXTENSION_ROOT: string,

        /**
         * If true, the extension is running in Theia, else it is running in VS Code.
         */
        IS_THEIA: boolean,
        /**
         * If true, the extension is running in Theia in Che.
         */
        IS_CHE: boolean,

        // For some reason, importing anything at the top of this file causes all the properties declared here to not work anymore.
        // So, we use 'any' for extGlobalState - but it's a vscode.Memento.
        // extGlobalState: vscode.Memento
        EXT_GLOBAL_STATE: any,

        /**
         * The running version of this extension, eg "0.7.0"
         */
        EXT_VERSION: string,

        CODEWIND_IMAGE_TAG: string,

        APPSODY_VERSION: string,
    }
}
