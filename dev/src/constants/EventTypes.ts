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

// non-nls-file

/**
 * List of Socket.io event types from Portal that we're interested in.
 */
enum EventTypes {
    PROJECT_CHANGED = "projectChanged",
    PROJECT_STATUS_CHANGED = "projectStatusChanged",
    PROJECT_CLOSED = "projectClosed",
    PROJECT_DELETION = "projectDeletion",
    PROJECT_RESTART_RESULT = "projectRestartResult",
    CONTAINER_LOGS = "container-logs",
    PROJECT_VALIDATED = "projectValidated",
    PROJECT_CREATION = "projectCreation"
}

export default EventTypes;
