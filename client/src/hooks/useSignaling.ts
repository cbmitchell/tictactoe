// useSignaling — manages the WebSocket connection to the API Gateway signaling
// backend and exposes typed send/receive primitives to the rest of the app.
//
// Responsibilities:
//   - Open and maintain the WebSocket connection
//   - Parse incoming server messages and dispatch them to registered handlers
//   - Expose sendCreateGame, sendJoinGame, sendSignal helpers
//   - Expose connection status so the UI can show loading/error states
//
// This hook does NOT know about WebRTC or game logic. It is purely the
// transport layer between the client and the signaling server.

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  ClientMessage,
  ServerMessage,
} from '../lib/signaling';

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL as string;

export type SignalingStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface UseSignalingReturn {
  status: SignalingStatus;
  sendCreateGame: () => void;
  sendJoinGame: (code: string) => void;
  sendSignal: (payload: RTCSessionDescriptionInit | RTCIceCandidateInit) => void;
  onMessage: (handler: (msg: ServerMessage) => void) => () => void;
  connect: () => void;
  disconnect: () => void;
}

export function useSignaling(): UseSignalingReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<(msg: ServerMessage) => void>>(new Set());
  const [status, setStatus] = useState<SignalingStatus>('idle');

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn('useSignaling: attempted to send while not connected', msg);
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setStatus('connecting');
    const ws = new WebSocket(SIGNALING_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('signaling: connected');
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        console.error('signaling: failed to parse message', event.data);
        return;
      }
      console.log('signaling: received', msg);
      handlersRef.current.forEach((h) => h(msg));
    };

    ws.onerror = (err) => {
      console.error('signaling: WebSocket error', err);
      setStatus('error');
    };

    ws.onclose = () => {
      console.log('signaling: disconnected');
      setStatus('disconnected');
    };
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const onMessage = useCallback(
    (handler: (msg: ServerMessage) => void): (() => void) => {
      handlersRef.current.add(handler);
      return () => {
        handlersRef.current.delete(handler);
      };
    },
    []
  );

  const sendCreateGame = useCallback(
    () => send({ action: 'create-game' }),
    [send]
  );

  const sendJoinGame = useCallback(
    (code: string) => send({ action: 'join-game', code }),
    [send]
  );

  const sendSignal = useCallback(
    (payload: RTCSessionDescriptionInit | RTCIceCandidateInit) =>
      send({ action: 'signal', payload }),
    [send]
  );

  return {
    status,
    sendCreateGame,
    sendJoinGame,
    sendSignal,
    onMessage,
    connect,
    disconnect,
  };
}
