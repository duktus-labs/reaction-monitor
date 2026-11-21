import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function page() {
  const nodes = {};
  function node() {
    return { children: [], dataset: {}, attributes: {}, hidden: false, textContent: '',
      style: { setProperty() {} }, classList: { toggle() {} },
      setAttribute(k, v) { this.attributes[k] = v; },
      append(...items) { this.children.push(...items); },
      appendChild(item) { this.children.push(item); },
      replaceChildren(...items) { this.children = items; } };
  }
  const document = { createElement: node, createElementNS: node,
    getElementById(id) { return nodes[id] ||= node(); } };
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
    .replace(/\nload\(\);\s*setInterval\(load, REFRESH_MS\);\s*$/, '');
  const context = vm.createContext({ document, Date, console });
  vm.runInContext(source, context);
  return { context, nodes };
}

test('stale operational status is neutral for banner and component indicators', () => {
  const { context, nodes } = page();
  const status = { overall: 'operational', checked_at: new Date(Date.now() - 60 * 60000).toISOString(),
    components: { web: { status: 'operational' } } };
  context.renderBanner(status, false);
  context.renderComponents(status, { days: [] }, false);
  assert.equal(nodes.banner.dataset.status, 'none');
  assert.equal(nodes.banner.children[1].children[0].textContent, 'Status derzeit nicht aktuell');
  assert.equal(nodes.components.children[0].children[0].children[0].children[0].dataset.status, 'none');
  assert.match(nodes.components.children[0].attributes['aria-label'], /keine aktuellen Daten/);
});

test('missing and invalid timestamps are not treated as fresh', () => {
  const { context, nodes } = page();
  for (const checked_at of [undefined, 'invalid', new Date(Date.now() + 3600000).toISOString()]) {
    context.renderBanner({ overall: 'operational', checked_at }, false);
    assert.equal(nodes.banner.dataset.status, 'none');
  }
});

test('fresh status keeps its reported severity and missing components remain unknown', () => {
  const { context, nodes } = page();
  const status = { overall: 'down', checked_at: new Date().toISOString(), components: {} };
  context.renderBanner(status, false);
  context.renderComponents(status, { days: [] }, false);
  assert.equal(nodes.banner.dataset.status, 'down');
  assert.equal(nodes.components.children[0].children[0].children[0].children[0].dataset.status, 'none');
});

test('old outages are not announced as current and missing incident data is explicit', () => {
  const { context, nodes } = page();
  context.renderIncidents(null, { overall: 'down', checked_at: '2020-01-01T00:00:00Z' });
  assert.equal(nodes.incidents.children.length, 1);
  assert.equal(nodes.incidents.children[0].textContent, 'Störungsmeldungen derzeit nicht abrufbar.');
});
