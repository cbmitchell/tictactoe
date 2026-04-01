// App.tsx — top-level component.
//
// Manages the overall app state machine:
//   lobby       → player is on the lobby screen (create or join game)
//   signaling   → WebSocket connected, waiting for peer to join/offer
//   playing     → WebRTC data channel open, game in progress
//   ended       → game is over (win, draw, or opponent disconnected)
//
// Wires together useSignaling, useWebRTC, and useGame and passes the right
// props down to child components.

import { useState, useCallback, useEffect } from 'react';
import { useSignaling } from './hooks/useSignaling';
import { useWebRTC } from './hooks/useWebRTC';
import { useGame, Role } from './hooks/useGame';
import { useDarkMode } from './hooks/useDarkMode';
import { DataChannelMessage, ServerMessage } from './lib/signaling';
import Lobby from './components/Lobby';
import Board from './components/Board';
import GameStatus from './components/GameStatus';

type AppView = 'lobby' | 'signaling' | 'playing' | 'ended';

const params = new URLSearchParams(window.location.search);
const URL_INVITE_CODE = params.get('code')?.toUpperCase() ?? null;

export default function App() {
  const { isDark, toggle: toggleDark } = useDarkMode();
  const [view, setView] = useState<AppView>('lobby');
  const [role, setRole] = useState<Role>(URL_INVITE_CODE ? 'guest' : 'host');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);

  // Data message handlers — registered by useGame, called by useWebRTC
  type DataHandler = (msg: DataChannelMessage) => void;
  const [dataHandlers] = useState(() => new Set<DataHandler>());

  const onDataMessage = useCallback(
    (handler: DataHandler) => {
      dataHandlers.add(handler);
      return () => { dataHandlers.delete(handler); };
    },
    [dataHandlers]
  );

  const handleDataMessage = useCallback(
    (msg: DataChannelMessage) => {
      dataHandlers.forEach((h) => h(msg));
    },
    [dataHandlers]
  );

  // -----------------------------------------------------------------------
  // Signaling
  // -----------------------------------------------------------------------
  const signaling = useSignaling();

  // Handle incoming signaling server messages
  useEffect(() => {
    const unsubscribe = signaling.onMessage((msg: ServerMessage) => {
      switch (msg.action) {
        case 'game-code':
          setInviteCode(msg.code);
          break;

        case 'peer-joined':
          // Host: guest has joined — initiate WebRTC handshake
          webrtc.initAsHost();
          setView('signaling');
          break;

        case 'waiting-for-offer':
          // Guest: joined successfully — wait for host's offer
          webrtc.initAsGuest();
          setView('signaling');
          break;

        case 'opponent-disconnected':
          setOpponentDisconnected(true);
          setView('ended');
          break;

        case 'error':
          console.error('Signaling error:', msg.message);
          break;
      }
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signaling.onMessage]);

  // -----------------------------------------------------------------------
  // WebRTC
  // -----------------------------------------------------------------------
  const webrtc = useWebRTC({
    sendSignal: signaling.sendSignal,
    onSignalingMessage: signaling.onMessage,
    onDataMessage: handleDataMessage,
  });

  // Transition to playing once the data channel is open
  useEffect(() => {
    if (webrtc.rtcStatus === 'connected') {
      setView('playing');
      // Disconnect from signaling server — no longer needed
      signaling.disconnect();
    }
  }, [webrtc.rtcStatus, signaling.disconnect]);

  // Detect peer disconnection during gameplay
  useEffect(() => {
    if (
      (webrtc.rtcStatus === 'disconnected' || webrtc.rtcStatus === 'failed') &&
      (view === 'playing' || view === 'ended')
    ) {
      setOpponentDisconnected(true);
      setView('ended');
    }
  }, [webrtc.rtcStatus, view]);

  // -----------------------------------------------------------------------
  // Game
  // -----------------------------------------------------------------------
  const game = useGame({
    role,
    sendData: webrtc.sendData,
    onDataMessage,
    onPlayAgain: useCallback(() => setView('playing'), []),
  });

  // Transition to ended when game is over
  useEffect(() => {
    if (game.isOver && view === 'playing') {
      setView('ended');
    }
  }, [game.isOver, view]);

  // -----------------------------------------------------------------------
  // Lobby actions
  // -----------------------------------------------------------------------
  const handleCreateGame = useCallback(() => {
    setRole('host');
    setOpponentDisconnected(false);
    signaling.connect();
    // send create-game once connected
    const unsubscribe = signaling.onMessage(() => {});
    // Wait for connected status then send — handled reactively below
    unsubscribe();
  }, [signaling]);

  // Send create-game once the signaling connection is open
  useEffect(() => {
    if (signaling.status === 'connected' && role === 'host' && !inviteCode) {
      signaling.sendCreateGame();
    }
  }, [signaling.status, role, inviteCode, signaling.sendCreateGame]);

  const handleJoinGame = useCallback(
    (code: string) => {
      setRole('guest');
      setOpponentDisconnected(false);
      signaling.connect();
      // Send join-game once connected — handled reactively below
      // Store the code so the effect below can use it
      setPendingJoinCode(code);
    },
    [signaling]
  );

  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(URL_INVITE_CODE);

  useEffect(() => {
    if (
      signaling.status === 'connected' &&
      role === 'guest' &&
      pendingJoinCode
    ) {
      signaling.sendJoinGame(pendingJoinCode);
      setPendingJoinCode(null);
      if (window.location.search) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }, [signaling.status, role, pendingJoinCode, signaling.sendJoinGame]);

  // Auto-connect when arriving via an invite link
  useEffect(() => {
    if (URL_INVITE_CODE) {
      signaling.connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlayAgain = useCallback(() => {
    setOpponentDisconnected(false);
    game.requestPlayAgain();
  }, [game]);

  const handleDisconnect = useCallback(() => {
    webrtc.close();
    signaling.disconnect();
    setInviteCode(null);
    setOpponentDisconnected(false);
    game.resetGame();
    setView('lobby');
  }, [webrtc, signaling, game]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="h-dvh overflow-y-auto bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans transition-colors duration-200">
      {/* Dark mode toggle */}
      <div className="fixed top-4 right-4 z-10">
        <button
          onClick={toggleDark}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-2 rounded-full bg-white dark:bg-gray-800 shadow-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          {isDark ? (
            // Sun icon
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07-.71.71M6.34 17.66l-.71.71m12.73 0-.71-.71M6.34 6.34l-.71-.71M12 7a5 5 0 1 0 0 10A5 5 0 0 0 12 7z" />
            </svg>
          ) : (
            // Moon icon
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>

      <div className="flex flex-col items-center justify-center min-h-full px-4 py-4">
        {(view === 'lobby' || view === 'signaling') && (
          <h1 className="text-3xl font-bold tracking-tight mb-8 text-gray-800 dark:text-gray-100">
            Tic-Tac-Toe
          </h1>
        )}

        {(view === 'lobby' || view === 'signaling') && (
          <Lobby
            signalingStatus={signaling.status}
            inviteCode={inviteCode}
            onCreateGame={handleCreateGame}
            onJoinGame={handleJoinGame}
            onCancel={handleDisconnect}
          />
        )}

        {(view === 'playing' || view === 'ended') && (
          <div className="flex flex-col items-center gap-6 w-full max-w-sm">
            <GameStatus
              mySymbol={game.mySymbol}
              currentTurn={game.currentTurn}
              winner={game.winner}
              isDrawn={game.isDrawn}
              isMyTurn={game.isMyTurn}
              opponentDisconnected={opponentDisconnected}
              isOver={game.isOver || opponentDisconnected}
              localWantsPlayAgain={game.localWantsPlayAgain}
              peerWantsPlayAgain={game.peerWantsPlayAgain}
              onPlayAgain={handlePlayAgain}
              onDisconnect={handleDisconnect}
            />
            <Board
              board={game.board}
              winningLine={game.winningLine}
              isMyTurn={game.isMyTurn}
              onSquareClick={game.makeMove}
            />
          </div>
        )}
      </div>
    </div>
  );
}
