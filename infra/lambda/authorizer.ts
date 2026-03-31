// authorizer — WebSocket $connect REQUEST authorizer
//
// Fetches the expected token from Secrets Manager using SECRET_ARN and caches
// it in module scope so warm invocations skip the API call. Compares the value
// against the `token` query string parameter on the incoming WebSocket upgrade.
//
// Returns { isAuthorized: bool } using API Gateway's simple response format
// (enableSimpleResponses: true must be set on the CfnAuthorizer in the stack).
//
// This is a lightweight barrier against casual endpoint abuse — the matching
// value is embedded in the client bundle via VITE_CONNECT_SECRET at build time.
// It is not strong authentication.

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { WsEvent } from './shared';

const client = new SecretsManagerClient({});
const SECRET_ARN = process.env.SECRET_ARN!;

// Cached on first invocation; lives for the lifetime of the warm container.
let cachedSecret: string | null = null;

async function getSecret(): Promise<string> {
  if (cachedSecret !== null) return cachedSecret;
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: SECRET_ARN })
  );
  cachedSecret = response.SecretString ?? '';
  return cachedSecret;
}

export const handler = async (
  event: Pick<WsEvent, never> & { queryStringParameters?: Record<string, string> | null }
): Promise<{ isAuthorized: boolean }> => {
  const secret = await getSecret();
  const token = event.queryStringParameters?.token ?? '';
  return { isAuthorized: secret !== '' && token === secret };
};
