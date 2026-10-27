// Minesweeper rules. Mines are placed on the first pick, never on it or next to it,
// so the first move always opens an area.

export function createField(cols, rows) {
  return { cols, rows, mines: null, open: new Set(), flags: new Set(), lost: false };
}

export function neighbors(field, i) {
  const x = i % field.cols;
  const y = Math.floor(i / field.cols);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < field.cols && ny < field.rows) out.push(ny * field.cols + nx);
    }
  }
  return out;
}

export function placeMines(field, count, safe, random = Math.random) {
  const keepFree = new Set([safe, ...neighbors(field, safe)]);
  const cells = [...Array(field.cols * field.rows).keys()].filter(i => !keepFree.has(i));
  field.mines = new Set();
  while (field.mines.size < Math.min(count, cells.length)) field.mines.add(cells[Math.floor(random() * cells.length)]);
}

export function count(field, i) {
  return neighbors(field, i).filter(n => field.mines.has(n)).length;
}

// Opens a cell; empty cells open their neighbors too. Returns false when a mine went off.
export function reveal(field, i) {
  if (field.open.has(i) || field.flags.has(i)) return true;
  if (field.mines.has(i)) {
    field.lost = true;
    return false;
  }
  const todo = [i];
  while (todo.length) {
    const c = todo.pop();
    if (field.open.has(c)) continue;
    field.open.add(c);
    field.flags.delete(c);
    if (count(field, c) === 0) todo.push(...neighbors(field, c).filter(n => !field.open.has(n)));
  }
  return true;
}

export function isWon(field) {
  return field.mines && field.open.size === field.cols * field.rows - field.mines.size;
}
