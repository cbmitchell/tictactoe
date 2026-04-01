// create-game handler
//
// Called by Player A (the host) after connecting. Generates a random 6-char
// invite code, stores the session in DynamoDB, and sends the code back to
// the caller so they can share it out of band.
//
// DynamoDB writes:
//   PK: "CODE#<code>"  — session record with hostConnectionId
//   PK: "CONN#<connectionId>" — reverse lookup so disconnect can find the session
//
// Client sends:  { action: "create-game" }
// Client receives: { action: "game-code", code: "ABC123" }

import {
  WsEvent,
  WsResult,
  OK,
  ERROR,
  putCodeRecord,
  putConnRecord,
  ttlIn24Hours,
  makeApiGwClient,
  sendToConnection,
} from './shared';
import { createLogger } from './lib/logger';

/** Generates a random uppercase alphanumeric invite code */
function generateCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit ambiguous chars 0/O, 1/I
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const handler = async (event: WsEvent): Promise<WsResult> => {
  const { connectionId, domainName, stage } = event.requestContext;
  const logger = createLogger({ connectionId });
  logger.info('create-game');

  const code = generateCode();
  const ttl = ttlIn24Hours();

  try {
    // Store game session keyed by invite code
    await putCodeRecord({
      pk: `CODE#${code}`,
      hostConnectionId: connectionId,
      ttl,
    });

    // Store reverse lookup so disconnect handler can find this session
    await putConnRecord({
      pk: `CONN#${connectionId}`,
      code,
      role: 'host',
      ttl,
    });
  } catch (err) {
    logger.error('create-game: DynamoDB write failed', err);
    return ERROR('Failed to create game session');
  }

  logger.info('create-game: session created');

  // Send the invite code back to the host
  try {
    const apiGw = makeApiGwClient(domainName, stage);
    await sendToConnection(apiGw, connectionId, {
      action: 'game-code',
      code,
    });
  } catch (err) {
    logger.error('create-game: failed to send game-code to host', err);
    return ERROR('Failed to send game code');
  }

  return OK;
};
