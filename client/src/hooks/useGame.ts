// useGame — owns all tic-tac-toe game state and logic.
//
// Responsibilities:
//   - Maintain board state and current turn
//   - Validate and apply moves from either player
//   - Detect win/draw conditions
//   - Send move messages to the peer via the data channel
//   - Receive and apply move messages from the peer
//   - Expose derived state (winner, winningLine, isDraw, isMyTurn)
//
// This hook does NOT know about signaling or WebRTC transport. It receives
// a sendData function and a way to register for incoming data messages.
//
// Role assignment:
//   host  → plays as X, goes first
//   guest → plays as O

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Board,
  Player,
  DataChannelMessage,
} from '../lib/signaling';
import {
  emptyBoard,
  getWinner,
  isDraw,
  isValidMove,
  applyMove,
  getWinningLine,
} from '../lib/gameLogic';
import { UseWebRTCReturn } from './useWebRTC';

export type Role = 'host' | 'guest';

export interface GameState {
  board: Board;
  currentTurn: Player;
  winner: Player | null;
  winningLine: number[] | null;
  isDrawn: boolean;
  isOver: boolean;
  mySymbol: Player;
  isMyTurn: boolean;
}

export interface UseGameProps {
  role: Role;
  sendData: UseWebRTCReturn['sendData'];
  onDataMessage: (handler: (msg: DataChannelMessage) => void) => () => void;
  onPlayAgain?: () => void;
}

export interface UseGameReturn extends GameState {
  makeMove: (square: number) => void;
  resetGame: () => void;
  requestPlayAgain: () => void;
  localWantsPlayAgain: boolean;
  peerWantsPlayAgain: boolean;
}

export function useGame({
  role,
  sendData,
  onDataMessage,
  onPlayAgain,
}: UseGameProps): UseGameReturn {
  const [swapped, setSwapped] = useState(false);
  const mySymbol: Player = (role === 'host') !== swapped ? 'X' : 'O';

  const [board, setBoard] = useState<Board>(emptyBoard);
  const [currentTurn, setCurrentTurn] = useState<Player>('X'); // X always goes first

  // Stable ref for board so the data message handler can read current state
  // without being re-registered on every render
  const boardRef = useRef(board);
  const currentTurnRef = useRef(currentTurn);
  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { currentTurnRef.current = currentTurn; }, [currentTurn]);

  // Derived state
  const winner = getWinner(board);
  const winningLine = getWinningLine(board);
  const isDrawn = isDraw(board);
  const isOver = winner !== null || isDrawn;
  const isMyTurn = currentTurn === mySymbol && !isOver;

  // Log win/draw when they are first detected
  useEffect(() => {
    if (winner) console.log('game: winner detected', { winner, winningLine });
  }, [winner, winningLine]);

  useEffect(() => {
    if (isDrawn) console.log('game: draw detected');
  }, [isDrawn]);

  // Apply a move locally and update state
  const applyMoveToState = useCallback(
    (square: number, player: Player, currentBoard: Board) => {
      if (!isValidMove(currentBoard, square)) return;
      const nextBoard = applyMove(currentBoard, square, player);
      const nextTurn: Player = player === 'X' ? 'O' : 'X';
      setBoard(nextBoard);
      setCurrentTurn(nextTurn);
    },
    []
  );

  // Called when the local player clicks a square
  const makeMove = useCallback(
    (square: number) => {
      const currentBoard = boardRef.current;
      const turn = currentTurnRef.current;

      console.log('game: move attempted', { square, isMyTurn: turn === mySymbol });

      // Only allow moves on the player's own turn
      if (turn !== mySymbol) {
        console.warn('game: move rejected — not my turn', { square, mySymbol, currentTurn: turn });
        return;
      }
      if (!isValidMove(currentBoard, square)) {
        console.warn('game: move rejected — square occupied or game over', { square });
        return;
      }

      // Apply locally
      applyMoveToState(square, mySymbol, currentBoard);
      console.log('game: move applied', { square, player: mySymbol });

      // Send to peer
      sendData({ type: 'move', square });
    },
    [mySymbol, applyMoveToState, sendData]
  );

  // Stable refs so data message handler can read current values without stale closures
  const onPlayAgainRef = useRef(onPlayAgain);
  useEffect(() => { onPlayAgainRef.current = onPlayAgain; }, [onPlayAgain]);

  const [localWantsPlayAgain, setLocalWantsPlayAgain] = useState(false);
  const [peerWantsPlayAgain, setPeerWantsPlayAgain] = useState(false);
  const localWantsPlayAgainRef = useRef(localWantsPlayAgain);
  useEffect(() => { localWantsPlayAgainRef.current = localWantsPlayAgain; }, [localWantsPlayAgain]);

  const doReset = useCallback(() => {
    console.log('game: board reset');
    setBoard(emptyBoard());
    setCurrentTurn('X');
    setLocalWantsPlayAgain(false);
    setPeerWantsPlayAgain(false);
    setSwapped((s) => !s);
    onPlayAgainRef.current?.();
  }, []);

  // Listen for moves from the peer over the data channel
  useEffect(() => {
    const unsubscribe = onDataMessage((msg) => {
      if (msg.type === 'move') {
        const peerSymbol: Player = mySymbol === 'X' ? 'O' : 'X';
        console.log('game: peer move received', { square: msg.square, player: peerSymbol });
        applyMoveToState(msg.square, peerSymbol, boardRef.current);
      } else if (msg.type === 'play-again') {
        console.log('game: peer wants play-again', { localAlreadyWants: localWantsPlayAgainRef.current });
        if (localWantsPlayAgainRef.current) {
          doReset();
        } else {
          setPeerWantsPlayAgain(true);
        }
      }
    });

    return unsubscribe;
  }, [onDataMessage, mySymbol, applyMoveToState, doReset]);

  const resetGame = useCallback(() => {
    setBoard(emptyBoard());
    setCurrentTurn('X');
    setLocalWantsPlayAgain(false);
    setPeerWantsPlayAgain(false);
    setSwapped(false);
  }, []);

  const requestPlayAgain = useCallback(() => {
    console.log('game: play-again requested', { peerAlreadyWants: peerWantsPlayAgain });
    sendData({ type: 'play-again' });
    if (peerWantsPlayAgain) {
      doReset();
    } else {
      setLocalWantsPlayAgain(true);
    }
  }, [sendData, peerWantsPlayAgain, doReset]);

  return {
    board,
    currentTurn,
    winner,
    winningLine,
    isDrawn,
    isOver,
    mySymbol,
    isMyTurn,
    makeMove,
    resetGame,
    requestPlayAgain,
    localWantsPlayAgain,
    peerWantsPlayAgain,
  };
}
