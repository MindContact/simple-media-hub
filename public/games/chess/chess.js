// Chess rules and a small computer player.
// Board: 64 squares, index = row * 8 + col, row 0 is Black's back rank. Pieces are letters,
// uppercase White (PNBRQK), lowercase Black, null for empty.

const N = -8, S = 8, E = 1, W = -1;
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export const colorOf = p => (p ? (p === p.toUpperCase() ? 'w' : 'b') : null);
const col = i => i % 8;
const row = i => Math.floor(i / 8);
const at = (c, r) => (c >= 0 && c < 8 && r >= 0 && r < 8 ? r * 8 + c : -1);

export function initialState() {
  const back = 'rnbqkbnr';
  const board = Array(64).fill(null);
  for (let c = 0; c < 8; c++) {
    board[c] = back[c];
    board[8 + c] = 'p';
    board[48 + c] = 'P';
    board[56 + c] = back[c].toUpperCase();
  }
  return { board, turn: 'w', castling: { K: true, Q: true, k: true, q: true }, ep: null };
}

// Is square i attacked by any piece of color `by`?
export function attacked(board, i, by) {
  const c = col(i), r = row(i);
  const pawn = by === 'w' ? 'P' : 'p';
  const dir = by === 'w' ? 1 : -1; // a white pawn attacks from the row below
  for (const dc of [-1, 1]) if (board[at(c + dc, r + dir)] === pawn) return true;
  const own = p => p && colorOf(p) === by;
  for (const [dc, dr] of KNIGHT) {
    const p = board[at(c + dc, r + dr)];
    if (own(p) && p.toUpperCase() === 'N') return true;
  }
  for (const [dc, dr] of KING) {
    const p = board[at(c + dc, r + dr)];
    if (own(p) && p.toUpperCase() === 'K') return true;
  }
  for (const [dirs, kinds] of [[ROOK, 'RQ'], [BISHOP, 'BQ']]) {
    for (const [dc, dr] of dirs) {
      for (let k = 1; ; k++) {
        const j = at(c + dc * k, r + dr * k);
        if (j < 0) break;
        const p = board[j];
        if (!p) continue;
        if (own(p) && kinds.includes(p.toUpperCase())) return true;
        break;
      }
    }
  }
  return false;
}

function pseudoMoves(state) {
  const { board, turn, castling, ep } = state;
  const moves = [];
  const enemy = turn === 'w' ? 'b' : 'w';
  const add = (from, to, extra = {}) => moves.push({ from, to, piece: board[from], captured: board[to], ...extra });
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (colorOf(p) !== turn) continue;
    const c = col(i), r = row(i);
    const kind = p.toUpperCase();
    if (kind === 'P') {
      const fwd = turn === 'w' ? N : S;
      const startRow = turn === 'w' ? 6 : 1;
      const lastRow = turn === 'w' ? 0 : 7;
      const push = (to, extra) => (row(to) === lastRow ? add(i, to, { promo: turn === 'w' ? 'Q' : 'q', ...extra }) : add(i, to, extra));
      if (!board[i + fwd]) {
        push(i + fwd);
        if (r === startRow && !board[i + 2 * fwd]) add(i, i + 2 * fwd, { double: true });
      }
      for (const dc of [-1, 1]) {
        const to = at(c + dc, r + (turn === 'w' ? -1 : 1));
        if (to < 0) continue;
        if (board[to] && colorOf(board[to]) === enemy) push(to);
        else if (to === ep) add(i, to, { enPassant: true, captured: turn === 'w' ? 'p' : 'P' });
      }
    } else if (kind === 'N' || kind === 'K') {
      for (const [dc, dr] of kind === 'N' ? KNIGHT : KING) {
        const to = at(c + dc, r + dr);
        if (to >= 0 && colorOf(board[to]) !== turn) add(i, to);
      }
      if (kind === 'K') {
        const home = turn === 'w' ? 60 : 4;
        const [k, q] = turn === 'w' ? ['K', 'Q'] : ['k', 'q'];
        if (i === home && !attacked(board, home, enemy)) {
          if (castling[k] && !board[home + 1] && !board[home + 2] && !attacked(board, home + 1, enemy) && !attacked(board, home + 2, enemy)) {
            add(i, home + 2, { castle: 'K' });
          }
          if (castling[q] && !board[home - 1] && !board[home - 2] && !board[home - 3] && !attacked(board, home - 1, enemy) && !attacked(board, home - 2, enemy)) {
            add(i, home - 2, { castle: 'Q' });
          }
        }
      }
    } else {
      const dirs = kind === 'R' ? ROOK : kind === 'B' ? BISHOP : [...ROOK, ...BISHOP];
      for (const [dc, dr] of dirs) {
        for (let k = 1; ; k++) {
          const to = at(c + dc * k, r + dr * k);
          if (to < 0 || colorOf(board[to]) === turn) break;
          add(i, to);
          if (board[to]) break;
        }
      }
    }
  }
  return moves;
}

export function makeMove(state, m) {
  const board = [...state.board];
  const castling = { ...state.castling };
  board[m.to] = m.promo ?? board[m.from];
  board[m.from] = null;
  if (m.enPassant) board[m.to + (state.turn === 'w' ? S : N)] = null;
  if (m.castle === 'K') [board[m.from + 1], board[m.from + 3]] = [board[m.from + 3], null];
  if (m.castle === 'Q') [board[m.from - 1], board[m.from - 4]] = [board[m.from - 4], null];
  // Moving the king or a rook, or losing a rook, ends those castling rights.
  for (const sq of [m.from, m.to]) {
    if (sq === 60) castling.K = castling.Q = false;
    if (sq === 4) castling.k = castling.q = false;
    if (sq === 63) castling.K = false;
    if (sq === 56) castling.Q = false;
    if (sq === 7) castling.k = false;
    if (sq === 0) castling.q = false;
  }
  return { board, turn: state.turn === 'w' ? 'b' : 'w', castling, ep: m.double ? (m.from + m.to) / 2 : null };
}

export function inCheck(state, color = state.turn) {
  const king = state.board.indexOf(color === 'w' ? 'K' : 'k');
  return attacked(state.board, king, color === 'w' ? 'b' : 'w');
}

export function legalMoves(state) {
  return pseudoMoves(state).filter(m => !inCheck(makeMove(state, m), state.turn));
}

// 'checkmate' | 'stalemate' | null
export function outcome(state) {
  if (legalMoves(state).length) return null;
  return inCheck(state) ? 'checkmate' : 'stalemate';
}

export function perft(state, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of legalMoves(state)) n += perft(makeMove(state, m), depth - 1);
  return n;
}

// --- Computer player: alpha-beta over material plus a small bonus for central squares.

const VALUE = { P: 100, N: 300, B: 320, R: 500, Q: 900, K: 0 };

function evaluate(board) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const center = 3.5 - Math.max(Math.abs(col(i) - 3.5), Math.abs(row(i) - 3.5));
    const v = VALUE[p.toUpperCase()] + (p.toUpperCase() === 'K' ? 0 : center * 4);
    score += colorOf(p) === 'w' ? v : -v;
  }
  return score;
}

function search(state, depth, alpha, beta) {
  const moves = legalMoves(state);
  if (!moves.length) return inCheck(state) ? -100_000 - depth : 0;
  if (depth === 0) return (state.turn === 'w' ? 1 : -1) * evaluate(state.board);
  // Captures first: better pruning.
  moves.sort((a, b) => (b.captured ? VALUE[b.captured.toUpperCase()] : 0) - (a.captured ? VALUE[a.captured.toUpperCase()] : 0));
  for (const m of moves) {
    const score = -search(makeMove(state, m), depth - 1, -beta, -alpha);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

// depth 1 plays like a beginner, 2 is a fair game for a child, 3 is a real opponent.
export function bestMove(state, depth = 2, random = Math.random) {
  let best = [];
  let bestScore = -Infinity;
  for (const m of legalMoves(state)) {
    const score = -search(makeMove(state, m), depth - 1, -Infinity, Infinity);
    if (score > bestScore) {
      bestScore = score;
      best = [m];
    } else if (score === bestScore) best.push(m);
  }
  return best[Math.floor(random() * best.length)] ?? null;
}
