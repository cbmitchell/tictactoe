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
import { DataChannelMessage, ServerMessage } from './lib/signaling';
import Lobby from './components/Lobby';
import Board from './components/Board';
import GameStatus from './components/GameStatus';

type AppView = 'lobby' | 'signaling' | 'playing' | 'ended';

export default function App() {
  const [view, setView] = useState<AppView>('lobby');
  const [role, setRole] = useState<Role>('host');
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

  // -----------------------------------------------------------------------
  // Game
  // -----------------------------------------------------------------------
  const game = useGame({
    role,
    sendData: webrtc.sendData,
    onDataMessage,
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

  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(null);

  useEffect(() => {
    if (
      signaling.status === 'connected' &&
      role === 'guest' &&
      pendingJoinCode
    ) {
      signaling.sendJoinGame(pendingJoinCode);
      setPendingJoinCode(null);
    }
  }, [signaling.status, role, pendingJoinCode, signaling.sendJoinGame]);

  const handlePlayAgain = useCallback(() => {
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
    <div>
      {(view === 'lobby' || view === 'signaling') && (
        <Lobby
          signalingStatus={signaling.status}
          inviteCode={inviteCode}
          onCreateGame={handleCreateGame}
          onJoinGame={handleJoinGame}
        />
      )}

      {(view === 'playing' || view === 'ended') && (
        <>
          <GameStatus
            mySymbol={game.mySymbol}
            currentTurn={game.currentTurn}
            winner={game.winner}
            isDrawn={game.isDrawn}
            isMyTurn={game.isMyTurn}
            opponentDisconnected={opponentDisconnected}
            isOver={game.isOver || opponentDisconnected}
            onPlayAgain={handlePlayAgain}
          />
          <Board
            board={game.board}
            winningLine={game.winningLine}
            isMyTurn={game.isMyTurn}
            onSquareClick={game.makeMove}
          />
        </>
      )}
    </div>
  );
}
