#!/usr/bin/env node

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

const fs = require("fs");
const util = require("util");
const rimraf = require("rimraf");

const cmdsToDelete = [
    "startCodewind",
    "startCodewind2",
    "stopCodewind",
    "stopCodewind2",
    "removeImages",
    "openFolder",
    "attachDebugger",
    "restartRun",
    "restartDebug",
    "manageLogs",
];

const PACKAGE_JSON_PATH = "./package.json";
const INSTALLER_DIR = "bin/installer";

async function main() {

    const pj = JSON.parse(await util.promisify(fs.readFile)(PACKAGE_JSON_PATH));

    // Delete unwanted commands
    pj.contributes.commands = pj.contributes.commands.filter((cmd) => {
        // If the command's 'command' field matches one of the cmdsToDelete, do not add it to the filtered list
        const matchingCmd = cmdsToDelete.find((s) => cmd.command.includes(s));
        if (matchingCmd) {
            // if (matchingCmd === cmdsToDelete[1] || matchingCmd === cmdsToDelete[3]) {
                // Special case - start2/stop2 are removed from menus only - so that the indicator shows up
                // return true;
            // }
            console.log("Deleting command" + cmd.command);
            return false;
        }
        return true;
    });

    const menus = pj.contributes.menus;
    Object.entries(menus).forEach(([menuTypeId, menuType]) => {
        menuType = menuType.filter((menuItem) => {
            if (cmdsToDelete.some((s) => menuItem.command.includes(s))) {
                console.log(`Deleting menuitem ${menuItem.command} from ${menuTypeId}`);
                return false;
            }
            return true;
        });
        menus[menuTypeId] = menuType;
        // menus.menuType = menuType;
    });
    pj.contributes.menus = menus;

    const toWrite = JSON.stringify(pj, undefined, 4) + '\n';
    await util.promisify(fs.writeFile)(PACKAGE_JSON_PATH, toWrite);

    // Delete the installer
    await util.promisify(rimraf)(INSTALLER_DIR);
    console.log(`Deleted ${INSTALLER_DIR}`);
}


main()
.then(() => { console.log("Done") })
.catch((err) => { console.error(err) });
