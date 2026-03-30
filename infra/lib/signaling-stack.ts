import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Construct } from 'constructs';

export class SignalingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -------------------------------------------------------------------------
    // DynamoDB — single table storing signaling session state
    //
    // Two record types (see CLAUDE.md for full schema):
    //   PK: "CODE#<inviteCode>"  — game session keyed by invite code
    //   PK: "CONN#<connectionId>" — reverse lookup keyed by connection ID
    //
    // TTL attribute auto-expires records after 24h so stale sessions
    // from abandoned games don't accumulate.
    // -------------------------------------------------------------------------
    const table = new dynamodb.Table(this, 'SignalingTable', {
      tableName: 'tictactoe-signaling',
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // -------------------------------------------------------------------------
    // Shared Lambda configuration
    // -------------------------------------------------------------------------
    const commonLambdaProps: Partial<lambdaNode.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: {
        TABLE_NAME: table.tableName,
      },
      bundling: {
        minify: true,
        sourceMap: false,
        // esbuild target — matches the Lambda Node runtime
        target: 'node22',
      },
    };

    // -------------------------------------------------------------------------
    // Lambda functions — one per WebSocket route
    // See CLAUDE.md for each handler's responsibilities and DynamoDB access
    // patterns.
    // -------------------------------------------------------------------------

    // $connect — fires when a client establishes a WebSocket connection.
    // Minimal handler; nothing to store until the client identifies themselves
    // with create-game or join-game.
    const connectFn = new lambdaNode.NodejsFunction(this, 'ConnectFunction', {
      ...commonLambdaProps,
      entry: path.join(__dirname, '../lambda/connect.ts'),
      functionName: 'tictactoe-connect',
      description: 'Handles WebSocket $connect — logs connection, no DB write',
    });

    // $disconnect — fires when a client disconnects for any reason.
    // Looks up the session, notifies the other peer if present, cleans up
    // both DynamoDB records.
    const disconnectFn = new lambdaNode.NodejsFunction(this, 'DisconnectFunction', {
      ...commonLambdaProps,
      entry: path.join(__dirname, '../lambda/disconnect.ts'),
      functionName: 'tictactoe-disconnect',
      description: 'Handles WebSocket $disconnect — notifies peer, cleans up DB',
    });

    // create-game — Player A calls this after connecting.
    // Generates a random invite code, stores CODE# and CONN# records,
    // returns the code to the caller.
    const createGameFn = new lambdaNode.NodejsFunction(this, 'CreateGameFunction', {
      ...commonLambdaProps,
      entry: path.join(__dirname, '../lambda/create-game.ts'),
      functionName: 'tictactoe-create-game',
      description: 'Handles create-game — generates invite code, stores session',
    });

    // join-game — Player B calls this with an invite code.
    // Looks up the session, pairs both peers, notifies both connections.
    const joinGameFn = new lambdaNode.NodejsFunction(this, 'JoinGameFunction', {
      ...commonLambdaProps,
      entry: path.join(__dirname, '../lambda/join-game.ts'),
      functionName: 'tictactoe-join-game',
      description: 'Handles join-game — pairs peers, notifies both',
    });

    // signal — the hot path. Relays WebRTC offer/answer/ICE candidate payloads
    // between peers verbatim. Does not inspect payload contents.
    const signalFn = new lambdaNode.NodejsFunction(this, 'SignalFunction', {
      ...commonLambdaProps,
      entry: path.join(__dirname, '../lambda/signal.ts'),
      functionName: 'tictactoe-signal',
      description: 'Handles signal — relays WebRTC signaling payload to other peer',
    });

    // -------------------------------------------------------------------------
    // DynamoDB permissions — least privilege per function
    // See CLAUDE.md for the rationale behind each grant
    // -------------------------------------------------------------------------
    table.grantReadData(connectFn);                    // connect reads nothing, but grant read for health checks
    table.grantReadWriteData(disconnectFn);            // needs GetItem + DeleteItem
    table.grantWriteData(createGameFn);                // needs PutItem only
    table.grantReadWriteData(joinGameFn);              // needs GetItem + UpdateItem + PutItem
    table.grantReadData(signalFn);                     // needs GetItem only

    // -------------------------------------------------------------------------
    // API Gateway WebSocket API
    // -------------------------------------------------------------------------
    const api = new apigatewayv2.WebSocketApi(this, 'SignalingApi', {
      apiName: 'tictactoe-signaling',
      description: 'WebRTC signaling for peer-to-peer tic-tac-toe',
      connectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration(
          'ConnectIntegration',
          connectFn
        ),
      },
      disconnectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration(
          'DisconnectIntegration',
          disconnectFn
        ),
      },
    });

    api.addRoute('create-game', {
      integration: new integrations.WebSocketLambdaIntegration(
        'CreateGameIntegration',
        createGameFn
      ),
    });

    api.addRoute('join-game', {
      integration: new integrations.WebSocketLambdaIntegration(
        'JoinGameIntegration',
        joinGameFn
      ),
    });

    api.addRoute('signal', {
      integration: new integrations.WebSocketLambdaIntegration(
        'SignalIntegration',
        signalFn
      ),
    });

    // Deploy the API to a stage named "prod"
    const stage = new apigatewayv2.WebSocketStage(this, 'ProdStage', {
      webSocketApi: api,
      stageName: 'prod',
      autoDeploy: true,
    });

    // -------------------------------------------------------------------------
    // API Gateway ManageConnections permission
    //
    // Each Lambda that calls apigatewaymanagementapi.postToConnection (i.e.
    // sends a message back to a connected client) needs this permission.
    // connect and signal are excluded: connect never sends back (the $connect
    // response is implicit), and... actually signal does need it — it forwards
    // to the other peer. disconnect and join-game also need it to notify peers.
    // -------------------------------------------------------------------------
    const manageConnectionsPolicy = new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [
        `arn:aws:execute-api:${this.region}:${this.account}:${api.apiId}/${stage.stageName}/POST/@connections/*`,
      ],
    });

    disconnectFn.addToRolePolicy(manageConnectionsPolicy);
    createGameFn.addToRolePolicy(manageConnectionsPolicy);
    joinGameFn.addToRolePolicy(manageConnectionsPolicy);
    signalFn.addToRolePolicy(manageConnectionsPolicy);

    // -------------------------------------------------------------------------
    // Outputs — printed after cdk deploy, used to configure the client
    // -------------------------------------------------------------------------
    new cdk.CfnOutput(this, 'WebSocketUrl', {
      value: stage.url,
      description: 'WebSocket endpoint URL — set as VITE_SIGNALING_URL in client/.env',
      exportName: 'TictactoeSignalingUrl',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: table.tableName,
      description: 'DynamoDB table name',
    });
  }
}
