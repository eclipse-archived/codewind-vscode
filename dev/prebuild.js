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

const path = require("path");
const fs = require("fs");
const util = require("util");
const rimraf = require("rimraf");

const theia_cmdsToDelete = [
    "startCodewind",
    "startCodewind2",
    "stopCodewind",
    "stopCodewind2",
    "removeImages",
    "newConnection",
    "removeConnection",
    "enableConnection",
    "disableConnection",
    "connectionOverview",
    "attachDebugger",
    "restartRun",
    "restartDebug",
    "manageLogs",
    "containerShell",
];

const vscode_cmdsToDelete = [
    // None at this time!
];

const PACKAGE_JSON_PATH = path.join(__dirname, "package.json");

const VIEW_CONTAINER_ID = "cw-viewcontainer";
const VIEW_ID = "ext.cw.explorer";

function removeCommands(commandsSection, cmdsToDelete) {
    return commandsSection.filter((cmd) => {
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
}

function removeMenus(menus, cmdsToDelete) {
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

    return menus;
}

async function prebuildTheia(pj) {

    // Contribute a viewcontainer instead of to the explorer view
    pj.contributes.viewsContainers = {
        right: [
            {
                icon: "res/img/themeless/codewind.svg",
                id: VIEW_CONTAINER_ID,
                title: "Codewind"
            }
        ]
    }
    pj.contributes.views = {
        [VIEW_CONTAINER_ID]: [
            {
                id: VIEW_ID,
                name: "Project Explorer"
            }
        ]
    };

    // Delete unwanted commands and their respective menu entries
    pj.contributes.commands = removeCommands(pj.contributes.commands, theia_cmdsToDelete);
    pj.contributes.menus = removeMenus(pj.contributes.menus, theia_cmdsToDelete);

    // Delete the binaries that aren't needed.
    const BIN_DIR = "bin";
    const winInstaller = path.join(BIN_DIR, "windows");
    const macInstaller = path.join(BIN_DIR, "darwin");
    await util.promisify(rimraf)(winInstaller);
    console.log(`Deleted ${winInstaller}`);
    await util.promisify(rimraf)(macInstaller);
    console.log(`Deleted ${macInstaller}`);


    return pj;
}

async function prebuildVSCode(pj) {
    // Delete unwanted commands and their respective menu entries
    pj.contributes.commands = removeCommands(pj.contributes.commands, vscode_cmdsToDelete);
    pj.contributes.menus = removeMenus(pj.contributes.menus, vscode_cmdsToDelete);
    return pj;
}

async function main() {

    const prebuildType = process.argv[2];
    let isForTheia;
    if (prebuildType === "theia") {
        isForTheia = true;
    }
    else if (prebuildType === "vscode") {
        isForTheia = false;
    }
    else {
        throw new Error(`This script must be called with either "theia" or "vscode" as argv[2]. ` +
            `Received "${prebuildType}"`);
    }

    console.log("Prebuilding for " + prebuildType);

    let pj = JSON.parse(await util.promisify(fs.readFile)(PACKAGE_JSON_PATH));

    if (isForTheia) {
        pj = await prebuildTheia(pj);
    }
    else {
        pj = await prebuildVSCode(pj);
    }

    const toWrite = JSON.stringify(pj, undefined, 4) + '\n';
    await util.promisify(fs.writeFile)(PACKAGE_JSON_PATH, toWrite);
    console.log("Wrote out new " + path.basename(PACKAGE_JSON_PATH));
    console.log("Finished prebuild for " + prebuildType);
}

main()
.then(() => { console.log("Done"); })
.catch((err) => {
    console.error(err);
    process.exit(1);
});
