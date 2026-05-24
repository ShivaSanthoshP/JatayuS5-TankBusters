# Hard-refresh perf pass — design

**Date:** 2026-05-24
**Scope:** Make a cold hard-refresh of the deployed app feel snappier. Steady-state polling and per-action navigation are out of scope (user reported only the hard-refresh case as slow).

## Constraints

- Single `uvicorn --workers 1` on EC2 Mumbai — in-process work only.
- Postgres 16 local; no Redis or external cache.
- nginx already in front; we can edit `deployment/nginx.conf`.
- No new dependencies.

## Cost centers on cold open

1. **Bytes over the wire** — JS/CSS bundle isn't gzipped; hashed assets don't carry an immutable cache header, so every refresh re-fetches even though the filename hash already guarantees content.
2. **First API call** — Dashboard (route `/`) blocks on `getDashboard` and `getIncidents`:
   - `get_dashboard_stats` does three full table scans (`nodes`, `incidents`, `remediations`) and counts in Python.
   - `get_incidents` over-fetches `limit * 20` rows (up to ~40 000) for a 15-min dedupe window, and `_to_out` lazy-loads `incident.node` per row → N+1.

## Changes

### 1. nginx — gzip + immutable cache on hashed assets

Edit `deployment/nginx.conf`:

- Enable `gzip on` with sensible types (`application/javascript`, `text/css`, `application/json`, `image/svg+xml`).
- Add a `location /assets/` block that serves `dist/assets/` with `Cache-Control: public, max-age=31536000, immutable`. Vite emits content-hashed filenames here, so eternal cache is safe — a new build = new hash = new URL.
- Leave the `try_files … /index.html` fallback alone (index.html must stay short-cached so deploys roll out).

### 2. `get_dashboard_stats` — SQL aggregates

Replace the three `.query(Model).all()` scans with:

- `SELECT status, COUNT(*) FROM infrastructure_nodes GROUP BY status` — single round-trip, no Python object hydration.
- `SELECT status, COUNT(*) FROM incidents GROUP BY status`.
- `SELECT status, COUNT(*) FROM remediations GROUP BY status`.

Aggregate the counts into the existing return shape (`total_nodes`, `healthy_nodes`, `degraded_nodes`, `critical_nodes`, `total_incidents`, `open_incidents`, `resolved_incidents`, `total_remediations`, `success_rate`). Function signature and response payload stay identical.

### 3. `get_incidents` — fix N+1, shrink over-fetch

Two edits in `IncidentService.get_incidents`:

- Add `.options(joinedload(Incident.node))` so each incident's node row arrives in the same query — kills the per-row lazy load that `_to_out` triggers via `incident.node.node_name`.
- Replace `limit * 20` with a tighter bound: `min(limit + 200, 500)`. The dedupe window is 15 minutes — pulling 40 000 rows to find duplicates among the most recent few hundred is overkill. The default `limit=2000` already exceeds total incident volume in practice; we just need headroom for the dedupe window.

Dedupe stays in Python — pushing the 15-minute "session-style" collapse into SQL would need `DISTINCT ON` plus a JSON-path lookup on `diagnostic_details->>'issue_type'`, which costs complexity not worth the marginal win.

## Verification

- nginx: `nginx -t` for syntax. After deploy, hit the app with browser devtools and confirm `content-encoding: gzip` on the JS bundle and `cache-control: public, max-age=31536000, immutable` on `/assets/*`. Second hard-refresh should show those assets as `(disk cache)`.
- Backend: existing pytest suite must stay green (`tests/api/test_*.py`, `tests/services/test_incident_*.py` if any). Spot-check the Dashboard payload shape matches before/after.

## Risks & rollback

- **nginx**: a typo can take the site down. Run `nginx -t` before `systemctl reload nginx`. Rollback = revert the config and reload.
- **`get_dashboard_stats`**: if a status enum is missing from the GROUP BY result, its count falls to 0 — we'll explicitly default missing keys to 0 to match previous behaviour.
- **`get_incidents` joinedload**: switching a lazy relationship to eager-loaded in this single query adds JOIN cost but eliminates N round-trips. Bounded over-fetch (max 500 rows) also caps any pathological case.

## Out of scope (intentionally)

- Redis / external cache layer.
- Frontend `usePolling` refactor (no flicker complaint).
- Page Visibility / tab-hidden polling pause.
- HTTP/2, TLS, CDN.
- Vite bundle splitting.
- Aggregated-history SQL rewrite (`get_metrics_history` is fine for now).
