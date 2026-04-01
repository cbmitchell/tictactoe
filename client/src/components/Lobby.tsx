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
  onCancel: () => void;
}

export default function Lobby({
  signalingStatus,
  inviteCode,
  onCreateGame,
  onJoinGame,
  onCancel,
}: LobbyProps) {
  const [mode, setMode] = useState<'choose' | 'join'>('choose');
  const [copied, setCopied] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?code=${inviteCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCancel = () => {
    setMode('choose');
    setCodeInput('');
    setInputError(null);
    onCancel();
  };

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
    <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-lg dark:shadow-gray-950 p-8 flex flex-col items-center gap-6">
      {/* Initial choice */}
      {mode === 'choose' && !isConnecting && (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Start a new game or join a friend's game with an invite code.
          </p>
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={onCreateGame}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm transition-colors"
            >
              Create game
            </button>
            <button
              onClick={() => setMode('join')}
              className="w-full py-2.5 px-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-sm transition-colors"
            >
              Join game
            </button>
          </div>
        </>
      )}

      {/* Join flow — code entry */}
      {mode === 'join' && (signalingStatus === 'idle' || signalingStatus === 'disconnected') && (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Enter the 6-character invite code your opponent shared with you.
          </p>
          <div className="flex flex-col gap-3 w-full">
            <input
              type="text"
              placeholder="XXXXXX"
              value={codeInput}
              maxLength={6}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinSubmit()}
              autoFocus
              className="w-full py-2.5 px-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-center text-xl font-mono tracking-widest placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {inputError && (
              <p className="text-sm text-red-500 dark:text-red-400 text-center">{inputError}</p>
            )}
            <button
              onClick={handleJoinSubmit}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm transition-colors"
            >
              Join
            </button>
            <button
              onClick={() => setMode('choose')}
              className="w-full py-2 px-4 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm transition-colors"
            >
              Back
            </button>
          </div>
        </>
      )}

      {/* Connecting */}
      {isConnecting && !isWaitingForGuest && !isWaitingForHost && (
        <div className="flex flex-col items-center gap-4 w-full">
          <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">Connecting…</p>
          <button
            onClick={handleCancel}
            className="w-full py-2 px-4 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Host: waiting for guest to join */}
      {isWaitingForGuest && (
        <div className="flex flex-col items-center gap-4 w-full">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Share this code with your opponent:
          </p>
          <div className="bg-gray-100 dark:bg-gray-800 rounded-xl px-6 py-4 w-full text-center">
            <span className="text-3xl font-mono font-bold tracking-widest text-indigo-600 dark:text-indigo-400 select-all">
              {inviteCode}
            </span>
          </div>
          <button
            onClick={handleCopyLink}
            className="w-full py-2.5 px-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-sm transition-colors"
          >
            {copied ? 'Copied!' : 'Copy invite link'}
          </button>
          <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">
            Waiting for opponent to join…
          </p>
          <button
            onClick={handleCancel}
            className="w-full py-2 px-4 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Guest: waiting for WebRTC handshake */}
      {isWaitingForHost && (
        <div className="flex flex-col items-center gap-4 w-full">
          <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">
            Connecting to opponent…
          </p>
          <button
            onClick={handleCancel}
            className="w-full py-2 px-4 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Error state */}
      {signalingStatus === 'error' && (
        <p className="text-sm text-red-500 dark:text-red-400 text-center">
          Connection error. Please refresh and try again.
        </p>
      )}
    </div>
  );
}
