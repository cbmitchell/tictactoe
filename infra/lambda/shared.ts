// Shared types and utilities for the tictactoe signaling Lambda functions.
// Imported by each handler — do not add handler-specific logic here.

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import {
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

// -----------------------------------------------------------------------
// DynamoDB client (shared across invocations via module-level init)
// -----------------------------------------------------------------------
const ddbClient = new DynamoDBClient({});
export const dynamo = DynamoDBDocumentClient.from(ddbClient);

export const TABLE_NAME = process.env.TABLE_NAME!;

// TTL: 24 hours from now, in Unix seconds
export const ttlIn24Hours = () =>
  Math.floor(Date.now() / 1000) + 60 * 60 * 24;

// -----------------------------------------------------------------------
// DynamoDB record types
// -----------------------------------------------------------------------

/** Stored under PK: "CODE#<inviteCode>" */
export interface CodeRecord {
  pk: string;
  hostConnectionId: string;
  guestConnectionId?: string;
  ttl: number;
}

/** Stored under PK: "CONN#<connectionId>" */
export interface ConnRecord {
  pk: string;
  code: string;
  role: 'host' | 'guest';
  ttl: number;
}

// -----------------------------------------------------------------------
// DynamoDB helpers
// -----------------------------------------------------------------------

export async function getCodeRecord(code: string): Promise<CodeRecord | null> {
  const result = await dynamo.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `CODE#${code}` },
    })
  );
  return (result.Item as CodeRecord) ?? null;
}

export async function getConnRecord(connectionId: string): Promise<ConnRecord | null> {
  const result = await dynamo.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `CONN#${connectionId}` },
    })
  );
  return (result.Item as ConnRecord) ?? null;
}

export async function putCodeRecord(record: CodeRecord): Promise<void> {
  await dynamo.send(new PutCommand({ TableName: TABLE_NAME, Item: record }));
}

export async function putConnRecord(record: ConnRecord): Promise<void> {
  await dynamo.send(new PutCommand({ TableName: TABLE_NAME, Item: record }));
}

export async function deleteRecord(pk: string): Promise<void> {
  await dynamo.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: { pk } })
  );
}

export async function setGuestOnCodeRecord(
  code: string,
  guestConnectionId: string
): Promise<void> {
  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `CODE#${code}` },
      UpdateExpression: 'SET guestConnectionId = :g',
      ExpressionAttributeValues: { ':g': guestConnectionId },
    })
  );
}

// -----------------------------------------------------------------------
// API Gateway Management — send a message to a connected client
// -----------------------------------------------------------------------

export function makeApiGwClient(domainName: string, stage: string) {
  return new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });
}

export async function sendToConnection(
  client: ApiGatewayManagementApiClient,
  connectionId: string,
  payload: object
): Promise<void> {
  await client.send(
    new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(payload)),
    })
  );
}

// -----------------------------------------------------------------------
// API Gateway WebSocket event type
// -----------------------------------------------------------------------
export interface WsEvent {
  requestContext: {
    connectionId: string;
    domainName: string;
    stage: string;
    routeKey: string;
  };
  body?: string;
}

export interface WsResult {
  statusCode: number;
  body?: string;
}

export const OK: WsResult = { statusCode: 200 };
export const ERROR = (msg: string): WsResult => ({
  statusCode: 500,
  body: msg,
});
