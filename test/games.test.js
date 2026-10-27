import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRS, LEVELS, isSolved, parseLevel, step } from '../public/games/sokoban/sokoban.js';

const key = s => `${s.player}|${[...s.boxes].sort()}`;

// Breadth-first search over player moves: the shortest solution, or null.
function solve(state, limit = 200_000) {
  const seen = new Set([key(state)]);
  let frontier = [[state, 0]];
  while (frontier.length && seen.size < limit) {
    const next = [];
    for (const [s, moves] of frontier) {
      if (isSolved(s)) return moves;
      for (const dir of Object.keys(DIRS)) {
        const n = step(s, dir);
        if (n && !seen.has(key(n))) {
          seen.add(key(n));
          next.push([n, moves + 1]);
        }
      }
    }
    frontier = next;
  }
  return null;
}

test('every sokoban level is well formed and solvable', () => {
  LEVELS.forEach((rows, i) => {
    const state = parseLevel(rows);
    assert.ok(state.player, `level ${i + 1} has a player`);
    assert.equal(state.boxes.size, state.goals.size, `level ${i + 1} has a goal per box`);
    assert.ok(!isSolved(state), `level ${i + 1} is not already solved`);
    assert.notEqual(solve(state), null, `level ${i + 1} is solvable`);
  });
});

test('sokoban levels get harder, roughly', () => {
  const moves = LEVELS.map(rows => solve(parseLevel(rows)));
  assert.ok(moves[0] < moves.at(-1));
});

test('step pushes a box and refuses to push two', () => {
  const state = parseLevel(['#######', '#@$$ .#', '#######']);
  assert.equal(step(state, 'right'), null);
  const one = parseLevel(['######', '#@$ .#', '######']);
  const after = step(one, 'right');
  assert.deepEqual(after.player, [2, 1]);
  assert.ok(after.boxes.has('3,1') && after.pushed);
});

import * as chess from '../public/games/chess/chess.js';
import * as checkers from '../public/games/checkers/checkers.js';
import * as mill from '../public/games/mill/mill.js';
import { computerMove, winner } from '../public/games/tris/tris.js';
import { createField, isWon, placeMines, reveal } from '../public/games/minesweeper/mines.js';
import { isSolved as puzzleSolved, scramble, slide } from '../public/games/puzzle/puzzle.js';

function fen(position, turn = 'w', castling = 'KQkq') {
  const board = [];
  for (const ch of position.replace(/\//g, '')) board.push(...(/\d/.test(ch) ? Array(Number(ch)).fill(null) : [ch]));
  return { board, turn, castling: Object.fromEntries([...'KQkq'].map(k => [k, castling.includes(k)])), ep: null };
}

test('chess move generation matches the reference perft counts', () => {
  assert.deepEqual([1, 2, 3].map(d => chess.perft(chess.initialState(), d)), [20, 400, 8902]);
  // "Kiwipete": castling, en passant, pins, promotions.
  const kiwipete = fen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R');
  assert.deepEqual([1, 2, 3].map(d => chess.perft(kiwipete, d)), [48, 2039, 97862]);
});

test('chess: checkmate, stalemate, and the computer takes a free queen', () => {
  assert.equal(chess.outcome(fen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR')), 'checkmate');
  assert.equal(chess.outcome(fen('7k/5Q2/6K1/8/8/8/8/8', 'b', '')), 'stalemate');
  const move = chess.bestMove(fen('4k3/8/8/3q4/4P3/8/8/4K3', 'w', ''), 2);
  assert.deepEqual([move.from, move.to], [36, 27]);
});

test('checkers: captures are mandatory and chain, men cannot take kings', () => {
  const b = Array(64).fill(null);
  const man = color => ({ color, king: false });
  // Index = row * 8 + col; white moves up (towards row 0).
  b[44] = man('w'); // row 5, col 4
  b[35] = man('b'); // row 4, col 3: taken, landing on 26
  b[17] = man('b'); // row 2, col 1: taken next, landing on 8
  b[49] = man('w'); // could step, but a capture exists
  b[42] = { color: 'b', king: true }; // next to 49: a man may not take a king
  const moves = checkers.legalMoves(b, 'w');
  assert.deepEqual(moves, [{ from: 44, path: [26, 8], captured: [35, 17] }]);
  const after = checkers.applyMove(b, moves[0]);
  assert.ok(!after[8].king && !after[35] && !after[17]);
  // Reaching row 0 makes a king.
  const last = Array(64).fill(null);
  last[10] = { color: 'w', king: false };
  assert.ok(checkers.applyMove(last, { from: 10, path: [1], captured: [] })[1].king);
  assert.equal(checkers.legalMoves(checkers.initialBoard(), 'w').length, 7);
});

test('checkers computer takes a free piece', () => {
  const b = Array(64).fill(null);
  b[44] = { color: 'w', king: false };
  b[35] = { color: 'b', king: false };
  b[1] = { color: 'b', king: false };
  assert.deepEqual(checkers.bestMove(b, 'w', 2).captured, [35]);
});

test('mill: a mill removes a piece, pieces in mills are protected', () => {
  let s = mill.initialState();
  for (const to of [0, 9, 1, 10]) s = mill.apply(s, { to });
  s = mill.apply(s, { to: 2 }); // white closes 0-1-2
  assert.ok(s.removing && s.turn === 'w');
  assert.deepEqual(mill.legalMoves(s).map(m => m.remove).sort((a, b) => a - b), [9, 10]);
  s = mill.apply(s, { remove: 9 });
  assert.equal(s.turn, 'b');
  assert.equal(mill.count(s, 'b'), 1);
  // Adjacency is symmetric.
  mill.ADJACENT.forEach((list, i) => list.forEach(j => assert.ok(mill.ADJACENT[j].includes(i))));
});

test('mill computer completes a mill when it can', () => {
  const s = { board: Array(24).fill(null), turn: 'b', toPlace: { w: 5, b: 5 }, removing: false };
  s.board[21] = s.board[22] = 'b';
  s.board[0] = s.board[1] = 'w';
  // Blocking 2 also matters, but closing 21-22-23 wins a piece first.
  assert.equal(mill.bestMove(s, 2).to, 23);
});

test('tris: hard computer never loses', () => {
  // Every possible line of play by X against the hard O.
  const play = board => {
    const w = winner(board);
    if (w) return assert.notEqual(w.player, 'X');
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      const next = [...board];
      next[i] = 'X';
      if (winner(next)) {
        assert.notEqual(winner(next).player, 'X');
        continue;
      }
      next[computerMove(next, 'O', 'hard')] = 'O';
      play(next);
    }
  };
  play(Array(9).fill(null));
});

test('minesweeper: the first pick is safe and opens an area', () => {
  const f = createField(8, 6);
  let seed = 7;
  placeMines(f, 10, 0, () => ((seed = (seed * 16807) % 2147483647) / 2147483647));
  assert.ok(!f.mines.has(0) && !f.mines.has(1) && !f.mines.has(8) && !f.mines.has(9));
  assert.ok(reveal(f, 0));
  assert.ok(f.open.size > 1);
  const all = createField(3, 3);
  placeMines(all, 1, 4);
  assert.equal(all.mines.size, 0);
  assert.ok(reveal(all, 4) && isWon(all));
});

test('puzzle: scrambles are never solved and slides only move next to the hole', () => {
  for (let i = 0; i < 20; i++) assert.ok(!puzzleSolved(scramble(3, 30)));
  const tiles = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  assert.equal(slide(tiles, 3, 0), null);
  assert.equal(slide([1, 2, 3, 0, 4, 5, 6, 7, 8], 3, 2), null); // not across rows
  assert.ok(puzzleSolved(slide([1, 2, 3, 4, 5, 6, 7, 0, 8], 3, 8)));
});
