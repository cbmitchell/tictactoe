# Tic-Tac-Toe — Project Context for Claude Code

This file captures the architectural decisions made during the design phase of
this project. Read it fully before making any implementation decisions. When in
doubt about why something is structured a certain way, the answer is likely here.

---

## What this app is

A browser-based tic-tac-toe game where two players connect peer-to-peer to play
in real time. Players who know each other share invite codes out of band (text,
Discord, etc.) to establish a game session. There is no matchmaking, no accounts,
and no public lobby.

---

## Architecture overview

This app uses a **WebRTC peer-to-peer** architecture. Game state never touches a
server — it travels directly between the two players' browsers over a WebRTC data
channel. A serverless AWS signaling backend exists solely to broker the initial
WebRTC connection handshake. Once the peers are connected, the signaling backend
is completely out of the picture for that session.

### Why P2P instead of a dedicated game server

- Near-zero infrastructure cost (the signaling backend fits entirely within AWS
  free tier)
- No warm-up time — WebRTC connections establish in seconds once both peers are
  online, with no server to spin up
- No server-side state to manage — the game is entirely client-side
- Scales naturally — adding more players adds zero server load
- Cheating is not a concern for a friends-only app

### Why not Socket.io / dedicated Node server

A dedicated game server was extensively considered and rejected. The main issues
were: flat-rate load balancer costs (~$16/month just to exist), dynamic Fargate
task IP management requiring Route 53 + Lambda orchestration, and 45–75 second
warm-up time if using on-demand spin-up. P2P eliminates all of these.

---

## Signaling backend

### Technology

- **AWS API Gateway WebSocket API** — persistent WebSocket connections for
  clients during the handshake phase
- **AWS Lambda** — one function per WebSocket route, stateless handlers
- **AWS DynamoDB** — stores session state (invite codes, connection IDs) during
  the handshake window
- **AWS CDK (TypeScript)** — all infrastructure defined as code, located in
  `/infra`

### What the signaling backend does

1. Player A connects and sends `create-game` → server generates an invite code,
   stores Player A's connection ID, returns the code
2. Player B connects and sends `join-game` with the code → server looks up
   Player A's connection ID, notifies both peers they are paired
3. Both peers exchange WebRTC offer, answer, and ICE candidates by sending
   `signal` messages → server relays them verbatim to the other peer
4. Once the WebRTC data channel is open, both peers disconnect from the
   signaling server — it plays no further role in the game

### What the signaling backend does NOT do

- It does not validate moves
- It does not store game state
- It does not know anything about tic-tac-toe
- It does not need to stay connected during gameplay

### Lambda functions

| Route | Handler file | Responsibility |
|---|---|---|
| `$connect` | `lambda/connect/index.ts` | Minimal — log connection, nothing to store yet |
| `$disconnect` | `lambda/disconnect/index.ts` | Look up session, notify other peer, clean up DynamoDB records |
| `create-game` | `lambda/create-game/index.ts` | Generate invite code, store session, return code to caller |
| `join-game` | `lambda/join-game/index.ts` | Look up session by code, pair peers, notify both |
| `signal` | `lambda/signal/index.ts` | Look up sender's session, forward payload verbatim to other peer |

### DynamoDB table structure

Single table, two access patterns:

```
PK: "CODE#<inviteCode>"  →  { hostConnectionId, guestConnectionId?, ttl }
PK: "CONN#<connectionId>" →  { code, role: "host" | "guest", ttl }
```

- `CODE#` records are created by `create-game` and updated by `join-game`
- `CONN#` records are created by `create-game` (host) and `join-game` (guest)
- Both record types are deleted on disconnect by `disconnect` handler
- TTL is set to 24 hours from creation on all records — DynamoDB auto-expires
  stale sessions from abandoned games

### API Gateway WebSocket routes

```
$connect     → ConnectFunction
$disconnect  → DisconnectFunction
create-game  → CreateGameFunction
join-game    → JoinGameFunction
signal       → SignalFunction
```

The `signal` route is the hot path — all WebRTC offer/answer/ICE candidate
messages flow through it. The handler is intentionally dumb: it does not inspect
the payload, it just finds the other peer's connection ID and forwards it.

### IAM permissions (least privilege)

- Each Lambda only has the DynamoDB permissions it needs:
  - `connect`: none
  - `disconnect`: GetItem, DeleteItem
  - `create-game`: PutItem
  - `join-game`: GetItem, UpdateItem, PutItem
  - `signal`: GetItem
- All Lambdas need `execute-api:ManageConnections` on the API Gateway stage ARN
  to call `postToConnection`

### Cost expectation

Essentially free at this app's scale. API Gateway WebSocket, Lambda, and
DynamoDB all fall well within AWS free tier for a friends-only app. Total cost
rounds to zero or low single-digit cents per month.

### $connect authorizer and shared secret

The `$connect` WebSocket route is protected by a REQUEST authorizer Lambda
(`lambda/authorizer/index.ts`). When a client upgrades to WebSocket it must
supply `?token=<secret>` in the URL. The authorizer compares the token against
a value stored in AWS Secrets Manager.

**Secret location:** Secrets Manager, name `tictactoe/connect-secret`

**How it works:**
- CDK auto-generates a 32-character alphanumeric secret on first deploy —
  the value never appears in source code or the CloudFormation template
- Run `./deploy.sh` from the project root to deploy and print both
  `VITE_SIGNALING_URL` and `VITE_CONNECT_SECRET` for `client/.env.local`
- The authorizer Lambda reads `SECRET_ARN` from its environment variable (the
  ARN is non-sensitive), fetches the secret value at first invocation, and
  caches it in module scope — warm invocations skip the Secrets Manager call
- The client embeds the matching value in the JS bundle via `VITE_CONNECT_SECRET`
  in `client/.env.local` (set at build time, never shown in the UI)

**Rotation:** Update the value in Secrets Manager. The Lambda picks it up on
its next cold start. Also update `client/.env.local` and rebuild/redeploy the
frontend so both sides stay in sync.

This is not strong authentication — it is a lightweight barrier against casual
abuse of the open API Gateway endpoint.

---

## WebRTC / client-side

### Libraries

- **PeerJS client** (`peerjs` npm package) — abstracts WebRTC's
  `RTCPeerConnection`, data channels, and ICE negotiation behind a simpler API
- PeerJS is configured with a **custom signaling server URL** pointing at the
  API Gateway WebSocket endpoint (not the default PeerJS cloud service)

### STUN/TURN

- **TURN provider: Cloudflare Realtime** — static/long-lived credentials are
  not supported; every `RTCPeerConnection` must be initialised with fresh
  credentials fetched from the `turn-credentials` Lambda immediately before
  the WebRTC handshake begins
- STUN (`stun.l.google.com:19302`) is always included as the first ICE server;
  TURN is appended when credentials are available
- TURN is the relay fallback for peers behind carrier-grade NAT (e.g. mobile
  data) where direct P2P connection fails
- If the `turn-credentials` fetch fails, `useWebRTC` falls back to STUN only
  and logs a warning — most connections on home WiFi will still succeed

### TURN credentials infrastructure

- **Secret:** `tictactoe/cloudflare-turn` in Secrets Manager — created manually
  in the AWS console before deploying (not managed by CDK). Format:
  `{ "keyId": "...", "apiToken": "..." }`. Key ID and API token come from the
  Cloudflare dashboard under Realtime → TURN keys.
- **Lambda:** `tictactoe-turn-credentials` — HTTP GET endpoint that caches the
  Cloudflare API credentials in module scope (warm invocations skip Secrets
  Manager) but always calls Cloudflare's credential API on each request since
  the returned TURN credentials are short-lived (1h TTL)
- **HTTP API:** separate API Gateway HTTP API (`tictactoe-http`), distinct from
  the WebSocket signaling API. The `turn-credentials` route is the only route.
- **Client env var:** `VITE_TURN_CREDENTIALS_URL` — set from the
  `TurnCredentialsUrl` CloudFormation output. Populated automatically by the
  GitHub Actions pipeline; set manually in `client/.env.local` for local dev.

### Client connection flow

1. Player opens app, connects to API Gateway WebSocket signaling endpoint
2. Player A: sends `create-game`, receives invite code, displays it
3. Player B: enters invite code, sends `join-game`
4. Both peers receive `peer-joined` / `waiting-for-offer` notifications
5. Host (Player A) creates `RTCPeerConnection`, generates offer, sends via
   `signal` route
6. Guest (Player B) receives offer, generates answer, sends via `signal` route
7. Both sides exchange ICE candidates via `signal` route
8. WebRTC data channel opens — signaling WebSocket is no longer needed
9. All game messages (moves, game state) travel over the data channel directly

### Game state ownership

- Host (Player A / the peer who created the game) is the authoritative source
  of game state
- Both peers independently validate moves for responsiveness, but host state
  wins on any conflict
- If host disconnects, the game ends — no reconnection or state recovery
- Disconnection is handled gracefully: show "opponent disconnected" message,
  offer to start a new game
- Game state is intentionally NOT persisted anywhere — no history, no resumption

### Game logic

- Standard tic-tac-toe: 3×3 grid, X goes first, first to three in a row wins
- Host plays as X, guest plays as O
- Win detection and draw detection run client-side on both peers
- Move validation: only the current player can make a move, only on empty squares

---

## Frontend

### Technology

- **React** with **TypeScript**
- **Vite** as the build tool
- Located in `/client`

### Key components (to be built out)

- `App.tsx` — top-level routing between lobby and game views
- `components/Lobby.tsx` — create game / join game UI, invite code display/entry
- `components/Board.tsx` — the 3×3 game board
- `components/GameStatus.tsx` — current turn, winner announcement, disconnect notice
- `hooks/useSignaling.ts` — manages the API Gateway WebSocket connection and
  signaling message handling
- `hooks/useWebRTC.ts` — manages the PeerJS/RTCPeerConnection lifecycle and data
  channel
- `hooks/useGame.ts` — game state, move validation, win detection
- `lib/signaling.ts` — typed message definitions for the signaling protocol
- `lib/gameLogic.ts` — pure functions for move validation and win detection

### Environment variables (client)

```
VITE_SIGNALING_URL=          # API Gateway WebSocket endpoint URL
VITE_TURN_CREDENTIALS_URL=   # TURN credentials endpoint (from TurnCredentialsUrl CFn output)
VITE_CONNECT_SECRET=         # Must match the value in Secrets Manager under 'tictactoe/connect-secret'
```

---

## Infrastructure (CDK)

### Stack location

`/infra` — TypeScript CDK app

### Constructs used

- `aws-cdk-lib/aws-apigatewayv2` — WebSocket API
- `aws-cdk-lib/aws-apigatewayv2-integrations` — Lambda integrations
- `aws-cdk-lib/aws-lambda-nodejs` — NodejsFunction construct (bundles TS Lambda
  with esbuild automatically)
- `aws-cdk-lib/aws-dynamodb` — single table
- `aws-cdk-lib/aws-iam` — least-privilege policies per Lambda

### Deployment

```bash
cd infra
npm run build
npx cdk deploy
```

### Useful CDK commands

```bash
npx cdk diff      # show pending changes
npx cdk synth     # synthesize CloudFormation template
npx cdk destroy   # tear down all resources
```

---

## CI/CD

### Workflows

**`deploy-infra.yml`** — triggers on changes to `infra/**`:
- Pull requests to `main`: runs `cdk diff` and posts the planned changes
- Pushes to `main`: runs `cdk deploy`, then captures the `WebSocketUrl` stack
  output as a job output for potential use by dependent workflows

**`deploy-frontend.yml`** — triggers on changes to `client/**` and
automatically after `deploy-infra.yml` completes on `main` (via
`workflow_run`). This ensures the frontend is always rebuilt with the latest
WebSocket URL and secret whenever infra changes. Steps: configure AWS
credentials, retrieve `WebSocketUrl` from CloudFormation, retrieve
`tictactoe/connect-secret` from Secrets Manager, build the client with both
values injected as env vars, deploy to GitHub Pages.

Both workflows use OIDC via `AWS_DEPLOY_ROLE_ARN` — no static AWS credentials
are stored in GitHub.

### GitHub repository variables

Set these in **Settings → Secrets and variables → Actions**:

| Name | Type | Purpose |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | Secret | Full ARN of the `tictactoe-github-actions` IAM role |
| `AWS_REGION` | Variable | AWS region for credentials and CLI commands |

### GitHub Actions IAM role

The role (`tictactoe-github-actions`) is created by CDK and output as
`GitHubActionsRoleArn` after deploy. It uses OIDC federation — trust is
restricted to `repo:<org>/<repo>:ref:refs/heads/main` via a `StringEquals`
condition, so only the main branch of the configured repository can assume it.

`GITHUB_ORG` and `GITHUB_REPO` must be set as environment variables when
running `cdk deploy` locally if the role needs to be created or updated:

```bash
GITHUB_ORG=your-username GITHUB_REPO=tictactoe npx cdk deploy
```

### GitHub Pages

The frontend is served at `https://<username>.github.io/tictactoe/`. The
`base: '/tictactoe/'` in `client/vite.config.ts` is required — without it
Vite emits absolute asset paths that resolve correctly on a root domain but
produce 404s on a subdirectory path.

---

## Project structure

```
tictactoe/
├── CLAUDE.md                  ← you are here
├── README.md
├── infra/                     ← CDK infrastructure
│   ├── bin/
│   │   └── app.ts             ← CDK app entry point
│   ├── lib/
│   │   └── signaling-stack.ts ← main CDK stack
│   ├── lambda/                ← Lambda function handlers
│   │   ├── connect/
│   │   │   └── index.ts
│   │   ├── disconnect/
│   │   │   └── index.ts
│   │   ├── create-game/
│   │   │   └── index.ts
│   │   ├── join-game/
│   │   │   └── index.ts
│   │   └── signal/
│   │       └── index.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── cdk.json
└── client/                    ← React frontend
    ├── src/
    │   ├── App.tsx
    │   ├── main.tsx
    │   ├── components/
    │   │   ├── Lobby.tsx
    │   │   ├── Board.tsx
    │   │   └── GameStatus.tsx
    │   ├── hooks/
    │   │   ├── useSignaling.ts
    │   │   ├── useWebRTC.ts
    │   │   └── useGame.ts
    │   └── lib/
    │       ├── signaling.ts
    │       └── gameLogic.ts
    ├── package.json
    ├── tsconfig.json
    └── vite.config.ts
```

---

## Decisions not yet made

These are open questions to resolve during implementation:

- Visual design / styling approach for the frontend
- Whether to add any persistence (e.g. game history) — current plan is no
- Custom domain setup (optional — API Gateway provides a default URL)
