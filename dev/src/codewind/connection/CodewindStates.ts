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
    STOPPED = "Stopped",
    STARTED = "Started",
    STARTING = "Starting",
    STOPPING = "Stopping",
    INSTALLING = "Installing",
    ERR_INSTALLING = "Error Installing",
    ERR_STARTING = "Error Starting",
    ERR_CONNECTING = "Error Connecting",
}

export const CODEWIND_STATES: {
    [key in CodewindStates]: {
        isErrorState: boolean;
        isTransitionState: boolean;
    }
} = {
    Stopped:    { isErrorState: false, isTransitionState: false },
    Started:    { isErrorState: false, isTransitionState: false },
    Starting:   { isErrorState: false, isTransitionState: true },
    Stopping:   { isErrorState: false, isTransitionState: true },
    Installing: { isErrorState: false, isTransitionState: true },
    "Error Connecting": { isErrorState: true, isTransitionState: false },
    "Error Installing": { isErrorState: true, isTransitionState: false },
    "Error Starting":   { isErrorState: true, isTransitionState: false },
};
