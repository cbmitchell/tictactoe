// join-game handler
//
// Called by Player B (the guest) with an invite code. Looks up the session,
// pairs both peers by updating the CODE# record with the guest's connection ID,
// writes a CONN# record for the guest, then notifies both peers they are paired
// and can begin the WebRTC handshake.
//
// After this point the signaling server's job is just to relay signal messages.
//
// DynamoDB reads/writes:
//   GetItem  PK: "CODE#<code>"       — find the host's connection ID
//   UpdateItem PK: "CODE#<code>"     — add guestConnectionId
//   PutItem  PK: "CONN#<guestConnId>" — reverse lookup for guest
//
// Client sends:    { action: "join-game", code: "ABC123" }
// Host receives:   { action: "peer-joined" }   ← host should send WebRTC offer
// Guest receives:  { action: "waiting-for-offer" }

import {
  WsEvent,
  WsResult,
  OK,
  ERROR,
  getCodeRecord,
  setGuestOnCodeRecord,
  putConnRecord,
  ttlIn24Hours,
  makeApiGwClient,
  sendToConnection,
} from './shared';
import { createLogger } from './lib/logger';

export const handler = async (event: WsEvent): Promise<WsResult> => {
  const { connectionId, domainName, stage } = event.requestContext;
  const logger = createLogger({ connectionId });

  // Parse the invite code from the message body
  let code: string;
  try {
    const body = JSON.parse(event.body ?? '{}');
    code = body.code;
    if (!code || typeof code !== 'string') throw new Error('missing code');
  } catch {
    return ERROR('Invalid join-game message — expected { action, code }');
  }

  logger.info('join-game', { code });

  // Look up the session
  const codeRecord = await getCodeRecord(code);
  if (!codeRecord) {
    const apiGw = makeApiGwClient(domainName, stage);
    await sendToConnection(apiGw, connectionId, {
      action: 'error',
      message: 'Game not found. The code may be invalid or expired.',
    });
    logger.warn('join-game: code not found', { code });
    return OK;
  }

  if (codeRecord.guestConnectionId) {
    // Session already has two players
    const apiGw = makeApiGwClient(domainName, stage);
    await sendToConnection(apiGw, connectionId, {
      action: 'error',
      message: 'Game is already full.',
    });
    logger.warn('join-game: game already full', { code });
    return OK;
  }

  const ttl = ttlIn24Hours();

  // Pair the guest into the session
  try {
    await setGuestOnCodeRecord(code, connectionId);
  } catch (err) {
    logger.error('join-game: failed to update CODE record with guest', err, { code });
    return ERROR('Failed to join game session');
  }

  // Store reverse lookup for the guest
  try {
    await putConnRecord({
      pk: `CONN#${connectionId}`,
      code,
      role: 'guest',
      ttl,
    });
  } catch (err) {
    logger.error('join-game: failed to write CONN record for guest', err);
    return ERROR('Failed to join game session');
  }

  logger.info('join-game: peers paired', {
    code,
    hostConnectionId: codeRecord.hostConnectionId,
    guestConnectionId: connectionId,
  });

  // Notify both peers
  const apiGw = makeApiGwClient(domainName, stage);

  try {
    // Tell host to initiate the WebRTC handshake by sending an offer
    await sendToConnection(apiGw, codeRecord.hostConnectionId, {
      action: 'peer-joined',
    });
  } catch (err) {
    logger.error('join-game: failed to notify host', err, { hostConnectionId: codeRecord.hostConnectionId });
    return ERROR('Failed to notify host — they may have disconnected');
  }

  try {
    // Tell guest to wait for the offer from the host
    await sendToConnection(apiGw, connectionId, {
      action: 'waiting-for-offer',
    });
  } catch (err) {
    logger.error('join-game: failed to notify guest', err);
    return ERROR('Failed to acknowledge guest connection');
  }

  return OK;
};
