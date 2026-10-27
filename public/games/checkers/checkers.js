// Italian draughts (dama italiana), simplified for children:
// 8×8, pieces on dark squares, men move and capture forward only, kings ("dame") move one
// square in any diagonal direction, capturing is mandatory and chains, men cannot capture kings.
// The Italian priority rules among different captures are left out: any capture may be chosen.
// Board: 64 squares, null or { color: 'w' | 'b', king }. White starts at the bottom (rows 5-7).

const col = i => i % 8;
const row = i => Math.floor(i / 8);
const at = (c, r) => (c >= 0 && c < 8 && r >= 0 && r < 8 ? r * 8 + c : -1);
export const isDark = i => (col(i) + row(i)) % 2 === 1;

export function initialBoard() {
  const board = Array(64).fill(null);
  for (let i = 0; i < 64; i++) {
    if (!isDark(i)) continue;
    if (row(i) < 3) board[i] = { color: 'b', king: false };
    if (row(i) > 4) board[i] = { color: 'w', king: false };
  }
  return board;
}

function dirs(piece) {
  if (piece.king) return [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  const dr = piece.color === 'w' ? -1 : 1;
  return [[1, dr], [-1, dr]];
}

// Every capture chain starting at `from`: [{ path: [squares landed on], captured: [squares] }].
function captures(board, from, piece, taken = []) {
  const chains = [];
  for (const [dc, dr] of dirs(piece)) {
    const over = at(col(from) + dc, row(from) + dr);
    const to = at(col(from) + 2 * dc, row(from) + 2 * dr);
    if (over < 0 || to < 0 || board[to] || taken.includes(over)) continue;
    const victim = board[over];
    if (!victim || victim.color === piece.color || (victim.king && !piece.king)) continue;
    // A man reaching the last row is promoted and the move ends there.
    const promoted = !piece.king && row(to) === (piece.color === 'w' ? 0 : 7);
    const after = [...board];
    after[from] = null;
    after[to] = piece;
    const rest = promoted ? [] : captures(after, to, piece, [...taken, over]);
    if (rest.length) for (const r of rest) chains.push({ path: [to, ...r.path], captured: [over, ...r.captured] });
    else chains.push({ path: [to], captured: [over] });
  }
  return chains;
}

// Legal moves for `color`: { from, path, captured }. Captures, when any, are the only choice.
export function legalMoves(board, color) {
  const jumps = [];
  const steps = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.color !== color) continue;
    for (const c of captures(board, i, p)) jumps.push({ from: i, ...c });
    for (const [dc, dr] of dirs(p)) {
      const to = at(col(i) + dc, row(i) + dr);
      if (to >= 0 && !board[to]) steps.push({ from: i, path: [to], captured: [] });
    }
  }
  return jumps.length ? jumps : steps;
}

export function applyMove(board, m) {
  const next = [...board];
  const piece = { ...next[m.from] };
  next[m.from] = null;
  for (const c of m.captured) next[c] = null;
  const to = m.path.at(-1);
  if (row(to) === (piece.color === 'w' ? 0 : 7)) piece.king = true;
  next[to] = piece;
  return next;
}

// --- Computer player: alpha-beta on material (kings worth more), a bonus for advancing men.

function evaluate(board, color) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const advance = p.color === 'w' ? 7 - row(i) : row(i);
    const v = p.king ? 300 : 100 + advance * 4;
    score += p.color === color ? v : -v;
  }
  return score;
}

function search(board, color, depth, alpha, beta) {
  const moves = legalMoves(board, color);
  if (!moves.length) return -10_000 - depth;
  if (depth === 0) return evaluate(board, color);
  const other = color === 'w' ? 'b' : 'w';
  for (const m of moves) {
    const score = -search(applyMove(board, m), other, depth - 1, -beta, -alpha);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

export function bestMove(board, color, depth = 4, random = Math.random) {
  const other = color === 'w' ? 'b' : 'w';
  let best = [];
  let bestScore = -Infinity;
  for (const m of legalMoves(board, color)) {
    const score = -search(applyMove(board, m), other, depth - 1, -Infinity, Infinity);
    if (score > bestScore) {
      bestScore = score;
      best = [m];
    } else if (score === bestScore) best.push(m);
  }
  return best[Math.floor(random() * best.length)] ?? null;
}
