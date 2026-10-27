import http from 'node:http';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createAdminAuth } from './admin-auth.js';
import { GAMES } from './games.js';
import { Jellyfin, normalizeId } from './jellyfin.js';
import { BACKGROUNDS, openSettings } from './settings.js';
import { createWeather } from './weather.js';
import { themeFromColor } from '../public/theme.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? path.join(root, 'data');
const DEFAULT_JELLYFIN_URL = 'http://localhost:8096';
const envFile = readEnvFile(process.env.ENV_FILE ?? '/run/secrets/media-hub.env');
const env = name => process.env[name] || envFile[name] || '';

const settings = openSettings(DATA_DIR);
const auth = createAdminAuth(env('ADMIN_PASSWORD'));
let jellyfin = connect(settings.get());
const weather = createWeather();

const STATIC = {
  '/vendor/hls.min.js': path.join(root, 'node_modules/hls.js/dist/hls.min.js'),
  '/vendor/hls.LICENSE.txt': path.join(root, 'node_modules/hls.js/LICENSE'),
  '/LICENSE.txt': path.join(root, 'LICENSE'),
};
const PACKAGE = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const VERSION = PACKAGE.version;
// AGPL section 13: users of a modified hub must be offered its source. Forks point
// `homepage` in package.json at their own code; the ℹ️ dialog links it.
const SOURCE_URL = PACKAGE.homepage ?? null;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
// Games run in a sandboxed iframe (opaque origin): they may load their own files only, never talk to
// the network. Fonts and module scripts are CORS requests from that opaque origin, hence the allow-origin.
const GAME_HEADERS = {
  'Content-Security-Policy': "default-src 'self' 'unsafe-inline' data: blob:; connect-src 'none'; form-action 'none'; frame-ancestors 'self'",
  'Access-Control-Allow-Origin': '*',
};
const IMAGE_TYPES = new Set(['Primary', 'Backdrop', 'Thumb', 'Logo']);
const PROXY_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'last-modified', 'etag'];

// KEY=value lines; a missing file is fine, everything can come from the environment or the admin page.
function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const vars = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return vars;
}

// Settings saved from the admin page win over the environment.
function jellyfinTarget(s, override = {}) {
  return {
    url: override.url || s.jellyfinUrl || env('JELLYFIN_URL') || DEFAULT_JELLYFIN_URL,
    apiKey: override.apiKey || s.jellyfinApiKey || env('JELLYFIN_API_KEY'),
    user: override.user || s.jellyfinUser || env('JELLYFIN_USER'),
  };
}

function connect(s) {
  const t = jellyfinTarget(s);
  return new Jellyfin(t.url, t.apiKey, t.user);
}

// --- Access control: the hub serves only what the Jellyfin user can see (enabled
// libraries, parental rating). /Items/{id}?userId= enforces that; /Items?ids= does not.

let favoriteCache = { at: 0, ids: new Set() };
let libraryCache = { at: 0, items: [] };
const itemCache = new Map();

function resetCaches() {
  favoriteCache = { at: 0, ids: new Set() };
  libraryCache = { at: 0, items: [] };
  itemCache.clear();
}

async function favoriteIds() {
  if (Date.now() - favoriteCache.at > 30_000) {
    const items = await jellyfin.favorites();
    favoriteCache = { at: Date.now(), ids: new Set(items.map(i => normalizeId(i.id))) };
  }
  return favoriteCache.ids;
}

async function libraries() {
  if (Date.now() - libraryCache.at > 60_000) {
    libraryCache = { at: Date.now(), items: await jellyfin.libraries() };
  }
  return libraryCache.items;
}

async function isLibrary(rawId) {
  const id = normalizeId(rawId);
  return (await libraries()).some(l => normalizeId(l.id) === id);
}

// Items listed for the user are visible to them by definition: skip the per-item check for their images and streams.
function markAllowed(items) {
  const at = Date.now();
  for (const item of items) itemCache.set(normalizeId(item.id), { at, allowed: true });
  return items;
}

async function isAllowed(rawId) {
  const id = normalizeId(rawId);
  if ((await favoriteIds()).has(id) || (await isLibrary(id))) return true;
  const cached = itemCache.get(id);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.allowed;
  let allowed = false;
  try {
    await jellyfin.item(id);
    allowed = true;
  } catch {
    // Not visible to the user (other library, parental rating) or not found.
  }
  itemCache.set(id, { at: Date.now(), allowed });
  return allowed;
}

// --- HTTP helpers

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'File troppo grande');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const body = (await readBody(req, 20_000)).toString();
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw new HttpError(400, 'JSON non valido');
  }
}

// Errors with a status and a message meant for the page; anything else is reported as Jellyfin down.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// --- Settings exposed to the page, and the admin API

const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

async function backgroundFile() {
  const names = await readdir(DATA_DIR).catch(() => []);
  const name = names.find(n => /^background\.(jpg|png|webp)$/.test(n));
  return name ? path.join(DATA_DIR, name) : null;
}

async function publicConfig() {
  const s = settings.get();
  const file = await backgroundFile();
  const catalog = new Map(GAMES.map(g => [g.id, g]));
  return {
    appName: s.appName,
    version: VERSION,
    sourceUrl: SOURCE_URL,
    themeColor: s.themeColor,
    background: s.background,
    // The version busts the browser cache when a new picture is uploaded.
    backgroundUrl: file ? `/api/background?v=${Math.round((await stat(file)).mtimeMs)}` : null,
    games: s.games.filter(g => g.enabled).map(g => ({ ...catalog.get(g.id), name: g.name })),
    // Empty: the TV's own time zone.
    timezone: s.timezone,
    weather: Boolean(s.weatherPlace),
  };
}

// Built from the settings so the installed app follows the name and theme chosen in the admin page.
function manifest() {
  const s = settings.get();
  const bg = themeFromColor(s.themeColor)['--bg'];
  // Shown under the home-screen icon: drop the article, then whole words up to 15 characters.
  let short = s.appName.replace(/^(La|Il|Lo|Le|I|Gli|L’|L')\s*/i, '');
  while (short.length > 15 && short.includes(' ')) short = short.slice(0, short.lastIndexOf(' '));
  return {
    name: s.appName,
    short_name: short,
    description: 'Cartoni e giochi per bambini',
    lang: 'it',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    orientation: 'landscape',
    background_color: bg,
    theme_color: bg,
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

async function adminSettings() {
  const { jellyfinApiKey, ...s } = settings.get();
  return {
    ...s,
    apiKeySet: Boolean(jellyfinApiKey),
    // What applies when a Jellyfin field is left empty.
    env: { jellyfinUrl: env('JELLYFIN_URL') || DEFAULT_JELLYFIN_URL, jellyfinUser: env('JELLYFIN_USER'), apiKeySet: Boolean(env('JELLYFIN_API_KEY')) },
    catalog: GAMES,
    backgrounds: BACKGROUNDS,
    hasBackgroundImage: Boolean(await backgroundFile()),
  };
}

// Checks a Jellyfin address/key/user before saving them. Empty fields fall back to the current ones.
async function testJellyfin(body) {
  const t = jellyfinTarget(settings.get(), { url: body.url?.trim(), apiKey: body.apiKey?.trim(), user: body.user?.trim() });
  if (!t.apiKey) return { ok: false, error: 'Manca la chiave API' };
  if (!t.user) return { ok: false, error: 'Manca l’utente Jellyfin' };
  const client = new Jellyfin(t.url, t.apiKey, t.user);
  try {
    const info = await client.json('/System/Info');
    const users = (await client.json('/Users')).map(u => u.Name);
    const userFound = users.some(u => u.toLowerCase() === t.user.toLowerCase());
    return { ok: userFound, serverName: info.ServerName, version: info.Version, users, user: t.user, error: userFound ? null : `Utente "${t.user}" non trovato` };
  } catch (err) {
    const error = /Jellyfin 401/.test(err.message) ? 'Chiave API rifiutata' : `Jellyfin non raggiungibile su ${t.url}`;
    return { ok: false, error };
  }
}

async function adminRoute(req, res, p) {
  if (req.method === 'GET' && p === '/api/admin/status') {
    return send(res, 200, { enabled: auth.enabled, loggedIn: auth.isAdmin(req) });
  }
  if (req.method === 'POST' && p === '/api/admin/login') {
    const { password } = await readJson(req);
    let cookie;
    try {
      cookie = auth.login(password);
    } catch (err) {
      throw new HttpError(401, err.message);
    }
    res.setHeader('Set-Cookie', cookie);
    return send(res, 200, { ok: true });
  }
  if (!auth.isAdmin(req)) throw new HttpError(401, 'Accesso richiesto');

  if (req.method === 'POST' && p === '/api/admin/logout') {
    res.setHeader('Set-Cookie', auth.logout(req));
    return send(res, 200, { ok: true });
  }
  if (req.method === 'GET' && p === '/api/admin/settings') return send(res, 200, await adminSettings());
  if (req.method === 'PUT' && p === '/api/admin/settings') {
    const before = jellyfinTarget(settings.get());
    try {
      settings.update(await readJson(req));
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, err.message);
    }
    const after = jellyfinTarget(settings.get());
    if (before.url !== after.url || before.apiKey !== after.apiKey || before.user !== after.user) {
      jellyfin = connect(settings.get());
      resetCaches();
    }
    return send(res, 200, await adminSettings());
  }
  if (req.method === 'POST' && p === '/api/admin/jellyfin/test') return send(res, 200, await testJellyfin(await readJson(req)));
  if (req.method === 'GET' && p === '/api/admin/places') {
    const name = (new URL(req.url, 'http://hub').searchParams.get('q') ?? '').trim().slice(0, 100);
    if (name.length < 2) return send(res, 200, []);
    try {
      return send(res, 200, await weather.search(name));
    } catch {
      throw new HttpError(502, 'Ricerca luoghi non disponibile (Open-Meteo non risponde)');
    }
  }
  if (req.method === 'PUT' && p === '/api/admin/background') {
    const ext = IMAGE_EXT[(req.headers['content-type'] ?? '').split(';')[0]];
    if (!ext) throw new HttpError(415, 'Usa un’immagine JPG, PNG o WebP');
    const data = await readBody(req, 8_000_000);
    const old = await backgroundFile();
    if (old) await unlink(old);
    await writeFile(path.join(DATA_DIR, 'background' + ext), data, { mode: 0o644 });
    return send(res, 200, await adminSettings());
  }
  if (req.method === 'DELETE' && p === '/api/admin/background') {
    const old = await backgroundFile();
    if (old) await unlink(old);
    return send(res, 200, await adminSettings());
  }
  throw new HttpError(404, 'Not found');
}

async function pipeUpstream(req, res, upstreamPath, extraHeaders = {}) {
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  const headers = {};
  for (const name of ['range', 'if-range']) if (req.headers[name]) headers[name] = req.headers[name];
  const upstream = await jellyfin.fetch(upstreamPath, { headers, signal: abort.signal });
  const out = { ...extraHeaders };
  for (const name of PROXY_HEADERS) {
    const value = upstream.headers.get(name);
    if (value && !(name in out)) out[name] = value;
  }
  res.writeHead(upstream.status, out);
  if (!upstream.body || req.method === 'HEAD') return res.end();
  Readable.fromWeb(upstream.body).on('error', () => res.destroy()).pipe(res);
}

async function serveFile(res, file, headers = {}) {
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const type = TYPES[path.extname(file)] ?? (path.basename(file) === 'LICENSE' ? TYPES['.txt'] : 'application/octet-stream');
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size, 'Cache-Control': 'no-cache', ...headers });
    createReadStream(file).pipe(res);
  } catch {
    send(res, 404, { error: 'Not found' });
  }
}

// --- Routes

async function route(req, res) {
  const url = new URL(req.url, 'http://hub');
  const p = url.pathname;
  let m;

  if (p.startsWith('/api/admin/')) return adminRoute(req, res, p);

  if (req.method === 'GET' && p === '/api/config') return send(res, 200, await publicConfig());

  if (req.method === 'GET' && p === '/manifest.webmanifest') {
    res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' });
    return res.end(JSON.stringify(manifest()));
  }

  // Null when no place is set or Open-Meteo is unreachable: the page then shows no weather.
  if (req.method === 'GET' && p === '/api/weather') {
    const place = settings.get().weatherPlace;
    return send(res, 200, place ? await weather.current(place) : null);
  }

  if (req.method === 'GET' && p === '/api/background') {
    const file = await backgroundFile();
    return file ? serveFile(res, file, { 'Cache-Control': 'public, max-age=31536000, immutable' }) : send(res, 404, { error: 'Not found' });
  }

  if (req.method === 'GET' && p === '/api/items') {
    return send(res, 200, await jellyfin.favorites());
  }

  if (req.method === 'GET' && p === '/api/libraries') {
    return send(res, 200, await libraries());
  }

  if (req.method === 'GET' && (m = p.match(/^\/api\/library\/([0-9a-f-]{32,36})$/i))) {
    if (!(await isLibrary(m[1]))) return send(res, 403, { error: 'Not allowed' });
    return send(res, 200, markAllowed(await jellyfin.libraryItems(m[1])));
  }

  if (req.method === 'GET' && p === '/api/search') {
    const term = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
    return send(res, 200, term.length < 2 ? [] : markAllowed(await jellyfin.search(term)));
  }

  if (req.method === 'GET' && (m = p.match(/^\/api\/series\/([0-9a-f-]{32,36})$/i))) {
    if (!(await isAllowed(m[1]))) return send(res, 403, { error: 'Not allowed' });
    return send(res, 200, markAllowed(await jellyfin.episodes(m[1])));
  }

  if (req.method === 'GET' && (m = p.match(/^\/api\/item\/([0-9a-f-]{32,36})$/i))) {
    if (!(await isAllowed(m[1]))) return send(res, 403, { error: 'Not allowed' });
    return send(res, 200, await jellyfin.details(m[1]));
  }

  if ((req.method === 'POST' || req.method === 'DELETE') && (m = p.match(/^\/api\/favorite\/([0-9a-f-]{32,36})$/i))) {
    if (!(await isAllowed(m[1]))) return send(res, 403, { error: 'Not allowed' });
    const isFavorite = req.method === 'POST';
    await jellyfin.setFavorite(m[1], isFavorite);
    favoriteCache.at = 0;
    return send(res, 200, { isFavorite });
  }

  if (req.method === 'GET' && (m = p.match(/^\/api\/img\/([0-9a-f-]{32,36})$/i))) {
    if (!(await isAllowed(m[1]))) return send(res, 403, { error: 'Not allowed' });
    const width = Math.min(Number(url.searchParams.get('w')) || 400, 1920);
    const type = IMAGE_TYPES.has(url.searchParams.get('type')) ? url.searchParams.get('type') : 'Primary';
    return pipeUpstream(req, res, `/Items/${m[1]}/Images/${type}?maxWidth=${width}&quality=85`,
      { 'cache-control': 'public, max-age=86400' });
  }

  if (req.method === 'POST' && (m = p.match(/^\/api\/play\/([0-9a-f-]{32,36})$/i))) {
    if (!(await isAllowed(m[1]))) return send(res, 403, { error: 'Not allowed' });
    return send(res, 200, await jellyfin.playbackInfo(m[1]));
  }

  // Progress and stop arrive via sendBeacon too, so the body is parsed whatever its content type.
  if (req.method === 'POST' && (p === '/api/progress' || p === '/api/stop')) {
    const body = await readJson(req);
    if (typeof body.id !== 'string' || !(await isAllowed(body.id))) return send(res, 403, { error: 'Not allowed' });
    const positionTicks = Math.max(0, Math.round(Number(body.positionTicks) || 0));
    await jellyfin.saveProgress(body.id, { positionTicks, played: body.played === true });
    if (p === '/api/stop' && body.playSessionId) {
      await jellyfin.stopped({ id: body.id, playSessionId: body.playSessionId, mediaSourceId: body.mediaSourceId, positionTicks });
    }
    return send(res, 200, { ok: true });
  }

  // Video streams and HLS playlists/segments. HLS playlists use relative URLs, so they stay under /jf/videos/<id>/.
  if ((req.method === 'GET' || req.method === 'HEAD') && (m = p.match(/^\/jf(\/videos\/([0-9a-f-]{32,36})\/[\w./-]+)$/i))) {
    if (!(await isAllowed(m[2]))) return send(res, 403, { error: 'Not allowed' });
    return pipeUpstream(req, res, m[1] + url.search);
  }

  if (req.method === 'GET' && STATIC[p]) return serveFile(res, STATIC[p]);

  if (req.method === 'GET') {
    const file = path.join(root, 'public', p.endsWith('/') ? path.normalize(p) + 'index.html' : path.normalize(p));
    if (!file.startsWith(path.join(root, 'public') + path.sep)) return send(res, 404, { error: 'Not found' });
    return serveFile(res, file, p.startsWith('/games/') ? GAME_HEADERS : {});
  }

  send(res, 404, { error: 'Not found' });
}

http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  route(req, res).catch(err => {
    if (err instanceof HttpError) return res.headersSent ? res.destroy() : send(res, err.status, { error: err.message });
    console.error(`${req.method} ${req.url.split('?')[0]}: ${err.message}`);
    if (!res.headersSent) send(res, 502, { error: 'Jellyfin non risponde' });
    else res.destroy();
  });
}).listen(PORT, () => {
  console.log(`Media hub on :${PORT}, Jellyfin ${jellyfin.baseUrl} user "${jellyfin.userName}", data in ${DATA_DIR}`);
  if (!auth.enabled) console.log('Admin page disabled: set ADMIN_PASSWORD in the .env');
});
