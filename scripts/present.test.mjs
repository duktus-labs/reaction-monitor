// Synthetic presentation tests. Fixtures are inline. This file does not
// read data/status.json, data/uptime.json, or any other production file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANNOUNCED_CHECK_INTERVAL_MIN,
  STALE_INTERVAL_FACTOR,
  STALE_AFTER_MIN,
  COMPONENTS,
  BANNER_TITLES,
  STALE_TITLE,
  presentStatus,
  presentFromSource,
  measurementSummary,
  displayBanner,
} from './present.mjs';

const NOW = new Date('2026-10-29T16:18:00.000Z');
const FRESH_AT = new Date(NOW.getTime() - 4 * 60 * 1000).toISOString();
const STALE_AT = new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString();

function snapshot(checkedAt, byKey, extra) {
  const components = {};
  for (const key of COMPONENTS) {
    components[key] = { status: (byKey && byKey[key]) || 'operational', latency_ms: 80 };
  }
  return Object.assign({
    checked_at: checkedAt,
    overall: 'operational',
    components,
  }, extra || {});
}

test('threshold is 3× the announced 5-minute interval (15 min), documented in the page', () => {
  assert.equal(ANNOUNCED_CHECK_INTERVAL_MIN, 5);
  assert.equal(STALE_INTERVAL_FACTOR, 3);
  assert.equal(STALE_AFTER_MIN, 15);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const workflow = readFileSync(new URL('../.github/workflows/status_check.yml', import.meta.url), 'utf8');
  assert.match(html, /alle 5 Minuten/);
  assert.match(html, /data-status="unknown"/);
  assert.doesNotMatch(html, /Alle Systeme betriebsbereit/);
  // The cron stays the announced interval. This change must not rewrite it.
  assert.match(workflow, /cron:\s*'\*\/5 \* \* \* \*'/);
});

test('fresh + ok -> green operational', () => {
  const view = presentStatus(snapshot(FRESH_AT), NOW);
  assert.equal(view.freshness, 'fresh');
  assert.equal(view.banner, 'operational');
  assert.equal(view.title, 'Alle Systeme betriebsbereit');
  assert.equal(view.title, BANNER_TITLES.operational);
  for (const key of COMPONENTS) {
    assert.equal(view.components[key].status, 'operational');
  }
});

test('age exactly at 15 min is still fresh; 1 ms past is stale neutral', () => {
  const edge = new Date(NOW.getTime() - STALE_AFTER_MIN * 60 * 1000).toISOString();
  const past = new Date(NOW.getTime() - STALE_AFTER_MIN * 60 * 1000 - 1).toISOString();
  const atEdge = presentStatus(snapshot(edge), NOW);
  const tooOld = presentStatus(snapshot(past), NOW);
  assert.equal(atEdge.banner, 'operational');
  assert.equal(tooOld.freshness, 'stale');
  assert.equal(tooOld.banner, 'unknown');
  assert.equal(tooOld.title, STALE_TITLE);
});

test('stale -> grey/neutral, never the green all-clear', () => {
  const view = presentStatus(snapshot(STALE_AT), NOW);
  assert.equal(view.freshness, 'stale');
  assert.equal(view.banner, 'unknown');
  assert.equal(view.title, 'Status wird aktualisiert');
  assert.notEqual(view.title, BANNER_TITLES.operational);
  assert.equal(view.showLiveOutage, false);
  for (const key of COMPONENTS) {
    assert.equal(view.components[key].status, 'unknown');
  }
  assert.match(view.subtitle, /Letzte Prüfung vor 3 Stunden/);
});

test('stale snapshot that says overall operational is still neutral', () => {
  const raw = snapshot(STALE_AT);
  raw.overall = 'operational';
  const view = presentStatus(raw, NOW);
  assert.equal(view.banner, 'unknown');
  assert.notEqual(view.banner, 'operational');
});

test('missing file -> neutral', () => {
  for (const source of [null, undefined, { error: 'missing' }, { error: 'ENOENT' }]) {
    const view = presentFromSource(source, NOW);
    assert.equal(view.freshness, 'missing');
    assert.equal(view.banner, 'unknown');
    assert.equal(view.title, 'Status unbekannt');
    assert.notEqual(view.title, BANNER_TITLES.operational);
    assert.equal(view.components.web.status, 'unknown');
  }
  assert.equal(presentStatus(null, NOW).freshness, 'missing');
});

test('malformed data -> neutral', () => {
  const cases = [
    { error: 'malformed' },
    { text: '{not json' },
    { text: '' },
    { value: 'operational' },
    { value: [] },
    { value: {} },
    { value: { overall: 'operational', components: {} } },
    { value: { checked_at: 'gestern', overall: 'operational', components: { web: { status: 'operational' } } } },
    { value: { checked_at: FRESH_AT, overall: 'operational' } },
    { value: { checked_at: FRESH_AT, components: null } },
  ];
  for (const source of cases) {
    const view = presentFromSource(source, NOW);
    assert.equal(view.banner, 'unknown', JSON.stringify(source));
    assert.equal(view.title, 'Status unbekannt');
    assert.notEqual(view.freshness, 'fresh');
    assert.notEqual(view.title, BANNER_TITLES.operational);
  }
});

test('one service down -> degraded overall, that service stays down', () => {
  const view = presentStatus(snapshot(FRESH_AT, { chat: 'down' }), NOW);
  assert.equal(view.freshness, 'fresh');
  assert.equal(view.banner, 'degraded');
  assert.equal(view.title, 'Eingeschränkter Betrieb');
  assert.notEqual(view.banner, 'operational');
  assert.equal(view.components.chat.status, 'down');
  assert.equal(view.components.web.status, 'operational');
  assert.equal(view.showLiveOutage, true);
});

test('a stored overall of operational cannot hide one down service', () => {
  const raw = snapshot(FRESH_AT, { voice: 'down' });
  raw.overall = 'operational';
  const view = presentStatus(raw, NOW);
  assert.equal(view.banner, 'degraded');
  assert.equal(view.components.voice.status, 'down');
});

test('every service down -> banner down', () => {
  const byKey = {};
  for (const key of COMPONENTS) byKey[key] = 'down';
  const view = presentStatus(snapshot(FRESH_AT, byKey), NOW);
  assert.equal(view.banner, 'down');
  assert.equal(view.title, 'Störung');
  assert.equal(view.showLiveOutage, true);
});

test('one service degraded -> banner degraded', () => {
  const view = presentStatus(snapshot(FRESH_AT, { doku: 'degraded' }), NOW);
  assert.equal(view.banner, 'degraded');
  assert.equal(view.components.doku.status, 'degraded');
  assert.equal(view.showLiveOutage, false);
});

test('fresh maintenance window still shows maintenance, not green or grey', () => {
  const byKey = {};
  for (const key of COMPONENTS) byKey[key] = 'maintenance';
  const view = presentStatus(
    snapshot(FRESH_AT, byKey, { note: 'Planmäßige nächtliche Wartung (00:00–06:00 Uhr)' }),
    NOW,
  );
  assert.equal(view.banner, 'maintenance');
  assert.equal(view.title, 'Geplante Wartung');
  assert.match(view.subtitle, /nächtliche Wartung/);
});

test('percentages hidden when there are no measurements', () => {
  const emptyCases = [
    undefined,
    null,
    [],
    [null, undefined],
    [{ up: 0, degraded: 0, down: 0, total: 0 }],
    [{ up: 0, degraded: 0, down: 0, maintenance: 12, total: 12 }],
    [{ total: 10 }],
    [{ up: 'nope', degraded: 0, down: 0 }],
  ];
  for (const buckets of emptyCases) {
    const summary = measurementSummary(buckets);
    assert.equal(summary.available, false);
    assert.equal(summary.percent, null);
    assert.equal(summary.label, null);
  }
});

test('percentages come from the counts and are not a fixed placeholder', () => {
  const half = measurementSummary([{ up: 1, degraded: 0, down: 1 }]);
  const threeQuarters = measurementSummary([
    { up: 2, degraded: 0, down: 0 },
    { up: 1, degraded: 0, down: 1 },
  ]);
  assert.equal(half.available, true);
  assert.equal(half.label, '50,00 % Uptime');
  assert.equal(threeQuarters.label, '75,00 % Uptime');
  assert.notEqual(half.label, threeQuarters.label);
  assert.notEqual(half.label, '99,91 % Uptime');
});

test('displayBanner: partial outage is degraded, total outage is down, unknown blocks green', () => {
  assert.equal(displayBanner(['operational', 'operational', 'down', 'operational', 'operational']), 'degraded');
  assert.equal(displayBanner(['down', 'down', 'down', 'down', 'down']), 'down');
  assert.equal(displayBanner(['operational', 'unknown', 'operational', 'operational', 'operational']), 'unknown');
  assert.equal(displayBanner(['operational', 'degraded', 'operational', 'operational', 'operational']), 'degraded');
});
