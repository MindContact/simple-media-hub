// Nine men's morris (tria / mulino). 24 points on three nested squares.
// Each player places 9 pieces, then moves them along the lines; with 3 left they may jump
// anywhere. Three in a row (a mill) removes an opponent piece, taken outside a mill when possible.
// A player with 2 pieces, or no move, loses.

// Points as [col, row] on a 7×7 grid, numbered 0..23.
export const POINTS = [
  [0, 0], [3, 0], [6, 0], [1, 1], [3, 1], [5, 1], [2, 2], [3, 2], [4, 2],
  [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3],
  [2, 4], [3, 4], [4, 4], [1, 5], [3, 5], [5, 5], [0, 6], [3, 6], [6, 6],
];

export const ADJACENT = [
  [1, 9], [0, 2, 4], [1, 14], [4, 10], [1, 3, 5, 7], [4, 13], [7, 11], [4, 6, 8], [7, 12],
  [0, 10, 21], [3, 9, 11, 18], [6, 10, 15], [8, 13, 17], [5, 12, 14, 20], [2, 13, 23],
  [11, 16], [15, 17, 19], [12, 16], [10, 19], [16, 18, 20, 22], [13, 19], [9, 22], [19, 21, 23], [14, 22],
];

export const MILLS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
  [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
];

export const other = c => (c === 'w' ? 'b' : 'w');

export function initialState() {
  return { board: Array(24).fill(null), turn: 'w', toPlace: { w: 9, b: 9 }, removing: false };
}

export const count = (s, c) => s.board.filter(p => p === c).length;

export function inMill(board, i) {
  return Boolean(board[i]) && MILLS.some(m => m.includes(i) && m.every(j => board[j] === board[i]));
}

export const phase = (s, c = s.turn) => (s.toPlace[c] > 0 ? 'place' : count(s, c) === 3 ? 'fly' : 'move');

// Moves for the player to act: { to } to place, { from, to } to move, { remove } after a mill.
export function legalMoves(s) {
  const c = s.turn;
  if (s.removing) {
    const theirs = s.board.map((p, i) => (p === other(c) ? i : -1)).filter(i => i >= 0);
    const free = theirs.filter(i => !inMill(s.board, i));
    return (free.length ? free : theirs).map(remove => ({ remove }));
  }
  const empty = s.board.map((p, i) => (p ? -1 : i)).filter(i => i >= 0);
  const p = phase(s);
  if (p === 'place') return empty.map(to => ({ to }));
  const moves = [];
  for (let from = 0; from < 24; from++) {
    if (s.board[from] !== c) continue;
    for (const to of p === 'fly' ? empty : ADJACENT[from].filter(j => !s.board[j])) moves.push({ from, to });
  }
  return moves;
}

export function apply(s, m) {
  const board = [...s.board];
  const toPlace = { ...s.toPlace };
  if (m.remove != null) {
    board[m.remove] = null;
    return { board, toPlace, turn: other(s.turn), removing: false };
  }
  if (m.from != null) board[m.from] = null;
  else toPlace[s.turn]--;
  board[m.to] = s.turn;
  if (inMill(board, m.to)) return { board, toPlace, turn: s.turn, removing: true };
  return { board, toPlace, turn: other(s.turn), removing: false };
}

// The player to act has lost?
export function lost(s) {
  if (s.removing) return false;
  const c = s.turn;
  if (s.toPlace[c] === 0 && count(s, c) < 3) return true;
  return legalMoves(s).length === 0;
}

// --- Computer player: alpha-beta on pieces, mills and mobility.

function evaluate(s, me) {
  const pieces = (c) => count(s, c) + s.toPlace[c];
  const mills = c => MILLS.filter(m => m.every(j => s.board[j] === c)).length;
  const twoInRow = c => MILLS.filter(m => m.filter(j => s.board[j] === c).length === 2 && m.some(j => !s.board[j])).length;
  const o = other(me);
  return (pieces(me) - pieces(o)) * 100 + (mills(me) - mills(o)) * 20 + (twoInRow(me) - twoInRow(o)) * 8;
}

function search(s, me, depth, alpha, beta) {
  if (lost(s)) return s.turn === me ? -10_000 - depth : 10_000 + depth;
  if (depth === 0) return evaluate(s, me);
  const maximizing = s.turn === me;
  for (const m of legalMoves(s)) {
    const score = search(apply(s, m), me, depth - 1, alpha, beta);
    if (maximizing) alpha = Math.max(alpha, score);
    else beta = Math.min(beta, score);
    if (alpha >= beta) break;
  }
  return maximizing ? alpha : beta;
}

export function bestMove(s, depth = 3, random = Math.random) {
  const me = s.turn;
  let best = [];
  let bestScore = -Infinity;
  for (const m of legalMoves(s)) {
    const score = search(apply(s, m), me, depth - 1, -Infinity, Infinity);
    if (score > bestScore) {
      bestScore = score;
      best = [m];
    } else if (score === bestScore) best.push(m);
  }
  return best[Math.floor(random() * best.length)] ?? null;
}
