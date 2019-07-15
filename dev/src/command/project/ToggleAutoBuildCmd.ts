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

import Project from "../../microclimate/project/Project";
import Requester from "../../microclimate/project/Requester";

export default async function toggleAutoBuildCmd(project: Project): Promise<void> {
    return Requester.requestToggleAutoBuild(project);
}
