// Pure functions for tic-tac-toe game logic.
// No React, no side effects — safe to unit test in isolation.
// Used by useGame.ts and potentially by both peers for local validation.

import { Board, Player, Square } from './signaling';

export { Board, Player, Square };

// All possible winning lines as index triplets
export const WIN_LINES: [number, number, number][] = [
  [0, 1, 2], // top row
  [3, 4, 5], // middle row
  [6, 7, 8], // bottom row
  [0, 3, 6], // left column
  [1, 4, 7], // middle column
  [2, 5, 8], // right column
  [0, 4, 8], // diagonal
  [2, 4, 6], // anti-diagonal
];

export const emptyBoard = (): Board =>
  [null, null, null, null, null, null, null, null, null];

/**
 * Returns the winning player if one exists, otherwise null.
 */
export function getWinner(board: Board): Player | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
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
  if (square < 0 || square > 8) return false;
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
export function getWinningLine(board: Board): [number, number, number] | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return line;
    }
  }
  return null;
}
