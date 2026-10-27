import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWeather, describeWeather } from '../src/weather.js';

const ROMA = { name: 'Roma', lat: 41.89, lon: 12.51 };

function fakeFetch(responses) {
  const calls = [];
  const fn = async url => {
    calls.push(url);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { ok: true, json: async () => next };
  };
  fn.calls = calls;
  return fn;
}

test('weather codes map to an icon and an Italian label', () => {
  assert.deepEqual(describeWeather(0, true), { icon: '☀️', label: 'Sereno' });
  assert.equal(describeWeather(0, false).icon, '🌙');
  assert.equal(describeWeather(63).label, 'Pioggia');
  assert.equal(describeWeather(1234).label, 'Meteo');
});

test('current weather is cached, and an old reading is kept while Open-Meteo is down', async () => {
  let clock = 0;
  const fetchImpl = fakeFetch([{ current: { temperature_2m: 17.6, weather_code: 2, is_day: 1 } }, new Error('down'), new Error('down')]);
  const weather = createWeather(fetchImpl, () => clock);
  const first = await weather.current(ROMA);
  assert.deepEqual(first, { temperature: 18, icon: '⛅', label: 'Parzialmente nuvoloso', place: 'Roma' });
  assert.match(fetchImpl.calls[0], /latitude=41.89&longitude=12.51/);

  clock = 5 * 60_000;
  assert.deepEqual(await weather.current(ROMA), first);
  assert.equal(fetchImpl.calls.length, 1, 'served from the cache');

  clock = 30 * 60_000;
  assert.deepEqual(await weather.current(ROMA), first, 'stale but still shown');
  clock = 3 * 60 * 60_000;
  assert.equal(await weather.current(ROMA), null, 'too old to show');
});

test('place search returns name, region, coordinates and time zone', async () => {
  const fetchImpl = fakeFetch([{ results: [{ name: 'Roma', admin1: 'Lazio', country: 'Italia', latitude: 41.89, longitude: 12.51, timezone: 'Europe/Rome' }] }, {}]);
  const weather = createWeather(fetchImpl);
  assert.deepEqual(await weather.search('Roma'), [{ name: 'Roma', region: 'Lazio, Italia', lat: 41.89, lon: 12.51, timezone: 'Europe/Rome' }]);
  assert.deepEqual(await weather.search('Nowhere'), []);
});
