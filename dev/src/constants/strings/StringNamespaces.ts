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

// All of these must obviously match the namespace object keys in strings.json
// Refer to these so that if the namespace names change we only have to update them here instead of everywhere we use that string.
enum StringNamespaces {
    DEFAULT = "",

    // CMD_NEW_CONNECTION = "newConnectionCmd",
    CMD_OPEN_IN_BROWSER = "openInBrowserCmd",
    CMD_OPEN_LOG = "openLogCmd",
    CMD_MISC = "command",
    CMD_RES_PROMPT = "cmdResourcePrompt",

    DEBUG = "debug",
    LOGS = "logs",
    PROJECT = "project",
    REQUESTS = "requests",
    TREEVIEW = "treeView",
}

export default StringNamespaces;
