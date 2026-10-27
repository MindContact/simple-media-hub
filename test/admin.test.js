import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAdminAuth } from '../src/admin-auth.js';
import { GAMES } from '../src/games.js';
import { DEFAULTS, mergeSettings, openSettings } from '../src/settings.js';
import { hexToHsl, hslToHex, PRESETS, themeFromColor } from '../public/theme.js';

test('settings persist in sqlite and survive a reopen', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hub-'));
  try {
    const store = openSettings(dir);
    assert.equal(store.get().appName, DEFAULTS.appName);
    store.update({ appName: '  Casa Giochi ', jellyfinApiKey: 'secret' });
    store.close();
    const again = openSettings(dir);
    assert.equal(again.get().appName, 'Casa Giochi');
    assert.equal(again.get().jellyfinApiKey, 'secret');
    assert.equal(statSync(path.join(dir, 'hub.db')).mode & 0o777, 0o600);
    again.close();
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('mergeSettings validates values and keeps the API key write-only', () => {
  const base = structuredClone(DEFAULTS);
  base.jellyfinApiKey = 'kept';
  assert.equal(mergeSettings(base, { jellyfinApiKey: null }).jellyfinApiKey, 'kept');
  assert.equal(mergeSettings(base, {}).jellyfinApiKey, 'kept');
  assert.equal(mergeSettings(base, { jellyfinApiKey: '' }).jellyfinApiKey, '');
  assert.equal(mergeSettings(base, { jellyfinUrl: 'http://jellyfin.lan:8096/' }).jellyfinUrl, 'http://jellyfin.lan:8096');
  assert.throws(() => mergeSettings(base, { jellyfinUrl: 'jellyfin.lan' }), /non valido/);
  assert.throws(() => mergeSettings(base, { themeColor: 'red' }), /Colore/);
  assert.throws(() => mergeSettings(base, { appName: '   ' }), /vuoto/);
  assert.throws(() => mergeSettings(base, { background: { type: 'lava' } }), /Sfondo/);
  assert.deepEqual(mergeSettings(base, { background: { type: 'image', blur: 99, dim: -5 } }).background, { type: 'image', blur: 30, dim: 0 });
});

test('games: unknown and duplicate ids dropped, missing ones appended enabled', () => {
  const next = mergeSettings(DEFAULTS, { games: [
    { id: 'dino', name: 'Dinosauro', enabled: true },
    { id: 'dino', name: 'again' },
    { id: 'evil', name: 'x' },
    { id: 'tetris', name: '', enabled: false },
  ] });
  assert.deepEqual(next.games.slice(0, 2), [
    { id: 'dino', name: 'Dinosauro', enabled: true },
    { id: 'tetris', name: 'Tetris', enabled: false },
  ]);
  assert.equal(next.games.length, GAMES.length);
  assert.ok(next.games.slice(2).every(g => g.enabled));
});

test('admin login: right password gives a session cookie, wrong ones lock out', () => {
  let clock = 1_000;
  const auth = createAdminAuth('pw', () => clock);
  const cookie = auth.login('pw');
  const req = { headers: { cookie: `other=1; ${cookie.split(';')[0]}` } };
  assert.ok(auth.isAdmin(req));
  assert.ok(!auth.isAdmin({ headers: { cookie: 'hub_admin=forged' } }));
  for (let i = 0; i < 5; i++) assert.throws(() => auth.login('nope'), /sbagliata/);
  assert.throws(() => auth.login('pw'), /Troppi tentativi/);
  clock += 61_000;
  assert.ok(auth.login('pw'));
  auth.logout(req);
  assert.ok(!auth.isAdmin(req));
  clock += 9 * 60 * 60_000;
  assert.throws(() => createAdminAuth('').login('x'), /disattivata/);
});

test('admin session expires', () => {
  let clock = 0;
  const auth = createAdminAuth('pw', () => clock);
  const req = { headers: { cookie: auth.login('pw').split(';')[0] } };
  clock += 8 * 60 * 60_000 + 1;
  assert.ok(!auth.isAdmin(req));
});

test('theme: hex/hsl round trip and a full palette for every preset', () => {
  for (const hex of ['#3a3180', '#ff0000', '#00ff7f', '#808080']) assert.equal(hslToHex(...hexToHsl(hex)), hex);
  for (const p of PRESETS) {
    const vars = themeFromColor(p.color);
    assert.deepEqual(Object.keys(vars), ['--bg', '--bg-2', '--card', '--text', '--muted', '--accent', '--focus']);
    for (const v of Object.values(vars)) assert.match(v, /^#[0-9a-f]{6}$/);
  }
  // Background always dark enough for white text.
  assert.ok(hexToHsl(themeFromColor('#ffff00')['--bg'])[2] < 20);
  assert.equal(themeFromColor('#c9a227')['--focus'], '#ffffff');
});

test('mergeSettings validates the time zone and the weather place', () => {
  const base = structuredClone(DEFAULTS);
  assert.equal(mergeSettings(base, { timezone: 'Europe/Rome' }).timezone, 'Europe/Rome');
  assert.equal(mergeSettings(base, { timezone: '' }).timezone, '');
  assert.throws(() => mergeSettings(base, { timezone: 'Mars/Olympus' }), /Fuso orario/);
  assert.deepEqual(mergeSettings(base, { weatherPlace: { name: ' Roma ', lat: 41.89, lon: 12.51 } }).weatherPlace, { name: 'Roma', lat: 41.89, lon: 12.51 });
  assert.equal(mergeSettings(base, { weatherPlace: null }).weatherPlace, null);
  assert.throws(() => mergeSettings(base, { weatherPlace: { name: 'x', lat: 120, lon: 0 } }), /Luogo/);
  assert.throws(() => mergeSettings(base, { weatherPlace: { name: 'x', lat: null, lon: 0 } }), /Luogo/);
});
