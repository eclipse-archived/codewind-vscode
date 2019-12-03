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

import Project from "../../codewind/project/Project";
import Requester from "../../codewind/project/Requester";

export default async function toggleAutoInjectMetricsCmd(project: Project): Promise<void> {
    return Requester.requestToggleAutoInjectMetrics(project);
}
