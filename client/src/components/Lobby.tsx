// Lobby.tsx — the pre-game screen.
//
// States it renders:
//   1. Initial — two buttons: "Create game" and "Join game"
//   2. Waiting for code entry — input field to enter an invite code
//   3. Connecting — brief loading state while signaling WebSocket opens
//   4. Waiting for opponent — shows the invite code for the host to share,
//      tells guest that connection is being established
//
// The component is purely presentational — all state transitions are
// handled in App.tsx and passed down as props.

import { useState } from 'react';
import { SignalingStatus } from '../hooks/useSignaling';

interface LobbyProps {
  signalingStatus: SignalingStatus;
  inviteCode: string | null;
  onCreateGame: () => void;
  onJoinGame: (code: string) => void;
}

export default function Lobby({
  signalingStatus,
  inviteCode,
  onCreateGame,
  onJoinGame,
}: LobbyProps) {
  const [mode, setMode] = useState<'choose' | 'join'>('choose');
  const [codeInput, setCodeInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  const handleJoinSubmit = () => {
    const code = codeInput.trim().toUpperCase();
    if (code.length !== 6) {
      setInputError('Invite codes are 6 characters long.');
      return;
    }
    setInputError(null);
    onJoinGame(code);
  };

  // Connecting state — shown briefly before invite code arrives or
  // before peer-joined/waiting-for-offer is received
  const isConnecting =
    signalingStatus === 'connecting' || signalingStatus === 'connected';

  // Host waiting state — code has been received, waiting for guest
  const isWaitingForGuest = inviteCode !== null;

  // Guest waiting state — join submitted, waiting for WebRTC handshake
  const isWaitingForHost =
    signalingStatus === 'connected' && mode === 'join' && !inviteCode;

  return (
    <div>
      {/* Initial choice */}
      {mode === 'choose' && !isConnecting && (
        <>
          <button onClick={onCreateGame}>Create game</button>
          <button onClick={() => setMode('join')}>Join game</button>
        </>
      )}

      {/* Join flow — code entry */}
      {mode === 'join' && signalingStatus === 'idle' && (
        <>
          <input
            type="text"
            placeholder="Enter invite code"
            value={codeInput}
            maxLength={6}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleJoinSubmit()}
            autoFocus
          />
          {inputError && <p>{inputError}</p>}
          <button onClick={handleJoinSubmit}>Join</button>
          <button onClick={() => setMode('choose')}>Back</button>
        </>
      )}

      {/* Connecting */}
      {isConnecting && !isWaitingForGuest && !isWaitingForHost && (
        <p>Connecting…</p>
      )}

      {/* Host: waiting for guest to join */}
      {isWaitingForGuest && (
        <>
          <p>Share this code with your opponent:</p>
          <strong>{inviteCode}</strong>
          <p>Waiting for opponent to join…</p>
        </>
      )}

      {/* Guest: waiting for WebRTC handshake */}
      {isWaitingForHost && <p>Connecting to opponent…</p>}

      {/* Error states */}
      {signalingStatus === 'error' && (
        <p>Connection error. Please refresh and try again.</p>
      )}
    </div>
  );
}
