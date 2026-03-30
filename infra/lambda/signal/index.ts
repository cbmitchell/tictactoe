// signal handler
//
// The hot path — relays WebRTC signaling messages between peers verbatim.
// This handler does not know or care whether the payload is an offer, answer,
// or ICE candidate. It just finds the other peer and forwards the message.
//
// DynamoDB reads:
//   GetItem PK: "CONN#<connectionId>"  — find sender's code + role
//   GetItem PK: "CODE#<code>"          — find other peer's connection ID
//
// Client sends:
//   { action: "signal", payload: <any WebRTC signaling object> }
// Other peer receives:
//   { action: "signal", payload: <same object, forwarded verbatim> }

import {
  WsEvent,
  WsResult,
  OK,
  ERROR,
  getConnRecord,
  getCodeRecord,
  makeApiGwClient,
  sendToConnection,
} from '../shared';

export const handler = async (event: WsEvent): Promise<WsResult> => {
  const { connectionId, domainName, stage } = event.requestContext;

  // Parse the signaling payload
  let payload: unknown;
  try {
    const body = JSON.parse(event.body ?? '{}');
    payload = body.payload;
    if (payload === undefined) throw new Error('missing payload');
  } catch {
    return ERROR('Invalid signal message — expected { action, payload }');
  }

  // Find which session this connection belongs to
  const connRecord = await getConnRecord(connectionId);
  if (!connRecord) {
    console.warn('signal from unknown connection', { connectionId });
    return ERROR('Connection not associated with a game session');
  }

  // Find the other peer's connection ID
  const codeRecord = await getCodeRecord(connRecord.code);
  if (!codeRecord) {
    console.warn('signal: code record not found', { code: connRecord.code });
    return ERROR('Game session not found');
  }

  const targetConnectionId =
    connRecord.role === 'host'
      ? codeRecord.guestConnectionId
      : codeRecord.hostConnectionId;

  if (!targetConnectionId) {
    // Guest hasn't joined yet — host is sending a signal before peer-joined
    console.warn('signal: other peer not connected yet', { connectionId });
    return ERROR('Other player has not joined yet');
  }

  // Forward the payload to the other peer
  try {
    const apiGw = makeApiGwClient(domainName, stage);
    await sendToConnection(apiGw, targetConnectionId, {
      action: 'signal',
      payload,
    });
  } catch (err) {
    console.error('Failed to forward signal to peer', err);
    return ERROR('Failed to deliver signal to peer');
  }

  return OK;
};
