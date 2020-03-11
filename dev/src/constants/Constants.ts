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

namespace Constants {
    /**
     * The Codewind image version for latest builds. Used on development branches.
     */
    export const CODEWIND_IMAGE_VERSION_DEV = "latest";

    /**
     * The Codewind image version when starting local Codewind.
     * Change this on release branches to match the release, eg. "0.9.0"
     */
    export const CODEWIND_IMAGE_VERSION = CODEWIND_IMAGE_VERSION_DEV;

    export const APPSODY_VERSION = "0.5.9";

    export const PROJ_SETTINGS_FILE_NAME = ".cw-settings";
    export const DOT_CODEWIND_DIR = ".codewind";

    export const CHE_WORKSPACEID_ENVVAR = "CHE_WORKSPACE_ID";
    export const CHE_API_EXTERNAL_ENVVAR = "CHE_API_EXTERNAL";

    export const CW_ENV_VAR = "CW_ENV";
    export const CW_ENV_DEV = "dev";
    export const CW_ENV_TEST = "test";
    export const CW_ENV_TAG_VAR = "CW_TAG";

    /**
     * Set this env var to anything to disable the cwctl shasum check
     */
    export const ENV_CWCTL_DEVMODE = "CWCTL_DEV";
    /**
     * Set this env var to anything to disable the appsody version check
     */
    export const ENV_APPSODY_DEVMODE = "APPSODY_DEV";
}

export default Constants;
