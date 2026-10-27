// Admin sessions: one password from the environment, random tokens in an HttpOnly cookie.
// Kept in memory, so a restart logs the admin out.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_MS = 8 * 60 * 60_000;
const COOKIE = 'hub_admin';
const MAX_FAILURES = 5;
const LOCK_MS = 60_000;

const digest = value => createHash('sha256').update(value).digest();

export function createAdminAuth(password, now = Date.now) {
  const expected = password ? digest(password) : null;
  const sessions = new Map();
  let failures = 0;
  let lockedUntil = 0;

  function token(req) {
    const match = (req.headers.cookie ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([\\w-]+)`));
    return match?.[1] ?? null;
  }

  return {
    enabled: Boolean(expected),

    // Returns the Set-Cookie value on success; throws with a message for the login form otherwise.
    login(given) {
      if (!expected) throw new Error('Amministrazione disattivata: imposta ADMIN_PASSWORD nel .env');
      if (now() < lockedUntil) throw new Error('Troppi tentativi, riprova tra un minuto');
      if (typeof given !== 'string' || !timingSafeEqual(digest(given), expected)) {
        if (++failures >= MAX_FAILURES) {
          failures = 0;
          lockedUntil = now() + LOCK_MS;
        }
        throw new Error('Password sbagliata');
      }
      failures = 0;
      const id = randomBytes(24).toString('base64url');
      sessions.set(id, now() + SESSION_MS);
      return `${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}`;
    },

    isAdmin(req) {
      const id = token(req);
      const until = id && sessions.get(id);
      if (!until) return false;
      if (until < now()) {
        sessions.delete(id);
        return false;
      }
      return true;
    },

    logout(req) {
      sessions.delete(token(req));
      return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
    },
  };
}
