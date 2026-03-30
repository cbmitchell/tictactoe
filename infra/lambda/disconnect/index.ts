// $disconnect handler
//
// Fires when a client disconnects for any reason — browser tab closed, network
// drop, explicit close, or idle timeout. We:
//   1. Look up the disconnecting connection's session (CONN# record)
//   2. If they were in a game, notify the other peer
//   3. Delete both the CONN# record and the CODE# record
//
// Note: postToConnection can fail if the other peer has already disconnected.
// We catch and ignore that error — the important thing is cleaning up DynamoDB.

import {
  WsEvent,
  WsResult,
  OK,
  getConnRecord,
  getCodeRecord,
  deleteRecord,
  makeApiGwClient,
  sendToConnection,
} from '../shared';

export const handler = async (event: WsEvent): Promise<WsResult> => {
  const { connectionId, domainName, stage } = event.requestContext;
  console.log('disconnect', { connectionId });

  // Look up which session this connection belonged to
  const connRecord = await getConnRecord(connectionId);
  if (!connRecord) {
    // Connection was never part of a game (e.g. connected then disconnected
    // before sending create-game or join-game)
    return OK;
  }

  const { code, role } = connRecord;

  // Look up the session to find the other peer
  const codeRecord = await getCodeRecord(code);

  if (codeRecord) {
    // Notify the other peer if they are connected
    const otherConnectionId =
      role === 'host'
        ? codeRecord.guestConnectionId
        : codeRecord.hostConnectionId;

    if (otherConnectionId) {
      try {
        const apiGw = makeApiGwClient(domainName, stage);
        await sendToConnection(apiGw, otherConnectionId, {
          action: 'opponent-disconnected',
        });
      } catch (err) {
        // Other peer already disconnected — safe to ignore
        console.warn('Could not notify other peer on disconnect', err);
      }
    }

    // Clean up CODE# record
    await deleteRecord(`CODE#${code}`);
  }

  // Clean up CONN# record for the disconnecting peer
  await deleteRecord(`CONN#${connectionId}`);

  // Also clean up the other peer's CONN# record if we know it
  if (codeRecord) {
    const otherConnectionId =
      role === 'host'
        ? codeRecord.guestConnectionId
        : codeRecord.hostConnectionId;
    if (otherConnectionId) {
      await deleteRecord(`CONN#${otherConnectionId}`);
    }
  }

  return OK;
};
