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

### 2. One-time GitHub setup

Before the first deploy, configure the following in your GitHub repository
under **Settings → Secrets and variables → Actions**:

**Secrets** (Settings → Secrets and variables → Actions → Secrets):

| Secret | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | ARN of the `tictactoe-github-actions` IAM role (output by CDK after first deploy) |

**Variables** (Settings → Secrets and variables → Actions → Variables):

| Variable | Value |
|---|---|
| `AWS_REGION` | Region you're deploying to (e.g. `us-east-1`) |

Then enable GitHub Pages: **Settings → Pages → Source → GitHub Actions**.

### 3. Initial CDK deploy (creates the IAM role)

The GitHub Actions IAM role is created by CDK itself, so the first deploy must
be run locally. Set `GITHUB_ORG` and `GITHUB_REPO` so the role is scoped to
your repository:

```bash
GITHUB_ORG=your-username GITHUB_REPO=tictactoe ./deploy.sh
```

After this succeeds, all future deploys run automatically on push to `main`.

### 4. Configure client/.env.local (local development only)

```bash
cd client
cp .env.example .env.local
```

Populate `.env.local` with the values printed by `deploy.sh` (or retrieve them
at any time with the AWS CLI):

```bash
# WebSocket URL
aws cloudformation describe-stacks \
  --stack-name TictactoeSignalingStack \
  --query "Stacks[0].Outputs[?OutputKey=='WebSocketUrl'].OutputValue" \
  --output text

# Connect secret
aws secretsmanager get-secret-value \
  --secret-id tictactoe/connect-secret \
  --query SecretString \
  --output text
```

Optionally configure TURN server credentials (see `.env.example`). Without
them, the app falls back to STUN only, which works for most home network
connections.

### 5. Run the client locally

```bash
cd client
npm run dev
```

---

## Deployment

Push to `main` — the GitHub Actions workflow handles everything automatically:
infra deployment, secret retrieval, frontend build, and GitHub Pages deployment.

The frontend is served at `https://<your-username>.github.io/tictactoe/`.

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
