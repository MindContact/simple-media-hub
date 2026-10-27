// Builds the whole palette from one base color, so the admin page only has to pick that.
// Themes stay dark: the hub runs on a TV-sized screen, often in a dim room.

export const PRESETS = [
  { name: 'Notte', color: '#3a3180' },
  { name: 'Oceano', color: '#1f5f8b' },
  { name: 'Foresta', color: '#2f6b3a' },
  { name: 'Tramonto', color: '#8b3a2f' },
  { name: 'Caramella', color: '#8b2f6b' },
  { name: 'Spazio', color: '#252a4a' },
  { name: 'Cioccolato', color: '#5c3d2e' },
];

export function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(v => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// CSS custom properties for style.css. With the default base (#3a3180) this lands close to
// the original hand-picked palette.
export function themeFromColor(hex) {
  const [h, s] = hexToHsl(hex);
  const sat = clamp(s, 25, 60);
  // Accent: the complementary-ish hue, bright, for active tabs, ◀ and play buttons.
  const accentHue = h + 95;
  // Focus ring: yellow, unless the theme itself is yellow-orange; then white stands out more.
  const yellowish = h > 25 && h < 75 && s > 30;
  return {
    '--bg': hslToHex(h, sat, 17),
    '--bg-2': hslToHex(h, sat, 26),
    '--card': hslToHex(h, sat, 34),
    '--text': '#ffffff',
    '--muted': hslToHex(h, 100, 88),
    '--accent': hslToHex(accentHue, 100, 70),
    '--focus': yellowish ? '#ffffff' : '#ffd23f',
  };
}
