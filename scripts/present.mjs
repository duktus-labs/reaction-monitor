// Presentation rules for the status page. No I/O, no DOM.
//
// Announced check interval
// ------------------------
// The page says checks run every 5 minutes (index.html: „automatisch alle
// 5 Minuten geprüft“). The workflow cron is `*/5 * * * *`. This module does
// not change that schedule. ANNOUNCED_CHECK_INTERVAL_MIN is the promise the
// page makes, not the cadence GitHub Actions actually keeps.
//
// Staleness threshold
// -------------------
// A snapshot may paint a positive or negative operational status only while
// its age is within STALE_AFTER_MIN. That limit is STALE_INTERVAL_FACTOR
// times the announced interval:
//
//   STALE_AFTER_MIN = 5 min × 3 = 15 min
//
// One delayed run can still land inside the window. A second missed run
// cannot. The comparison is strict: age > 15 min is stale; age == 15 min
// is still fresh. Stale, missing, or unreadable data is a neutral grey
// state and must not render „Alle Systeme betriebsbereit“.

export const ANNOUNCED_CHECK_INTERVAL_MIN = 5;
export const STALE_INTERVAL_FACTOR = 3;
export const STALE_AFTER_MIN = ANNOUNCED_CHECK_INTERVAL_MIN * STALE_INTERVAL_FACTOR;
export const STALE_AFTER_MS = STALE_AFTER_MIN * 60 * 1000;

export const COMPONENTS = ['web', 'chat', 'doku', 'voice', 'b2b'];

export const LABELS = {
  web: 'Web-App',
  chat: 'Chat & KI',
  doku: 'Doku-Modus',
  voice: 'Voice & Transkription',
  b2b: 'B2B-API',
};

export const KNOWN_STATUSES = ['operational', 'degraded', 'down', 'maintenance'];

export const STATUS_DE = {
  operational: 'betriebsbereit',
  degraded: 'eingeschränkt',
  down: 'Störung',
  maintenance: 'Wartung',
  unknown: 'unbekannt',
  none: 'keine Daten',
};

export const BANNER_TITLES = {
  operational: 'Alle Systeme betriebsbereit',
  degraded: 'Eingeschränkter Betrieb',
  down: 'Störung',
  maintenance: 'Geplante Wartung',
  unknown: 'Status unbekannt',
};

/** Shown when a snapshot exists but is older than STALE_AFTER_MIN. */
export const STALE_TITLE = 'Status wird aktualisiert';

const RANK = { operational: 0, maintenance: 1, degraded: 2, down: 3 };

/** Most severe known status. Unknown is not a rank. */
export function worstStatus(statuses) {
  return statuses.reduce(
    (acc, s) => (RANK[s] > RANK[acc] ? s : acc),
    'operational',
  );
}

/**
 * Banner from per-service states.
 * A single `down` among otherwise live services is a partial outage
 * (`degraded`). `down` on the banner means every service is `down`.
 * Any `unknown` service blocks an all-clear.
 */
export function displayBanner(statuses) {
  const list = statuses.map((s) => (RANK[s] != null || s === 'unknown' ? s : 'unknown'));
  const known = list.filter((s) => s !== 'unknown');
  if (known.length === 0) return 'unknown';
  const worst = worstStatus(known);
  if (list.some((s) => s === 'unknown')) {
    if (worst === 'operational') return 'unknown';
    if (worst === 'down') return 'degraded';
    return worst;
  }
  if (worst === 'down' && list.some((s) => s !== 'down')) return 'degraded';
  return worst;
}

function readComponentStatus(components, key) {
  if (!components || typeof components !== 'object') return 'unknown';
  const raw = components[key];
  const status = raw && typeof raw === 'object' ? raw.status : raw;
  return KNOWN_STATUSES.includes(status) ? status : 'unknown';
}

function componentMap(statusFor) {
  const out = {};
  for (const key of COMPONENTS) out[key] = { status: statusFor(key) };
  return out;
}

function unknownComponents() {
  return componentMap(() => 'unknown');
}

export function relativeTime(iso, now) {
  const t = Date.parse(iso);
  const base = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(t) || !Number.isFinite(base)) return 'zu einem unbekannten Zeitpunkt';
  const min = Math.round((base - t) / 60000);
  if (min < 1) return 'gerade eben';
  if (min === 1) return 'vor 1 Minute';
  if (min < 60) return 'vor ' + min + ' Minuten';
  const h = Math.round(min / 60);
  return h === 1 ? 'vor 1 Stunde' : 'vor ' + h + ' Stunden';
}

function neutralView(freshness, subtitle) {
  return {
    freshness,
    banner: 'unknown',
    title: BANNER_TITLES.unknown,
    subtitle,
    components: unknownComponents(),
    showLiveOutage: false,
    checkedAt: null,
  };
}

/**
 * @param {object|null|undefined} status parsed status.json
 * @param {Date|string|number} now evaluation clock (injectable for tests)
 */
export function presentStatus(status, now) {
  const clock = now instanceof Date ? now : new Date(now);
  if (status == null) {
    return neutralView('missing', 'Es liegt keine Statusdatei vor.');
  }
  if (typeof status !== 'object' || Array.isArray(status)) {
    return neutralView('malformed', 'Die Statusdaten konnten nicht gelesen werden.');
  }
  const checkedAt = status.checked_at;
  const checkedMs = typeof checkedAt === 'string' ? Date.parse(checkedAt) : NaN;
  if (!Number.isFinite(checkedMs)) {
    return neutralView('malformed', 'Die Statusdaten konnten nicht gelesen werden.');
  }
  if (!status.components || typeof status.components !== 'object' || Array.isArray(status.components)) {
    return neutralView('malformed', 'Die Statusdaten konnten nicht gelesen werden.');
  }

  if (clock.getTime() - checkedMs > STALE_AFTER_MS) {
    return {
      freshness: 'stale',
      banner: 'unknown',
      title: STALE_TITLE,
      subtitle: 'Letzte Prüfung ' + relativeTime(checkedAt, clock) + '.',
      components: unknownComponents(),
      showLiveOutage: false,
      checkedAt,
    };
  }

  const components = componentMap((key) => readComponentStatus(status.components, key));
  const banner = displayBanner(COMPONENTS.map((key) => components[key].status));
  let subtitle = 'Aktualisiert ' + relativeTime(checkedAt, clock);
  if (banner === 'down') {
    subtitle = 'Wir haben das Problem erkannt und arbeiten an einer Lösung.';
  } else if (banner === 'maintenance' && typeof status.note === 'string' && status.note.trim()) {
    subtitle = status.note.trim();
  }

  return {
    freshness: 'fresh',
    banner,
    title: BANNER_TITLES[banner] || BANNER_TITLES.unknown,
    subtitle,
    components,
    showLiveOutage: COMPONENTS.some((key) => components[key].status === 'down'),
    checkedAt,
  };
}

/**
 * Turn a load result into a view. `source` is one of:
 *   { error: 'missing' | 'ENOENT' | 'malformed' | string }
 *   { text: string }   raw file contents
 *   { value: object }  already parsed JSON
 * Missing and unreadable sources are neutral. They never become operational.
 */
export function presentFromSource(source, now) {
  if (!source || source.error === 'missing' || source.error === 'ENOENT') {
    return neutralView('missing', 'Es liegt keine Statusdatei vor.');
  }
  if (source.error) {
    return neutralView('malformed', 'Die Statusdaten konnten nicht gelesen werden.');
  }
  if (typeof source.text === 'string') {
    let parsed;
    try {
      parsed = JSON.parse(source.text);
    } catch {
      return neutralView('malformed', 'Die Statusdaten konnten nicht gelesen werden.');
    }
    return presentStatus(parsed, now);
  }
  return presentStatus(source.value, now);
}

function finiteCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}

/**
 * Uptime label from real check buckets.
 * Returns label: null when there is no up/degraded/down measurement,
 * so the page does not invent a percentage. Maintenance-only buckets
 * do not count: they are excluded from the denominator, matching the checker.
 */
export function measurementSummary(buckets) {
  let up = 0;
  let real = 0;
  let saw = false;
  const list = Array.isArray(buckets) ? buckets : [];
  for (const bucket of list) {
    if (!bucket || typeof bucket !== 'object') continue;
    const u = finiteCount(bucket.up);
    const d = finiteCount(bucket.degraded);
    const n = finiteCount(bucket.down);
    if (u == null || d == null || n == null) continue;
    saw = true;
    up += u;
    real += u + d + n;
  }
  if (!saw || real <= 0) {
    return { available: false, percent: null, label: null };
  }
  const percent = (up / real) * 100;
  return {
    available: true,
    percent,
    label: percent.toFixed(2).replace('.', ',') + ' % Uptime',
  };
}
