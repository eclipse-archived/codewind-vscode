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

import Resources from "../../constants/Resources";
import MCUtil from "../../MCUtil";
// import Log from "../../Logger";

export class ProjectType {

    public readonly type: ProjectType.Types;
    // public readonly userFriendlyType: string;
    public readonly debugType: ProjectType.DebugTypes | undefined;

    public readonly icon: Resources.IconPaths;

    constructor(
        public readonly internalType: string,
        public readonly language: string,
        public readonly extensionName?: string,
    ) {
        this.type = ProjectType.getType(internalType, extensionName);
        // this.userFriendlyType = ProjectType.getUserFriendlyType(this.type);
        this.debugType = ProjectType.getDebugType(this.type, language);
        this.icon = ProjectType.getProjectIcon(this.type, language);
    }

    public toString(): string {
        if (this.extensionName) {
            let ufExtension = this.extensionName.toLowerCase();
            if (ufExtension.endsWith("extension")) {
                ufExtension = ufExtension.substring(0, ufExtension.length - "extension".length);
            }
            return MCUtil.uppercaseFirstChar(ufExtension);
        }
        return this.type.toString();
    }

    private static getType(internalType: string, extensionName: string | undefined): ProjectType.Types {
        if (internalType === this.InternalTypes.MICROPROFILE) {
            return ProjectType.Types.MICROPROFILE;
        }
        else if (internalType === this.InternalTypes.SPRING) {
            return ProjectType.Types.SPRING;
        }
        else if (internalType === this.InternalTypes.NODE) {
            return ProjectType.Types.NODE;
        }
        else if (internalType === this.InternalTypes.SWIFT) {
            return ProjectType.Types.SWIFT;
        }
        else if (internalType === this.InternalTypes.DOCKER) {
            return ProjectType.Types.GENERIC_DOCKER;
        }
        else if (extensionName) {
            return ProjectType.Types.EXTENSION;
        }
        else {
            // Log.e(`Unrecognized project type ${interalType}`);
            return ProjectType.Types.UNKNOWN;
        }
    }

    /**
     * Get the corresponding VSCode debug configuration "type" value.
     * Returns undefined if we don't have any project types that use the language and support debug.
     */
    private static getDebugType(type: ProjectType.Types, language: string): ProjectType.DebugTypes | undefined {
        switch (type) {
            case ProjectType.Types.MICROPROFILE:
            case ProjectType.Types.SPRING:
                return this.DebugTypes.JAVA;
            case ProjectType.Types.NODE:
                return this.DebugTypes.NODE;
            case ProjectType.Types.EXTENSION:
                // For extension types, we use the language to determine debug type
                const lang = language.toLowerCase();
                if (lang === this.Languages.JAVA) {
                    return this.DebugTypes.JAVA;
                }
                else if (lang === this.Languages.NODE) {
                    return this.DebugTypes.NODE;
                }
            default:
                return undefined;
        }
    }

    private static getProjectIcon(type: ProjectType.Types, language: string): Resources.IconPaths {
        switch (language.toLowerCase()) {
            case this.Languages.JAVA:
                if (type === ProjectType.Types.MICROPROFILE) {
                    return Resources.getIconPaths(Resources.Icons.Microprofile);
                }
                else if (type === ProjectType.Types.SPRING) {
                    return Resources.getIconPaths(Resources.Icons.Spring);
                }
                else {
                    return Resources.getIconPaths(Resources.Icons.Java);
                }
            case this.Languages.NODE:
            case "javascript":
            case "js":
                return Resources.getIconPaths(Resources.Icons.NodeJS);
            case this.Languages.SWIFT:
                return Resources.getIconPaths(Resources.Icons.Swift);
            case this.Languages.PYTHON:
                return Resources.getIconPaths(Resources.Icons.Python);
            case this.Languages.GO:
                return Resources.getIconPaths(Resources.Icons.Go);
            default:
                return Resources.getIconPaths(Resources.Icons.Generic);
        }
    }

    /*
    private static getUserFriendlyType(type: ProjectType.Types): string {
        // For docker projects, return the language
        /*
        if (type === ProjectType.Types.GENERIC_DOCKER && language != null) {
            return uppercaseFirstChar(language);
        }

        // For all other types, the enum's string value is user-friendly
        return type.toString();
    }*/

    public get providesBuildLog(): boolean {
        return !ProjectType.PROJECTS_WITHOUT_BUILDLOGS.includes(this.type);
    }
}

export namespace ProjectType {

    /*
     * These are the project types as exposed to the user. String value must be user-friendly.
     */
    export enum Types {
        MICROPROFILE = "Microprofile",
        SPRING = "Spring",
        NODE = "Node.js",
        SWIFT = "Swift",
        GENERIC_DOCKER = "Docker",
        EXTENSION = "Extension",
        UNKNOWN = "Unknown"
    }

    // non-nls-section-start

    /**
     * Possible values of the "projectType" or "buildType" internal attribute
     */
    export enum InternalTypes {
        MICROPROFILE = "liberty",
        SPRING = "spring",
        NODE = "nodejs",
        SWIFT = "swift",
        DOCKER = "docker"
    }


    /**
     * Some possible values of the "language" internal attribute, for which we have special treatment such as nicer icons.
     * Language can be user-determined so this is not a complete list
     */
    export enum Languages {
        JAVA = "java",
        NODE = "nodejs",
        SWIFT = "swift",
        PYTHON = "python",
        GO = "go"
    }

    /**
     * VSCode debug types, used as the "type" attribute in a debug launch.
     */
    export enum DebugTypes {
        JAVA = "java",
        NODE = "node"
    }

    // non-nls-section-end

    export const PROJECTS_WITHOUT_BUILDLOGS: ReadonlyArray<ProjectType.Types> = [
        ProjectType.Types.NODE
    ];
}

export interface IProjectSubtype {
    id: string;
    version?: string;
    label: string;
    description?: string;
}

export interface IProjectSubtypesDescriptor {
    label?: string;
    items: IProjectSubtype[];
}

export interface IProjectTypeDescriptor {
    projectType: string;
    projectSubtypes: IProjectSubtypesDescriptor;
}

export default ProjectType;
