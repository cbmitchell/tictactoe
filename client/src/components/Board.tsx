// Board.tsx — renders the 4×4×4 tic-tac-toe board as 4 perspective layers.
//
// Board is a flat 64-cell array. Index formula: layer * 16 + row * 4 + col.
// Layers are displayed top-to-bottom (layer 0 at top).
// Each layer is rendered with a CSS perspective transform for a 3D look.

import { Board, Square } from '../lib/signaling';

interface BoardProps {
  board: Board;
  winningLine: number[] | null;
  isMyTurn: boolean;
  onSquareClick: (square: number) => void;
}

// Cell heights increase layer by layer to simulate perspective depth
const CELL_HEIGHTS = ['h-7', 'h-9', 'h-11', 'h-14'];

// rotateX(45deg) with transformOrigin:center bottom compresses visual content
// toward the layout bottom, leaving dead space at the top of each layer's box.
// Negative margins pull subsequent layers up to close that gap.
const NEGATIVE_MARGINS = [0, -40, -56, -82];

function LayerGrid({
  layer,
  board,
  winningSet,
  isMyTurn,
  onSquareClick,
}: {
  layer: number;
  board: Board;
  winningSet: Set<number> | null;
  isMyTurn: boolean;
  onSquareClick: (square: number) => void;
}) {
  const cellHeight = CELL_HEIGHTS[layer];
  const cells: JSX.Element[] = [];

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const index = layer * 16 + row * 4 + col;
      const value: Square = board[index];
      const isWinning = winningSet?.has(index) ?? false;
      const isEmpty = value === null;
      const isClickable = isEmpty && isMyTurn;

      cells.push(
        <button
          key={index}
          onClick={() => isClickable && onSquareClick(index)}
          disabled={!isClickable}
          data-winning={isWinning}
          data-value={value ?? ''}
          className={[
            `flex items-center justify-center rounded-lg text-xl sm:text-2xl font-bold transition-all duration-150 ${cellHeight} select-none`,
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
    }
  }

  return (
    <div
      className="flex flex-col items-center w-full"
      style={{ marginTop: NEGATIVE_MARGINS[layer] }}
    >
      <div
        style={{
          transform: 'perspective(500px) rotateX(45deg)',
          transformOrigin: 'center bottom',
        }}
        className="grid grid-cols-4 gap-1 w-full max-w-xs sm:max-w-sm"
      >
        {cells}
      </div>
    </div>
  );
}

export default function BoardComponent({
  board,
  winningLine,
  isMyTurn,
  onSquareClick,
}: BoardProps) {
  const winningSet = winningLine ? new Set(winningLine) : null;

  return (
    <div className="flex flex-col items-center gap-0 w-full max-w-xs sm:max-w-sm">
      {[0, 1, 2, 3].map((layer) => (
        <LayerGrid
          key={layer}
          layer={layer}
          board={board}
          winningSet={winningSet}
          isMyTurn={isMyTurn}
          onSquareClick={onSquareClick}
        />
      ))}
    </div>
  );
}
