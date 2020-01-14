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

import { Uri } from "vscode";
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
const THEMELESS_FOLDER_NAME = "themeless";
// const PROJECT_TYPES_FOLDER = "project-types";

namespace Resources {

    export function getBaseResourcePath(): Uri {
        return Uri.file(path.join(global.__extRoot, RES_FOLDER_NAME));
    }

    function getImagePath(...paths: string[]): Uri {
        const imagePath = path.join(getBaseResourcePath().fsPath, IMG_FOLDER_NAME, ...paths);
        return Uri.file(imagePath);
    }

    export function getCssPath(filename: string): Uri {
        const cssPath = path.join(getBaseResourcePath().fsPath, STYLE_FOLDER_NAME, filename);
        return Uri.file(cssPath);
    }

    // VSC allows providing a separate icon for dark or light themes.
    // This is the format the API expects when icons are set.
    export interface IconPaths {
        readonly dark: Uri;
        readonly light: Uri;
    }

    /**
     * Resolve the icon with the given name and return the paths to it,
     * which can then be assigned to a vscode iconPath (eg on a TreeItem).
     * If an icon cannot be found, an error is will be logged.
     *
     * If a matching icon exists in the 'themeless' folder, the icon will be returned from there, with the dark and light paths matching.
     * Else, a requested icon is assumed to have a file in both 'dark' and 'light' folders.
     *
     */
    export function getIconPaths(icon: Icons): IconPaths {
        const themeless = getImagePath(THEMELESS_FOLDER_NAME, icon);
        try {
            fs.accessSync(themeless.fsPath, fs.constants.R_OK);
            return {
                dark: themeless,
                light: themeless,
            };
        }
        catch (err) {
            // if it doesn't exist in the themeless folder, it must exist in both dark and light folders
        }

        const darkPath = getImagePath(DARK_FOLDER_NAME, icon);
        // make sure the file exists and is readable
        fs.access(darkPath.fsPath, fs.constants.R_OK, (err) => {
            if (err) {
                Log.e(`Dark icon not found! ${icon} - error:`, err);
            }
        });

        const lightPath = getImagePath(LIGHT_FOLDER_NAME, icon);
        fs.access(lightPath.fsPath, fs.constants.R_OK, (err) => {
            if (err) {
                Log.e(`Light icon not found! ${icon} - error:`, err);
            }
        });

        return {
            dark: darkPath,
            light: lightPath,
        };
    }



    export enum Icons {
        Logo = "codewind.svg",
        Connect = "connect.svg",
        ConnectionConnected = "connection_connected.svg",
        ConnectionDisconnected = "connection_disconnected.svg",
        ConnectionConnectedCheckmark = "connection_connected_checkmark.svg",
        ConnectionDisconnectedCheckmark = "connection_disconnected_checkmark.svg",
        ConnectionWarningCheckmark = "connection_warning.svg",
        Copy = "copy.svg",
        ServerError = "server_error.svg",
        Error = "error.svg",
        Edit = "edit.svg",
        Help = "help.svg",
        Info = "info.svg",
        LocalConnected = "local_connected.svg",
        LocalDisconnected = "local_disconnected.svg",
        New = "new.svg",
        OpenExternal = "launch.svg",
        Play = "play.svg",
        Refresh = "refresh.svg",
        Stop = "stop.svg",
        ToggleOnThin = "toggle_on_thin.svg",
        ToggleOffThin = "toggle_off_thin.svg",
        Trash = "trash.svg",
        Delete = "trash_can.svg",
        Edit_Connection = "edit_connection.svg",
        Warning = "warning.svg",

        Generic      = "project-types/generic.svg",
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
