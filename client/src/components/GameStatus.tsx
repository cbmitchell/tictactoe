// GameStatus.tsx — displays the current game state above the board.
//
// Shows:
//   - Whose turn it is (with distinction between "your turn" and "opponent's turn")
//   - Winner announcement
//   - Draw announcement
//   - Opponent disconnected notice
//   - Play again button when the game is over

import { Player } from '../lib/signaling';

interface GameStatusProps {
  mySymbol: Player;
  currentTurn: Player;
  winner: Player | null;
  isDrawn: boolean;
  isMyTurn: boolean;
  opponentDisconnected: boolean;
  isOver: boolean;
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

  return (
    <div>
      <p>You are playing as {mySymbol}</p>
      <p>{message}</p>
      {isOver && (
        <button onClick={onPlayAgain}>Play again</button>
      )}
      <button onClick={onDisconnect}>Disconnect</button>
    </div>
  );
}
