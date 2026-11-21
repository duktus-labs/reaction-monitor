'use strict';

// Render order + display labels for the five components.
var ORDER = ['web', 'chat', 'doku', 'voice', 'b2b'];
var LABELS = {
  web: 'Web-App',
  chat: 'Chat & KI',
  doku: 'Doku-Modus',
  voice: 'Voice & Transkription',
  b2b: 'B2B-API',
};
var STATUS_DE = {
  operational: 'betriebsbereit',
  degraded: 'eingeschränkt',
  down: 'Störung',
  maintenance: 'Wartung',
  none: 'keine Daten',
};
var REFRESH_MS = 60000;
var HISTORY_DAYS = 90;
var STALE_MINUTES = 15;
var CHECK_INTERVAL_MIN = 5; // checker cadence — one bucket check ≈ 5 minutes
var SVG_NS = 'http://www.w3.org/2000/svg';

// First paint animates; refreshes (every 60s) do not.
var firstPaint = true;

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

function isCurrent(status) {
  var checked = status && typeof status.checked_at === 'string'
    ? Date.parse(status.checked_at) : NaN;
  var age = Date.now() - checked;
  return Number.isFinite(age) && age >= 0 && age <= STALE_MINUTES * 60000;
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

// Uptime % excludes maintenance checks from the denominator, so a
// planned nightly window does not drag the figure down.
function uptimePct(cells) {
  var up = 0;
  var real = 0;
  for (var i = 0; i < cells.length; i++) {
    var b = cells[i].bucket;
    if (b) { up += b.up; real += b.up + b.degraded + b.down; }
  }
  if (real === 0) return null;
  return (up / real) * 100;
}

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function statusIcon(kind) {
  var svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');

  function stroke(node) {
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', 'currentColor');
    node.setAttribute('stroke-width', '2.5');
    node.setAttribute('stroke-linecap', 'round');
    node.setAttribute('stroke-linejoin', 'round');
    return node;
  }

  if (kind === 'maintenance') {
    var circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '8');
    svg.appendChild(stroke(circle));
    var hands = document.createElementNS(SVG_NS, 'path');
    hands.setAttribute('d', 'M12 7.6V12l3 1.8');
    svg.appendChild(stroke(hands));
    return svg;
  }

  var d = kind === 'operational' ? 'M5 12.5l4.2 4.2L19 7'
    : kind === 'down' ? 'M7 7l10 10M17 7L7 17'
    : 'M12 6.5v7.5M12 17.4v.1';
  var path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.appendChild(stroke(path));
  return svg;
}

function renderBanner(status, animate) {
  var host = document.getElementById('banner');
  host.replaceChildren();
  var current = isCurrent(status);
  var kind = current && Object.prototype.hasOwnProperty.call(STATUS_DE, status.overall)
    ? status.overall : 'none';
  host.dataset.status = kind;
  host.classList.toggle('banner--in', animate);

  var titles = {
    operational: 'Alle Systeme betriebsbereit',
    degraded: 'Eingeschränkter Betrieb',
    down: 'Störung',
    maintenance: 'Geplante Wartung',
    none: 'Status derzeit nicht aktuell',
  };

  var icon = el('span', 'banner-icon');
  icon.appendChild(statusIcon(kind));

  var sub;
  if (!current) {
    sub = 'Aktuelle Statusdaten sind nicht verfügbar.';
  } else if (kind === 'down') {
    sub = 'Wir haben das Problem erkannt und arbeiten an einer Lösung.';
  } else if (status.overall === 'maintenance' && status.note) {
    sub = status.note;
  } else {
    sub = 'Aktualisiert ' + relativeTime(status.checked_at);
  }

  var text = el('div');
  text.append(
    el('div', 'banner-title', titles[kind] || 'Status unbekannt'),
    el('div', 'banner-sub', sub),
  );
  host.append(icon, text);
}

function renderStale(status) {
  var host = document.getElementById('stale');
  if (!isCurrent(status)) {
    var checked = status && Date.parse(status.checked_at);
    host.textContent = Number.isFinite(checked) && checked <= Date.now()
      ? 'Letzte Prüfung ' + relativeTime(status.checked_at) + '.'
      : 'Der Zeitpunkt der letzten Prüfung ist nicht verfügbar.';
    host.hidden = false;
  } else {
    host.hidden = true;
  }
}

function renderComponents(status, uptime, animate) {
  var host = document.getElementById('components');
  host.replaceChildren();

  for (var i = 0; i < ORDER.length; i++) {
    var key = ORDER[i];
    var cur = (status.components && status.components[key]) || { status: 'none' };
    var kind = isCurrent(status) && Object.prototype.hasOwnProperty.call(STATUS_DE, cur.status)
      ? cur.status : 'none';
    var cells = dayCells(uptime, key, HISTORY_DAYS);
    var pct = uptimePct(cells);
    var pctText = pct === null
      ? '– Uptime'
      : pct.toFixed(2).replace('.', ',') + ' % Uptime';

    var row = el('div', animate ? 'row row--in' : 'row');
    row.style.setProperty('--i', i);
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-label',
      LABELS[key] + ': ' + (kind === 'none' ? 'keine aktuellen Daten' : STATUS_DE[kind]) + ', ' + pctText);

    var top = el('div', 'row-top');
    var name = el('span', 'row-name');
    var dot = el('span', 'dot');
    dot.dataset.status = kind;
    dot.setAttribute('aria-hidden', 'true');
    name.append(dot, el('span', null, LABELS[key]));
    top.append(name, el('span', 'row-pct', pctText));

    var bar = el('div', 'bar');
    bar.setAttribute('aria-hidden', 'true');
    for (var c = 0; c < cells.length; c++) {
      var cell = el('i');
      cell.dataset.status = bucketColor(cells[c].bucket);
      cell.title = cellTooltip(cells[c].key, cells[c].bucket);
      bar.append(cell);
    }

    row.append(top, bar);
    host.append(row);
  }
}

// Honest caption while the 90-day history is still filling up.
function renderMonitorSince(uptime) {
  var host = document.getElementById('monitor-since');
  if (!host) return;
  var days = (uptime && uptime.days) || [];
  if (days.length === 0) {
    host.textContent = 'Überwachung gerade gestartet · Verlauf füllt sich täglich';
    host.hidden = false;
  } else if (days.length < HISTORY_DAYS) {
    host.textContent = 'Überwachung seit ' + formatDate(days[0].date)
      + ' · Verlauf füllt sich täglich';
    host.hidden = false;
  } else {
    host.hidden = true; // history is full — caption no longer needed
  }
}

function renderIncidents(incidents, status) {
  var host = document.getElementById('incidents');
  host.replaceChildren();

  var hasManual = incidents && incidents.length > 0;
  var liveOutage = isCurrent(status) && status.overall === 'down';

  // Automatic notice while a real outage is ongoing — no manual edit needed.
  if (liveOutage) {
    var auto = el('article', 'incident');
    auto.dataset.severity = 'down';
    var ahead = el('div', 'incident-head');
    ahead.append(
      el('span', 'incident-title', 'Aktuelle Störung'),
      el('span', 'incident-date', 'Aktiv'),
    );
    var aline = el('div', 'incident-update');
    aline.append(el('span', null,
      'Wir haben eine Störung festgestellt und arbeiten an einer Lösung.'));
    auto.append(ahead, aline);
    host.append(auto);
  }

  if (hasManual) {
    for (var i = 0; i < incidents.length; i++) {
      var inc = incidents[i];
      var card = el('article', 'incident');
      card.dataset.severity = inc.severity || 'degraded';

      var head = el('div', 'incident-head');
      head.append(
        el('span', 'incident-title', inc.title || 'Störung'),
        el('span', 'incident-date',
          (inc.date || '') + (inc.resolved ? ' · behoben' : ' · aktiv')),
      );
      card.append(head);

      var updates = inc.updates || [];
      for (var u = 0; u < updates.length; u++) {
        var line = el('div', 'incident-update');
        line.append(
          el('span', 'incident-time', updates[u].time || ''),
          el('span', null, updates[u].text || ''),
        );
        card.append(line);
      }
      host.append(card);
    }
  } else if (!incidents) {
    host.append(el('div', 'incident-empty', 'Störungsmeldungen derzeit nicht abrufbar.'));
  } else if (!liveOutage) {
    host.append(el('div', 'incident-empty',
      'Keine Störungen in den letzten 14 Tagen gemeldet.'));
  }
}

function load() {
  var animate = firstPaint;
  Promise.all([
    getJson('data/status.json'),
    getJson('data/uptime.json').catch(function () { return { days: [] }; }),
    getJson('data/incidents.json').catch(function () { return null; }),
  ]).then(function (results) {
    renderBanner(results[0], animate);
    renderStale(results[0]);
    renderComponents(results[0], results[1], animate);
    renderMonitorSince(results[1]);
    renderIncidents(results[2], results[0]);
    firstPaint = false;
  }).catch(function () {
    var banner = document.getElementById('banner');
    banner.replaceChildren();
    banner.dataset.status = 'none';
    banner.append(el('div', 'banner-title', 'Status derzeit nicht abrufbar'));
    renderComponents({ components: {} }, { days: [] }, false);
    renderStale({});
    renderIncidents(null, {});
  });
}

load();
setInterval(load, REFRESH_MS);
