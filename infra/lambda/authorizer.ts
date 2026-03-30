// authorizer — WebSocket $connect REQUEST authorizer
//
// Reads the `token` query string parameter and compares it against the
// CONNECT_SECRET environment variable. Returns { isAuthorized: true/false }
// using API Gateway's simple response format (enableSimpleResponses must be
// set on the CfnAuthorizer in the stack).
//
// This is a lightweight barrier against casual endpoint abuse — the secret is
// embedded in the client bundle at build time. It is not strong authentication.

const CONNECT_SECRET = process.env.CONNECT_SECRET ?? '';

export const handler = async (event: {
  queryStringParameters?: Record<string, string> | null;
}): Promise<{ isAuthorized: boolean }> => {
  const token = event.queryStringParameters?.token ?? '';
  return { isAuthorized: CONNECT_SECRET !== '' && token === CONNECT_SECRET };
};
