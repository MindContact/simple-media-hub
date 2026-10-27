// Tic-tac-toe rules and a computer player. Board: array of 9, 'X' | 'O' | null.

export const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export function winner(board) {
  for (const [a, b, c] of LINES) if (board[a] && board[a] === board[b] && board[a] === board[c]) return { player: board[a], line: [a, b, c] };
  return board.every(Boolean) ? { player: null, line: [] } : null;
}

// Minimax score from `me`'s point of view: faster wins score higher.
function minimax(board, turn, me, depth) {
  const w = winner(board);
  if (w) return w.player === me ? 10 - depth : w.player ? depth - 10 : 0;
  const scores = [];
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    board[i] = turn;
    scores.push(minimax(board, turn === 'X' ? 'O' : 'X', me, depth + 1));
    board[i] = null;
  }
  return turn === me ? Math.max(...scores) : Math.min(...scores);
}

// Easy: random. Medium: wins or blocks when it can, otherwise random. Hard: never loses.
export function computerMove(board, me, level = 'medium', random = Math.random) {
  const free = board.map((v, i) => (v ? null : i)).filter(i => i !== null);
  const pick = () => free[Math.floor(random() * free.length)];
  if (level === 'easy') return pick();
  const other = me === 'X' ? 'O' : 'X';
  if (level === 'medium') {
    for (const who of [me, other]) {
      for (const i of free) {
        const test = [...board];
        test[i] = who;
        if (winner(test)?.player === who) return i;
      }
    }
    return pick();
  }
  let best = free[0];
  let bestScore = -Infinity;
  for (const i of free) {
    const test = [...board];
    test[i] = me;
    const score = minimax(test, other, me, 1);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
