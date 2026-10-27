// Sokoban rules, kept apart from the page so the tests can check every level is solvable.
// Level map: # wall, space floor, . goal, $ box, * box on goal, @ player, + player on goal.

// Ordered by the length of the shortest solution.
export const LEVELS = [
  [
    '#####',
    '#@$.#',
    '#####',
  ],
  [
    '######',
    '#    #',
    '#@$ .#',
    '#    #',
    '######',
  ],
  [
    '#######',
    '#.$@$.#',
    '#######',
  ],
  [
    '######',
    '#@ $.#',
    '# $ .#',
    '######',
  ],
  [
    '  #####',
    '  #. .#',
    '###$$ #',
    '#   @ #',
    '#  #  #',
    '#######',
  ],
  [
    '#######',
    '###.###',
    '###$###',
    '#.$@$.#',
    '###$###',
    '###.###',
    '#######',
  ],
  [
    '  ####',
    '###  #',
    '#.$  #',
    '#.$ @#',
    '#.$  #',
    '###  #',
    '  ####',
  ],
  [
    '#######',
    '#     #',
    '#.$ $.#',
    '#  @  #',
    '#.$ $.#',
    '#     #',
    '#######',
  ],
  [
    '######',
    '#.   #',
    '#  $ #',
    '# $@ #',
    '#   .#',
    '######',
  ],
  [
    '#######',
    '#.  . #',
    '# $$  #',
    '#  @$ #',
    '#   . #',
    '#######',
  ],
  [
    '#######',
    '#. $ .#',
    '#  @$ #',
    '#.$   #',
    '#     #',
    '#######',
  ],
  [
    '#####  ',
    '#@  ###',
    '# $$  #',
    '## .. #',
    ' ######',
  ],
  [
    '######',
    '#    #',
    '# #@ #',
    '# $* #',
    '# .* #',
    '#    #',
    '######',
  ],
  [
    '########',
    '#   .  #',
    '# #$#  #',
    '# . $@ #',
    '# $ .  #',
    '#      #',
    '########',
  ],
  [
    '######',
    '#.   #',
    '#.$$ #',
    '#@ $ #',
    '#.   #',
    '######',
  ],
  [
    '  ######',
    '  #    #',
    '###$## #',
    '#. .$  #',
    '# #  @ #',
    '#  .$  #',
    '########',
  ],
  [
    ' #####',
    '##   #',
    '#  $ #',
    '# .#@#',
    '#  $ #',
    '##. ##',
    ' ####',
  ],
  [
    '#######',
    '#.    #',
    '# $## #',
    '# $.@ #',
    '#  #  #',
    '#     #',
    '#######',
  ],
  [
    '  #####',
    '  #   #',
    '###$# #',
    '#.  @ #',
    '#  $ ##',
    '#. ###',
    '####',
  ],
  [
    '########',
    '#@     #',
    '# $ $  #',
    '## ## ##',
    '#.    .#',
    '########',
  ],
  [
    '########',
    '#      #',
    '# #..# #',
    '# $$$$ #',
    '#  ..@ #',
    '########',
  ],
];

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function parseLevel(rows) {
  const walls = new Set();
  const goals = new Set();
  const boxes = new Set();
  let player = null;
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    const key = `${x},${y}`;
    if (c === '#') walls.add(key);
    if (c === '.' || c === '*' || c === '+') goals.add(key);
    if (c === '$' || c === '*') boxes.add(key);
    if (c === '@' || c === '+') player = [x, y];
  }));
  const width = Math.max(...rows.map(r => r.length));
  return { width, height: rows.length, walls, goals, boxes, player };
}

// Returns the state after moving the player one cell, or null when the move is blocked.
export function step(state, dir) {
  const [dx, dy] = DIRS[dir];
  const [x, y] = state.player;
  const next = `${x + dx},${y + dy}`;
  if (state.walls.has(next)) return null;
  let boxes = state.boxes;
  let pushed = false;
  if (boxes.has(next)) {
    const beyond = `${x + 2 * dx},${y + 2 * dy}`;
    if (state.walls.has(beyond) || boxes.has(beyond)) return null;
    boxes = new Set(boxes);
    boxes.delete(next);
    boxes.add(beyond);
    pushed = true;
  }
  return { ...state, boxes, player: [x + dx, y + dy], pushed };
}

export function isSolved(state) {
  return [...state.boxes].every(b => state.goals.has(b));
}
