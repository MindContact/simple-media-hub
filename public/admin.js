import { PRESETS, themeFromColor } from './theme.js';

const $ = id => document.getElementById(id);
const BACKGROUND_LABELS = { gradient: '🌈 Sfumato', stars: '✨ Stelle', bubbles: '🫧 Bolle', snow: '❄️ Neve', image: '🖼️ Immagine' };

let saved = null; // settings as last loaded from the server
let draft = null; // what the form shows

async function api(path, init = {}) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/admin/login') showLogin();
  if (!res.ok) throw new Error(body.error ?? `Errore ${res.status}`);
  return body;
}

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
}

// 👁️ next to a password field shows what is being typed.
for (const b of document.querySelectorAll('.reveal')) {
  b.addEventListener('click', () => {
    const input = $(b.dataset.for);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(show));
    b.textContent = show ? '🙈' : '👁️';
    input.focus();
  });
}

// --- Login

function showLogin(message) {
  $('settings').hidden = true;
  $('logout').hidden = true;
  $('login').hidden = false;
  if (message) $('login-note').textContent = message;
  $('password').focus();
}

$('login').addEventListener('submit', async e => {
  e.preventDefault();
  $('login-error').hidden = true;
  try {
    await api('/api/admin/login', json('POST', { password: $('password').value }));
    $('password').value = '';
    $('password').type = 'password';
    await open();
  } catch (err) {
    $('login-error').textContent = err.message;
    $('login-error').hidden = false;
  }
});

$('logout').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

// --- Form

function applyTheme(color) {
  const vars = themeFromColor(color);
  for (const [name, value] of Object.entries(vars)) document.documentElement.style.setProperty(name, value);
  $('palette').replaceChildren(...Object.entries(vars)
    .filter(([name]) => name !== '--text')
    .map(([name, value]) => {
      const chip = el('span', 'chip');
      chip.style.background = value;
      chip.title = `${name} ${value}`;
      return chip;
    }));
  for (const b of $('presets').children) b.classList.toggle('active', b.dataset.color === color);
}

function renderBackgrounds() {
  $('backgrounds').replaceChildren(...saved.backgrounds.map(type => {
    const b = el('button', type === draft.background.type ? 'choice active' : 'choice', BACKGROUND_LABELS[type] ?? type);
    b.type = 'button';
    b.addEventListener('click', () => {
      draft.background.type = type;
      renderBackgrounds();
      changed();
    });
    return b;
  }));
  $('image-options').hidden = draft.background.type !== 'image';
  $('image-state').textContent = saved.hasBackgroundImage ? 'Immagine caricata ✓' : 'Nessuna immagine caricata';
  $('image-remove').hidden = !saved.hasBackgroundImage;
  $('blur').value = draft.background.blur;
  $('dim').value = draft.background.dim;
  $('blur-out').textContent = `${draft.background.blur}px`;
  $('dim-out').textContent = `${draft.background.dim}%`;
}

function renderGames() {
  const catalog = new Map(saved.catalog.map(g => [g.id, g]));
  $('games').replaceChildren(...draft.games.map((g, i) => {
    const row = el('li', g.enabled ? 'game-row' : 'game-row off');
    const icon = el('span', 'game-icon', catalog.get(g.id).icon);
    icon.style.background = catalog.get(g.id).color;
    const enabled = el('input');
    enabled.type = 'checkbox';
    enabled.checked = g.enabled;
    enabled.title = 'Mostra';
    enabled.addEventListener('change', () => { g.enabled = enabled.checked; renderGames(); changed(); });
    const name = el('input');
    name.value = g.name;
    name.maxLength = 30;
    name.placeholder = catalog.get(g.id).name;
    name.addEventListener('input', () => { g.name = name.value; changed(); });
    const move = (delta, label, text) => {
      const b = el('button', 'btn small', text);
      b.type = 'button';
      b.title = label;
      b.disabled = !draft.games[i + delta];
      b.addEventListener('click', () => {
        [draft.games[i], draft.games[i + delta]] = [draft.games[i + delta], draft.games[i]];
        renderGames();
        changed();
      });
      return b;
    };
    row.append(enabled, icon, name, move(-1, 'Su', '▲'), move(1, 'Giù', '▼'));
    return row;
  }));
}

function renderTimezones() {
  const select = $('timezone');
  const own = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = Intl.supportedValuesOf('timeZone');
  // A saved zone this browser does not list stays selectable.
  if (draft.timezone && !zones.includes(draft.timezone)) zones.unshift(draft.timezone);
  select.replaceChildren(
    Object.assign(el('option', null, `Quello della TV (qui: ${own})`), { value: '' }),
    ...zones.map(z => Object.assign(el('option', null, z.replaceAll('_', ' ')), { value: z })),
  );
  select.value = draft.timezone;
}

function renderPlace() {
  const place = draft.weatherPlace;
  $('place-state').textContent = place ? `Meteo di ${place.name} ✓` : 'Nessun luogo: il meteo non viene mostrato';
  $('place-clear').hidden = !place;
}

async function searchPlaces() {
  const list = $('places');
  const q = $('place-query').value.trim();
  if (q.length < 2) return;
  list.replaceChildren(el('li', 'note', 'Cerco…'));
  try {
    const places = await api(`/api/admin/places?q=${encodeURIComponent(q)}`);
    if (!places.length) return list.replaceChildren(el('li', 'note', 'Nessun luogo trovato'));
    list.replaceChildren(...places.map(p => {
      const b = el('button', 'choice', p.name);
      b.type = 'button';
      b.append(' ', el('small', null, p.region));
      b.addEventListener('click', () => {
        draft.weatherPlace = { name: p.name, lat: p.lat, lon: p.lon };
        list.replaceChildren();
        $('place-query').value = '';
        renderPlace();
        changed();
      });
      const li = el('li');
      li.append(b);
      return li;
    }));
  } catch (err) {
    list.replaceChildren(el('li', 'note error', err.message));
  }
}

function fillForm() {
  draft = structuredClone(saved);
  $('app-name').value = draft.appName;
  $('theme-color').value = draft.themeColor;
  applyTheme(draft.themeColor);
  renderBackgrounds();
  $('jf-url').value = draft.jellyfinUrl;
  $('jf-url').placeholder = saved.env.jellyfinUrl;
  $('jf-key').value = '';
  // Saving hides the key again.
  $('jf-key').type = 'password';
  document.querySelector('[data-for=jf-key]').textContent = '👁️';
  document.querySelector('[data-for=jf-key]').setAttribute('aria-pressed', 'false');
  $('jf-key').placeholder = saved.apiKeySet ? '•••••• salvata (scrivi per cambiarla)'
    : saved.env.apiKeySet ? 'dal .env (scrivi per cambiarla)' : 'nessuna chiave impostata';
  $('jf-key-clear').checked = false;
  $('jf-key-clear').parentElement.hidden = !saved.apiKeySet;
  $('jf-user').value = draft.jellyfinUser;
  $('jf-user').placeholder = saved.env.jellyfinUser || 'obbligatorio';
  $('jf-result').textContent = '';
  renderTimezones();
  renderPlace();
  $('places').replaceChildren();
  renderGames();
  $('save-state').textContent = '';
}

function changed() {
  $('save-state').textContent = 'Modifiche non salvate';
}

async function open() {
  saved = await api('/api/admin/settings');
  $('login').hidden = true;
  $('settings').hidden = false;
  $('logout').hidden = false;
  const presets = PRESETS.map(p => {
    const b = el('button', 'preset', p.name);
    b.type = 'button';
    b.dataset.color = p.color;
    b.style.setProperty('--swatch', p.color);
    b.addEventListener('click', () => {
      draft.themeColor = p.color;
      $('theme-color').value = p.color;
      applyTheme(p.color);
      changed();
    });
    return b;
  });
  $('presets').replaceChildren(...presets);
  fillForm();
}

$('app-name').addEventListener('input', () => { draft.appName = $('app-name').value; changed(); });
$('theme-color').addEventListener('input', () => {
  draft.themeColor = $('theme-color').value;
  applyTheme(draft.themeColor);
  changed();
});
for (const id of ['blur', 'dim']) {
  $(id).addEventListener('input', () => {
    draft.background[id] = Number($(id).value);
    renderBackgrounds();
    changed();
  });
}
$('timezone').addEventListener('change', () => { draft.timezone = $('timezone').value; changed(); });
$('place-search').addEventListener('click', searchPlaces);
// Enter searches instead of saving the whole form.
$('place-query').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  searchPlaces();
});
$('place-clear').addEventListener('click', () => {
  draft.weatherPlace = null;
  renderPlace();
  changed();
});
for (const id of ['jf-url', 'jf-key', 'jf-user', 'jf-key-clear']) $(id).addEventListener('input', changed);

$('image-file').addEventListener('change', async () => {
  const file = $('image-file').files[0];
  if (!file) return;
  try {
    saved = { ...saved, ...await api('/api/admin/background', { method: 'PUT', headers: { 'Content-Type': file.type }, body: file }) };
    draft.background.type = 'image';
    renderBackgrounds();
    changed();
    toast('Immagine caricata: salva per usarla come sfondo');
  } catch (err) {
    toast(err.message);
  }
  $('image-file').value = '';
});

$('image-remove').addEventListener('click', async () => {
  try {
    saved = { ...saved, ...await api('/api/admin/background', { method: 'DELETE' }) };
    renderBackgrounds();
    toast('Immagine rimossa');
  } catch (err) {
    toast(err.message);
  }
});

$('jf-test').addEventListener('click', async () => {
  const result = $('jf-result');
  result.textContent = 'Provo…';
  result.className = 'note';
  try {
    const r = await api('/api/admin/jellyfin/test', json('POST', { url: $('jf-url').value, apiKey: $('jf-key').value, user: $('jf-user').value }));
    if (r.users) $('jf-users').replaceChildren(...r.users.map(u => Object.assign(el('option'), { value: u })));
    result.textContent = r.ok ? `✓ ${r.serverName} (Jellyfin ${r.version}), utente “${r.user}”`
      : r.users ? `✗ ${r.error}. Utenti: ${r.users.join(', ')}` : `✗ ${r.error}`;
    result.className = r.ok ? 'note ok' : 'note error';
  } catch (err) {
    result.textContent = `✗ ${err.message}`;
    result.className = 'note error';
  }
});

$('settings').addEventListener('submit', async e => {
  e.preventDefault();
  const patch = {
    appName: draft.appName,
    themeColor: draft.themeColor,
    background: draft.background,
    jellyfinUrl: $('jf-url').value,
    jellyfinUser: $('jf-user').value,
    timezone: draft.timezone,
    weatherPlace: draft.weatherPlace,
    games: draft.games,
  };
  // The key is write-only: sent only when typed, or '' to clear it.
  if ($('jf-key').value) patch.jellyfinApiKey = $('jf-key').value;
  else if ($('jf-key-clear').checked) patch.jellyfinApiKey = '';
  try {
    saved = await api('/api/admin/settings', json('PUT', patch));
    fillForm();
    $('save-state').textContent = 'Salvato ✓ (la TV si aggiorna entro 5 minuti, o ricaricando)';
  } catch (err) {
    toast(err.message);
  }
});

const status = await api('/api/admin/status');
if (!status.enabled) {
  showLogin('Amministrazione disattivata: imposta ADMIN_PASSWORD nel file .env del server e riavvialo.');
  $('password').disabled = true;
} else if (status.loggedIn) {
  await open();
} else {
  showLogin();
}
