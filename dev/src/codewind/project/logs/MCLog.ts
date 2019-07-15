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
import * as vscode from "vscode";
import Translator from "../../../constants/strings/translator";
import StringNamespaces from "../../../constants/strings/StringNamespaces";

const STRING_NS = StringNamespaces.LOGS;

export default class MCLog implements vscode.QuickPickItem {

    public readonly displayName: string;

    // quickPickItem
    public readonly label: string;
    // public readonly detail: string;

    private output: vscode.OutputChannel | undefined;

    constructor(
        projectName: string,
        // MUST match the logName provided in the log-update events
        public readonly logName: string,
        public readonly logPath?: string,
    ) {
        this.displayName = `${projectName} - ${this.logName}`;
        this.label = this.displayName;
        // this.detail = logPath;
        // this.description = `(${this.logType} log)`;

        // Log.d(`Initialized log ${this.displayName} internal name ${this.logName} from ${}`);
    }

    public onNewLogs(reset: boolean, logs: string): void {
        if (!this.output) {
            return;
        }

        if (reset) {
            // Log.d("Reset " + this.displayName);
            this.output.clear();
        }
        // Log.d(`${this.displayName} appending length ${logs.length}`);
        this.output.append(logs);
    }

    public get isOpen(): boolean {
        return this.output != null;
    }

    // quickPickItem
    public get picked(): boolean {
        return this.isOpen;
    }

    public removeOutput(): void {
        // Log.d("Hide log " + this.displayName);
        if (this.output) {
            this.output.dispose();
            this.output = undefined;
        }
    }

    public showOutput(): void {
        // Log.d("Show log " + this.displayName);
        if (!this.output) {
            // Log.d("Creating output for log " + this.displayName);
            this.output = vscode.window.createOutputChannel(this.displayName);
            this.output.show();
            this.output.appendLine(Translator.t(STRING_NS, "waitingForLogs"));
        }
    }

    public onDisconnectOrDisable(disconnect: boolean): void {
        if (this.output) {
            let notUpdatingReason: string;
            if (disconnect) {
                notUpdatingReason = Translator.t(STRING_NS, "notUpdatingReasonDisconnect");
            }
            else {
                notUpdatingReason = Translator.t(STRING_NS, "notUpdatingReasonDisabled");
            }
            const msg = "*".repeat(8) + Translator.t(STRING_NS, "logNoLongerUpdating", { reason: notUpdatingReason });

            this.output.appendLine(msg);
        }
    }

    public destroy(): void {
        this.removeOutput();
    }
}
