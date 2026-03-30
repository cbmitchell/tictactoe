// Board.tsx — renders the 3×3 tic-tac-toe grid.
//
// Squares are indexed 0–8 in row-major order:
//   0 | 1 | 2
//   ---------
//   3 | 4 | 5
//   ---------
//   6 | 7 | 8
//
// Highlights the winning line when the game is over.
// Dims non-winning squares after the game ends.
// Only fires onSquareClick when it is the local player's turn.

import { Board, Square } from '../lib/signaling';

interface BoardProps {
  board: Board;
  winningLine: [number, number, number] | null;
  isMyTurn: boolean;
  onSquareClick: (square: number) => void;
}

export default function BoardComponent({
  board,
  winningLine,
  isMyTurn,
  onSquareClick,
}: BoardProps) {
  const winningSet = winningLine ? new Set(winningLine) : null;

  return (
    <div>
      {board.map((value: Square, index: number) => {
        const isWinning = winningSet?.has(index) ?? false;
        const isEmpty = value === null;
        const isClickable = isEmpty && isMyTurn;

        return (
          <button
            key={index}
            onClick={() => isClickable && onSquareClick(index)}
            disabled={!isClickable}
            data-winning={isWinning}
            data-value={value ?? ''}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}
