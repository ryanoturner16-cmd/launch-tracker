# Launch Tracker (v2)

Unofficial fan project. Not affiliated with SpaceX or any launch provider. Data from Launch Library 2 by
The Space Devs; may be delayed or inaccurate.

Static, mobile-first rocket launch tracker with countdowns, plain-language mission explanations, exploded
3D rocket models and full-screen deep dives for **Starship**, **Falcon 9**, and **Apollo / Saturn V** (cutaway/X-ray, fuel flow, info cards).

## Layout
| Path | What |
|---|---|
| `index.html` | tracker shell (strict CSP meta tag, no inline script/style) |
| `starship.html` | Starship deep dive (same CSP) |
| `falcon9.html`, `apollo.html` | Falcon 9 Block 5 and Apollo / Saturn V deep dives |
| `css/style.css`, `css/starship.css` | styles |
| `js/app.js` | list, filters, detail view, router; only reads `data/launches.json` |
| `js/data.js` | loads `data/launches.json`, merges with the device cache (newest `last_updated` wins) |
| `js/watch.js` | "Watch live" links: LL2 webcasts (https only, no user:pw@ URLs, by priority) + provider-site fallback. LIVE is shown only when the data is < 45 min old and now is between 4 h before and 1 h after NET; card buttons only for Hour precision or better, with a "data N h old" caveat when the data is stale |
| `js/when.js` | launch-date precision handling (Second … Decade) and countdown text |
| `js/explain.js` | template-based mission explanation from API fields |
| `js/rocket3d.js` | procedural three.js models, side-booster table, scroll-friendly viewer, idle render loop |
| `js/starship-detailed.js` | tracker's Starship model (V3 or Block 2) |
| `js/starship/geometry.js` | **shared** Starship geometry (tracker model + deep dive) |
| `js/starship/main.js`, `info.js`, `entry.js`, `boot.js`, `variant.js` | Starship deep dive app, info cards, loaders |
| `js/dive/` | shared deep-dive engine + Falcon 9 and Apollo / Saturn V models |
| `js/vendor/three/` | self-hosted three.js r169 (+4 addons, imports rewritten to relative paths) and its MIT `LICENSE` |
| `data/launches.json` | trimmed LL2 snapshot written by the fetch job (under 100 KB) |
| `tools/fetch-launches.mjs` | server-side fetch job (LL2 upcoming + last 48 h → `data/launches.json`) |
| `tools/ci-refresh.sh`, `tools/check-data.mjs` | CI data step: restore last published data (validated), fetch, decide whether to deploy (never fails the job itself) |
| `tools/ci-health.mjs` | last workflow step, after deploy: fails the run (GitHub emails you) if the fetch crashed (exit 1), nothing was deployed, or `generated_at` is more than 3 h old |
| `tools/test-fetch.mjs` | offline tests for the fetch keep rules, failure handling, the CI restore/deploy decision and the health step |
| `tools/test-logic.mjs` | unit tests for the LIVE / watch-button rules and the side-booster table |

All test runners set `LL2_OFFLINE=1`; with it set, `tools/fetch-launches.mjs` refuses any live LL2 request and exits 1 (use `--raw` fixtures instead). The CI workflow never sets it.
| `tools/build.mjs` | builds `dist/` and checks it |
| `tools/verify.mjs` | headless Chromium checks + screenshots |
| `.github/workflows/fetch-launches.yml` | scheduled LL2 refresh + GitHub Pages deploy |
| `dev/models.html` | dev-only model harness (never deployed) |

## Data flow
Browsers never call Launch Library 2. A scheduled job runs `node tools/fetch-launches.mjs` every 15 min
(2 LL2 requests per run = 8/hour, inside the free tier's 15/hour), writes `data/launches.json`, then
`node tools/build.mjs` produces `dist/`, which is published to a static host. The app shows the data age
from `generated_at` inside the file (the server fetch time), not the browser's fetch time, and warns on the
list and on detail pages when it is older than 2 hours.

Keep rules: a successful run keeps exactly the fresh upcoming list (50 fetched, sorted by NET then id, first 40)
plus launches whose NET is in the last 48 h. Launches that slipped out of the top 40 or were deleted in LL2 are
dropped. Empty or malformed responses count as failures and never advance `generated_at`.

## Build & deploy
```
node tools/fetch-launches.mjs   # needs LL2 quota; exit code 2 = nothing new, previous file kept
node tools/build.mjs            # -> dist/
```
**Deploy the contents of `dist/` only** (never the project root: it contains tools, backups, screenshots and
node_modules). The CSP is in a meta tag; if the host supports headers also send
`Content-Security-Policy` (same value plus `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`
and `Referrer-Policy: strict-origin-when-cross-origin`. Directory listings are irrelevant for `dist/`
(every directory is either served files or 404 on the hosts below).

## Scheduled refresh (GitHub Actions)
`.github/workflows/fetch-launches.yml` runs at :07/:22/:37/:52 (off the top of the hour, when Actions is
busiest) plus manual `workflow_dispatch`. Each run restores the last *published* `launches.json`
(`curl -L`, validated by `tools/check-data.mjs`, so an HTML error page is never used), fetches LL2 on top,
and deploys `dist/` as a Pages artifact. Data is never committed. If the fetch fails **and** the published
copy can't be restored, the run skips the deploy rather than shipping the repo's (possibly days-old) file.
Optional secret `LL2_API_TOKEN` (sent as `Authorization: Token …`); optional variable `PAGES_URL` for a custom domain.

- **Expected data age:** usually 15–40 min. Runs are every 15 min but GitHub may start scheduled runs late,
  and GitHub Pages serves files with a short cache (about 10 min), so browsers can see an older copy for a while.
- **60-day rule:** in a *public* repo GitHub automatically disables scheduled workflows after 60 days without
  repository activity. Deploys made by the workflow itself don't count, since they don't commit anything. Keep-alive
  options: push any commit (even a README tweak) at least every ~50 days; re-enable the workflow from the
  Actions tab (or `gh workflow enable`) when GitHub emails that it was disabled; or use a keep-alive action that
  calls the "enable workflow" API. A private repo avoids the rule but uses Actions minutes.
- **Hardening (optional):** pin each `uses:` to a full commit SHA and let Dependabot update them.
  `frame-ancestors` (anti-clickjacking) can't be set in a meta tag; hosts that support headers (Cloudflare Pages,
  Netlify) can send it.

Hosting options for the scheduled fetch + static site (all free tiers, all need an account):
- **GitHub Pages + GitHub Actions cron** (GitHub account; free for public repos). This is what the live site uses: https://ryanoturner16-cmd.github.io/launch-tracker/
  Can't set custom headers (the meta CSP still applies).
- **Cloudflare Pages** (Cloudflare account) fed by the same GitHub Actions job via `wrangler pages deploy dist`
  (needs an API token secret); supports `_headers`.
- **Netlify** (Netlify account): scheduled functions or a GitHub Actions job + `netlify deploy --dir dist`;
  supports `_headers`.

## Local dev
`python3 -m http.server 8787 --bind 127.0.0.1` in this folder, then http://127.0.0.1:8787/.
(Bound to localhost only; don't expose it publicly.)

## Credits & licenses
- three.js r169 (MIT), self-hosted in `js/vendor/three/` with its `LICENSE`.
- Launch data: [Launch Library 2](https://thespacedevs.com/llapi) by The Space Devs. Launch images link to and credit their sources in the app.
- Unofficial fan project, not affiliated with or endorsed by SpaceX or any other launch provider. No license has been chosen for this project's own code yet.
