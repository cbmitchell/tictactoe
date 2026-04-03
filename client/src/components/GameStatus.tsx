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
  isLocal: boolean;
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
  isLocal,
  onPlayAgain,
  onDisconnect,
}: GameStatusProps) {
  let message: string;

  if (isLocal) {
    if (winner)       message = `${winner} wins!`;
    else if (isDrawn) message = "It's a draw.";
    else              message = `${currentTurn}'s turn.`;
  } else if (opponentDisconnected) {
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

  const symbolColor =
    mySymbol === 'X'
      ? 'text-indigo-600 dark:text-indigo-400'
      : 'text-rose-500 dark:text-rose-400';

  let rematchUI: React.ReactNode = null;
  if (isOver && !opponentDisconnected) {
    if (isLocal) {
      rematchUI = (
        <button
          onClick={onPlayAgain}
          className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm transition-colors"
        >
          Play again
        </button>
      );
    } else if (localWantsPlayAgain) {
      rematchUI = (
        <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">
          Waiting for opponent to accept rematch…
        </p>
      );
    } else if (peerWantsPlayAgain) {
      rematchUI = (
        <div className="flex flex-col items-center gap-2 w-full">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Your opponent wants a rematch.
          </p>
          <button
            onClick={onPlayAgain}
            className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm transition-colors"
          >
            Accept rematch
          </button>
        </div>
      );
    } else {
      rematchUI = (
        <button
          onClick={onPlayAgain}
          className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm transition-colors"
        >
          Play again
        </button>
      );
    }
  }

  return (
    <div className="w-full bg-white dark:bg-gray-900 rounded-2xl shadow-lg dark:shadow-gray-950 p-5 flex flex-col items-center gap-4">
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        {isLocal ? (
          <span>Local game</span>
        ) : (
          <>
            <span>Playing as</span>
            <span className={`font-bold text-base ${symbolColor}`}>{mySymbol}</span>
          </>
        )}
      </div>

      <p className={`text-base font-semibold text-center ${
        opponentDisconnected
          ? 'text-red-500 dark:text-red-400'
          : winner
          ? isLocal || winner === mySymbol
            ? 'text-indigo-600 dark:text-indigo-400'
            : 'text-gray-600 dark:text-gray-300'
          : isDrawn
          ? 'text-gray-600 dark:text-gray-300'
          : 'text-gray-800 dark:text-gray-100'
      }`}>
        {message}
      </p>

      {rematchUI}

      <button
        onClick={onDisconnect}
        className="text-xs text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
      >
        Disconnect
      </button>
    </div>
  );
}
