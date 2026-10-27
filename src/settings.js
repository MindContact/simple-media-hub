// Hub settings, edited from the admin page and kept in SQLite as one JSON value per key.

import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { GAMES } from './games.js';

export const BACKGROUNDS = ['gradient', 'stars', 'bubbles', 'snow', 'image'];

export const DEFAULTS = {
  appName: 'L’Isola dei Bimbi',
  themeColor: '#3a3180',
  background: { type: 'gradient', blur: 8, dim: 40 },
  // Empty means "use the environment" (JELLYFIN_URL, JELLYFIN_API_KEY, JELLYFIN_USER).
  jellyfinUrl: '',
  jellyfinApiKey: '',
  jellyfinUser: '',
  // Empty means the TV's own time zone. No place means no weather.
  timezone: '',
  weatherPlace: null, // { name, lat, lon }
  games: GAMES.map(g => ({ id: g.id, name: g.name, enabled: true })),
};

const HEX = /^#[0-9a-f]{6}$/i;

function text(value, max) {
  if (typeof value !== 'string') throw new Error('Valore non valido');
  return value.trim().slice(0, max);
}

function int(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) throw new Error('Numero non valido');
  return Math.min(max, Math.max(min, n));
}

function isTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('it', { timeZone });
    return true;
  } catch {
    return false;
  }
}

// Validates a partial update against the current settings and returns the merged result.
// Unknown keys are ignored; a bad value throws with a message fit for the admin page.
export function mergeSettings(current, patch) {
  const next = structuredClone(current);
  if ('appName' in patch) {
    next.appName = text(patch.appName, 40);
    if (!next.appName) throw new Error('Il nome dell’app non può essere vuoto');
  }
  if ('themeColor' in patch) {
    if (!HEX.test(patch.themeColor)) throw new Error('Colore non valido');
    next.themeColor = patch.themeColor.toLowerCase();
  }
  if ('background' in patch) {
    const b = patch.background ?? {};
    if (!BACKGROUNDS.includes(b.type)) throw new Error('Sfondo non valido');
    next.background = { type: b.type, blur: int(b.blur ?? 0, 0, 30), dim: int(b.dim ?? 0, 0, 90) };
  }
  if ('jellyfinUrl' in patch) {
    const url = text(patch.jellyfinUrl, 200).replace(/\/+$/, '');
    if (url && !/^https?:\/\/[^\s/]+/i.test(url)) throw new Error('Indirizzo Jellyfin non valido (http://host:porta)');
    next.jellyfinUrl = url;
  }
  // The key is write-only: absent or null keeps it, '' clears it.
  if (patch.jellyfinApiKey != null) next.jellyfinApiKey = text(patch.jellyfinApiKey, 100);
  if ('jellyfinUser' in patch) next.jellyfinUser = text(patch.jellyfinUser, 100);
  if ('timezone' in patch) {
    const timezone = text(patch.timezone ?? '', 64);
    if (timezone && !isTimeZone(timezone)) throw new Error('Fuso orario non valido');
    next.timezone = timezone;
  }
  if ('weatherPlace' in patch) {
    const place = patch.weatherPlace;
    if (place == null) {
      next.weatherPlace = null;
    } else {
      const { lat, lon } = place;
      if (typeof lat !== 'number' || typeof lon !== 'number' || !(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new Error('Luogo non valido');
      next.weatherPlace = { name: text(place.name ?? '', 80) || 'Meteo', lat, lon };
    }
  }
  if ('games' in patch) {
    if (!Array.isArray(patch.games)) throw new Error('Lista giochi non valida');
    const known = new Map(GAMES.map(g => [g.id, g]));
    const seen = new Set();
    next.games = [];
    for (const g of patch.games) {
      if (!known.has(g?.id) || seen.has(g.id)) continue;
      seen.add(g.id);
      next.games.push({ id: g.id, name: text(g.name ?? '', 30) || known.get(g.id).name, enabled: g.enabled !== false });
    }
  }
  return withAllGames(next);
}

// Games added to the catalog after the settings were saved show up at the end, enabled.
function withAllGames(settings) {
  const listed = new Set(settings.games.map(g => g.id));
  for (const g of GAMES) if (!listed.has(g.id)) settings.games.push({ id: g.id, name: g.name, enabled: true });
  return settings;
}

export function openSettings(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'hub.db');
  const db = new DatabaseSync(file);
  // It may hold the Jellyfin API key.
  chmodSync(file, 0o600);
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const select = db.prepare('SELECT key, value FROM settings');
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

  function get() {
    const stored = Object.fromEntries(select.all().map(r => [r.key, JSON.parse(r.value)]));
    return withAllGames({ ...structuredClone(DEFAULTS), ...stored });
  }

  function update(patch) {
    const next = mergeSettings(get(), patch);
    db.exec('BEGIN');
    try {
      for (const key of Object.keys(DEFAULTS)) upsert.run(key, JSON.stringify(next[key]));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return next;
  }

  return { get, update, close: () => db.close() };
}
