'use strict';

import {
  COMPONENTS,
  LABELS,
  STATUS_DE,
  measurementSummary,
  presentFromSource,
} from './scripts/present.mjs';

var REFRESH_MS = 60000;
var HISTORY_DAYS = 90;
var SVG_NS = 'http://www.w3.org/2000/svg';

// First paint animates; refreshes (every 60s) do not.
var firstPaint = true;

function getJson(path) {
  // Cache-bust so an open tab always sees the latest committed data.
  return fetch(path + '?t=' + Date.now()).then(function (res) {
    if (res.status === 404) {
      var missing = new Error(path + ' missing');
      missing.reason = 'missing';
      throw missing;
    }
    if (!res.ok) {
      var bad = new Error(path + ' ' + res.status);
      bad.reason = 'malformed';
      throw bad;
    }
    return res.text().then(function (text) {
      try {
        return JSON.parse(text);
      } catch (e) {
        var mal = new Error(path + ' malformed');
        mal.reason = 'malformed';
        throw mal;
      }
    });
  });
}

function formatDate(key) {
  var p = key.split('-');
  return p[2] + '.' + p[1] + '.' + p[0];
}

// Count recorded checks. Do not convert that count into minutes: the
// announced 5-minute cadence is not the cadence the scheduler keeps,
// so a duration computed from it would be an invented number.
function checkPhrase(n, adjective) {
  return n + ' ' + adjective + ' ' + (n === 1 ? 'Prüfung' : 'Prüfungen');
}

function cellTooltip(key, bucket) {
  var d = formatDate(key);
  if (!bucket || bucket.total === 0) return d + ' — keine Daten';
  var real = (bucket.up || 0) + (bucket.degraded || 0) + (bucket.down || 0);
  if (real === 0) return d + ' — Wartung';
  var parts = [];
  if (bucket.down > 0) parts.push(checkPhrase(bucket.down, 'fehlgeschlagene'));
  if (bucket.degraded > 0) parts.push(checkPhrase(bucket.degraded, 'eingeschränkte'));
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
  var list = (uptime && Array.isArray(uptime.days) && uptime.days) || [];
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

  if (kind === 'unknown') {
    var ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('cx', '12');
    ring.setAttribute('cy', '12');
    ring.setAttribute('r', '7');
    svg.appendChild(stroke(ring));
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

function renderBanner(view, animate) {
  var host = document.getElementById('banner');
  host.replaceChildren();
  host.dataset.status = view.banner;
  host.classList.toggle('banner--in', animate);

  var icon = el('span', 'banner-icon');
  icon.appendChild(statusIcon(view.banner));

  var text = el('div');
  text.append(
    el('div', 'banner-title', view.title),
    el('div', 'banner-sub', view.subtitle),
  );
  host.append(icon, text);
}

function renderComponents(view, uptime, animate) {
  var host = document.getElementById('components');
  host.replaceChildren();

  for (var i = 0; i < COMPONENTS.length; i++) {
    var key = COMPONENTS[i];
    var cur = (view.components && view.components[key]) || { status: 'unknown' };
    var cells = dayCells(uptime, key, HISTORY_DAYS);
    var summary = measurementSummary(cells.map(function (cell) { return cell.bucket; }));
    var pctText = summary.label;
    var pctShown = pctText || 'keine Messung';
    var stateLabel = STATUS_DE[cur.status] || STATUS_DE.unknown;

    var row = el('div', animate ? 'row row--in' : 'row');
    row.style.setProperty('--i', i);
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-label',
      LABELS[key] + ': ' + stateLabel + ', ' + (pctText || 'keine Messung'));

    var top = el('div', 'row-top');
    var name = el('span', 'row-name');
    var dot = el('span', 'dot');
    dot.dataset.status = cur.status || 'unknown';
    dot.setAttribute('aria-hidden', 'true');
    name.append(dot, el('span', null, LABELS[key]));
    var pctEl = el('span', 'row-pct', pctShown);
    if (!summary.available) pctEl.dataset.unavailable = 'true';
    top.append(name, pctEl);

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
  var days = (uptime && Array.isArray(uptime.days) && uptime.days) || [];
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

function renderIncidents(incidents, view) {
  var host = document.getElementById('incidents');
  host.replaceChildren();

  var hasManual = incidents && incidents.length > 0;
  var liveOutage = !!(view && view.showLiveOutage);

  // Automatic notice while a real outage is ongoing — no manual edit needed.
  // Only when the snapshot is fresh enough to call the outage current.
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
  } else if (!liveOutage) {
    host.append(el('div', 'incident-empty',
      'Keine Störungen in den letzten 14 Tagen gemeldet.'));
  }
}

function paint(view, uptime, incidents, animate) {
  renderBanner(view, animate);
  renderComponents(view, uptime, animate);
  renderMonitorSince(uptime);
  renderIncidents(incidents, view);
}

function load() {
  var animate = firstPaint;
  var now = new Date();
  Promise.all([
    getJson('data/status.json').then(
      function (data) { return { value: data }; },
      function (err) {
        return { error: err && err.reason === 'missing' ? 'missing' : 'malformed' };
      },
    ),
    getJson('data/uptime.json').catch(function () { return { days: [] }; }),
    getJson('data/incidents.json').catch(function () { return []; }),
  ]).then(function (results) {
    var uptime = results[1] && Array.isArray(results[1].days) ? results[1] : { days: [] };
    var incidents = Array.isArray(results[2]) ? results[2] : [];
    paint(presentFromSource(results[0], now), uptime, incidents, animate);
    firstPaint = false;
  }).catch(function () {
    paint(
      presentFromSource({ error: 'malformed' }, now),
      { days: [] },
      [],
      false,
    );
  });
}

load();
setInterval(load, REFRESH_MS);
