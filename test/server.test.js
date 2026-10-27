import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const freePort = () => new Promise(resolve => {
  const s = createServer().listen(0, () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

// Starts the real server against an unreachable Jellyfin: everything that does not need
// Jellyfin must work, the rest must fail cleanly.
test('server starts on a fresh data dir and serves the page, config, admin and games', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hub-server-'));
  const port = await freePort();
  const child = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, ENV_FILE: path.join(dir, 'none'), ADMIN_PASSWORD: 'pw', JELLYFIN_URL: 'http://127.0.0.1:9', JELLYFIN_USER: 'kids', JELLYFIN_API_KEY: 'k' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', d => String(d).includes('Media hub on') && resolve());
    child.on('exit', code => reject(new Error(`server exited with ${code}`)));
  });
  const url = p => `http://127.0.0.1:${port}${p}`;

  const page = await fetch(url('/'));
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');

  const config = await (await fetch(url('/api/config'))).json();
  assert.equal(config.appName, 'L’Isola dei Bimbi');
  assert.ok(config.games.length >= 19);
  assert.equal(config.sourceUrl, 'https://github.com/MindContact/simple-media-hub');
  assert.match(await (await fetch(url('/LICENSE.txt'))).text(), /GNU AFFERO GENERAL PUBLIC LICENSE/);
  assert.equal(config.timezone, '');
  assert.equal(config.weather, false);
  assert.equal(await (await fetch(url('/api/weather'))).json(), null, 'no place, no weather and no outside call');

  assert.equal((await fetch(url('/manifest.webmanifest'))).headers.get('content-type'), 'application/manifest+json');

  const game = await fetch(url('/games/chess/'));
  assert.equal(game.status, 200);
  assert.match(game.headers.get('content-security-policy'), /connect-src 'none'/);

  assert.equal((await fetch(url('/../src/server.js'))).status, 404);
  assert.equal((await fetch(url('/%2e%2e/src/server.js'))).status, 404);

  assert.equal((await fetch(url('/api/admin/settings'))).status, 401);
  const login = await fetch(url('/api/admin/login'), { method: 'POST', body: JSON.stringify({ password: 'pw' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const settings = await (await fetch(url('/api/admin/settings'), { headers: { cookie } })).json();
  assert.equal(settings.env.jellyfinUser, 'kids');
  assert.ok(!('jellyfinApiKey' in settings), 'the API key never leaves the server');

  const items = await fetch(url('/api/items'));
  assert.equal(items.status, 502);
});
