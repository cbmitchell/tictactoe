// Pure functions for 3D tic-tac-toe game logic (4×4×4 board).
// No React, no side effects — safe to unit test in isolation.
// Used by useGame.ts and potentially by both peers for local validation.
//
// Board layout: flat array of 64 cells.
// Index formula: layer * 16 + row * 4 + col  (each 0–3)

import { Board, Player, Square } from './signaling';

export type { Board, Player, Square };

const idx = (z: number, r: number, c: number) => z * 16 + r * 4 + c;

// Generate all 76 winning lines for a 4×4×4 board.
function buildWinLines(): number[][] {
  const lines: number[][] = [];

  // Within each layer: 4 rows + 4 cols + 2 diagonals = 10 lines × 4 layers = 40
  for (let z = 0; z < 4; z++) {
    for (let r = 0; r < 4; r++) {
      lines.push([idx(z,r,0), idx(z,r,1), idx(z,r,2), idx(z,r,3)]); // row
    }
    for (let c = 0; c < 4; c++) {
      lines.push([idx(z,0,c), idx(z,1,c), idx(z,2,c), idx(z,3,c)]); // column
    }
    lines.push([idx(z,0,0), idx(z,1,1), idx(z,2,2), idx(z,3,3)]); // forward diagonal
    lines.push([idx(z,0,3), idx(z,1,2), idx(z,2,1), idx(z,3,0)]); // back diagonal
  }

  // Pillars: fixed (r,c) across all 4 layers = 16 lines
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      lines.push([idx(0,r,c), idx(1,r,c), idx(2,r,c), idx(3,r,c)]);
    }
  }

  // Layer-crossing diagonals = 20 lines
  // Vary z and c together, fixed r (4 lines each direction)
  for (let r = 0; r < 4; r++) {
    lines.push([idx(0,r,0), idx(1,r,1), idx(2,r,2), idx(3,r,3)]); // z+, c+
    lines.push([idx(0,r,3), idx(1,r,2), idx(2,r,1), idx(3,r,0)]); // z+, c-
  }
  // Vary z and r together, fixed c (4 lines each direction)
  for (let c = 0; c < 4; c++) {
    lines.push([idx(0,0,c), idx(1,1,c), idx(2,2,c), idx(3,3,c)]); // z+, r+
    lines.push([idx(0,3,c), idx(1,2,c), idx(2,1,c), idx(3,0,c)]); // z+, r-
  }
  // 4 space diagonals (vary z, r, and c simultaneously)
  lines.push([idx(0,0,0), idx(1,1,1), idx(2,2,2), idx(3,3,3)]);
  lines.push([idx(0,0,3), idx(1,1,2), idx(2,2,1), idx(3,3,0)]);
  lines.push([idx(0,3,0), idx(1,2,1), idx(2,1,2), idx(3,0,3)]);
  lines.push([idx(0,3,3), idx(1,2,2), idx(2,1,1), idx(3,0,0)]);

  return lines;
}

export const WIN_LINES: number[][] = buildWinLines();

export const emptyBoard = (): Board => Array(64).fill(null);

/**
 * Returns the winning player if one exists, otherwise null.
 */
export function getWinner(board: Board): Player | null {
  for (const line of WIN_LINES) {
    const [a, b, c, d] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c] && board[a] === board[d]) {
      return board[a] as Player;
    }
  }
  return null;
}

/**
 * Returns true if the board is full and there is no winner (draw).
 */
export function isDraw(board: Board): boolean {
  return board.every((sq) => sq !== null) && getWinner(board) === null;
}

/**
 * Returns true if the game is over (win or draw).
 */
export function isGameOver(board: Board): boolean {
  return getWinner(board) !== null || isDraw(board);
}

/**
 * Returns true if placing a piece at `square` is a legal move.
 * Checks: square is in range, square is empty, game is not over.
 */
export function isValidMove(board: Board, square: number): boolean {
  if (square < 0 || square > 63) return false;
  if (board[square] !== null) return false;
  if (isGameOver(board)) return false;
  return true;
}

/**
 * Returns a new board with the given move applied.
 * Does not mutate the input board.
 * Caller is responsible for ensuring the move is valid.
 */
export function applyMove(board: Board, square: number, player: Player): Board {
  const next = [...board] as Board;
  next[square] = player;
  return next;
}

/**
 * Returns the winning line indices if there is a winner, otherwise null.
 * Useful for highlighting the winning squares in the UI.
 */
export function getWinningLine(board: Board): number[] | null {
  for (const line of WIN_LINES) {
    const [a, b, c, d] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c] && board[a] === board[d]) {
      return line;
    }
  }
  return null;
}
