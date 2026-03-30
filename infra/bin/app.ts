#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SignalingStack } from '../lib/signaling-stack';

const app = new cdk.App();

new SignalingStack(app, 'TictactoeSignalingStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: 'WebRTC signaling backend for peer-to-peer tic-tac-toe',
});
