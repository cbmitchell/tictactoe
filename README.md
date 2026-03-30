# Tic-Tac-Toe

A peer-to-peer browser tic-tac-toe game. Two players connect directly via
WebRTC using invite codes shared out of band. Game state never touches a
server — a lightweight AWS serverless backend handles only the WebRTC
connection handshake.

See `CLAUDE.md` for full architectural context and decision rationale.

---

## Architecture

```
Player A (browser) ←──WebRTC data channel──→ Player B (browser)
        ↕                                            ↕
   API Gateway WebSocket (signaling only — disconnects after handshake)
        ↕
   Lambda functions (connect / disconnect / create-game / join-game / signal)
        ↕
   DynamoDB (invite codes + connection IDs, TTL 24h)
```

---

## Prerequisites

- Node.js 20+
- AWS CLI configured (`aws configure`)
- AWS CDK bootstrapped in your account/region (`npx cdk bootstrap`)

---

## Project structure

```
tictactoe/
├── CLAUDE.md          Architecture context for Claude Code
├── README.md
├── infra/             CDK infrastructure (TypeScript)
│   ├── bin/app.ts
│   ├── lib/signaling-stack.ts
│   └── lambda/        Lambda handlers + shared utilities
└── client/            React + Vite frontend (TypeScript)
    └── src/
        ├── components/
        ├── hooks/
        └── lib/
```

---

## Setup

### 1. Install dependencies

```bash
# Infrastructure
cd infra
npm install

# Client
cd ../client
npm install
```

### 2. Deploy the signaling backend

```bash
cd infra
npx cdk deploy
```

After deployment, CDK prints a `WebSocketUrl` output. Copy it — you'll need
it in the next step.

### 3. Configure the client

```bash
cd client
cp .env.example .env.local
```

Edit `.env.local` and set `VITE_SIGNALING_URL` to the WebSocket URL from
the CDK output.

Optionally configure TURN server credentials (see `.env.example`). Without
them, the app falls back to STUN only, which works for most home network
connections.

### 4. Run the client locally

```bash
cd client
npm run dev
```

---

## Deployment (client)

The client is a standard Vite SPA — build it and host the `dist/` folder
anywhere that serves static files (S3 + CloudFront, Netlify, Vercel, etc.).

```bash
cd client
npm run build
# dist/ is ready to deploy
```

---

## Useful CDK commands

```bash
cd infra
npx cdk diff        # show pending infrastructure changes
npx cdk synth       # synthesize CloudFormation template
npx cdk deploy      # deploy / update stack
npx cdk destroy     # tear down all AWS resources
```

---

## How a game session works

1. Player A opens the app, clicks **Create game**
2. A WebSocket connection opens to the signaling backend
3. The backend generates a 6-character invite code and returns it
4. Player A shares the code with Player B out of band (text, Discord, etc.)
5. Player B enters the code and clicks **Join**
6. The backend pairs both players and triggers the WebRTC handshake
7. Player A (host) sends a WebRTC offer; Player B (guest) sends an answer
8. ICE candidates are exchanged via the signaling backend
9. A direct WebRTC data channel opens between the browsers
10. Both players disconnect from the signaling backend — it plays no further role
11. All game moves travel peer-to-peer over the data channel

---

## Cost

The signaling backend runs entirely within AWS free tier at this app's scale.
Expected cost: $0–0.05/month.
