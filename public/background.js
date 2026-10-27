// Page backgrounds: the theme gradient, an uploaded picture (optionally blurred and dimmed),
// or a light animated canvas. Animations pause while a video or a game is on screen.

let layer = null;
let canvas = null;
let anim = null;
let paused = false;

const EFFECTS = { stars, bubbles, snow };

export function applyBackground(bg, imageUrl) {
  layer ??= Object.assign(document.createElement('div'), { className: 'bg-layer' });
  canvas ??= Object.assign(document.createElement('canvas'), { className: 'bg-canvas' });
  document.body.prepend(layer, canvas);
  anim?.stop();
  anim = null;
  layer.style.cssText = '';
  canvas.hidden = true;
  document.body.classList.toggle('bg-custom', bg.type !== 'gradient');

  if (bg.type === 'image') {
    layer.style.backgroundImage = `linear-gradient(rgb(0 0 0 / ${bg.dim / 100}), rgb(0 0 0 / ${bg.dim / 100})), url(${imageUrl})`;
    // Blur bleeds transparent edges: scale up a little to hide them.
    if (bg.blur) layer.style.filter = `blur(${bg.blur}px)`;
    if (bg.blur) layer.style.transform = 'scale(1.06)';
  } else if (EFFECTS[bg.type]) {
    layer.style.background = 'radial-gradient(circle at 20% 0%, var(--bg-2), var(--bg) 60%)';
    canvas.hidden = false;
    anim = loop(EFFECTS[bg.type]());
  }
}

export function pauseBackground(pause) {
  paused = pause;
}

function loop(effect) {
  const ctx = canvas.getContext('2d');
  let frame = 0;
  let last = performance.now();
  const resize = () => {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    effect.resize?.(canvas.width, canvas.height);
  };
  resize();
  addEventListener('resize', resize);
  const tick = now => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused && !document.hidden) effect.draw(ctx, canvas.width, canvas.height, dt);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return {
    stop() {
      cancelAnimationFrame(frame);
      removeEventListener('resize', resize);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}

// Stars flying out from the center.
function stars() {
  const list = Array.from({ length: 260 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() }));
  return {
    draw(ctx, w, h, dt) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      for (const s of list) {
        s.z -= dt * 0.12;
        if (s.z <= 0.02) Object.assign(s, { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: 1 });
        const px = w / 2 + (s.x / s.z) * w * 0.5;
        const py = h / 2 + (s.y / s.z) * h * 0.5;
        if (px < 0 || px > w || py < 0 || py > h) continue;
        const size = (1 - s.z) * 2.6;
        ctx.globalAlpha = 1 - s.z;
        ctx.fillRect(px, py, size, size);
      }
      ctx.globalAlpha = 1;
    },
  };
}

// Soap bubbles slowly rising.
function bubbles() {
  let list = [];
  return {
    resize(w, h) {
      list = Array.from({ length: 28 }, () => ({ x: Math.random() * w, y: Math.random() * h, r: 12 + Math.random() * 46, v: 15 + Math.random() * 30, p: Math.random() * 6 }));
    },
    draw(ctx, w, h, dt) {
      ctx.clearRect(0, 0, w, h);
      for (const b of list) {
        b.y -= b.v * dt;
        b.p += dt;
        if (b.y < -b.r) Object.assign(b, { y: h + b.r, x: Math.random() * w });
        const x = b.x + Math.sin(b.p) * 14;
        ctx.strokeStyle = 'rgb(255 255 255 / 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgb(255 255 255 / 0.25)';
        ctx.beginPath();
        ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}

// Gentle snowfall.
function snow() {
  let list = [];
  return {
    resize(w, h) {
      list = Array.from({ length: 180 }, () => ({ x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() * 3, v: 20 + Math.random() * 40, p: Math.random() * 6 }));
    },
    draw(ctx, w, h, dt) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgb(255 255 255 / 0.8)';
      for (const f of list) {
        f.y += f.v * dt;
        f.p += dt;
        if (f.y > h + 4) Object.assign(f, { y: -4, x: Math.random() * w });
        ctx.beginPath();
        ctx.arc(f.x + Math.sin(f.p) * 10, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}
