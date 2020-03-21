/*******************************************************************************
 * Copyright (c) 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

// This is how we determine the tests to run, and order them.

// import * as LSAR from "../local/LocalStopAndRemove.test";

import * as LocalStart from "../local/LocalStart.test";
LocalStart;
import * as TemplateSources from "../connection/TemplateSources.test";
TemplateSources;
import * as Creation from "../project/Creation.test";
Creation;
import * as AutoBuild from "../project/AutoBuild.test";
AutoBuild;
// import * as Miscellaneous from "../project/Miscellaneous.test";
// Miscellaneous;
// import * as Restart from "../project/Restart.test";
// Restart;
import * as Removal from "../project/Removal.test";
Removal;

// import * as LSAR from "../local/LocalStopAndRemove.test";
