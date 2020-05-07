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

    export const PROJ_SETTINGS_FILE_NAME = ".cw-settings";

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

    /**
     * This is checked on activation to see if there are any projects that should have been removed, 
     * but were not due to the extension reloading.
     * See Project.onDeletionEvent
     */
    export const DIR_TO_DELETE_KEY = "project-dir-to-delete";
}

export default Constants;
