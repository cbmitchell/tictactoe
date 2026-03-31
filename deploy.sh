#!/bin/bash
# deploy.sh — deploys infra and prints the values needed for client/.env.local

set -e

echo "Deploying CDK stack..."
cd infra && npx cdk deploy --outputs-file ../cdk-outputs.json
cd ..

echo ""
echo "Stack deployed. Add these to client/.env.local:"
echo ""

SIGNALING_URL=$(cat cdk-outputs.json | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['TictactoeSignalingStack']['WebSocketUrl'])")
echo "VITE_SIGNALING_URL=${SIGNALING_URL}"

SECRET=$(aws secretsmanager get-secret-value \
  --secret-id tictactoe/connect-secret \
  --query SecretString \
  --output text)
echo "VITE_CONNECT_SECRET=${SECRET}"

echo ""
echo "Then run: cd client && npm run build"
