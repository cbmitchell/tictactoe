// Typed definitions for every message that crosses the signaling WebSocket.
// Keep this file in sync with the Lambda handlers in /infra/lambda/.
//
// Messages sent FROM the client TO the server:
//   CreateGameMessage  — request a new game session and invite code
//   JoinGameMessage    — join an existing session by invite code
//   SignalMessage      — relay a WebRTC signaling payload to the other peer
//
// Messages sent FROM the server TO the client:
//   GameCodeMessage        — server responds to create-game with the invite code
//   PeerJoinedMessage      — host receives this when guest joins; should send offer
//   WaitingForOfferMessage — guest receives this after joining; wait for host offer
//   SignalMessage          — forwarded WebRTC payload from the other peer
//   OpponentDisconnectedMessage — other peer disconnected
//   ErrorMessage           — server-side error

// -----------------------------------------------------------------------
// Client → Server
// -----------------------------------------------------------------------

export interface CreateGameMessage {
  action: 'create-game';
}

export interface JoinGameMessage {
  action: 'join-game';
  code: string;
}

export interface SignalMessage {
  action: 'signal';
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

export type ClientMessage = CreateGameMessage | JoinGameMessage | SignalMessage;

// -----------------------------------------------------------------------
// Server → Client
// -----------------------------------------------------------------------

export interface GameCodeMessage {
  action: 'game-code';
  code: string;
}

export interface PeerJoinedMessage {
  action: 'peer-joined';
}

export interface WaitingForOfferMessage {
  action: 'waiting-for-offer';
}

export interface IncomingSignalMessage {
  action: 'signal';
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

export interface OpponentDisconnectedMessage {
  action: 'opponent-disconnected';
}

export interface ErrorMessage {
  action: 'error';
  message: string;
}

export type ServerMessage =
  | GameCodeMessage
  | PeerJoinedMessage
  | WaitingForOfferMessage
  | IncomingSignalMessage
  | OpponentDisconnectedMessage
  | ErrorMessage;

// -----------------------------------------------------------------------
// Game messages — sent peer-to-peer over the WebRTC data channel.
// These never touch the signaling server.
// -----------------------------------------------------------------------

export interface MoveMessage {
  type: 'move';
  square: number; // 0–63, index formula: layer * 16 + row * 4 + col
}

export interface PlayAgainMessage {
  type: 'play-again';
}

export type DataChannelMessage = MoveMessage | PlayAgainMessage;

// -----------------------------------------------------------------------
// Game types (used by both signaling.ts and gameLogic.ts)
// -----------------------------------------------------------------------

export type Player = 'X' | 'O';
export type Square = Player | null;
export type Board = Square[];
