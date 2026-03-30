// $connect handler
//
// Fires when a client establishes a WebSocket connection. At this point we
// only have a connection ID — the client hasn't told us whether they want to
// create or join a game yet. Nothing is written to DynamoDB here.
//
// API Gateway requires a 2xx response to accept the connection. Non-2xx
// rejects it before the client's onopen fires.

import { WsEvent, WsResult, OK } from './shared';

export const handler = async (event: WsEvent): Promise<WsResult> => {
  const { connectionId } = event.requestContext;
  console.log('connect', { connectionId });
  return OK;
};
