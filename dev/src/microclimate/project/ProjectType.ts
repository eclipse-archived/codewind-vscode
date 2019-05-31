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
import Log from "../../Logger";

export class ProjectType {

    public readonly type: ProjectType.Types;
    // public readonly userFriendlyType: string;
    public readonly debugType: ProjectType.DebugTypes | undefined;

    public readonly icon: Resources.IconPaths;

    constructor(
        public readonly internalType: string,
        public readonly language: string
    ) {
        this.type = ProjectType.getType(internalType, language);
        // this.userFriendlyType = ProjectType.getUserFriendlyType(this.type);
        this.debugType = ProjectType.getDebugType(this.type);
        this.icon = ProjectType.getProjectIcon(this.type);
    }

    public toString(): string {
        return this.type.toString();
    }

    /**
     *
     * @param interalType A Microclimate/Codewind internal project type.
     */
    private static getType(interalType: string, language: string): ProjectType.Types {
        if (interalType === this.InternalTypes.MICROPROFILE) {
            return ProjectType.Types.MICROPROFILE;
        }
        else if (interalType === this.InternalTypes.SPRING) {
            return ProjectType.Types.SPRING;
        }
        else if (interalType === this.InternalTypes.NODE) {
            return ProjectType.Types.NODE;
        }
        else if (interalType === this.InternalTypes.SWIFT) {
            return ProjectType.Types.SWIFT;
        }
        else if (interalType === this.InternalTypes.DOCKER) {
            if (language === this.Languages.PYTHON) {
                return ProjectType.Types.PYTHON;
            }
            else if (language === this.Languages.GO) {
                return ProjectType.Types.GO;
            }
            else {
                return ProjectType.Types.GENERIC_DOCKER;
            }
        }
        else {
            Log.e(`Unrecognized project type ${interalType}`);
            return ProjectType.Types.UNKNOWN;
        }
    }

    /**
     * Get the corresponding VSCode debug configuration "type" value.
     * Returns undefined if we don't know how to debug this project type.
     */
    private static getDebugType(type: ProjectType.Types): ProjectType.DebugTypes | undefined {
        switch (type) {
            case ProjectType.Types.MICROPROFILE:
            case ProjectType.Types.SPRING:
                return this.DebugTypes.JAVA;
            case ProjectType.Types.NODE:
                return this.DebugTypes.NODE;
            default:
                return undefined;
        }
    }

    private static getProjectIcon(type: ProjectType.Types): Resources.IconPaths {
        switch (type) {
            case ProjectType.Types.MICROPROFILE:
                return Resources.getIconPaths(Resources.Icons.Microprofile);
            case ProjectType.Types.SPRING:
                return Resources.getIconPaths(Resources.Icons.Spring);
            case ProjectType.Types.NODE:
                return Resources.getIconPaths(Resources.Icons.Node);
            case ProjectType.Types.SWIFT:
                return Resources.getIconPaths(Resources.Icons.Swift);
            case ProjectType.Types.PYTHON:
                return Resources.getIconPaths(Resources.Icons.Python);
            case ProjectType.Types.GO:
                return Resources.getIconPaths(Resources.Icons.Go);
            case ProjectType.Types.GENERIC_DOCKER:
                // Could return the Java icon for Lagom
                // This is our fall-back, we could possibly use a more generic icon.
                return Resources.getIconPaths(Resources.Icons.Docker);
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

    // These are the project types as exposed to the user.
    // String value must be user-friendly!
    export enum Types {
        MICROPROFILE = "Microprofile",
        SPRING = "Spring",
        NODE = "Node.js",
        SWIFT = "Swift",
        PYTHON = "Python",
        GO = "Go",
        GENERIC_DOCKER = "Docker",
        UNKNOWN = "Unknown"
    }

    // non-nls-section-start

    // possible values of the "projectType" or "buildType" internal attribute
    export enum InternalTypes {
        MICROPROFILE = "liberty",
        SPRING = "spring",
        NODE = "nodejs",
        SWIFT = "swift",
        DOCKER = "docker"
    }

    // Possible values of the "language" internal attribute
    // could be others, but if they're not in this list we'll just treat them as generic docker
    export enum Languages {
        JAVA = "java",
        NODE = "nodejs",
        SWIFT = "swift",
        PYTHON = "python",
        GO = "go"
    }

    // VSCode debug types, used as the "type" attribute in a debug launch.
    export enum DebugTypes {
        JAVA = "java",
        NODE = "node"
    }

    // non-nls-section-end

    export const PROJECTS_WITHOUT_BUILDLOGS: ReadonlyArray<ProjectType.Types> = [
        ProjectType.Types.NODE
    ];
}

export default ProjectType;
