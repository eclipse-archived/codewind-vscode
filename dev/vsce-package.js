#!/usr/bin/env node

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


/*****
 * This file should be used to build the plugin instead of running vsce package directly.
 * First it does some preprocessing, then runs vsce package, then undoes the preprocessing to reset the development environment.
 * See main() function for command-line args.
 *****/

const path = require("path");
const fs = require("fs-extra");
const minimist = require("minimist");
const { spawn } = require("child_process");

const che_cmdsToDelete = [
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
    "separator",
    "addProjectToWorkspace",
    "changeProjectConnection",
    "homepage",
];

const vscode_cmdsToDelete = [
    // None at this time!
];

const PACKAGE_JSON = "package.json"
const PACKAGE_JSON_PATH = path.join(__dirname, PACKAGE_JSON);
const PACKAGE_JSON_BACKUP = `${PACKAGE_JSON_PATH}.backup`;

const VIEW_CONTAINER_ID = "cw-viewcontainer";
const VIEW_ID = "ext.cw.explorer";

const IMAGE_TAG_KEY = "codewindImageTag";

async function replaceCodewindImageTag(pj, newTag) {
    if (typeof newTag !== "string") {
        newTag = pj.version;
        console.log(`No image tag was given; falling back to extension version ${pj.version}`);
    }
    const oldCodewindImageTag = pj[IMAGE_TAG_KEY];
    pj[IMAGE_TAG_KEY] = newTag;
    console.log(`Replaced ${PACKAGE_JSON} ${IMAGE_TAG_KEY} "${oldCodewindImageTag}" with "${newTag}"`);
}

/**
 *
 * @param {object} commandsSection
 * @param {string[]} cmdsToDelete
 */
function removeCommands(commandsSection, cmdsToDelete) {
    if (cmdsToDelete.length === 0) {
        console.log("No commands to delete");
        return commandsSection;
    }

    return commandsSection.filter((cmd) => {
        // If the command's 'command' field matches one of the cmdsToDelete, do not add it to the filtered list
        const matchingCmd = cmdsToDelete.find((s) => cmd.command.includes(s));
        if (matchingCmd) {
            console.log("Deleting command" + cmd.command);
            return false;
        }
        return true;
    });
}

/**
 *
 * @param {object} menusSection
 * @param {string[]} cmdsToDelete
 */
function removeMenus(menusSection, cmdsToDelete) {
    if (cmdsToDelete.length === 0) {
        console.log("No command menus to delete");
        return menusSection;
    }

    Object.entries(menusSection).forEach(([menuTypeId, menuType]) => {
        menuType = menuType.filter((menuItem) => {
            if (cmdsToDelete.some((s) => menuItem.command.includes(s))) {
                console.log(`Deleting menuitem ${menuItem.command} from ${menuTypeId}`);
                return false;
            }
            return true;
        });
        menusSection[menuTypeId] = menuType;
        // menus.menuType = menuType;
    });

    return menusSection;
}

async function prebuildChe(pj) {

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
    pj.contributes.commands = removeCommands(pj.contributes.commands, che_cmdsToDelete);
    pj.contributes.menus = removeMenus(pj.contributes.menus, che_cmdsToDelete);

    return pj;
}

async function prebuildVSCode(pj) {
    // Delete unwanted commands and their respective menu entries
    pj.contributes.commands = removeCommands(pj.contributes.commands, vscode_cmdsToDelete);
    pj.contributes.menus = removeMenus(pj.contributes.menus, vscode_cmdsToDelete);
    return pj;
}

/**
 *
 * @param {object} pj
 * @param {boolean} isForChe
 */
async function preparePackageJSON(pj, isForChe) {
    let newPJ = { ...pj };
    if (isForChe) {
        newPJ = await prebuildChe(newPJ);
    }
    else {
        newPJ = await prebuildVSCode(newPJ);
    }

    const prodEntrypoint = "./dist/extension.js";
    // replace dev entrypoint with production one
    console.log(`Changing extension entrypoint from ${newPJ.main} to ${prodEntrypoint}`);
    newPJ.main = prodEntrypoint;

    await writePackageJSON(newPJ);
}

async function writePackageJSON(newPJ) {
    const toWrite = JSON.stringify(newPJ, undefined, 4) + '\n';
    await fs.writeFile(PACKAGE_JSON_PATH, toWrite);
    console.log(`Wrote out new ${PACKAGE_JSON}`);
}

/**
 *
 * @param {string} cmd
 * @param {string[]} args
 */
async function spawnWithOutput(cmd, args) {
    console.log(`Running ${cmd} ${args.join(" ")}...`);

    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args);
        proc.on("error", (err) => {
            reject(err);
        });
        proc.stdout.on("data", (chunk) => { console.log(chunk.toString()); });
        proc.stderr.on("data", (chunk) => { console.error(chunk.toString()); });
        proc.on("exit", (code) => {
            if (code === 0) {
                return resolve(code);
            }
            else {
                return reject(code);
            }
        });
    });
}

/**
 * Command-line args:
 * --codewindImageTagOnly - Replace the codewindImageTag with the value of this argument and then exit.
 *  If given with no argument, sets the tag to the package's `version`.
 * --buildForChe - Build for Che. If not set, build for VS Code.
 */
async function main() {
    const args = minimist(process.argv.slice(2));
    const buildForChe = !!args.buildForChe;
    const prebuildType = buildForChe ? "Che" : "VS Code";
    console.log("Building for " + prebuildType);

    await fs.copyFile(PACKAGE_JSON_PATH, PACKAGE_JSON_BACKUP);

    const pj = JSON.parse(await fs.readFile(PACKAGE_JSON_PATH));

    if (args.codewindImageTagOnly) {
        await replaceCodewindImageTag(pj, args.codewindImageTagOnly);
        await writePackageJSON(pj);
        await fs.remove(PACKAGE_JSON_BACKUP);
        return;
    }

    try {
        await preparePackageJSON(pj, buildForChe);
        await spawnWithOutput("vsce", [ "package" ]);
    }
    finally {
        await fs.rename(PACKAGE_JSON_BACKUP, PACKAGE_JSON_PATH);
        console.log(`Finished restoring ${PACKAGE_JSON}`);
    }

    console.log("Sucessfully packaged for " + prebuildType);
}

main()
.catch((err) => {
    console.error(err);
    process.exit(1);
});
