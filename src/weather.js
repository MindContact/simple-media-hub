// Current weather from Open-Meteo (no API key, data under CC BY 4.0). Fetched by the server,
// so the TV only talks to the hub, and cached: a whole house of TVs makes one call per place.

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';
const FRESH = 15 * 60_000;
const STALE = 2 * 60 * 60_000; // an old reading beats none while Open-Meteo is unreachable

// WMO weather codes, as used by Open-Meteo.
const CODES = [
  [[0], '☀️', '🌙', 'Sereno'],
  [[1], '🌤️', '🌙', 'Poco nuvoloso'],
  [[2], '⛅', '☁️', 'Parzialmente nuvoloso'],
  [[3], '☁️', '☁️', 'Nuvoloso'],
  [[45, 48], '🌫️', '🌫️', 'Nebbia'],
  [[51, 53, 55, 56, 57], '🌦️', '🌧️', 'Pioggerella'],
  [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️', '🌧️', 'Pioggia'],
  [[71, 73, 75, 77, 85, 86], '🌨️', '🌨️', 'Neve'],
  [[95, 96, 99], '⛈️', '⛈️', 'Temporale'],
];

export function describeWeather(code, isDay = true) {
  const row = CODES.find(([codes]) => codes.includes(code));
  if (!row) return { icon: '🌡️', label: 'Meteo' };
  return { icon: isDay ? row[1] : row[2], label: row[3] };
}

export function createWeather(fetchImpl = fetch, now = Date.now) {
  const cache = new Map();

  async function getJson(url) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    return res.json();
  }

  // { place, temperature, icon, label } for a { name, lat, lon } place, or null when unknown.
  async function current(place) {
    const key = `${place.lat},${place.lon}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < FRESH) return { ...hit.value, place: place.name };
    try {
      const url = `${FORECAST}?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,weather_code,is_day&timezone=auto`;
      const { current: c } = await getJson(url);
      const value = { temperature: Math.round(c.temperature_2m), ...describeWeather(c.weather_code, c.is_day !== 0) };
      cache.set(key, { at: now(), value });
      return { ...value, place: place.name };
    } catch (err) {
      console.error(`Weather: ${err.message}`);
      return hit && now() - hit.at < STALE ? { ...hit.value, place: place.name } : null;
    }
  }

  // Places matching a name, for the admin page.
  async function search(name) {
    const { results = [] } = await getJson(`${GEOCODING}?name=${encodeURIComponent(name)}&count=8&language=it&format=json`);
    return results.map(r => ({
      name: r.name,
      region: [r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude,
      timezone: r.timezone ?? '',
    }));
  }

  return { current, search };
}
