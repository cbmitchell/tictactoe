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

// WebSocket authorizers must return an IAM policy document — the simple
// { isAuthorized: bool } response format is HTTP API only.
export const handler = async (event: {
  methodArn: string;
  queryStringParameters?: Record<string, string> | null;
}): Promise<{
  principalId: string;
  policyDocument: {
    Version: string;
    Statement: { Action: string; Effect: string; Resource: string }[];
  };
}> => {
  const secret = await getSecret();
  const token = event.queryStringParameters?.token ?? '';
  const effect = secret !== '' && token === secret ? 'Allow' : 'Deny';
  return {
    principalId: 'client',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: effect, Resource: event.methodArn }],
    },
  };
};
