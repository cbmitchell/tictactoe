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
} from './shared';
import { createLogger } from './lib/logger';

export const handler = async (event: WsEvent): Promise<WsResult> => {
  const { connectionId, domainName, stage } = event.requestContext;
  const logger = createLogger({ connectionId });
  logger.info('disconnect');

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

  const otherConnectionId = codeRecord
    ? (role === 'host' ? codeRecord.guestConnectionId : codeRecord.hostConnectionId)
    : undefined;

  if (codeRecord) {
    // Notify the other peer if they are connected
    if (otherConnectionId) {
      try {
        const apiGw = makeApiGwClient(domainName, stage);
        await sendToConnection(apiGw, otherConnectionId, {
          action: 'opponent-disconnected',
        });
      } catch (err) {
        // Other peer already disconnected — safe to ignore
        logger.warn('disconnect: could not notify other peer', err as Record<string, unknown>);
      }
    }

    // Clean up CODE# record
    try {
      await deleteRecord(`CODE#${code}`);
    } catch (err) {
      logger.error('disconnect: failed to delete CODE record', err, { pk: `CODE#${code}` });
    }
  }

  // Clean up CONN# record for the disconnecting peer
  try {
    await deleteRecord(`CONN#${connectionId}`);
  } catch (err) {
    logger.error('disconnect: failed to delete CONN record', err, { pk: `CONN#${connectionId}` });
  }

  // Also clean up the other peer's CONN# record if we know it
  if (otherConnectionId) {
    try {
      await deleteRecord(`CONN#${otherConnectionId}`);
    } catch (err) {
      logger.error('disconnect: failed to delete other peer CONN record', err, { pk: `CONN#${otherConnectionId}` });
    }
  }

  logger.info('disconnect: cleanup complete', { code, hadPeer: !!otherConnectionId });

  return OK;
};
