
import * as vscode from "vscode";

import RemoteConnection from "./RemoteConnection";
import { ConnectionStates } from "./ConnectionState";
import Log from "../../Logger";
import { getOcticon, Octicons } from "../../constants/CWImages";
import Translator from "../../constants/strings/Translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import toggleConnectionEnablementCmd from "../../command/connection/ToggleConnectionEnablement";

export default class RemoteConnectionReconnector {

    private readonly MIN_RECONNECT_INTERVAL: number = 2000;
    private readonly MAX_RECONNECT_INTERVAL: number = 90000;
    private readonly RECONNECT_INTERVAL_INCREASE_FACTOR: number = 2;

    private reconnectIntervalTimer: NodeJS.Timeout | undefined;
    private reconnectIntervalMs: number = this.MIN_RECONNECT_INTERVAL;
    private didWarnReconnectFailing: boolean = false;

    constructor(
        private readonly connection: RemoteConnection,
    ) {

    }

    /**
     * The auto-reconnect works as follows:
     *  1. If the connection disconnects (meaning, it has to have connected at least once)
     *      - This is skipped if not in 'network error' state since that's the only state a reconnect could 'fix'.
     *  2. A reconnect is scheduled
     *  3. If the reconnect attempt fails, the reconnect interval timeout is increased, and we return to 2.
     *  4. If the reconnect attempt succeeds, the reconnect state is reset and the connection is back up-and-running.
     */
    public startReconnectAttempts(): void {
        this.scheduleReconnect();
    }

    private scheduleReconnect(): void {
        if (this.connection.state !== ConnectionStates.NETWORK_ERROR) {
            Log.d(`${this.connection.label} refusing to schedule a reconnect when in ${this.connection.state} state`);
            this.reset();
            return;
        }

        this.reconnectIntervalTimer = setTimeout(this.tryReconnect, this.reconnectIntervalMs);
        Log.d(`${this.connection.label} will auto-reconnect in ${this.reconnectIntervalMs}ms`)

        // Increase the reconnect interval, unless we're already at the max reconnect interval.
        if (this.reconnectIntervalMs < this.MAX_RECONNECT_INTERVAL) {
            const nextReconnectIntervalMs = this.reconnectIntervalMs * this.RECONNECT_INTERVAL_INCREASE_FACTOR;
            this.reconnectIntervalMs = Math.min(this.MAX_RECONNECT_INTERVAL, nextReconnectIntervalMs);
        }
        else if (!this.didWarnReconnectFailing) {
            Log.d(`Displaying unable to reconnect warning`);
            // After waiting the maximum amount of time once, warn the user that the connection is not coming back anytime soon.
            const disableBtn = Translator.t(StringNamespaces.ACTIONS, "disable");
            vscode.window.showWarningMessage(
                Translator.t(StringNamespaces.CONNECTION, "autoReconnectFailedAttempsMsg", { connectionLabel: this.connection.label }),
                disableBtn
            ).then((res) => {
                if (res === disableBtn) {
                    toggleConnectionEnablementCmd(this.connection, false);
                }
            });
            this.didWarnReconnectFailing = true;
        }
    }

    private readonly tryReconnect = async (): Promise<void> => {
        if (this.connection.isTogglingEnablement()) {
            return;
        }

        Log.d(`${this.connection.label} is auto-reconnecting`)

        const statusItem = vscode.window.setStatusBarMessage(getOcticon(Octicons.cloud_upload) + " " +
            Translator.t(StringNamespaces.CONNECTION, "autoReconnectingStatusMsg", { connectionLabel: this.connection.label })
        );

        try {
            await this.connection.enable();
            Log.i(`${this.connection.label} auto-reconnected`);

            const successStatusItem = vscode.window.setStatusBarMessage(getOcticon(Octicons.cloud_upload) + " " +
                Translator.t(StringNamespaces.CONNECTION, "autoReconnectSuccessStatusMsg", { connectionLabel: this.connection.label })
            );

            setTimeout(() => {
                successStatusItem.dispose();
            }, 2000);
        }
        catch (err) {
            Log.w(`${this.connection.label} failed to auto-reconnect`, err);
            this.scheduleReconnect();
        }
        finally {
            statusItem.dispose();
        }
    }

    /**
     * Stop trying to reconnect, and reset the reconnect tracking state.
     */
    public reset(): void {
        // Log.d(`${this.connection.label} resetting reconnect interval`);
        if (this.reconnectIntervalTimer) {
            clearTimeout(this.reconnectIntervalTimer);
        }
        this.reconnectIntervalTimer = undefined;
        this.reconnectIntervalMs = this.MIN_RECONNECT_INTERVAL;
        this.didWarnReconnectFailing = false;
    }
}
