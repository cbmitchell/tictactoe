// GameStatus.tsx — displays the current game state above the board.
//
// Shows:
//   - Whose turn it is (with distinction between "your turn" and "opponent's turn")
//   - Winner announcement
//   - Draw announcement
//   - Opponent disconnected notice
//   - Play again button when the game is over

import React from 'react';
import { Player } from '../lib/signaling';

interface GameStatusProps {
  mySymbol: Player;
  currentTurn: Player;
  winner: Player | null;
  isDrawn: boolean;
  isMyTurn: boolean;
  opponentDisconnected: boolean;
  isOver: boolean;
  localWantsPlayAgain: boolean;
  peerWantsPlayAgain: boolean;
  onPlayAgain: () => void;
  onDisconnect: () => void;
}

export default function GameStatus({
  mySymbol,
  currentTurn,
  winner,
  isDrawn,
  isMyTurn,
  opponentDisconnected,
  isOver,
  localWantsPlayAgain,
  peerWantsPlayAgain,
  onPlayAgain,
  onDisconnect,
}: GameStatusProps) {
  let message: string;

  if (opponentDisconnected) {
    message = 'Your opponent disconnected.';
  } else if (winner) {
    message = winner === mySymbol ? 'You win!' : 'Your opponent wins.';
  } else if (isDrawn) {
    message = "It's a draw.";
  } else if (isMyTurn) {
    message = 'Your turn.';
  } else {
    message = `Waiting for opponent (${currentTurn})…`;
  }

  let rematchUI: React.ReactNode = null;
  if (isOver && !opponentDisconnected) {
    if (localWantsPlayAgain) {
      rematchUI = <p>Waiting for opponent to accept rematch…</p>;
    } else if (peerWantsPlayAgain) {
      rematchUI = (
        <>
          <p>Your opponent wants a rematch.</p>
          <button onClick={onPlayAgain}>Accept rematch</button>
        </>
      );
    } else {
      rematchUI = <button onClick={onPlayAgain}>Play again</button>;
    }
  }

  return (
    <div>
      <p>You are playing as {mySymbol}</p>
      <p>{message}</p>
      {rematchUI}
      <button onClick={onDisconnect}>Disconnect</button>
    </div>
  );
}
