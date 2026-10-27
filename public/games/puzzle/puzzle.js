// Sliding puzzle. Tiles 1..n²-1, 0 is the hole. Shuffled with random legal moves,
// so every puzzle can be solved.

export function solved(size) {
  return [...Array(size * size).keys()].map(i => (i + 1) % (size * size));
}

export function isSolved(tiles) {
  return tiles.every((t, i) => t === (i + 1) % tiles.length);
}

// Moves the tile at index i into the hole when they touch; returns the new tiles or null.
export function slide(tiles, size, i) {
  const hole = tiles.indexOf(0);
  const near = Math.abs(hole - i) === size || (Math.abs(hole - i) === 1 && Math.floor(hole / size) === Math.floor(i / size));
  if (!near) return null;
  const next = [...tiles];
  [next[hole], next[i]] = [next[i], next[hole]];
  return next;
}

export function scramble(size, moves, random = Math.random) {
  let tiles = solved(size);
  let previous = -1;
  for (let m = 0; m < moves; m++) {
    const hole = tiles.indexOf(0);
    const options = [hole - size, hole + size, hole - 1, hole + 1]
      .filter(i => i >= 0 && i < tiles.length && i !== previous && slide(tiles, size, i));
    const i = options[Math.floor(random() * options.length)];
    previous = hole;
    tiles = slide(tiles, size, i);
  }
  return isSolved(tiles) ? scramble(size, moves, random) : tiles;
}
