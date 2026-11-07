'use strict';

// Render order + display labels for the five components.
var ORDER = ['web', 'chat', 'doku', 'voice', 'b2b'];
// Bezeichnungen nach Vorlage V3Status.dc.html (Rebrush v3).
var LABELS = {
  web: 'Website',
  chat: 'Chat',
  doku: 'Dokumentation',
  voice: 'Sprache',
  b2b: 'B2B-Schnittstelle',
};
// Nur die Web-App wird direkt gemessen; die übrigen Komponenten teilen sich eine
// Backend-Prüfung. Latenz steht deshalb nur dort, wo sie wirklich gemessen wurde.
var MEASURED_LATENCY = { web: true };
// Datenzustand -> Zustand der DS-Komponente ServiceStatus.
var DS_STATE = {
  operational: 'betrieb',
  degraded: 'eingeschraenkt',
  down: 'stoerung',
  maintenance: 'wartung',
  none: 'unbekannt',
};
var DS_LABEL = {
  betrieb: 'In Betrieb', eingeschraenkt: 'Eingeschränkt', stoerung: 'Störung',
  wartung: 'Wartung', unbekannt: 'Keine Daten',
};
var DS_COLOR = {
  betrieb: 'var(--success)', eingeschraenkt: 'var(--apricot)', stoerung: 'var(--danger)',
  wartung: 'var(--accent)', unbekannt: 'var(--ink-muted)',
};
var REFRESH_MS = 60000;
var HISTORY_DAYS = 90;
var STALE_MINUTES = 15;
var CHECK_INTERVAL_MIN = 5; // checker cadence — one bucket check ≈ 5 minutes


function getJson(path) {
  // Cache-bust so an open tab always sees the latest committed data.
  return fetch(path + '?t=' + Date.now()).then(function (res) {
    if (!res.ok) throw new Error(path + ' ' + res.status);
    return res.json();
  });
}

function relativeTime(iso) {
  var min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'gerade eben';
  if (min === 1) return 'vor 1 Minute';
  if (min < 60) return 'vor ' + min + ' Minuten';
  var h = Math.round(min / 60);
  return h === 1 ? 'vor 1 Stunde' : 'vor ' + h + ' Stunden';
}

function formatDate(key) {
  var p = key.split('-');
  return p[2] + '.' + p[1] + '.' + p[0];
}

// Estimate a duration from a count of 5-minute checks.
function formatDuration(checks) {
  var min = checks * CHECK_INTERVAL_MIN;
  if (min < 60) return '~' + min + ' Min';
  var h = Math.floor(min / 60);
  var m = min % 60;
  return m === 0 ? '~' + h + ' Std' : '~' + h + ' Std ' + m + ' Min';
}

// Hover text for one day's bar — includes how long the day was disrupted.
function cellTooltip(key, bucket) {
  var d = formatDate(key);
  if (!bucket || bucket.total === 0) return d + ' — keine Daten';
  var real = bucket.up + bucket.degraded + bucket.down;
  if (real === 0) return d + ' — Wartung';
  var parts = [];
  if (bucket.down > 0) parts.push(formatDuration(bucket.down) + ' Ausfall');
  if (bucket.degraded > 0) {
    parts.push(formatDuration(bucket.degraded) + ' eingeschränkt');
  }
  if (parts.length === 0) return d + ' — keine Störung';
  return d + ' — ' + parts.join(', ');
}

// Color of one day's bar. Maintenance checks are excluded from the
// up/down judgement; a day that was nothing but maintenance shows blue.
function bucketColor(bucket) {
  if (!bucket || bucket.total === 0) return 'none';
  var real = bucket.up + bucket.degraded + bucket.down;
  if (real === 0) return 'maintenance';
  if (bucket.down === 0 && bucket.degraded === 0) return 'operational';
  if (bucket.down / real > 0.05) return 'down';
  return 'degraded';
}

// Fixed-length array of { key, bucket } for one component, oldest first.
function dayCells(uptime, comp, days) {
  var byDate = {};
  var list = (uptime && uptime.days) || [];
  for (var i = 0; i < list.length; i++) {
    byDate[list[i].date] = list[i][comp] || null;
  }
  var out = [];
  var today = new Date();
  for (var d = days - 1; d >= 0; d--) {
    var dt = new Date(today);
    dt.setDate(today.getDate() - d);
    var key = dt.toISOString().slice(0, 10);
    out.push({ key: key, bucket: byDate[key] || null });
  }
  return out;
}

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Markup der DS-Komponente ServiceStatus (src/components/v3/ds.js), ohne React.
function serviceStatus(opts) {
  var state = opts.state || 'unbekannt';
  var root = el('div', 'dk-svc');
  var head = el('div', 'dk-svc-head');
  var left = el('div');
  left.append(el('p', 'dk-svc-name', opts.name));
  var hostLine = [opts.host, opts.latency ? 'Latenz ' + opts.latency : null].filter(Boolean).join(' · ');
  if (hostLine) left.append(el('p', 'dk-svc-host', hostLine));
  var st = el('span', 'dk-svc-state');
  st.style.color = DS_COLOR[state];
  var shape = el('span', 'dk-svc-shape dk-svc-shape--' + state);
  shape.setAttribute('aria-hidden', 'true');
  var label = el('span', null, DS_LABEL[state]);
  label.style.color = 'var(--ink)';
  st.append(shape, label);
  head.append(left, st);
  root.append(head);

  if (opts.cells && opts.cells.length) {
    var bars = el('div', 'dk-svc-bars');
    bars.setAttribute('role', 'img');
    bars.setAttribute('aria-label', 'Verlauf der letzten 90 Tage');
    for (var c = 0; c < opts.cells.length; c++) {
      var day = el('span');
      day.style.background = DS_COLOR[DS_STATE[bucketColor(opts.cells[c].bucket)]];
      day.title = cellTooltip(opts.cells[c].key, opts.cells[c].bucket);
      bars.append(day);
    }
    var axis = el('div', 'dk-svc-axis');
    axis.append(el('span', null, 'vor 90 Tagen'), el('span', null, 'heute'));
    root.append(bars, axis);
  } else if (opts.empty) {
    root.append(el('p', 'dk-svc-empty', opts.empty));
  }
  return root;
}

// Markup der DS-Komponente Callout.
function callout(kind, title, text) {
  var k = {
    tip: ['var(--paper-warm)', 'var(--ink)'],
    gap: ['var(--apricot-tint)', 'var(--apricot)'],
    limit: ['var(--coral-tint)', 'var(--coral)'],
  }[kind] || ['var(--paper-warm)', 'var(--ink)'];
  var box = el('aside', 'dk-callout');
  box.style.background = k[0];
  box.style.borderColor = k[1];
  box.append(el('p', 'dk-callout-label', title));
  var lines = [].concat(text);
  for (var i = 0; i < lines.length; i++) box.append(el('p', 'dk-callout-text', lines[i]));
  return box;
}

function formatBerlin(iso) {
  try {
    return new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso)) + ' Uhr';
  } catch (e) {
    return iso;
  }
}

function renderBanner(status) {
  var host = document.getElementById('banner');
  host.replaceChildren();
  var titles = {
    operational: 'Alle Komponenten betriebsbereit',
    degraded: 'Eingeschränkter Betrieb',
    down: 'Störung',
    maintenance: 'Geplante Wartung',
  };
  var sub;
  if (status.overall === 'down') {
    sub = 'Wir haben das Problem erkannt und arbeiten an einer Lösung.';
  } else if (status.overall === 'maintenance' && status.note) {
    sub = status.note;
  } else {
    sub = 'Aktualisiert ' + relativeTime(status.checked_at);
  }
  host.append(serviceStatus({
    name: titles[status.overall] || 'Status unbekannt',
    state: DS_STATE[status.overall] || 'unbekannt',
    host: sub,
  }));
  document.getElementById('checked').textContent = 'Zuletzt geprüft: '
    + formatBerlin(status.checked_at) + ' (Europe/Berlin). Prüfungen laufen mehrmals täglich.';
}

function renderStale(status) {
  var host = document.getElementById('stale');
  host.replaceChildren();
  var ageMin = (Date.now() - new Date(status.checked_at).getTime()) / 60000;
  if (ageMin > STALE_MINUTES) {
    host.append(callout('gap', 'Daten möglicherweise veraltet',
      'Die letzte Prüfung liegt ' + relativeTime(status.checked_at).replace('vor ', '') + ' zurück.'));
    host.hidden = false;
  } else {
    host.hidden = true;
  }
}

function renderComponents(status, uptime) {
  var host = document.getElementById('components');
  host.replaceChildren();
  for (var i = 0; i < ORDER.length; i++) {
    var key = ORDER[i];
    var cur = (status.components && status.components[key]) || { status: 'none' };
    var cells = dayCells(uptime, key, HISTORY_DAYS);
    var hasData = cells.some(function (c) { return c.bucket && c.bucket.total > 0; });
    host.append(serviceStatus({
      name: LABELS[key],
      host: key,
      latency: MEASURED_LATENCY[key] && cur.latency_ms != null ? cur.latency_ms + ' ms' : '',
      state: DS_STATE[cur.status] || 'unbekannt',
      cells: hasData ? cells : [],
      empty: 'Für die letzten 90 Tage liegen keine Messdaten vor.',
    }));
  }
}

// Ehrlicher Hinweis, solange sich der 90-Tage-Verlauf noch füllt.
function renderMonitorSince(uptime) {
  var host = document.getElementById('data-note');
  var days = (uptime && uptime.days) || [];
  var base = 'Latenz steht nur dort, wo sie direkt gemessen wurde.';
  if (days.length === 0) {
    host.textContent = 'Überwachung gerade gestartet, der Verlauf füllt sich täglich. ' + base;
  } else if (days.length < HISTORY_DAYS) {
    host.textContent = 'Überwachung seit ' + formatDate(days[0].date)
      + ', der Verlauf füllt sich täglich. ' + base;
  } else {
    host.textContent = base;
  }
}

function renderIncidents(incidents, status) {
  var host = document.getElementById('incidents');
  host.replaceChildren();
  var hasManual = incidents && incidents.length > 0;
  var liveOutage = status && status.overall === 'down';

  if (status && status.overall === 'maintenance') {
    host.append(callout('tip', 'Geplante Wartung', status.note || 'Eine Wartung läuft gerade.'));
  }
  if (liveOutage) {
    host.append(callout('limit', 'Aktuelle Störung',
      'Wir haben eine Störung festgestellt und arbeiten an einer Lösung.'));
  }
  if (hasManual) {
    for (var i = 0; i < incidents.length; i++) {
      var inc = incidents[i];
      var lines = (inc.updates || []).map(function (u) {
        return (u.time ? u.time + ' · ' : '') + (u.text || '');
      });
      var title = (inc.title || 'Störung') + ' · ' + (inc.date || '')
        + (inc.resolved ? ' · behoben' : ' · aktiv');
      host.append(callout(inc.resolved ? 'tip' : 'limit', title, lines.length ? lines : ''));
    }
  } else if (!liveOutage) {
    var p = el('p', null, 'Keine dokumentierten Störungen im angezeigten Zeitraum.');
    p.style.cssText = 'margin: 0; padding: 20px 0; border-top: 1px solid var(--paper-line); font-size: 16px; line-height: 25px; color: var(--ink-2);';
    host.append(p);
  }
}

function load() {
  Promise.all([
    getJson('data/status.json'),
    getJson('data/uptime.json').catch(function () { return { days: [] }; }),
    getJson('data/incidents.json').catch(function () { return []; }),
  ]).then(function (results) {
    renderBanner(results[0]);
    renderStale(results[0]);
    renderComponents(results[0], results[1]);
    renderMonitorSince(results[1]);
    renderIncidents(results[2], results[0]);
  }).catch(function () {
    var banner = document.getElementById('banner');
    banner.replaceChildren();
    banner.append(serviceStatus({ name: 'Status derzeit nicht abrufbar', state: 'unbekannt' }));
  });
}

load();
setInterval(load, REFRESH_MS);
