// Pure helpers shared by the page and the tests.

export const TICKS_PER_SECOND = 10_000_000;

const SECTIONS = [
  { title: 'Film', types: ['Movie'] },
  { title: 'Cartoni a puntate', types: ['Series'] },
  { title: 'Puntate', types: ['Episode'] },
  { title: 'Canzoni', types: ['MusicVideo'] },
  { title: 'Altri video', types: ['Video'] },
];

export function groupSections(items) {
  return SECTIONS
    .map(s => ({ title: s.title, items: items.filter(i => s.types.includes(i.type)) }))
    .filter(s => s.items.length);
}

// "1 h 37 min" / "22 min"; empty when unknown.
export function formatRuntime(ticks) {
  const minutes = Math.round((ticks ?? 0) / TICKS_PER_SECOND / 60);
  if (minutes < 1) return '';
  const h = Math.floor(minutes / 60);
  return h ? `${h} h ${minutes % 60} min` : `${minutes} min`;
}

export function progress(item) {
  if (item.played || !item.runTicks || !item.resumeTicks) return 0;
  return Math.min(1, item.resumeTicks / item.runTicks);
}

// Where a series picks up: the episode watched last, or the one after it if it was finished.
export function pickEpisode(episodes) {
  const touched = episodes
    .filter(e => e.lastPlayed)
    .sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed))[0];
  if (!touched) return episodes[0] ?? null;
  if (!touched.played) return touched;
  return episodes[episodes.indexOf(touched) + 1] ?? episodes[0];
}

// State saved when playback stops: near the end counts as watched, the first seconds do not count.
export function stopState(positionSeconds, durationSeconds) {
  if (durationSeconds && positionSeconds > durationSeconds * 0.92) return { played: true, positionTicks: 0 };
  if (positionSeconds < 30) return { played: false, positionTicks: 0 };
  return { played: false, positionTicks: Math.round(positionSeconds * TICKS_PER_SECOND) };
}

// Arrow-key navigation: the closest rect in the given direction, favouring the same row/column.
export function nearest(from, rects, dir) {
  const cx = r => r.x + r.width / 2;
  const cy = r => r.y + r.height / 2;
  let best = -1;
  let bestScore = Infinity;
  rects.forEach((r, i) => {
    const dx = cx(r) - cx(from);
    const dy = cy(r) - cy(from);
    const along = { left: -dx, right: dx, up: -dy, down: dy }[dir];
    if (along <= 1) return;
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = along + across * 3;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
