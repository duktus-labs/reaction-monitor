# duktus PRO — Status

Public uptime/status page for duktus PRO, served at
[status.duktus-pro.de](https://status.duktus-pro.de).

Runs entirely on GitHub Pages + GitHub Actions — independent of the
duktus AWS infrastructure, so it stays online during an outage.

## How it works

- `.github/workflows/status_check.yml` is scheduled with cron `*/5 * * * *`
  and runs `scripts/check.mjs`. GitHub's scheduler does not keep that
  cadence; missed ticks are not replayed. The workflow file is the
  announced interval, not a guarantee.
- The checker probes the frontend URL and the public
  `/api/status/components` backend endpoint, then writes `data/*.json`
  and commits the result back to this repo.
- `index.html` + `app.js` render that JSON. `scripts/present.mjs` decides
  what may be shown.

## Freshness

The page promises a check every 5 minutes. A snapshot may paint
operational, degraded, down, or maintenance only while it is at most
15 minutes old. That threshold is explicit in `scripts/present.mjs`:

```
ANNOUNCED_CHECK_INTERVAL_MIN = 5
STALE_INTERVAL_FACTOR        = 3
STALE_AFTER_MIN              = 15   // strict: age > 15 min is stale
```

Fifteen minutes is three announced intervals: one delayed run can still
land inside the window, a second missed run cannot. Older data, a missing
`data/status.json`, or JSON that cannot be parsed renders a neutral grey
state („Status wird aktualisiert“ / „Status unbekannt“), including every
service row. The green sentence „Alle Systeme betriebsbereit“ is reserved
for a fresh snapshot whose five services are all `operational`.

Uptime percentages are shown only when `up + degraded + down` of the
90-day buckets is greater than zero. Otherwise the row says „keine Messung“.
The percentage is the share of recorded checks, not wall-clock time, and
it is never a hard-coded placeholder.

## Editing incidents

Incidents are maintained by hand. Edit `data/incidents.json`, commit,
and push — the page picks it up. Schema: see `data/incidents.json`.

## Local development

```
node --test scripts/*.test.mjs   # checker + presentation tests (no network, no production data)
node --check app.js         # syntax check; there is no compile step
node scripts/check.mjs      # run one real check against the live endpoints
python -m http.server 8000  # serve the page at http://localhost:8000
```

No npm dependencies — Node 20+ only.

## Configuration

`config.json` holds the monitored URLs and thresholds. When the
production domain `duktus-pro.de` goes live, update `targets` there.
