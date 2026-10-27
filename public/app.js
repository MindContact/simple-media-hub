import { applyBackground, pauseBackground } from './background.js';
import { CREDITS } from './credits.js';
import { formatRuntime, groupSections, nearest, pickEpisode, progress, stopState, TICKS_PER_SECOND } from './lib.js';
import { themeFromColor } from './theme.js';

const $ = id => document.getElementById(id);
const VIEWS = ['home', 'search', 'library', 'info', 'player', 'game'];
const searchInput = $('search-input');
const searchResults = $('search-results');
const video = $('video');
const gameFrame = $('game-frame');

// Name, theme, background and games come from the admin page. Games live in public/games/<id>/
// and run offline in a sandboxed iframe.
let config = { appName: 'L’Isola dei Bimbi', themeColor: '#3a3180', background: { type: 'gradient' }, backgroundUrl: null, games: [], timezone: '', weather: false };

let shownBackground = null;

async function loadConfig() {
  try {
    config = await api('/api/config');
  } catch {
    // Keep the defaults (or the last config): the hub must still open.
  }
  document.title = config.appName;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', themeFromColor(config.themeColor)['--bg']);
  for (const [name, value] of Object.entries(themeFromColor(config.themeColor))) document.documentElement.style.setProperty(name, value);
  // Re-applying restarts the animation: only when it changed.
  const background = JSON.stringify([config.background, config.backgroundUrl]);
  if (background !== shownBackground) applyBackground(config.background, config.backgroundUrl);
  shownBackground = background;
}

// Navigation stack: one entry per screen, ◀ / Esc goes back to the previous one.
// Each entry remembers the card that was opened from it, to focus it again on return.
const stack = [];
let current = null; // playback: { item, playlist, session, hls, timer }

const top = () => stack.at(-1);
const isWide = item => ['Episode', 'MusicVideo', 'Video'].includes(item.type);

async function api(path, init) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Errore ${res.status}`);
  return body;
}

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
  toast.timer = setTimeout(() => { t.hidden = true; }, 4000);
}

function card(item, { wide = false, label = item.name, onOpen, onPlay }) {
  const node = el('button', wide ? 'card wide' : 'card');
  node.dataset.id = item.id;
  const art = el('div', 'art');
  art.append(el('span', 'fallback', item.name));
  if (item.hasImage) {
    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = `/api/img/${item.id}?w=${wide ? 480 : 360}`;
    img.onerror = () => img.remove();
    art.append(img);
  }
  const p = progress(item);
  if (p) {
    const bar = el('div', 'bar');
    bar.style.setProperty('--p', p);
    art.append(bar);
  }
  if (item.played) art.append(el('span', 'seen', '✓'));
  if (item.isFavorite) art.append(el('span', 'fav', '❤️'));
  if (onPlay) {
    // Play straight away, skipping the info page. A card is a button, so this is a span:
    // the keyboard equivalent is Space on the focused card.
    const overlay = el('span', 'play-overlay');
    overlay.addEventListener('click', e => {
      e.stopPropagation();
      top().focus = item.id;
      onPlay(item);
    });
    art.append(overlay);
    node.playAction = () => overlay.click();
  }
  node.append(art, el('span', 'title', label));
  node.addEventListener('mouseenter', () => node.focus({ preventScroll: true }));
  node.addEventListener('click', () => {
    top().focus = item.id;
    onOpen(item);
  });
  return node;
}

function grid(items, onOpen, { label, onPlay } = {}) {
  const node = el('div', items.length && items.every(isWide) ? 'grid wide' : 'grid');
  node.append(...items.map(item => card(item, { wide: isWide(item), label: label?.(item), onOpen, onPlay })));
  return node;
}

function sections(items, onOpen, onPlay) {
  return groupSections(items).flatMap(s => [el('h2', null, s.title), grid(s.items, onOpen, { onPlay })]);
}

function focusIn(scope, id, fallback = '.card') {
  const target = (id && scope.querySelector(`[data-id="${id}"]`)) ?? scope.querySelector(fallback);
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: 'center' });
}

// --- Navigation

function render(entry) {
  for (const v of VIEWS) $(v).hidden = v !== entry.view;
  // Animated backgrounds would only steal frames from the video or the game.
  pauseBackground(entry.view === 'player' || entry.view === 'game');
  RENDER[entry.view](entry);
}

function go(entry) {
  document.activeElement?.blur();
  stack.push(entry);
  render(entry);
}

function back() {
  if (stack.length < 2) return;
  if (top().view === 'player') {
    stopPlayback();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  if (top().view === 'game') gameFrame.src = 'about:blank';
  document.activeElement?.blur();
  stack.pop();
  render(top());
}

function openItem(item, playlist) {
  go({ view: 'info', item, playlist });
}

// --- Home

const TABS = [
  { id: 'watch', label: '📺 Guarda' },
  { id: 'play', label: '🎮 Gioca' },
];

function homeHeader(entry) {
  const tabs = el('nav', 'tabs');
  for (const tab of TABS) {
    const b = el('button', tab.id === entry.tab ? 'tab active' : 'tab', tab.label);
    b.dataset.id = `tab-${tab.id}`;
    b.addEventListener('mouseenter', () => b.focus({ preventScroll: true }));
    b.addEventListener('click', () => {
      if (entry.tab === tab.id) return;
      entry.tab = tab.id;
      entry.focus = b.dataset.id;
      render(entry);
    });
    tabs.append(b);
  }
  const open = el('button', 'search-open', '🔍 Cerca');
  open.addEventListener('click', () => go({ view: 'search', term: '' }));
  // Mouse only: arrow-key navigation skips it, so the kids do not land there by chance.
  const admin = el('a', 'admin-open', '⚙️');
  admin.href = '/admin.html';
  admin.title = 'Impostazioni';
  admin.tabIndex = -1;
  const info = el('button', 'admin-open info-open', 'i');
  info.title = 'Informazioni';
  info.tabIndex = -1;
  info.addEventListener('click', showAbout);
  const actions = el('div', 'head-actions');
  actions.append(open, info, admin);
  // One row: name, date and weather, then tabs, then actions.
  const title = el('div', 'head-group');
  title.append(el('h1', 'hello', config.appName), el('p', 'now'), el('span', 'weather'));
  const head = el('header', 'home-head');
  head.append(title, tabs, actions);
  updateNow(head);
  return head;
}

// --- Date, time and weather next to the name

let weather = null; // { place, temperature, icon, label }

function formatNow(options) {
  const date = new Date();
  try {
    return date.toLocaleString('it-IT', { ...options, timeZone: config.timezone || undefined });
  } catch {
    // A time zone this browser does not know: use its own.
    return date.toLocaleString('it-IT', options);
  }
}

function updateNow(scope = document) {
  const day = formatNow({ weekday: 'long', day: 'numeric', month: 'long' });
  for (const node of scope.querySelectorAll('.now')) {
    node.replaceChildren(el('span', 'time', formatNow({ hour: '2-digit', minute: '2-digit' })), el('span', 'date', day[0].toUpperCase() + day.slice(1)));
  }
  const shown = config.weather && weather;
  for (const node of scope.querySelectorAll('.weather')) {
    node.hidden = !shown;
    node.textContent = shown ? `${weather.icon} ${weather.temperature}°` : '';
    node.title = shown ? `${weather.label} a ${weather.place}` : '';
  }
}

async function loadWeather() {
  weather = config.weather ? await api('/api/weather').catch(() => weather) : null;
  updateNow();
}

setInterval(updateNow, 10_000);
// The server caches the reading for 15 minutes; this picks up a new place soon after it is set.
setInterval(loadWeather, 5 * 60_000);

function gameCard(game) {
  const node = card({ id: game.id, name: game.name }, { wide: true, onOpen: () => go({ view: 'game', game }) });
  const art = node.querySelector('.art');
  art.classList.add('game-art');
  art.style.background = game.color;
  art.querySelector('.fallback').textContent = game.icon;
  return node;
}

async function renderHome(entry) {
  const home = $('home');
  entry.tab ??= 'watch';
  if (entry.tab === 'play') {
    // Games need no Jellyfin: they stay playable while it is down.
    const games = el('div', 'grid wide');
    games.append(...config.games.map(gameCard));
    home.replaceChildren(homeHeader(entry), games);
    return focusIn(home, entry.focus);
  }
  let items;
  let libraries;
  try {
    [items, libraries] = await Promise.all([api('/api/items'), api('/api/libraries')]);
  } catch (err) {
    if (top() === entry && entry.tab === 'watch') {
      home.replaceChildren(homeHeader(entry), el('p', 'empty', `${err.message}. Riprovo tra poco…`));
      focusIn(home, entry.focus, '.tab');
    }
    return;
  }
  // Left while loading, or switched to the games meanwhile.
  if (top() !== entry || entry.tab !== 'watch') return;
  // Favorites first, then every library the user can see.
  const children = [homeHeader(entry), ...sections(items, i => openItem(i, [i]), i => quickPlay(i))];
  if (libraries.length) {
    const libs = el('div', 'grid wide');
    libs.append(...libraries.map(lib => card(lib, { wide: true, onOpen: l => go({ view: 'library', library: l }) })));
    children.push(el('h2', null, items.length ? 'Tutti i video' : 'Scegli cosa guardare'), libs);
  }
  home.replaceChildren(...children);
  focusIn(home, entry.focus);
}

// --- About

function ownLicense() {
  const li = el('div', 'own-license');
  const head = el('div', 'credit-head');
  head.append(el('strong', null, 'Software libero'), el('span', 'license', 'AGPL-3.0'));
  li.append(head, el('p', 'meta', '© 2026 Roberto Luttino · GNU Affero General Public License, versione 3 o successiva'));
  if (config.sourceUrl) {
    const link = el('a', 'link', 'Codice sorgente');
    link.href = config.sourceUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    li.append(link, ' ');
  }
  li.append(licenseToggle('/LICENSE.txt'));
  return li;
}

// A button that shows the license text served at `file` under it.
function licenseToggle(file) {
  const wrap = el('span');
  const toggle = el('button', 'link', 'Leggi la licenza');
  const text = el('pre', 'license-text');
  text.hidden = true;
  toggle.addEventListener('click', async () => {
    if (!text.textContent) text.textContent = await fetch(file).then(r => r.text()).catch(() => 'Licenza non disponibile.');
    text.hidden = !text.hidden;
    toggle.textContent = text.hidden ? 'Leggi la licenza' : 'Nascondi la licenza';
  });
  wrap.append(toggle, text);
  return wrap;
}

function showAbout() {
  const body = $('about-body');
  const list = el('ul', 'credits');
  for (const c of CREDITS) {
    const li = el('li');
    const head = el('div', 'credit-head');
    head.append(el('strong', null, c.name), el('span', 'license', c.license));
    li.append(head, el('p', 'meta', `${c.use} · ${c.copyright}`));
    if (c.file) {
      li.append(licenseToggle(c.file));
    } else {
      const link = el('a', 'link', 'Licenza sul sito dell’autore');
      link.href = c.url;
      link.target = '_blank';
      link.rel = 'noopener';
      li.append(link);
    }
    list.append(li);
  }
  body.replaceChildren(
    el('h2', 'about-title', `🏝️ ${config.appName}`),
    el('p', 'meta', `Versione ${config.version ?? '?'}`),
    el('p', null, 'Cartoni e film dalla libreria Jellyfin di casa, e giochi che funzionano anche senza internet. Niente pubblicità, niente tracciamento.'),
    ownLicense(),
    el('p', 'meta', 'I giochi che non sono in questa lista sono scritti apposta per l’app. Gli altri giochi e le librerie vengono da progetti open source:'),
    list,
  );
  $('about').showModal();
}

// --- Search

let searchSeq = 0;
let searchTimer = null;

function renderSearch(entry) {
  // Coming back from a result: the results are still on screen.
  if (entry.shown) return focusIn(searchResults, entry.focus);
  entry.shown = true;
  searchInput.value = entry.term;
  searchResults.replaceChildren();
  runSearch();
  searchInput.focus();
}

async function runSearch() {
  const term = searchInput.value.trim();
  const seq = ++searchSeq;
  if (term.length < 2) {
    searchResults.replaceChildren(el('p', 'empty', 'Scrivi il nome di un cartone.'));
    return;
  }
  let items;
  try {
    items = await api(`/api/search?q=${encodeURIComponent(term)}`);
  } catch (err) {
    if (seq === searchSeq) searchResults.replaceChildren(el('p', 'empty', err.message));
    return;
  }
  // Typing fast fires several searches: only the latest one may render.
  if (seq !== searchSeq) return;
  searchResults.replaceChildren(...(items.length
    ? sections(items, i => openItem(i, items.filter(x => x.type === i.type)), i => quickPlay(i, items.filter(x => x.type === i.type)))
    : [el('p', 'empty', `Nessun risultato per “${term}”.`)]));
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 300);
});

// --- Library

async function renderLibrary(entry) {
  $('library-title').textContent = entry.library.name;
  const box = $('library-items');
  box.replaceChildren();
  let items;
  try {
    items = await api(`/api/library/${entry.library.id}`);
  } catch (err) {
    toast(err.message);
    if (top() === entry) back();
    return;
  }
  if (top() !== entry) return;
  box.replaceChildren(items.length ? grid(items, i => openItem(i, items), { onPlay: i => quickPlay(i, items) }) : el('p', 'empty', 'Qui non c’è ancora niente.'));
  focusIn(box, entry.focus);
}

// --- Info

function episodeLabel(ep) {
  return ep.index != null ? `${ep.index}. ${ep.name}` : ep.name;
}

function infoMeta(item) {
  const parts = [];
  if (item.type === 'Episode') {
    parts.push(item.seriesName, item.seasonName, item.index != null ? `Puntata ${item.index}` : null);
  }
  parts.push(item.year, formatRuntime(item.runTicks), item.officialRating, item.genres.slice(0, 3).join(', '));
  if (item.played) parts.push('✓ Già visto');
  return parts.filter(Boolean).join(' · ');
}

function actionButton(text, className, onClick) {
  const b = el('button', `action ${className}`, text);
  b.addEventListener('mouseenter', () => b.focus({ preventScroll: true }));
  b.addEventListener('click', onClick);
  return b;
}

function favoriteButton(entry) {
  const label = () => (entry.item.isFavorite ? '❤️ Nei preferiti' : '🤍 Aggiungi ai preferiti');
  const b = actionButton(label(), 'fav-toggle', async () => {
    const want = !entry.item.isFavorite;
    b.disabled = true;
    try {
      const res = await api(`/api/favorite/${entry.item.id}`, { method: want ? 'POST' : 'DELETE' });
      entry.item.isFavorite = res.isFavorite;
      b.textContent = label();
      // Search results are kept while browsing: update their badge too.
      for (const art of document.querySelectorAll(`.card[data-id="${entry.item.id}"] .art`)) {
        art.querySelector('.fav')?.remove();
        if (res.isFavorite) art.append(el('span', 'fav', '❤️'));
      }
      toast(res.isFavorite ? 'Aggiunto ai preferiti' : 'Tolto dai preferiti');
    } catch (err) {
      toast(err.message);
    } finally {
      b.disabled = false;
      b.focus();
    }
  });
  return b;
}

// Starts playback from any item: a series resumes where it was left, an episode keeps
// going with the rest of its series, anything else plays through the given list.
async function quickPlay(item, playlist = [item], episodes = null) {
  const from = top();
  if (item.type === 'Series') {
    episodes ??= await api(`/api/series/${item.id}`).catch(err => { toast(err.message); return []; });
    const next = pickEpisode(episodes);
    if (next && top() === from) play(next, episodes);
    return;
  }
  if (item.type === 'Episode' && item.seriesId) {
    playlist = await api(`/api/series/${item.seriesId}`).catch(() => [item]);
    if (top() !== from) return;
  }
  play(playlist.find(i => i.id === item.id) ?? item, playlist);
}

function playFromInfo(entry) {
  quickPlay(entry.item, entry.playlist, entry.episodes);
}

function playLabel(entry) {
  const { item } = entry;
  if (item.type === 'Series') {
    const next = pickEpisode(entry.episodes);
    if (!next) return null;
    return `▶ ${progress(next) ? 'Riprendi' : 'Guarda'} ${next.index != null ? `puntata ${next.index}` : next.name}`;
  }
  return progress(item) ? '▶ Riprendi' : '▶ Guarda';
}

async function renderInfo(entry) {
  const body = $('info-body');
  const episodesBox = $('episodes');
  const backdrop = $('info-backdrop');
  body.replaceChildren();
  episodesBox.replaceChildren();
  backdrop.style.backgroundImage = '';
  let item;
  let episodes = null;
  try {
    item = await api(`/api/item/${entry.item.id}`);
    if (item.type === 'Series') episodes = await api(`/api/series/${item.id}`);
  } catch (err) {
    toast(err.message);
    if (top() === entry) back();
    return;
  }
  if (top() !== entry) return;
  entry.item = item;
  entry.episodes = episodes;

  if (item.backdropId) backdrop.style.backgroundImage = `url(/api/img/${item.backdropId}?type=Backdrop&w=1920)`;
  const poster = el('div', isWide(item) ? 'info-poster wide' : 'info-poster');
  if (item.hasImage) {
    const img = el('img');
    img.alt = '';
    img.src = `/api/img/${item.id}?w=${isWide(item) ? 640 : 480}`;
    poster.append(img);
  }
  const text = el('div', 'info-text');
  text.append(el('h1', null, item.name), el('p', 'meta', infoMeta(item)));
  if (item.overview) text.append(el('p', 'overview', item.overview));
  const actions = el('div', 'actions');
  const label = playLabel(entry);
  if (label) actions.append(actionButton(label, 'primary play', () => playFromInfo(entry)));
  actions.append(favoriteButton(entry));
  text.append(actions);
  body.append(poster, text);

  if (episodes?.length) {
    const seasons = new Map();
    for (const ep of episodes) {
      const key = ep.seasonName ?? 'Puntate';
      if (!seasons.has(key)) seasons.set(key, []);
      seasons.get(key).push(ep);
    }
    for (const [name, eps] of seasons) {
      episodesBox.append(el('h2', null, seasons.size > 1 ? name : 'Puntate'), grid(eps, i => play(i, episodes), { label: episodeLabel, onPlay: i => play(i, episodes) }));
    }
  }
  // Back from an episode: that episode. Otherwise the play button.
  if (entry.focus && $('info').querySelector(`[data-id="${entry.focus}"]`)) focusIn($('info'), entry.focus);
  else focusIn(body, null, '.action');
}

// --- Game

function renderGame(entry) {
  gameFrame.src = `/games/${entry.game.id}/`;
  // Leaving loads about:blank, which fires load too: the frame must not take the focus back then.
  gameFrame.onload = () => { if (top() === entry) gameFrame.contentWindow.focus(); };
  gameFrame.focus();
}

function forwardKey(e) {
  gameFrame.contentWindow.postMessage({ type: 'key', event: e.type, key: e.key, code: e.code, keyCode: e.keyCode }, '*');
}

document.addEventListener('keyup', e => {
  if (top().view === 'game') forwardKey(e);
}, true);

// Inside the iframe the hub gets no keys: the game page sends "back" for Esc / Backspace.
window.addEventListener('message', e => {
  if (e.source === gameFrame.contentWindow && e.data?.type === 'back' && top().view === 'game') back();
});

// --- Player

async function play(item, playlist) {
  const entry = { view: 'player', item };
  go(entry);
  let session;
  try {
    session = await api(`/api/play/${item.id}`, { method: 'POST' });
  } catch (err) {
    toast(err.message);
    if (top() === entry) back();
    return;
  }
  if (top() !== entry) return; // left with Esc while the stream was being prepared
  const start = progress(item) ? item.resumeTicks / TICKS_PER_SECOND : 0;
  current = { item, playlist, session, hls: null, timer: null };
  if (session.mode === 'hls' && window.Hls?.isSupported()) {
    current.hls = new window.Hls({ startPosition: start });
    current.hls.on(window.Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        toast('Questo video non parte, riprova più tardi');
        back();
      }
    });
    current.hls.loadSource(session.url);
    current.hls.attachMedia(video);
  } else {
    video.src = session.url;
    if (start) video.addEventListener('loadedmetadata', () => { video.currentTime = start; }, { once: true });
  }
  video.play().catch(() => {});
  current.timer = setInterval(() => report('/api/progress'), 10_000);
  video.focus();
}

function report(endpoint) {
  // Before metadata arrives currentTime is 0 and would wipe the resume point.
  if (!current || !video.duration) return;
  const { item, session } = current;
  const state = stopState(video.currentTime, video.duration);
  const body = JSON.stringify({ id: item.id, ...state, playSessionId: session.playSessionId, mediaSourceId: session.mediaSourceId });
  if (endpoint === '/api/stop') navigator.sendBeacon(endpoint, body);
  else fetch(endpoint, { method: 'POST', body }).catch(() => {});
}

function stopPlayback() {
  if (!current) return null;
  report('/api/stop');
  clearInterval(current.timer);
  current.hls?.destroy();
  video.removeAttribute('src');
  video.load();
  const stopped = current;
  current = null;
  return stopped;
}

video.addEventListener('ended', () => {
  const stopped = stopPlayback();
  if (!stopped) return;
  const next = stopped.playlist[stopped.playlist.indexOf(stopped.item) + 1];
  // Episodes and music videos keep going with the next one; a film ends back on the previous screen.
  if (next && (stopped.item.type === 'Episode' || stopped.item.type === 'MusicVideo')) {
    stack.pop();
    top().focus = next.id;
    play(next, stopped.playlist);
  } else {
    back();
  }
});

video.addEventListener('pause', () => report('/api/progress'));
window.addEventListener('pagehide', () => stopPlayback());

const RENDER = {
  home: renderHome,
  search: renderSearch,
  library: renderLibrary,
  info: renderInfo,
  player: () => {},
  game: renderGame,
};

// --- Keyboard

const DIRS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

function move(dir) {
  const targets = [...$(top().view).querySelectorAll('.card, .back, .action, .tab, .search-open, #search-input')];
  const from = document.activeElement;
  if (!targets.includes(from)) return targets[0]?.focus();
  const i = nearest(from.getBoundingClientRect(), targets.map(t => t.getBoundingClientRect()), dir);
  if (i < 0) return;
  targets[i].focus({ preventScroll: true });
  targets[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
}

document.addEventListener('keydown', e => {
  // The dialog keeps its own keys: Esc closes it, Tab moves inside it.
  if ($('about').open) return;
  // Only reached when the focus slipped out of the game: Esc leaves, anything else goes on to the game.
  if (top().view === 'game') {
    e.preventDefault();
    if (e.key === 'Escape' || e.key === 'Backspace') back();
    else forwardKey(e);
    return;
  }
  if (top().view === 'player') {
    switch (e.key) {
      case 'Escape': case 'Backspace': back(); break;
      case ' ': case 'Enter': case 'k': video.paused ? video.play() : video.pause(); break;
      case 'ArrowLeft': video.currentTime = Math.max(0, video.currentTime - 10); break;
      case 'ArrowRight': video.currentTime += 10; break;
      case 'ArrowUp': video.volume = Math.min(1, video.volume + 0.1); break;
      case 'ArrowDown': video.volume = Math.max(0, video.volume - 0.1); break;
      case 'f': document.fullscreenElement ? document.exitFullscreen() : $('player').requestFullscreen(); break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (e.target === searchInput) {
    // The text field keeps its own keys; only these leave it.
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      focusIn(searchResults);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      back();
    }
    return;
  }
  // Typing a letter anywhere outside the player starts a search with it.
  if (e.key.length === 1 && /\p{L}|\p{N}/u.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    if (top().view === 'search') {
      searchInput.value += e.key;
      searchInput.focus();
      searchInput.dispatchEvent(new Event('input'));
    } else {
      go({ view: 'search', term: e.key });
    }
    return;
  }
  if (e.key === ' ' && document.activeElement?.playAction) {
    e.preventDefault();
    document.activeElement.playAction();
    return;
  }
  if (DIRS[e.key]) {
    e.preventDefault();
    move(DIRS[e.key]);
  } else if (e.key === 'Escape' || e.key === 'Backspace') {
    e.preventDefault();
    back();
  }
}, true);

for (const b of document.querySelectorAll('.back')) b.addEventListener('click', back);

// New favorites and admin changes show up without touching the PC attached to the monitor.
setInterval(async () => {
  if (top().view !== 'home') return;
  await loadConfig();
  if (top().view !== 'home') return;
  top().focus = document.activeElement?.dataset?.id ?? top().focus;
  render(top());
}, 5 * 60_000);

// Installable app, and still opens (with the games) when the server is unreachable.
// Browsers allow service workers on https and localhost only.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

await loadConfig();
go({ view: 'home' });
loadWeather();
