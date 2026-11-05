# duktus PRO — Status

Public uptime/status page for duktus PRO, served at
[status.duktus-pro.de](https://status.duktus-pro.de).

Runs entirely on GitHub Pages + GitHub Actions — independent of the
duktus production infrastructure (Hetzner), so it stays online during an outage.

## How it works

- `.github/workflows/status_check.yml` runs `scripts/check.mjs` on a `*/5` cron.
  GitHub delays and drops scheduled runs, so the real cadence is lower (see DUK-154).
- The checker probes the frontend URL and the public
  `/api/status/components` backend endpoint, then writes `data/*.json`
  and commits the result back to this repo.
- `index.html` + `app.js` render that JSON.

## Editing incidents

Incidents are maintained by hand. Edit `data/incidents.json`, commit,
and push — the page picks it up. Schema: see `data/incidents.json`.

## Local development

```
node --test scripts/        # run checker unit tests
node scripts/check.mjs      # run one real check against the live endpoints
python -m http.server 8000  # serve the page at http://localhost:8000
```

No npm dependencies — Node 20+ only.

## Configuration

`config.json` holds the monitored URLs and thresholds. When the
production domain `duktus-pro.de` goes live, update `targets` there.
