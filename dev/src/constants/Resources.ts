/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as fs from "fs";
import * as path from "path";

import Log from "../Logger";

// non-nls-file

const RES_FOLDER_NAME = "res";
const STYLE_FOLDER_NAME = "css";
const IMG_FOLDER_NAME = "img";
const LIGHT_FOLDER_NAME = "light";
const DARK_FOLDER_NAME = "dark";
// for icons that are the same on all themes
const BOTH_FOLDER_NAME = "themeless";
// const PROJECT_TYPES_FOLDER = "project-types";

namespace Resources {

    export function getBaseResourcePath(): string {
        return path.join(global.__extRoot, RES_FOLDER_NAME);
    }

    function getResourcePath(...paths: string[]): string {
        return path.join(getBaseResourcePath(), ...paths);
    }

    export function getCss(filename: string): string {
        return getResourcePath(STYLE_FOLDER_NAME, filename);
    }

    /**
     * Resolve the icon with the given name and return the paths to it,
     * which can then be assigned to a vscode iconPath (eg on a TreeItem).
     * If an icon cannot be found, an error is will be logged.
     *
     * A requested icon is assumed to have a file in both 'dark' and 'light' folders.
     *
     */
    export function getIconPaths(icon: Icons): IconPaths {
        const bothPath = getResourcePath(IMG_FOLDER_NAME, BOTH_FOLDER_NAME, icon);
        try {
            fs.accessSync(bothPath, fs.constants.R_OK);
            return {
                dark: bothPath,
                light: bothPath,
            };
        }
        catch (err) {
            // if it doesn't exist in the both folder, it must exist in both dark and light folders
        }

        const darkPath = getResourcePath(IMG_FOLDER_NAME, DARK_FOLDER_NAME, icon);
        // make sure the file exists and is readable
        fs.access(darkPath, fs.constants.R_OK, (err) => {
            if (err) {
                Log.e(`Dark icon not found! ${icon} - error:`, err);
            }
        });

        const lightPath = getResourcePath(IMG_FOLDER_NAME, LIGHT_FOLDER_NAME, icon);
        fs.access(lightPath, fs.constants.R_OK, (err) => {
            if (err) {
                Log.e(`Light icon not found! ${icon} - error:`, err);
            }
        });

        return {
            light: lightPath,
            dark: darkPath
        };
    }

    // VSC allows providing a separate icon for dark or light themes.
    // This is the format the API expects when icons are set.
    // tslint:disable-next-line: interface-name
    export interface IconPaths {
        readonly light: string;
        readonly dark: string;
    }

    export enum Icons {
        Logo = "codewind.svg",
        Connect = "connect.svg",
        Disconnected = "server_error.svg",
        Error = "error.svg",
        Edit = "edit.svg",
        Help = "help.svg",
        Info = "info.svg",
        LocalProjects = "local_projects.svg",
        New = "new.svg",
        OpenExternal = "launch.svg",
        Play = "play.svg",
        Refresh = "refresh.svg",
        Stop = "stop.svg",
        ToggleOnThin = "toggle_on_thin.svg",
        ToggleOffThin = "toggle_off_thin.svg",
        Trash = "trash.svg",

        Generic      = "project-types/cloud.svg",
        Go           = "project-types/go.svg",
        Java         = "project-types/java.svg",
        Microprofile = "project-types/microprofile.svg",
        NodeJS       = "project-types/nodejs.svg",
        Python       = "project-types/python.svg",
        Spring       = "project-types/spring.svg",
        Swift        = "project-types/swift.svg",
    }

    // https://octicons.github.com/
    export enum Octicons {
        sync = "sync",
        bug = "bug"
    }

    /**
     * Get a string which can be included in a status bar message to render an octicon.
     * The returned value will be "$(iconName)" or "$(iconName~spin)"
     *
     * @param iconName - One of the octicons from https://octicons.github.com
     */
    export function getOcticon(iconName: Octicons, spinning: boolean = false): string {
        return `$(${iconName}${spinning ? "~spin" : ""})`;
    }

}

export default Resources;
