// Small helpers shared by the games written for the hub: sounds without files,
// a keyboard cursor over a grid, and a big centered message.

let audio = null;

export function beep(freq, time = 0.08, type = 'sine', volume = 0.12) {
  try {
    audio ??= new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + time);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + time);
  } catch {
    // No sound is fine.
  }
}

export function tune(notes, step = 0.12) {
  notes.forEach((f, i) => setTimeout(() => beep(f, step * 1.5, 'triangle'), i * step * 1000));
}

export const WIN = [523, 659, 784, 1047];
export const LOSE = [392, 330, 262];

// Arrow keys move { x, y } inside a cols × rows grid; Enter / Space call onPick.
// `skip(x, y)` lets boards jump over cells that cannot be selected.
export function gridCursor({ cols, rows, start = [0, 0], onMove, onPick, skip }) {
  const cursor = { x: start[0], y: start[1] };
  const DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  addEventListener('keydown', e => {
    if (DIRS[e.key]) {
      const [dx, dy] = DIRS[e.key];
      let { x, y } = cursor;
      for (let i = 0; i < Math.max(cols(), rows()); i++) {
        x += dx;
        y += dy;
        if (x < 0 || y < 0 || x >= cols() || y >= rows()) return;
        if (!skip?.(x, y)) break;
      }
      cursor.x = x;
      cursor.y = y;
      onMove?.(cursor);
    } else if (e.key === 'Enter' || e.key === ' ') {
      onPick(cursor);
    }
  });
  return cursor;
}

export function message(text, sub = '') {
  let box = document.querySelector('.kit-message');
  if (!box) {
    box = document.createElement('div');
    box.className = 'kit-message';
    document.body.append(box);
  }
  box.replaceChildren(Object.assign(document.createElement('strong'), { textContent: text }),
    Object.assign(document.createElement('span'), { textContent: sub }));
  box.hidden = !text;
}

export function shuffle(list, random = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
