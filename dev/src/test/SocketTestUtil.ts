/*******************************************************************************
 * Copyright (c) 2018 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as io from "socket.io-client";

// I don't know how to import this properly
// tslint:disable-next-line:no-require-imports
import wildcard = require("socketio-wildcard");

import Log from "../Logger";
import SocketEvents from "../microclimate/connection/SocketEvents";

export interface IExpectedSocketEvent {
    readonly eventType: SocketEvents.Types;
    readonly projectID?: string;
    readonly expectedData?: { key: string, value: any };
    resolveFn?: (result: ISocketEventData) => void;
}

interface ISocketEvent {
    type: string;
    nsp?: string;
    data: ISocketEventData;
}

interface ISocketEventData {
    [key: string]: string;
    projectID: string;
}

namespace SocketTestUtil {
    export function createTestSocket(uri: string): Promise<SocketIOClient.Socket> {
        Log.t("Creating test socket at: " + uri);
        const socket = io(uri);

        // use the socket-io-wildcard middleware so we can send all events to one function
        wildcard(io.Manager)(socket);
        socket.on("*", onSocketEvent);

        return new Promise<SocketIOClient.Socket>( (resolve) => {
            socket.on("connect", () => {
                Log.t("Socket connect success");
                return resolve(socket);
            });

            socket.connect();
        });
    }

    const expectedSocketEvents: IExpectedSocketEvent[] = [];
    // let _expectedSocketEvent: ExpectedSocketEvent | undefined;

    async function onSocketEvent(rawEvent: any): Promise<void> {
        const event: ISocketEvent = {
            type: rawEvent.data[0],
            data: rawEvent.data[1]
        };
        // Log.t("onSocketEvent", event);

        if (expectedSocketEvents.length === 0) {
            return;
        }

        const matchedEvent = expectedSocketEvents.find( (e) => eventMatches(e, event));

        if (matchedEvent != null) {
            Log.t(`Expected socket event was received of type ${event.type} ` +
                    `for project ${matchedEvent.projectID} with data ${JSON.stringify(matchedEvent.expectedData)}`);

            if (matchedEvent.resolveFn != null) {
                // This causes expectSocketEvent to resolve with this event's data
                matchedEvent.resolveFn(event.data);
            }
            else {
                Log.e("ExpectedEvent did not have a resolve function", matchedEvent);
            }
            // _expectedSocketEvent = undefined;
            expectedSocketEvents.splice(expectedSocketEvents.indexOf(matchedEvent), 1);
            if (expectedSocketEvents.length > 0) {
                Log.t("Still waiting for socket events:", expectedSocketEvents);
            }
        }
    }

    function eventMatches(expectedEvent: IExpectedSocketEvent, event: ISocketEvent): boolean {

        // First check that the event is of the correct type
        if (expectedEvent.eventType === event.type) {
            // check that the event is for the correct project
            if (expectedEvent.projectID != null && expectedEvent.projectID !== event.data.projectID) {
                // Log.t(`Event does not have correct project ID, expected ${expectedEvent.projectID}, actual ${event.data.projectID}`)
                return false;
            }

            // check that the event has the correct data, if specific data is expected
            if (expectedEvent.expectedData == null) {
                return true;
            }
            // Log.t("Event type matches expected event:", expectedEvent, "actual event:", event);

            for (const key of Object.keys(event.data)) {
                // Check that the event contains the expected key that it maps to the expected value
                if (key === expectedEvent.expectedData.key &&
                        event.data[key] === expectedEvent.expectedData.value) {

                   return true;
                }
            }
        }
        return false;
    }

    export async function expectSocketEvent(event: IExpectedSocketEvent): Promise<ISocketEventData> {
        expectedSocketEvents.push(event);

        Log.t(`Now waiting for socket event of type ${event.eventType} and data: ${JSON.stringify(event.expectedData)}`);
        Log.t(`Events being waited for are now: ${JSON.stringify(expectedSocketEvents)}`);

        return new Promise<ISocketEventData>( (resolve) => {
            // This promise will be resolved with the socket event's 'data' in onSocketEvent above when a matching event is received
            event.resolveFn = resolve;
        });
    }
}

export default SocketTestUtil;
