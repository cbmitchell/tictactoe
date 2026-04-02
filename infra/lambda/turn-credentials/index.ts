// turn-credentials handler
//
// HTTP GET endpoint that returns fresh Cloudflare TURN credentials for use
// in RTCPeerConnection. Called by the client immediately before initiating a
// WebRTC handshake.
//
// Cloudflare Realtime does not support static/long-lived credentials — every
// RTCPeerConnection must be initialised with fresh credentials fetched here.
//
// The Cloudflare API credentials (keyId + apiToken) are stored in Secrets
// Manager and cached in module scope after the first fetch so warm Lambda
// invocations skip the Secrets Manager call. The TURN credentials returned
// by Cloudflare are short-lived (1h TTL) and are never cached here.

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { createLogger } from '../lib/logger';

const smClient = new SecretsManagerClient({});
const TURN_SECRET_ARN = process.env.TURN_SECRET_ARN!;
// Allowed origin for CORS — set to the GitHub Pages URL at deploy time.
// Falls back to '*' only if the env var is absent (e.g. local testing).
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

interface CloudflareSecret {
  keyId: string;
  apiToken: string;
}

// Cached after first fetch; lives for the lifetime of the warm container.
let cachedSecret: CloudflareSecret | null = null;

async function getCloudflareSecret(): Promise<CloudflareSecret> {
  if (cachedSecret !== null) return cachedSecret;
  const response = await smClient.send(
    new GetSecretValueCommand({ SecretId: TURN_SECRET_ARN })
  );
  cachedSecret = JSON.parse(response.SecretString ?? '{}') as CloudflareSecret;
  return cachedSecret;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Content-Type': 'application/json',
};

export const handler = async (): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}> => {
  const logger = createLogger();
  logger.info('turn-credentials');

  let secret: CloudflareSecret;
  try {
    secret = await getCloudflareSecret();
  } catch (err) {
    logger.error('turn-credentials: failed to fetch Cloudflare secret', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to retrieve credentials configuration' }),
    };
  }

  // Fetch fresh short-lived TURN credentials from Cloudflare Realtime.
  // The response shape is { iceServers: RTCIceServer[] } — we return it as-is
  // so the client can destructure it directly.
  let credentialsResponse: unknown;
  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${secret.keyId}/credentials/generate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: 3600 }),
      }
    );
    if (!res.ok) {
      throw new Error(`Cloudflare API returned HTTP ${res.status}`);
    }
    credentialsResponse = await res.json();
  } catch (err) {
    logger.error('turn-credentials: Cloudflare API request failed', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to generate TURN credentials' }),
    };
  }

  logger.info('turn-credentials: credentials generated');

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify(credentialsResponse),
  };
};
