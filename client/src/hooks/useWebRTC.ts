// useWebRTC — manages the RTCPeerConnection lifecycle, ICE negotiation,
// and the data channel used for peer-to-peer game messages.
//
// Responsibilities:
//   - Create and configure RTCPeerConnection with STUN/TURN servers
//   - Handle the offer/answer handshake as either host or guest
//   - Exchange ICE candidates via the signaling layer
//   - Open and maintain the RTCDataChannel
//   - Expose a typed send primitive for game messages
//   - Expose connection status so the UI can reflect peer connection state
//
// This hook does NOT know about game logic. It receives signaling messages
// from useSignaling and produces/consumes raw DataChannel messages.
// Game logic lives in useGame.ts.
//
// Usage:
//   const rtc = useWebRTC({ role, onMessage, sendSignal, onMessage: signalingOnMessage });
//   rtc.initAsHost()   — called when host receives 'peer-joined'
//   rtc.initAsGuest()  — called when guest receives 'waiting-for-offer'

import { useEffect, useRef, useCallback, useState } from 'react';
import { DataChannelMessage, IncomingSignalMessage } from '../lib/signaling';
import { UseSignalingReturn } from './useSignaling';

const TURN_CREDENTIALS_URL =
  import.meta.env.VITE_TURN_CREDENTIALS_URL as string | undefined;

async function fetchIceServers(): Promise<RTCIceServer[]> {
  const stun: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

  if (!TURN_CREDENTIALS_URL) return stun;

  try {
    const res = await fetch(TURN_CREDENTIALS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { iceServers } = await res.json() as { iceServers: RTCIceServer };
    console.log('rtc: TURN credentials fetched', { urls: (iceServers.urls as string[]).length });
    return [...stun, iceServers];
  } catch (err) {
    console.warn('rtc: failed to fetch TURN credentials, falling back to STUN only', err);
    return stun;
  }
}

export type RTCStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed';

export interface UseWebRTCProps {
  sendSignal: UseSignalingReturn['sendSignal'];
  onSignalingMessage: UseSignalingReturn['onMessage'];
  onDataMessage: (msg: DataChannelMessage) => void;
}

export interface UseWebRTCReturn {
  rtcStatus: RTCStatus;
  initAsHost: () => Promise<void>;
  initAsGuest: () => Promise<void>;
  sendData: (msg: DataChannelMessage) => void;
  close: () => void;
}

export function useWebRTC({
  sendSignal,
  onSignalingMessage,
  onDataMessage,
}: UseWebRTCProps): UseWebRTCReturn {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const [rtcStatus, setRtcStatus] = useState<RTCStatus>('idle');

  // Keep a stable ref to the onDataMessage callback so the channel handler
  // doesn't go stale
  const onDataMessageRef = useRef(onDataMessage);
  useEffect(() => {
    onDataMessageRef.current = onDataMessage;
  }, [onDataMessage]);

  const createPeerConnection = useCallback((iceServers: RTCIceServer[]): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        console.log('rtc: ICE candidate', { protocol: candidate.protocol, type: candidate.type });
        sendSignal(candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('rtc: connectionState', pc.connectionState);
      switch (pc.connectionState) {
        case 'connecting':
          setRtcStatus('connecting');
          break;
        case 'connected':
          setRtcStatus('connected');
          break;
        case 'disconnected':
        case 'closed':
          setRtcStatus('disconnected');
          break;
        case 'failed':
          setRtcStatus('failed');
          break;
      }
    };

    return pc;
  }, [sendSignal]);

  const attachDataChannel = useCallback((channel: RTCDataChannel) => {
    channelRef.current = channel;
    channel.onmessage = (event) => {
      let msg: DataChannelMessage;
      try {
        msg = JSON.parse(event.data as string) as DataChannelMessage;
      } catch {
        console.error('rtc: failed to parse data channel message', event.data);
        return;
      }
      onDataMessageRef.current(msg);
    };

    channel.onopen = () => console.log('rtc: data channel open');
    channel.onclose = () => console.log('rtc: data channel closed');
    channel.onerror = (err) => console.error('rtc: data channel error', err);
  }, []);

  // Listen for incoming signal messages from the signaling server and
  // apply them to the peer connection
  useEffect(() => {
    const unsubscribe = onSignalingMessage((msg) => {
      if (msg.action !== 'signal') return;
      const { payload } = msg as IncomingSignalMessage;
      const pc = pcRef.current;
      if (!pc) return;

      if ('type' in payload) {
        // RTCSessionDescriptionInit (offer or answer)
        pc.setRemoteDescription(new RTCSessionDescription(payload))
          .then(async () => {
            if (payload.type === 'offer') {
              // Guest receives offer — create and send answer
              console.log('rtc: offer received, creating answer');
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              sendSignal(answer);
              console.log('rtc: answer created and sent');
            }
          })
          .catch((err) => console.error('rtc: setRemoteDescription failed', err));
      } else {
        // RTCIceCandidateInit
        pc.addIceCandidate(new RTCIceCandidate(payload)).catch((err) =>
          console.error('rtc: addIceCandidate failed', err)
        );
      }
    });

    return unsubscribe;
  }, [onSignalingMessage, sendSignal]);

  // Host: create offer and data channel
  const initAsHost = useCallback(async () => {
    console.log('rtc: initAsHost called');
    const iceServers = await fetchIceServers();
    const pc = createPeerConnection(iceServers);

    // Host creates the data channel
    const channel = pc.createDataChannel('game', { ordered: true });
    attachDataChannel(channel);

    console.log('rtc: creating offer');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(offer);
    console.log('rtc: offer created and sent');
  }, [createPeerConnection, attachDataChannel, sendSignal]);

  // Guest: wait for the data channel to be offered by the host
  const initAsGuest = useCallback(async () => {
    console.log('rtc: initAsGuest called');
    const iceServers = await fetchIceServers();
    const pc = createPeerConnection(iceServers);

    // Guest receives the data channel created by the host
    pc.ondatachannel = ({ channel }) => {
      attachDataChannel(channel);
    };
  }, [createPeerConnection, attachDataChannel]);

  const sendData = useCallback((msg: DataChannelMessage) => {
    const channel = channelRef.current;
    if (channel?.readyState === 'open') {
      channel.send(JSON.stringify(msg));
    } else {
      console.warn('rtc: attempted to send data while channel is not open', msg);
    }
  }, []);

  const close = useCallback(() => {
    channelRef.current?.close();
    pcRef.current?.close();
    channelRef.current = null;
    pcRef.current = null;
    setRtcStatus('idle');
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      channelRef.current?.close();
      pcRef.current?.close();
    };
  }, []);

  return {
    rtcStatus,
    initAsHost,
    initAsGuest,
    sendData,
    close,
  };
}
