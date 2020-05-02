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

export enum CodewindStates {
    SETUP = "Setting up",
    ERR_SETUP = "Error setting up",
    STOPPED = "Stopped",
    STARTED = "Started",
    STARTING = "Starting",
    STOPPING = "Stopping",
    INSTALLING = "Installing",
    ERR_INSTALLING = "Error pulling images",
    ERR_STARTING = "Error starting containers",
    ERR_CONNECTING = "Error connecting",
    ERR_GENERIC = "Error",
}
