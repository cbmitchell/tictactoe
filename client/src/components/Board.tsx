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
    <div className="grid grid-cols-3 gap-2 w-full max-w-xs sm:max-w-sm aspect-square">
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
            className={[
              'flex items-center justify-center rounded-xl text-4xl sm:text-5xl font-bold transition-all duration-150 aspect-square select-none',
              // Base background
              isWinning
                ? 'bg-indigo-100 dark:bg-indigo-900/50'
                : 'bg-white dark:bg-gray-900',
              // Border
              'border-2',
              isWinning
                ? 'border-indigo-400 dark:border-indigo-500'
                : 'border-gray-200 dark:border-gray-700',
              // Text color by symbol
              value === 'X'
                ? isWinning
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-indigo-500 dark:text-indigo-400'
                : value === 'O'
                ? isWinning
                  ? 'text-rose-500 dark:text-rose-400'
                  : 'text-rose-400 dark:text-rose-400'
                : '',
              // Hover / cursor for clickable squares
              isClickable
                ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                : 'cursor-default',
              // Dim non-winning squares when there's a winner
              winningSet && !isWinning ? 'opacity-40' : 'opacity-100',
            ].join(' ')}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}
