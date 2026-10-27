import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRuntime, groupSections, nearest, pickEpisode, progress, stopState, TICKS_PER_SECOND } from '../public/lib.js';
import { normalizeId, stripApiKey } from '../src/jellyfin.js';

test('groupSections keeps section order and drops empty ones', () => {
  const sections = groupSections([
    { id: 'a', type: 'Series' },
    { id: 'b', type: 'Movie' },
    { id: 'c', type: 'Movie' },
  ]);
  assert.deepEqual(sections.map(s => [s.title, s.items.length]), [['Film', 2], ['Cartoni a puntate', 1]]);
});

test('formatRuntime shows hours only when needed', () => {
  assert.equal(formatRuntime(97 * 60 * TICKS_PER_SECOND), '1 h 37 min');
  assert.equal(formatRuntime(22 * 60 * TICKS_PER_SECOND), '22 min');
  assert.equal(formatRuntime(0), '');
  assert.equal(formatRuntime(null), '');
});

test('progress is zero for played or untouched items', () => {
  assert.equal(progress({ runTicks: 100, resumeTicks: 25 }), 0.25);
  assert.equal(progress({ runTicks: 100, resumeTicks: 25, played: true }), 0);
  assert.equal(progress({ runTicks: 0, resumeTicks: 25 }), 0);
});

test('pickEpisode resumes the last touched episode or moves past a finished one', () => {
  const eps = [
    { id: '1', played: true, lastPlayed: '2026-10-01T10:00:00Z' },
    { id: '2', played: false, lastPlayed: '2026-10-02T10:00:00Z' },
    { id: '3', played: false, lastPlayed: null },
  ];
  assert.equal(pickEpisode(eps).id, '2');
  eps[1].played = true;
  assert.equal(pickEpisode(eps).id, '3');
  eps[2] = { id: '3', played: true, lastPlayed: '2026-10-03T10:00:00Z' };
  assert.equal(pickEpisode(eps).id, '1', 'wraps around after the last episode');
  assert.equal(pickEpisode([{ id: 'x', lastPlayed: null }]).id, 'x');
  assert.equal(pickEpisode([]), null);
});

test('stopState marks the end as watched and ignores the first seconds', () => {
  assert.deepEqual(stopState(95, 100), { played: true, positionTicks: 0 });
  assert.deepEqual(stopState(10, 100), { played: false, positionTicks: 0 });
  assert.deepEqual(stopState(60, 1000), { played: false, positionTicks: 60 * TICKS_PER_SECOND });
});

test('nearest prefers the same row or column', () => {
  const r = (x, y) => ({ x, y, width: 100, height: 100 });
  const grid = [r(0, 0), r(200, 0), r(400, 0), r(0, 200), r(200, 200)];
  assert.equal(nearest(grid[0], grid, 'right'), 1);
  assert.equal(nearest(grid[1], grid, 'down'), 4);
  assert.equal(nearest(grid[4], grid, 'up'), 1);
  assert.equal(nearest(grid[0], grid, 'left'), -1);
});

test('stripApiKey removes the key whatever its spelling', () => {
  assert.equal(stripApiKey('/videos/x/master.m3u8?DeviceId=a&ApiKey=secret&b=1'), '/videos/x/master.m3u8?DeviceId=a&b=1');
  assert.equal(stripApiKey('/videos/x/main.m3u8?api_key=secret'), '/videos/x/main.m3u8');
});

test('normalizeId drops dashes from GUIDs', () => {
  assert.equal(normalizeId('0936740A-8012-cb70-da96-cad32188ad5d'), '0936740a8012cb70da96cad32188ad5d');
});
