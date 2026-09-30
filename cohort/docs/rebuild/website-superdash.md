# Rebuild: Website / Operator Dashboard (`service:superdash`)

Permanent rebuild documentation for the ZEROBRAIN fleet operator dashboard, known as
**Superdash <version-label>**. Written so that an engineer with no access to the original machines can
rebuild the website from scratch.

| Field | Value |
|---|---|
| Canonical service ID | `service:superdash` |
| Canonical host | the coordinator host |
| Canonical port | `<DASHBOARD_PORT>` |
| Application name | Superdash <version-label> |
| Source project name | `superdash-<version-label>` |
| Backend service | `service:coordinator` (the coordinator repository), port `<COORD_PORT>` |
| Sibling service | image service, port `<FILES_PORT>` |
| Document status | Generic rebuild design. Deployment-specific evidence removed. |

### How to read this document

This document is written for a rebuilder, not for an archivist. The goal is **not** a byte-faithful
clone of any previous deployment. The goal is that a competent engineer or agent can rebuild a system
that does the same job, and may build parts of it better.

To that end the document keeps three kinds of content strictly separated. Never blur them.

| Layer | Sections | What it is | How to treat it |
|---|---|---|---|
| **(a) Reference implementation** | 1-12 | Facts read directly from source, live HTTP responses, and `file:line` citations. Verbatim file reproductions. | Authoritative. If it is here, it was read at source. |
| **(b) Design intent** | 13, 14, 15, 16 | Why decisions were made, what must remain true in any reimplementation, what broke before, and what migrated from what. Quotes source comments and commit messages where they state a reason. | Reconstructable intent. Rationale quoted from source is evidence; inferred rationale is labelled as inference. |
| **(c) Assessment / opinion** | 17 | The documenting engineer's own judgement about what was over-complex, fragile, or should be reconsidered. | **Opinion.** Not evidence. A rebuilder may disagree. |

**If you are rebuilding and can only read one section, read Section 14 (Constraints and
Invariants).** It separates the properties that are load-bearing from the ones that are
incidental. Sections 1-12 tell you what exists; Section 14 tells you what you are not allowed to
get wrong; Section 15 tells you which bugs you will otherwise reintroduce.


### Evidence locators

These are **evidence locators only**, not stable references. The machines they name are being
decommissioned. Every fact in this document was read from one of these locations.

| Locator | What it is |
|---|---|
| `<shared-root>\superdash-<version-label>` | Superdash <version-label> source worktree (dev, `master` checked out). the tracked files. |
| `<shared-root>\superdash-<version-label>-deploy` | The **served** tree. Detached git worktree of the same repo. |
| `<shared-root>\superdash-<version-label>-svc` | NSSM stdout/stderr logs. Deliberately outside the served tree. |
| `<shared-root>\tests\superdash-<version-label>\` | Fleet-tracked subset of the Playwright suite (exists). |
| `<shared-root>\scripts\` | Service install / promote / drift / mirror PowerShell. |
| `<backup-destination>\superdash-<version-label>.git` | The **only** git remote (`backup`). There is no `origin`. |
| `<repo> coordinator repository` | Coordinator git repo, branch `master`, HEAD `<git-sha>`. |
| `http://<dashboard-host>:<DASHBOARD_PORT>` | Live runtime, used for read-only GET evidence capture. |

### Stable references used in this document

| Reference | Meaning |
|---|---|
| `service:superdash` | This service. |
| `service:coordinator` | The FastAPI coordinator that owns all fleet data. |
| Superdash local API | `/api/health`, `/api/version`, `/api/deploy_status`, `/api/lane_health` |
| Coordinator API | every other `/api/*` path |
| Design-token decision | Visual token source of truth; `DESIGN.md` is its artifact. |
| lane-probe design | git-over-SSH lane health probe; source of `/api/lane_health`. |
| Reverse-proxy change | Introduced the reverse-proxy of unhandled `/api/*` to the coordinator. |
| Provenance endpoints | Introduced `/api/version` and `/api/deploy_status`. |
| Deploy discipline | Reconcile / commit-on-deploy / cache-buster / receipts. |
| Test split | Fleet-tracked versus peer-repo test split. |

---

## 0. Source of record and deployment provenance

**Current contract.** Superdash <version-label> is a **self-contained, no-build, static web application plus a
single-file Python 3 stdlib HTTP server**. It is versioned in its own git repository. It is
*not* part of the coordinator repository and is *not* served by the coordinator.

**Implementation evidence.**

* The repository is a **local-only git repository**. `git remote -v` in the source worktree shows
  exactly one remote, named `backup`, pointing at a bare mirror on a file share
  (`<backup-destination>\superdash-<version-label>.git`). **There is no `origin` and no public source-hosting remote.** This is the single most important preservation fact: the only copies of this
  repository are the coordinator-host worktrees and that bare mirror.
* Primary branch: `master`.
* Development worktree HEAD at time of capture:
  `<git-sha>`, commit time `<date>`,
  subject `sync: bring master up to the live-deployed content`.
* The repository has **many worktrees** on the coordinator host:
  * `superdash-<version-label>` -- development worktree, `master` checked out. Canonical source.
  * `superdash-<version-label>-deploy` -- **detached HEAD** worktree. This is the tree the web server serves.
  * `superdash-<version-label>-svc` -- service log directory (not a worktree of content).
  * feature/staging worktrees: `superdash-<version-label>-feature-*`, `superdash-<version-label>-staging-*`, etc.
    Liveness of these is **unresolved** (see section 12).

**Deployment evidence.** See sections 9 and 10.

**Unresolved.** Whether the `backup` bare mirror is itself backed up off the decommissioned
estate. If it is not, cloning `superdash-<version-label>.git` before decommission is mandatory.

---

## 1. Complete file inventory

Tracked files are grouped by role. Deployment-specific byte sizes are intentionally omitted.

### 1.1 Server and services

| File | Purpose |
|---|---|
| `superdash-server.py` | **The entire web server.** Python 3 stdlib only. Static file serving + 4 local API endpoints + reverse proxy to coordinator + gzip + ETag + cache policy + perf logging. Summarized in section 2.6. |
| `services/image-service.py` | Separate FastAPI/uvicorn micro-service on port **<FILES_PORT>**. Image upload/serve for the dashboard. Uploads to a shared `uploads\` dir, metadata in SQLite `images.db`. Max 20 MB; allows `.png .jpg .jpeg .gif .webp .bmp .ico`. Consumed by `js/images.js`. Not started by the superdash service. |

### 1.2 HTML pages

| File | Purpose |
|---|---|
| `index.html` | **CURRENT primary entry point.** The Superdash <version-label> cockpit. Loads 20 stylesheets + `marked.min.js` + 52 deferred scripts, all `?v=<cache-label>` Summarized in section 5.2. |
| `fleet-recovery.html` | **CURRENT secondary page.** Standalone Fleet Recovery Console. Loads only `css/base.css`, `css/recovery.css`, `js/config.js`, `js/recovery.js`. Calls `/api/recovery/*` and `/api/topology`. Not linked from `index.html`. |
| `operator.html` | **CURRENT secondary page.** Standalone CAIRN OPERATOR console with its own inline CSS + inline JS + its own auth gate. Shares no JS modules with `index.html`. Not linked from `index.html`. |

### 1.3 CSS

| File | Purpose |
|---|---|
| `css/base.css` | Design-token `:root` block, global reset, scrollbars, layout grid, header, nav, status bar. The implementation of `DESIGN.md`. |
| `css/components.css` | Shared components: glass panels, intel cards, tabs, buttons, badges, kanban cards. |
| `css/cairn.css` | CAIRN drawer: RFC board, scratch, KB, archive. Largest stylesheet. |
| `css/overrides.css` | Late-cascade overrides applied after all other sheets. |
| `css/messaging.css` | Messaging panel. |
| `css/corrections.css` | Lessons / corrections panel. |
| `css/responsive.css` | Breakpoint behaviour (640 / 768 / 1024 / 1440). |
| `css/chat.css` | Node chat view. |
| `css/recovery.css` | Styles for the standalone `fleet-recovery.html` page. |
| `css/bus-panel.css` | Breathbus panel. |
| `css/merit.css` | Merit panel. **Declares its own `:root` colours** -- a design-token drift instance. |
| `css/scratch-limits.css` | Scratch quota/limit rendering. |
| `css/scratch-threads.css` | Scratch thread rendering. |
| `css/gary-panel.css` | Gary Status panel. |
| `css/fleet-sections.css` | Fleet overview collapsible sections. |
| `css/recovery-panel.css` | In-dashboard recovery status panel (distinct from `recovery.css`). |
| `css/electric-border.css` | Optional SVG-turbulence border accent enabled by query flag. |
| `css/tool-cost-panel.css` | Tool Cost intel card. |
| `css/phase-badge.css` | **ORPHANED.** an RFC-B4 phase vocabulary badges. Referenced by no HTML and not precached. |
| `css/resilience-card.css` | Resilience intel card (feature-flagged). Comments claim reuse of phase-badge styles, but `phase-badge.css` is not linked -- latent bug. |
| `css/failure-episodes.css` | Failure Episodes intel card. |
| `css/deploy-pending-banner.css` | Retained only for the footer `#status-deploy` pill colourings. The page-spanning banner it was written for was removed . |

### 1.4 JavaScript

Core / infrastructure:

| File | Purpose |
|---|---|
| `js/config.js` | Global `CONFIG` object: API base, auth token, poll intervals, node colours, host map, breathbus map. Summarized in section 7.2. |
| `js/api.js` | All HTTP calls to the coordinator. Owns auth header injection and operator/node token prompting. |
| `js/datastore.js` | `FleetState` -- L1 in-memory cache, endpoint registry, subscriber-driven polling, in-flight dedup. Exposes back-compat alias `var DataStore = FleetState`. |
| `js/api-resilience.js` | `APICache` -- L2 localStorage cache, retry/backoff, stale-while-revalidate, maintenance detection. |
| `js/cairn-cache.js` | L4 IndexedDB cache (`zb_cairn_cache` <version-label>) for CAIRN data + offline search + SSE-driven invalidation. |
| `js/sse.js` | Event stream client. **In practice runs in poll mode** -- see section 4.3. |
| `js/app.js` | Application bootstrap, tab router, global refresh loop, service-worker registration and self-heal. |
| `js/components.js` | Shared render helpers (`Components.errorBanner`, badges, loading states). |
| `js/perf-guard.js` | Pause/resume of polling when the tab is hidden; reduced-motion handling. |
| `js/boot-loader.js` | Header boot progress bar. |
| `js/notify.js` | Notification queue + bell badge. |
| `js/version-stamp.js` | Footer `Build:` pill. Joins `/api/version` with live SW cache version, localStorage rev, IndexedDB rev. |
| `js/deploy-pending-banner.js` | Footer `Deploy:` pill from `/api/deploy_status`. |
| `js/deploy.js` | A **third, distinct** deploy surface (4C-E3 `last-deploy.json` widget). |

Panels and views:

| File | Purpose |
|---|---|
| `js/taskboard.js` | Task Board (default tab). Kanban of `/api/tasks` + `/api/swats`. |
| `js/review-pipeline.js` | Review tab. |
| `js/messaging.js` | Messages tab. |
| `js/messages.js` | Per-node chat rendering. |
| `js/guestbook.js` | Authorization tab. Includes the ~60-entry authority gate registry (section 7.6). |
| `js/files-panel.js` | Files tab shell. |
| `js/docs.js` | Docs sub-view of Files. |
| `js/scripts.js` | Scripts sub-view of Files. |
| `js/images.js` | Images sub-view of Files. Talks to port **<FILES_PORT>**, not <COORD_PORT>. |
| `js/notifications-panel.js` | Notifications tab (replaced the Boomerang tab). |
| `js/corrections.js` | Lessons tab. |
| `js/tool-failures.js` | Tool failure rollups inside Lessons. |
| `js/merit.js` | Merit tab (overflow drawer). |
| `js/gary-panel.js` | Gary Status tab (overflow drawer). an RFC: nav-only, never auto-rendered or polled. |
| `js/panels.js` | Fleet overview panel host. |
| `js/fleet-sections.js` | Collapsible sections inside Fleet overview (`bus`, `recovery`, ...). |
| `js/nodes.js` | Left-nav node list + Fleet Health card. |
| `js/bus-panel.js` | Breathbus section. |
| `js/recovery.js` | Logic for the standalone `fleet-recovery.html`. |
| `js/recovery-status-panel.js` | In-dashboard recovery status section. |
| `js/broadcast.js` | Broadcast composer. |
| `js/motd.js` | MOTD surface. |
| `js/boomerang.js` | Boomerang data. Tab retired; module still loaded. |
| `js/layout-resizer.js` | Draggable Task Board height resizer. |
| `js/feedback.js` | OPERATOR Feedback intel card ("Scratch it"). |

CAIRN subsystem:

| File | Purpose |
|---|---|
| `js/cairn.js` | CAIRN drawer controller, tab switching, operator-token touchpoint. |
| `js/cairn-board.js` | RFC board. Largest JS module. |
| `js/cairn-panel.js` | CAIRN panel chrome/filters. |
| `js/cairn-recent.js` | Active RFCs intel card. |
| `js/cairn-kb.js` | KB tab. |
| `js/cairn-scratch.js` | Scratch tab. |
| `js/scratch-threads.js` | Scratch threading. |
| `js/scratch-limits.js` | Scratch quota display. |
| `js/cairn-search.js` | CAIRN search box. |
| `js/approval-throughline.js` | Approval throughline rendering (an RFC). |

Intel cards:

| File | Purpose |
|---|---|
| `js/tool-cost-panel.js` | Tool Cost card (default ON via `window.TOOL_COST_WIDGET_ENABLED`). |
| `js/resilience-card.js` | Resilience card (default OFF; enable `localStorage.resilienceCard='1'`). |
| `js/resilience-incidents.js` | Resilience incident list. |
| `js/failure-episodes.js` | Failure Episodes card (always on). |

Orphaned:

| File | Bytes | Status |
|---|---|
| `js/bb-pill.js` | **ORPHANED** (OPERATOR-direct). BB header pill removed; the node list is the canonical liveness surface. Referenced by no HTML, not precached. |
| `js/phase-vocab.js` | **ORPHANED.** an RFC-B4 phase vocabulary. Referenced by no HTML, not precached. |

Vendor:

| File | Purpose |
|---|---|
| `marked.min.js` | Markdown renderer. The **only** third-party front-end dependency. Loaded non-deferred at the top of `index.html`. |

### 1.5 Service worker

| File | Purpose |
|---|---|
| `sw.js` | Service worker (revision `4c-r4`). Precaches 72 assets; network-first for both static and API. Summarized in section 5.4. |

### 1.6 Config and manifests

| File | Purpose |
|---|---|
| `package.json` | Declares `type: commonjs` and the sole devDependency `@playwright/test ^1.60.0`. There is **no build script**. |
| `package-lock.json` | Lockfile for the Playwright devDependency. |
| `playwright.config.js` | `testDir ./tests`, `timeout 60000`, `retries 0`, `baseURL http://<dashboard-host>:<DASHBOARD_PORT>`, `headless true`. |
| `.gitignore` | Ignores `node_modules/`, `dist/`, `*.log`, `temp/`, `*.bak*`, `.env`, `.vscode/`, `.copilot/`, `.the MCP bridge/`. |
| `.cache-stamp-manifest.json` | Source of truth for the cache-stamp gate. Maps `path -> { stamp, sha256 }` for every `?v=<cache-label>` asset. |
| `DESIGN.md` | **Canonical design-token specification** (an RFC). Summarized in section 6. |
| `docs/SUPERDASH-DEPLOY-DISCIPLINE.md` | The four deploy disciplines. Summarised in section 9. |

There is **no** web app manifest (`manifest.json`/`manifest.webmanifest`) and **no** favicon file:
the favicon is an inline `data:image/svg+xml` URI in `index.html` (a radiation-symbol emoji). The
app is service-worker-enabled but is **not** an installable PWA.

### 1.7 Scripts (in-repo)

| File | Purpose |
|---|---|
| `scripts/Lint-CacheStamps.ps1` | Content-hash deploy gate. Modes `-Check` (default), `-Init`, `-Bump`, `-SelfTest`. |
| `scripts/superdash-deploy-reconcile.ps1` | Session-start drift check. Verdicts `CONVERGENT` / `AHEAD` / `BEHIND` / `DIVERGENT`; non-zero exit on non-convergent. |
| `scripts/superdash-deploy-receipt.ps1` | Writes a tracked receipt into `deploy-receipts/`. |

### 1.8 Tests

| File | Purpose |
|---|---|
| `tests/smoke.spec.js` | **The machine-checkable gate.** 17 `@smoke`-tagged tests (the "OG10" reference set). |
| `tests/kanban-card-overflow-fix.spec.js` | Kanban card text overflow regression. |
| `tests/taskboard-resizer-fix.spec.js` | Task Board height resizer regression. |
| `tests/perf-e-reduced-motion.spec.js` | `prefers-reduced-motion` compliance. |
| `tests/perf-f-cairn-board.spec.js` | CAIRN board render performance. |
| `tests/lessons-rework.spec.js` | Lessons tab rework. |
| `tests/tool-cost-widget.spec.js` | Tool Cost widget, mocked backend. Includes degraded-state AC-P5-9 / AC-P5-10. |
| `tests/tool-cost-widget.live.spec.js` | Tool Cost widget against a live coordinator. |
| `tests/resilience-card.spec.js` | Resilience card incl. `B4.error` and `B4.truncated` degraded cases. |
| `tests/view-independent-invalidation.spec.js` | Cache invalidation must not depend on the active view. |
| `tests/dirty-cache.spec.js` | Dirty-cache scenario (`npm run test:dirty-cache`). |
| `tests/count-freshness.spec.js` | SWAT count freshness. |
| `tests/tracked-change.spec.js` | Active SWAT set completeness. |
| `tests/cairn-recent-sse-invalidation.spec.js` | Active RFCs card invalidates on CAIRN events. |
| `tests/approval-throughline.probe.spec.js` | **the coordinator host-only.** `require('../js/approval-throughline.js')` crosses the tree boundary. |
| `tests/approval-throughline-inheritance.probe.spec.js` | **the coordinator host-only**, same reason. |
| `tests/test_lane_probe.py` | pytest for the `/api/lane_health` two-tier probe. |
| `test-results/.last-run.json` | Playwright run artifact (not meaningful source). |

By design, the relevant files:
8 HTTP-only specs, the pytest, plus byte-identical `package.json` and `playwright.config.js`).
The two `approval-throughline*` probes stayed the coordinator host-only because they `require()` a sibling
path outside the test tree.

### 1.9 Deploy receipts

`deploy-receipts/` contains `.gitkeep`, `README.md`, and **20 tracked receipts** named
`<UTC-timestamp>Z-<sha-short>.txt` (plus two named `...-P1-fullchain-GREEN.txt` and
`...-P1-the reviewer node-reviewer-GREEN.txt`), spanning `<timestamp>` through `<timestamp>`.
Each records author, verifier, deployed SHA and verification notes.

---

## 2. Server

### 2.1 Current contract

| Property | Value |
|---|---|
| Language / runtime | Python 3 (running under `<python>`, i.e. CPython 3) |
| Third-party dependencies | **None.** stdlib only: `gzip`, `http.server`, `io`, `json`, `logging`, `os`, `re`, `socket`, `subprocess`, `threading`, `time`, `socketserver` |
| External tool dependency | `git` must be on `PATH` (used for revision facts and drift counts) |
| Server class | `socketserver.ThreadingTCPServer` subclass named `ReuseTCPServer` |
| Handler class | `http.server.SimpleHTTPRequestHandler` subclass named `SuperdashHandler` |
| Bind | `("", <DASHBOARD_PORT>)` -- all interfaces, port hardcoded as `PORT = <DASHBOARD_PORT>` |
| Served directory | `os.path.dirname(os.path.abspath(__file__))` |
| Methods supported | `GET` only (plus inherited `HEAD`). No `POST`/`PUT`/`DELETE` handler exists. |

**The serve-root mechanism is the script's own directory.** There is no configuration file, no
environment variable, and no command-line argument for the document root. `superdash-server.py`
must physically sit at the top of the tree you want served. This is why the NSSM service sets
both `AppParameters` to `<DeployTree>\superdash-server.py` and `AppDirectory` to `<DeployTree>`,
and why the installer asserts that `/api/health` reports `.directory == <DeployTree>`.

Server tuning, all deliberate and load-bearing:

| Setting | Value | Reason (from source comments) |
|---|---|---|
| `allow_reuse_address` | `True` | Restart without `TIME_WAIT` bind failures. |
| `daemon_threads` | `True` | Threads do not block shutdown. |
| `request_queue_size` | `128` (default is 5) | 8+ parallel browser sockets were overflowing the TCP SYN queue and incurring retransmit-delay tails. |
| `address_string()` override | returns `self.client_address[0]` | Skips `socket.getfqdn()` reverse DNS, which cost **~2000 ms per request** on Windows. Per-request latency dropped to <50 ms. |
| `log_message()` override | no-op | Suppresses per-request stdout noise. |
| Per-request perf log | JSONL to `<DIRECTORY>/../logs/superdash-perf.jsonl` | Records `ts, method, path, status, ms_total, ms_parse, ms_handler, inflight_start, inflight_end, thread`. **Deliberately outside the served tree.** |

### 2.2 Startup command

```
<python> <shared-root>\superdash-<version-label>-deploy\superdash-server.py
```

with working directory set to the deploy tree. Startup prints:

```
Superdash <version-label> server starting on port <DASHBOARD_PORT>
Serving: <DIRECTORY>
Health:  http://<dashboard-host>:<DASHBOARD_PORT>/api/health
Version: http://<dashboard-host>:<DASHBOARD_PORT>/api/version
Deploy:  git=<sha7> branch=<branch> sw=<sw_cache_version>
Lane:    http://<dashboard-host>:<DASHBOARD_PORT>/api/lane_health (probes git-ssh <host-address>:<GIT_SSH_PORT>)
```

Environment variables read (all optional, all for the lane probe only):

| Variable | Default | Meaning |
|---|---|---|
| `RFC599_LANE_HOST` | `<host-address>` | Host for the git-over-SSH lane probe. |
| `RFC599_LANE_PORT` | `<GIT_SSH_PORT>` | Port for the lane probe. **Not the system SSH port** -- the in-box `:22` rule was disabled; the lane is a `Match`-scoped sshd on <GIT_SSH_PORT>. |
| `RFC599_LANE_PROBE_TIMEOUT` | `1.5` | Seconds, per tier. |

The server reads **no** authentication configuration. It holds no tokens.

### 2.3 Routing rules

`do_GET` dispatches in this exact order:

| Order | Match | Action |
|---|---|---|
| 1 | `self.path == "/api/health"` | local handler |
| 2 | `self.path == "/api/version"` | local handler |
| 3 | `self.path == "/api/deploy_status"` | local handler |
| 4 | `self.path == "/api/lane_health"` | local handler |
| 5 | `self.path.split("?",1)[0].startswith("/api/")` | **reverse-proxy to the coordinator** |
| 6 | anything else | `SimpleHTTPRequestHandler.do_GET()` -- static file from `DIRECTORY` |

Note that matches 1--4 are **exact string equality including the query string**. A request to
`/api/health?x=1` does *not* match rule 1 and falls through to rule 5, i.e. it is proxied to the
coordinator (which has its own public `/api/health`). This is a real, verified behaviour.

Static serving is plain `SimpleHTTPRequestHandler`: directory index resolution to
`index.html`, MIME guessing via `mimetypes`, `If-Modified-Since` handling inherited from the
parent. There is no SPA fallback, no rewrite rules, no route table. Every URL maps directly to a
file path under the served directory.

### 2.4 The proxy rule

**Which paths proxy:** every `GET /api/*` except the four exact paths above.

**Target:** `http://<coordinator-host>:<COORD_PORT>` + the original `self.path` (path and query preserved verbatim).

**Headers forwarded:** exactly two, and only if present on the inbound request --
`Authorization` and `X-Node-Token`. **All other request headers are dropped**, including
`X-Operator-Token`, `X-Auth-Token`, `X-Session-Token`, `Cookie`, `Accept`, `Accept-Encoding`,
`User-Agent` and `If-None-Match`. This is a significant and easily-missed constraint: any
dashboard feature needing `X-Operator-Token` **cannot** go through the <DASHBOARD_PORT> proxy and must call
port <COORD_PORT> directly.

**Method:** `GET` only, by design ("the dashboard widgets are read-only").

**Timeout:** 10 seconds.

**Design rationale**: the
B4/P5 widgets fetch coordinator-canonical `/api/*` paths *relative* to the superdash origin.
Forwarding the client's own `Authorization` header verbatim keeps the coordinator token off the
superdash side entirely (no env lookup, no token surfaced in superdash) while the browser still
sees a same-origin request (no CORS preflight).

**Behaviour on coordinator responses:**

| Upstream condition | Superdash response |
|---|---|
| Any 2xx/3xx | Status, `Content-Type` and body relayed verbatim. `Content-Length` recomputed. |
| `urllib.error.HTTPError` (4xx/5xx, e.g. coordinator 401/403/404) | Upstream status code, upstream `Content-Type` (default `application/json`) and upstream body relayed **faithfully**, so the widget sees the real status, not a generic 500. |
| Coordinator unreachable, connection refused, DNS failure, or >10 s | `502` with `Content-Type: application/json` and body `{"error":"superdash_proxy_upstream_failed","detail":"<python exception str>"}` |

Proxied responses do **not** receive `Access-Control-Allow-Origin` (only locally-generated JSON
does). Proxied responses do receive `Cache-Control: no-store` from the `end_headers()` override,
because the path starts with `/api/`.

Verified live: an unauthenticated `GET http://<dashboard-host>:<DASHBOARD_PORT>/api/fleet` returns
`HTTP 401 {"error":"Authentication required"}` -- the coordinator's own error, relayed.

### 2.5 Caching, compression and ETag policy

Applied in the overridden `end_headers()`, keyed on the path with the query stripped:

| Path shape | `Cache-Control` | Extra |
|---|---|---|
| `/`, `""`, or `*.html` | `no-cache, must-revalidate` | -- |
| `*.css` / `*.js` **with** a `?...v=<cache-label> query | `public, max-age=<long-lived-seconds>, immutable` | -- |
| `*.css` / `*.js` **without** `v=<cache-label> in the query | `no-cache, must-revalidate` | `ETag: "<mtime_ns>-<size>"` |
| `/api/*` | `no-store` | -- |
| anything else | (none set) | -- |

**The immutable-URL scheme is the primary cache-bust mechanism.** Every `<script src>` and
`<link href>` in `index.html` carries a `?v=<cache-label>` on ship the label changes, so the URL
changes, so the browser fetches fresh. There is no staleness window. This eliminated a ~3 s
warm-reload conditional-GET waterfall (47 JS+CSS files x ~70 ms RTT).

**ETag is deliberately `mtime_ns + size`, NOT a content hash.** Rationale preserved from
the source: every `promote-superdash-<version-label>-master.ps1` run touches mtime, so the ETag rotates
per-deploy even for unchanged content, forcing revalidation on every ship and closing the
60-second post-ship stale window that a prior `max-age=60` policy left open. **Do not
"optimise" this to a content hash without re-designing deploy-bust semantics.**

`send_head()` handles `If-None-Match` itself and returns `304` before deferring to the parent;
the parent still handles `If-Modified-Since`.

**Gzip** is applied in `_send_gzipped()` when all three conditions hold:

1. request carries `Accept-Encoding` containing `gzip` (substring match, no q-value parsing),
2. file extension is in `(".js", ".css", ".html", ".json", ".svg", ".mjs")`,
3. file size >= 512 bytes.

Compression level 6, performed in memory per request, no compressed-byte cache (the immutable
URL scheme means the browser caches the compressed response). Headers added:
`Content-Encoding: gzip`, `Vary: Accept-Encoding`, recomputed `Content-Length`, `Last-Modified`.
**Any** `OSError` during read/compress falls back silently to the uncompressed parent path --
compression never breaks a response.

### 2.6 Implementation evidence: `superdash-server.py`, full listing (genericized)

This file is small, load-bearing and cannot be reconstructed from description. Preserved in full.

```python
"""
Superdash v2 HTTP Server with /api/health + /api/version endpoints.
Drop-in replacement for `python -m http.server <DASHBOARD_PORT>`.
Serves static files + health check API + deploy-version API.
"""

import gzip
import http.server
import io
import json
import logging
import os
import re
import socket
import subprocess
import threading
import time
import socketserver

PORT = <DASHBOARD_PORT>
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
START_TIME = time.time()

#  : SSH-lane health probe for the <coordinator-host> git-over-ssh endpoint.
# W1 stood the git lane up on port <GIT_SSH_PORT> (NOT :22 -- the in-box :22 rule was
# disabled; the lane is Match-scoped sshd on <GIT_SSH_PORT>). The superdash runs on the
# same host (<coordinator-host> <coordinator-host>:<DASHBOARD_PORT>), so the probe is a local TCP connect to
# <GIT_SSH_PORT>. A live per-request probe means /api/lane_health flips RED within one
# dashboard poll cycle when the lane drops (e.g. Stop-Service sshd). Host/port
# are env-overridable for testability and for a future off-host probe.
LANE_HOST = os.environ.get("RFC599_LANE_HOST", "<host-address>")
LANE_PORT = int(os.environ.get("RFC599_LANE_PORT", "<GIT_SSH_PORT>"))
LANE_PROBE_TIMEOUT = float(os.environ.get("RFC599_LANE_PROBE_TIMEOUT", "1.5"))
_SSH_BANNER_PREFIX = b"SSH-"  # RFC 4253 server identification string


def _git(args):
    """Run a git command in DIRECTORY; return stripped stdout or '' on failure."""
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=DIRECTORY,
            capture_output=True,
            text=True,
            timeout=2,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return ""


def _probe_lane(host, port, timeout):
    """: two-tier health probe for the <coordinator-host> git-over-ssh lane.

    a peer review: a bare TCP-connect has a false-GREEN blind spot --
    port-open-but-sshd-hung reports reachable while git-over-SSH is actually
    broken (reproduced from a remote node: connect to :<GIT_SSH_PORT> succeeded
    but `ssh -T` timed out "during banner exchange"). So we add a second tier:

      tier 1  TCP connect           -> reachability + latency (fast signal)
      tier 2  read the sshd ident   -> liveness (RFC 4253: the server sends its
              "SSH-..." identification string on connect; a hung sshd accepts
              the TCP connection but never emits the banner)

    Pure-socket (no key, no `ssh` subprocess, no auth attempt) -> safe to run
    every request. Returns a dict:
      status      "green"    connect ok AND SSH banner seen
                  "degraded" connect ok but NO banner (sshd hung / wrong service)
                  "red"      connect failed (lane down/unreachable)
      connect_ok, banner_ok, latency_ms, banner, error
    """
    t0 = time.perf_counter()
    sock = None
    try:
        sock = socket.create_connection((host, port), timeout=timeout)
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    except (OSError, socket.timeout) as exc:
        return {
            "status": "red", "connect_ok": False, "banner_ok": False,
            "latency_ms": None, "banner": None,
            "error": f"connect: {type(exc).__name__}: {exc}",
        }
    try:
        sock.settimeout(timeout)
        data = sock.recv(256)
        banner = data.split(b"\r\n", 1)[0].decode("ascii", "replace") if data else ""
        if data.startswith(_SSH_BANNER_PREFIX):
            return {
                "status": "green", "connect_ok": True, "banner_ok": True,
                "latency_ms": latency_ms, "banner": banner, "error": None,
            }
        return {
            "status": "degraded", "connect_ok": True, "banner_ok": False,
            "latency_ms": latency_ms, "banner": banner,
            "error": "port open but no SSH banner (sshd hung / wrong service?)",
        }
    except (OSError, socket.timeout) as exc:
        return {
            "status": "degraded", "connect_ok": True, "banner_ok": False,
            "latency_ms": latency_ms, "banner": None,
            "error": f"banner: {type(exc).__name__}: {exc}",
        }
    finally:
        try:
            sock.close()
        except OSError:
            pass


def _read_sw_cache_version():
    """Parse CACHE_VERSION literal from sw.js (cheap regex, no JS eval).
    Returns the version string or '' if not parsable."""
    sw_path = os.path.join(DIRECTORY, "sw.js")
    try:
        with open(sw_path, "r", encoding="utf-8") as fh:
            head = fh.read(4096)
        m = re.search(r"CACHE_VERSION\s*=\s*['\"]([^'\"]+)['\"]", head)
        if m:
            return m.group(1)
    except OSError:
        pass
    return ""


# Cache these at startup -- they only change on deploy.
_GIT_SHA = _git(["rev-parse", "HEAD"])
_GIT_SHA_SHORT = _git(["rev-parse", "--short", "HEAD"])
_GIT_BRANCH = _git(["rev-parse", "--abbrev-ref", "HEAD"])
_GIT_COMMIT_TIME = _git(["log", "-1", "--format=%cI"])  # ISO 8601 strict
_SW_CACHE_VERSION = _read_sw_cache_version()
_SERVER_STARTED_AT = time.time()


# per-request perf log (jsonl) to diagnose tail latency that
# survived ThreadingTCPServer + address_string fixes.
_PERF_LOG_PATH = os.path.join(DIRECTORY, "..", "logs", "superdash-perf.jsonl")
os.makedirs(os.path.dirname(os.path.abspath(_PERF_LOG_PATH)), exist_ok=True)
_perf_logger = logging.getLogger("superdash.perf")
_perf_logger.setLevel(logging.INFO)
_perf_logger.propagate = False
if not _perf_logger.handlers:
    _h = logging.FileHandler(_PERF_LOG_PATH, encoding="utf-8")
    _h.setFormatter(logging.Formatter("%(message)s"))
    _perf_logger.addHandler(_h)

# Lightweight in-flight counter to spot serialization windows in logs.
_inflight_lock = threading.Lock()
_inflight_count = 0


class SuperdashHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def address_string(self):
        # Skip socket.getfqdn() reverse-DNS lookup (Windows: ~2s per request on
        # localhost/<host-address>). Log raw client IP instead. Per-request latency
        # drops from ~2000ms to <50ms.
        return self.client_address[0]

    def do_GET(self):
        if self.path == "/api/health":
            self._handle_health()
        elif self.path == "/api/version":
            self._handle_version()
        elif self.path == "/api/deploy_status":
            self._handle_deploy_status()
        elif self.path == "/api/lane_health":
            self._handle_lane_health()
        elif self.path.split("?", 1)[0].startswith("/api/"):
            self._proxy_to_coord()
        else:
            super().do_GET()

    def _proxy_to_coord(self):
        """ Axis B: reverse-proxy unhandled /api/* GETs to the
        coordinator on :<COORD_PORT>, forwarding the client's auth header as-is.

        The B4/P5 widgets fetch coord-canonical (hyphen) /api/* paths relative to
        the superdash origin (:<DASHBOARD_PORT>). Superdash answers a few local /api endpoints
        (health/version/deploy_status, matched BEFORE this clause) but holds no
        coord data, so anything else under /api/ is proxied to the coordinator.
        The client already sets ``Authorization: Bearer <FLEET_BEARER_TOKEN>``; forwarding it
        verbatim keeps the coord token off the superdash side (no env lookup, no
        token surfaced in superdash) and the browser sees same-origin (no CORS).
        GET-only by design -- the dashboard widgets are read-only.
        """
        import urllib.request
        import urllib.error

        target = "http://<host-address>:<COORD_PORT>" + self.path
        fwd_headers = {}
        for header_name in ("Authorization", "X-Node-Token"):
            value = self.headers.get(header_name)
            if value:
                fwd_headers[header_name] = value
        req = urllib.request.Request(target, headers=fwd_headers, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=10) as upstream:
                body = upstream.read()
                self.send_response(upstream.status)
                self.send_header(
                    "Content-Type",
                    upstream.headers.get("Content-Type", "application/json"),
                )
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as exc:
            # Relay the coordinator's own error response (e.g. 401/404) faithfully
            # so the widget sees the real upstream status, not a generic 500.
            body = exc.read() or b""
            self.send_response(exc.code)
            self.send_header(
                "Content-Type", exc.headers.get("Content-Type", "application/json")
            )
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:  # noqa: BLE001 -- coord unreachable / timeout
            body = json.dumps(
                {"error": "superdash_proxy_upstream_failed", "detail": str(exc)}
            ).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    # SWAT-candidate finding H (superdash resource-efficiency pass, 2026-08):
    # text assets (JS/CSS/HTML) were served completely uncompressed -- ~168
    # files, no build step, no bundling (per KB `superdash-architecture`).
    # Gzip cuts transfer size ~70-80% for JS/CSS/HTML with near-zero CPU cost
    # (compression happens once per request, no caching of compressed bytes
    # needed given the existing immutable-URL cache-bust scheme above already
    # makes the browser cache the compressed response itself). Gated on:
    #   (a) client sends Accept-Encoding: gzip (universal in practice, but
    #       must not blindly compress for clients that don't advertise it)
    #   (b) extension is a known-compressible text type
    #   (c) file is above a minimum size (gzip has ~20-30 byte overhead;
    #       not worth it below a few hundred bytes)
    _COMPRESSIBLE_EXTS = (".js", ".css", ".html", ".json", ".svg", ".mjs")
    _GZIP_MIN_BYTES = 512

    def _client_accepts_gzip(self):
        accept_encoding = self.headers.get("Accept-Encoding", "")
        # Simple substring check (no q-value parsing needed -- gzip is either
        # offered or not in every real browser/client seen on this dashboard).
        return "gzip" in accept_encoding.lower()

    def send_head(self):
        # Compute ETag from file stat for static assets and honor If-None-Match
        # before deferring to the parent (which still handles If-Modified-Since).
        path = self.translate_path(self.path)
        if os.path.isfile(path):
            try:
                st = os.stat(path)
                # ETag = mtime_ns + size. Intentionally NOT a content hash: every
                # `promote-superdash-v2-master.ps1` run touches mtime, so ETag
                # rotates per-deploy even on unchanged content -- forces revalidation
                # on every ship and prevents the 60s staleness-after-ship window.
                # Do NOT "optimize" by switching to content-hash without re-thinking
                # deploy-bust semantics .
                etag = f'"{st.st_mtime_ns}-{st.st_size}"'
                self._current_etag = etag
                inm = self.headers.get("If-None-Match")
                if inm and inm == etag:
                    self.send_response(304)
                    # ETag emitted via overridden end_headers() (avoids duplicate header)
                    self.end_headers()
                    return None
            except OSError:
                self._current_etag = None
                st = None

            _, ext = os.path.splitext(path)
            if (
                st is not None
                and ext.lower() in self._COMPRESSIBLE_EXTS
                and st.st_size >= self._GZIP_MIN_BYTES
                and self._client_accepts_gzip()
            ):
                return self._send_gzipped(path, st)
        else:
            self._current_etag = None
        return super().send_head()

    def _send_gzipped(self, path, st):
        """Read `path`, gzip-compress in memory, and send headers + a
        file-like object of the compressed bytes for copyfile() to stream.
        Falls back to the uncompressed parent path on ANY read/compress
        failure -- never breaks a response for the sake of a size optimization.
        """
        try:
            with open(path, "rb") as f:
                raw = f.read()
            compressed = gzip.compress(raw, compresslevel=6)
        except OSError:
            return super().send_head()

        ctype = self.guess_type(path)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(compressed)))
        self.send_header("Vary", "Accept-Encoding")
        self.send_header(
            "Last-Modified", self.date_time_string(int(st.st_mtime))
        )
        # end_headers() (overridden below) still applies the existing
        # Cache-Control/ETag policy based on self.path -- unchanged behavior,
        # only the body transfer-encoding changes.
        self.end_headers()
        return io.BytesIO(compressed)

    def end_headers(self):
        path = self.path.split("?")[0]
        if path.endswith(".html") or path == "/" or path == "":
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        elif path.endswith((".css", ".js")):
            # INVARIANT: dashboard never serves post-ship stale assets.
            # Two-mode cache policy depending on whether the URL carries an explicit
            # version query string (e.g. `?v=<build-label>`):
            #
            #   (a) URL has ?v=... cache-buster  -> immutable, 1-year max-age.
            #       The version string IS the cache-bust; on ship the URL changes,
            #       browsers fetch the new URL fresh. No staleness window possible.
            #       Eliminates the ~3s warm-reload conditional-GET waterfall
            #       (47 JS+CSS files * ~70ms RTT) measured.
            #
            #   (b) URL has no query string  -> no-cache, must-revalidate (legacy).
            #       Some assets (config.js, scripts.js, etc.) are not version-stamped;
            #       fall back to ETag-driven revalidation per the fix
            #.
            #
            # Audit hygiene: any new <script>/<link> in index.html SHOULD include ?v=N
            # so it benefits from path (a). Unversioned assets degrade gracefully to (b).
            has_version = "?" in self.path and "v=" in self.path.split("?", 1)[1]
            if has_version:
                self.send_header("Cache-Control", "public, max-age=31536000, immutable")
            else:
                self.send_header("Cache-Control", "no-cache, must-revalidate")
                etag = getattr(self, "_current_etag", None)
                if etag:
                    self.send_header("ETag", etag)
        elif path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _handle_health(self):
        uptime_seconds = round(time.time() - START_TIME, 1)
        payload = {
            "status": "ok",
            "service": "superdash-v2",
            "port": PORT,
            "uptime_seconds": uptime_seconds,
            "directory": DIRECTORY,
        }
        self._send_json(payload)

    def _handle_version(self):
        """: deploy-version stamp for OPERATOR self-diagnose.
        Returns server-side deploy facts (git SHA, branch, commit time) +
        precomputed SW cache version. Client side joins this with its
        actual SW.CACHE_VERSION, localStorage SWR rev, IndexedDB rev, and
        last-API-fetch timestamp to compute fresh/stale color."""
        now = time.time()
        payload = {
            "git_sha": _GIT_SHA,
            "git_sha_short": _GIT_SHA_SHORT,
            "git_branch": _GIT_BRANCH,
            "git_commit_time": _GIT_COMMIT_TIME,
            "sw_cache_version": _SW_CACHE_VERSION,
            "server_started_at": _SERVER_STARTED_AT,
            "server_started_iso": time.strftime(
                "%Y-%m-%dT%H:%M:%SZ", time.gmtime(_SERVER_STARTED_AT)
            ),
            "server_now": now,
            "server_uptime_seconds": round(now - _SERVER_STARTED_AT, 1),
        }
        self._send_json(payload)

    def _handle_deploy_status(self):
        """ Option C: live deploy-vs-master drift surface for
        OPERATOR-visible deploy-pending banner. Distinct from /api/version (which
        caches git facts at startup and goes stale post-promote because
        promote-superdash-v2-master.ps1 does `git reset --hard` without server
        restart). This endpoint does LIVE git lookups every request so the
        banner reflects real-time drift state.

        Fields:
          deploy_sha       - HEAD of deploy worktree (the served files)
          deploy_sha_short - 7-char abbrev
          master_sha       - current local master ref tip (where merges land)
          master_sha_short - 7-char abbrev
          drift            - bool: master != deploy
          deploy_behind    - int: commits master is AHEAD of deploy (a promote is
                             pending); 0 when not behind, -1 if git rev-list failed
          deploy_ahead     - int: commits deploy is AHEAD of master (an unmerged
                             branch is checked out in the served worktree); 0/-1 as above
          drift_commits    - int: back-compat magnitude = the non-zero direction
                             (prefers behind). 0 when drift==False; -1 on git failure
          checked_at       - server-side now() float seconds

        Drift is SYMMETRIC: the served deploy worktree can be behind master
        (normal "promote pending") OR ahead of master (a feature branch left
        checked out in the served tree). The original one-directional count
        (HEAD..master only) returned 0 in the ahead case, which the client
        rendered as a bare "?"; deploy_behind/deploy_ahead resolve that.
        """
        deploy_sha = _git(["rev-parse", "HEAD"])
        master_sha = _git(["rev-parse", "master"])
        drift = bool(deploy_sha and master_sha and deploy_sha != master_sha)

        def _count(rng):
            count_str = _git(["rev-list", "--count", rng])
            try:
                return int(count_str) if count_str else -1
            except ValueError:
                return -1

        deploy_behind = _count("HEAD..master") if drift else 0
        deploy_ahead = _count("master..HEAD") if drift else 0
        if deploy_behind and deploy_behind > 0:
            drift_commits = deploy_behind
        elif deploy_ahead and deploy_ahead > 0:
            drift_commits = deploy_ahead
        else:
            drift_commits = -1 if drift else 0
        payload = {
            "deploy_sha": deploy_sha,
            "deploy_sha_short": deploy_sha[:7] if deploy_sha else "",
            "master_sha": master_sha,
            "master_sha_short": master_sha[:7] if master_sha else "",
            "drift": drift,
            "deploy_behind": deploy_behind,
            "deploy_ahead": deploy_ahead,
            "drift_commits": drift_commits,
            "checked_at": time.time(),
        }
        self._send_json(payload)

    def _handle_lane_health(self):
        """ : live two-tier SSH-lane health probe for the <coordinator-host>
        git-over-ssh endpoint (port <GIT_SSH_PORT>). Runs fresh every request so the
        dashboard flips off-green within one poll cycle when the lane drops.

        Two tiers close the false-GREEN blind spot:
          status "green"    = TCP connect AND SSH banner (lane truly serving)
                 "degraded" = connect ok but no SSH banner (sshd hung) -> NOT green
                 "red"      = connect failed (lane down; e.g. Stop-Service sshd)
        `healthy` is the binary RED signal for the dashboard (green only).
        Keyed on port <GIT_SSH_PORT> (the live git lane), NOT :22 (W1 disabled in-box :22).
        """
        r = _probe_lane(LANE_HOST, LANE_PORT, LANE_PROBE_TIMEOUT)
        payload = {
            "lane": "git-ssh-<host-id>",
            "host": LANE_HOST,
            "port": LANE_PORT,
            "status": r["status"],               # green | degraded | red
            "healthy": r["status"] == "green",   # binary RED signal for the dash
            "connect_ok": r["connect_ok"],
            "banner_ok": r["banner_ok"],
            "banner": r["banner"],
            "latency_ms": r["latency_ms"],
            "error": r["error"],
            "probe_timeout_s": LANE_PROBE_TIMEOUT,
            "checked_at": time.time(),
        }
        self._send_json(payload)

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.write(body)

    def write(self, data):
        self.wfile.write(data)

    def log_message(self, format, *args):
        # Suppress noisy per-request logging
        pass

    def handle_one_request(self):
        # perf instrumentation: capture per-request total + in-flight count
        # so log analysis can spot serialization windows. recv = parse_request,
        # handler = do_GET / send_head, send = wfile flush. We only measure
        # total + parse_done because finer phases require deeper overrides.
        global _inflight_count
        t0 = time.perf_counter()
        t_parse = None
        with _inflight_lock:
            _inflight_count += 1
            inflight_at_start = _inflight_count
        try:
            # Hook parse-done timing by overriding parse_request via wrapper.
            orig_parse = self.parse_request

            def timed_parse():
                ok = orig_parse()
                nonlocal t_parse
                t_parse = time.perf_counter()
                return ok

            self.parse_request = timed_parse  # type: ignore
            super().handle_one_request()
        finally:
            t_end = time.perf_counter()
            with _inflight_lock:
                _inflight_count -= 1
                inflight_at_end = _inflight_count
            try:
                method = getattr(self, "command", None)
                path = getattr(self, "path", None)
                status = getattr(self, "_perf_status", None)
                if method and path:
                    ms_total = round((t_end - t0) * 1000, 2)
                    ms_parse = round((t_parse - t0) * 1000, 2) if t_parse else None
                    ms_handler = round((t_end - t_parse) * 1000, 2) if t_parse else None
                    _perf_logger.info(json.dumps({
                        "ts": round(time.time(), 3),
                        "method": method,
                        "path": path[:200],
                        "status": status,
                        "ms_total": ms_total,
                        "ms_parse": ms_parse,
                        "ms_handler": ms_handler,
                        "inflight_start": inflight_at_start,
                        "inflight_end": inflight_at_end,
                        "thread": threading.get_ident(),
                    }))
            except Exception:
                pass

    def send_response(self, code, message=None):
        self._perf_status = code
        super().send_response(code, message)


class ReuseTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    # bump from default 5 to handle 8+ browser parallel sockets
    # without TCP-SYN-queue overflow + retransmit-delay tail.
    request_queue_size = 128


if __name__ == "__main__":
    print(f"Superdash v2 server starting on port {PORT}")
    print(f"Serving: {DIRECTORY}")
    print(f"Health:  http://<host-address>:{PORT}/api/health")
    print(f"Version: http://<host-address>:{PORT}/api/version")
    print(f"Deploy:  git={_GIT_SHA_SHORT or '??'} branch={_GIT_BRANCH or '??'} sw={_SW_CACHE_VERSION or '??'}")
    print(f"Lane:    http://<host-address>:{PORT}/api/lane_health (probes git-ssh {LANE_HOST}:{LANE_PORT})")
    with ReuseTCPServer(("", PORT), SuperdashHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down.")
```

> Preservation note: the docstring of `_proxy_to_coord` originally contained a literal example
> `Authorization` header value. It has been replaced with the placeholder
> `<FLEET_BEARER_TOKEN>` per the no-secrets rule. Nothing else in this file was altered.

### 2.7 Unresolved (server)

* Whether any process supervisor other than NSSM has ever been used in production.
* Whether the `logs/` sibling directory is rotated; no rotation logic exists in the server.

---

## 3. Endpoint contract: endpoints Superdash itself implements

All four are `GET`, all respond `200` with `Content-Type: application/json`,
`Access-Control-Allow-Origin: *` and `Cache-Control: no-store`. None require authentication.
None have error paths of their own -- git or socket failures are encoded in the payload fields
rather than in the HTTP status.

### 3.1 `GET /api/health`

| Field | Type | Meaning |
|---|---|---|
| `status` | string | Always `"ok"` if the process is answering. |
| `service` | string | Always `"superdash-<version-label>"`. |
| `port` | int | Always `<DASHBOARD_PORT>`. |
| `uptime_seconds` | float | Seconds since module import, 1 dp. |
| `directory` | string | **Absolute path of the served tree.** The deploy verifier asserts on this. |

Live capture:

```json
{"status":"ok","service":"superdash-<version-label>","port":"<DASHBOARD_PORT>","uptime_seconds":"<seconds>","directory":"<shared-root>\superdash-<version-label>-deploy"}
```

### 3.2 `GET /api/version`

Deploy provenance stamp. Git facts are **cached at process start** and go
stale after a file-only promote; `/api/deploy_status` exists precisely to cover that.

| Field | Type | Meaning |
|---|---|---|
| `git_sha` | string | Full HEAD SHA of the served worktree at process start. `""` on git failure. |
| `git_sha_short` | string | `git rev-parse --short HEAD`. |
| `git_branch` | string | `git rev-parse --abbrev-ref HEAD`. Reads `"HEAD"` when the served tree is a detached worktree -- which is the normal production state. |
| `git_commit_time` | string | `git log -1 --format=%cI`, strict ISO 8601 with offset. |
| `sw_cache_version` | string | `CACHE_VERSION` literal regex-parsed out of the first 4096 bytes of `sw.js`. |
| `server_started_at` | float | Unix epoch seconds. |
| `server_started_iso` | string | `%Y-%m-%dT%H:%M:%SZ` (UTC). |
| `server_now` | float | Unix epoch seconds at request time. |
| `server_uptime_seconds` | float | 1 dp. |

Live capture:

```json
{"git_sha":"<git-sha>","git_sha_short":"<id>","git_branch":"HEAD","git_commit_time":"<date>","sw_cache_version":"zb-superdash-<version-label>-precache-sync","server_started_at":"<epoch-seconds>","server_started_iso":"<timestamp>","server_now":"<epoch-seconds>","server_uptime_seconds":"<seconds>"}
```

### 3.3 `GET /api/deploy_status`

Live (per-request) git drift between the served worktree and the local `master` ref.

| Field | Type | Meaning |
|---|---|---|
| `deploy_sha` / `deploy_sha_short` | string | HEAD of the served worktree, live. |
| `master_sha` / `master_sha_short` | string | Tip of local `master`. |
| `drift` | bool | `master_sha != deploy_sha` (and both non-empty). |
| `deploy_behind` | int | `git rev-list --count HEAD..master`. Promote pending. `0` if no drift, `-1` on git failure. |
| `deploy_ahead` | int | `git rev-list --count master..HEAD`. An unmerged branch is checked out in the served tree. |
| `drift_commits` | int | Back-compat magnitude: prefers `deploy_behind`, else `deploy_ahead`, else `0` (no drift) or `-1` (git failure). |
| `checked_at` | float | Unix epoch seconds. |

Drift is **symmetric** by design. The original one-directional count returned `0` in the
"ahead" case, which the client rendered as a bare `?`.

Live capture (convergent):

```json
{"deploy_sha":"<git-sha>","deploy_sha_short":"<id>","master_sha":"<git-sha>","master_sha_short":"<id>","drift":false,"deploy_behind":0,"deploy_ahead":0,"drift_commits":0,"checked_at":"<timestamp>"}
```

### 3.4 `GET /api/lane_health`

lane-probe design two-tier probe of the git-over-SSH lane. Runs a live socket probe **on every
request**, so the dashboard flips off-green within one poll cycle.

| Field | Type | Meaning |
|---|---|---|
| `lane` | string | Always `"git-ssh-lane"`. |
| `host` / `port` | string / int | From `RFC599_LANE_HOST` / `RFC599_LANE_PORT`. Defaults `<host-address>` / `<GIT_SSH_PORT>`. |
| `status` | string | `green` \| `degraded` \| `red` -- see table below. |
| `healthy` | bool | `status == "green"`. The binary RED signal for the dashboard. |
| `connect_ok` | bool | Tier 1: TCP connect succeeded. |
| `banner_ok` | bool | Tier 2: an `SSH-`-prefixed identification string was received. |
| `banner` | string\|null | First CRLF-delimited line received, ASCII with replacement. |
| `latency_ms` | float\|null | TCP connect time, 2 dp. `null` when connect failed. |
| `error` | string\|null | Human-readable failure detail. |
| `probe_timeout_s` | float | Effective per-tier timeout. |
| `checked_at` | float | Unix epoch seconds. |

| `status` | Condition | Operational meaning |
|---|---|---|
| `green` | connect OK **and** SSH banner received | Lane is genuinely serving. |
| `degraded` | connect OK, no banner within timeout | **sshd hung or wrong service on the port.** This is the false-GREEN case a bare TCP probe would miss (reproduced from a remote node: TCP connect to `:<GIT_SSH_PORT>` succeeded but `ssh -T` timed out during banner exchange). |
| `red` | connect failed | Lane down / unreachable (e.g. `Stop-Service sshd`). |

Live capture:

```json
{"lane":"git-ssh-lane","host":"<host-address>","port":<GIT_SSH_PORT>,"status":"green","healthy":true,"connect_ok":true,"banner_ok":true,"banner":"SSH-2.0-OpenSSH_for_Windows_<version>","latency_ms":"<latency-ms>","error":null,"probe_timeout_s":1.5,"checked_at":"<timestamp>"}
```

### 3.5 Everything else

There is **no** `POST`, `PUT`, `PATCH` or `DELETE` handler on port <DASHBOARD_PORT>. All writes go directly
to the coordinator on port <COORD_PORT> from the browser.

---

## 4. Browser-to-backend route map

### 4.1 Current contract: two distinct network paths

This is the single most confusing aspect of Superdash and the hardest part of the system to trace. **The
browser uses two different origins for `/api/*`, chosen per module.**

| Path | Used by | URL form | Auth carried |
|---|---|---|---|
| **A. Direct to coordinator** | everything that goes through `js/api.js` (`API.get`, `API.post`, `API.put`, `API.getRaw`, `API.operatorPost`, `API.nodePut`) | absolute: `CONFIG.API_BASE + '/api/...'` where `API_BASE = 'http://' + window.location.hostname + ':<COORD_PORT>'` | `Authorization: <redacted> <FLEET_BEARER_TOKEN>`, plus `X-Operator-Token` / `X-Node-Token` where applicable |
| **B. Through the superdash proxy** | widgets that `fetch()` a **relative** `/api/...` URL: `js/deploy-pending-banner.js`, `js/version-stamp.js`, `js/tool-cost-panel.js`, `js/resilience-card.js`, `js/resilience-incidents.js`, `js/failure-episodes.js` | relative: `/api/...` -> resolves to `:<DASHBOARD_PORT>` -> proxied to `:<COORD_PORT>` | whatever headers the widget sets; **only `Authorization` and `X-Node-Token` survive the proxy** |

Consequence: the coordinator must accept cross-origin requests from `http://<host>:<DASHBOARD_PORT>` for
path A to work at all (the dashboard origin is `:<DASHBOARD_PORT>` but it calls `:<COORD_PORT>`). Path B exists
specifically to avoid CORS for widgets added later.

A third origin exists for images only: `js/images.js` uses
`IMAGE_BASE = 'http://' + window.location.hostname + ':<FILES_PORT>'` (the standalone image service).

### 4.2 Page inventory

| Page | Entry URL | Scripts loaded | Backend calls |
|---|---|---|---|
| Superdash cockpit | `/` or `/index.html` | 52 modules + `marked.min.js` | see 4.4 |
| Fleet Recovery Console | `/fleet-recovery.html` | `js/config.js`, `js/recovery.js` only | `/api/recovery/*`, `/api/topology` |
| CAIRN OPERATOR console | `/operator.html` | self-contained inline JS | `/api/health` (auth probe) plus CAIRN write endpoints with `X-Node-Token` / `X-Operator-Token` |

Neither secondary page is linked from `index.html`. Discovery is by direct URL only.

### 4.3 SSE reality

**The Superdash browser application does not consume the coordinator's `__dashboard__` SSE
channel.** Verified by reading `js/sse.js` end-to-end and by grepping the whole `js/` tree for
`EventSource`, `/api/stream` and `__dashboard__`.

What `js/sse.js` actually does:

1. Issues a probe request to `GET /api/events?token=<FLEET_BEARER_TOKEN>` and inspects the
   response `Content-Type` for `text/event-stream`.
2. The coordinator's `GET /api/events` is **not** an SSE endpoint -- it is a plain JSON endpoint
   returning `{ "events": [...], "count": N }` with params `limit` (default 50), `since_id` and
   `event_type`. So the probe **always** fails the content-type check.
3. The module therefore falls back permanently to **poll mode**: `_pollInterval = 10000` ms,
   repeatedly `GET /api/events?token=...&since_id=<_lastEventId>&limit=50`, advancing
   `_lastEventId` from the highest event id seen.
4. Received events are dispatched through `SSE.handleEvent`, which `js/cairn-cache.js`
   monkey-patches in order to invalidate its IndexedDB caches.

Footer `SSE:` pill (`#status-sse`) state machine:

| State | Condition |
|---|---|
| `connected` | a genuine `text/event-stream` was detected (does not occur against the current coordinator) |
| `degraded (poll)` | **the normal steady state** -- polling `/api/events` every 10 s |
| `reconnecting` | a poll request errored |
| `offline` | `maxRetries` (10) consecutive failures |

`/api/stream` appears in the Superdash front end **only as two documentation rows inside the
authority gate registry** in `js/guestbook.js` -- it is described to the operator but never
opened.

`sw.js` explicitly refuses to intercept both `/api/events` and `/api/stream*`, so a future
switch to real SSE will work without service-worker changes.

#### The coordinator side of the channel (for completeness)

Traced in `the coordinator repository` @ `<git-sha>`:

| Element | Location | Behaviour |
|---|---|---|
| Queue | `coordinator/cairn.py` (`_queue_notification`) | Every CAIRN mutation inserts a row into table `cairn_outbox` with `surface='dashboard'`, `kind=<event_type>`, a JSON payload and a `correlation_id`. |
| Relay | `coordinator/server.py` | ~1 s loop routes `surface='dashboard'` rows to `_dashboard_outbox_dispatcher`. |
| Dispatcher | `coordinator/server.py` | Publishes onto the in-memory channel named **`__dashboard__`**. |
| Channel | `coordinator/notifications.py`, `:22` | 4096-entry per-channel replay ring, monotonic SSE ids. |
| Drainer | `coordinator/server.py` | FIFO, dispatch-before-mark-delivered, retry with timeout, dead-letter after 5 attempts. |
| Consumer surface | `GET /api/stream` | True `text/event-stream`, supports `Last-Event-ID` replay and ping keepalives. |

True SSE endpoints on the coordinator: `GET /api/stream`, `GET /api/stream/{node_id}`,
`GET /events/{node_id}`, `GET /events?nodes=A,B`. A `/sse` prefix is listed in the auth
middleware but **no `/sse` route exists**.

The 22 event kinds queued to `surface='dashboard'`:

```
seed_created                 rfc_created                rfc_meta_set
rfc_reparented               rfc_short_description_set  rfc_tags_set
rfc_revised                  rfc_status_set             rfc_shipped
rfc_archived                 rfc_council_summoned       rfc_promoted
rfc_demoted                  wave_opened                wave_closed_with_synthesis
synthesis_published          solidplan_attached         rfc_voted
rfc_ratified                 seed_starred_promoted      response_starred
operator_frame               rfc_renamed
```

> **Rebuild implication.** If you rebuild only the website, you get the current behaviour
> (10-second polling of `/api/events`). If you want live push, point `js/sse.js` at
> `GET /api/stream?token=<FLEET_BEARER_TOKEN>` with an `EventSource`; the server side already
> exists and is the only place the `__dashboard__` channel is exposed.

### 4.4 View-to-endpoint map

Tab routing is `App.switchTab()` in `js/app.js`, driven by `data-tab` attributes in
`index.html`.

| `data-tab` | Label | Renderer | Primary endpoints | Renders |
|---|---|---|---|---|
| `taskboard` | Tasks (default) | `TaskBoard.renderPanel()` | `/api/tasks?include_completed=false`, `/api/tasks?include_completed=true`, `/api/swats?stage=open\|in_review\|fixed&limit=200`, `/api/swats/count` | Kanban columns of fleet tasks and SWATs, with a resizable height. |
| `review-pipeline` | Review | `ReviewPipeline.renderPanel()` | `/api/review-pipeline` | Items awaiting review ACK. |
| `cairn` | CAIRN | `Cairn.toggle()` -- a **drawer**, not a panel | `/api/cairn/trail`, `/api/cairn/filter?status=...&limit=30`, `/api/cairn/kb?limit=500`, `/api/cairn/scratch`, `/api/cairn/search`, `/api/cairn/approval_events` | Four sub-tabs: RFC board, Scratch, KB, Archive. |
| `messages` | Messages | `Messaging.renderPanel()` | `/api/messages/recent?limit=100` | Fleet message feed. |
| `guestbook` | Authorization | `Guestbook.renderPanel()` | `/api/molt/history`, `/api/opa/active`, `/api/opa/audit?limit=10` | OPA grants, MOLT history, and the static authority gate registry (section 7.6). |
| `files` | Files | `FilesPanel.renderPanel()` | `/api/files/*`, `/api/scripts`, plus image service on `:<FILES_PORT>` | Files / Docs / Scripts / Images sub-views. |
| `notifications` | Notifications | `NotificationsPanel.renderPanel()` | client-side queue fed by `SSE.handleEvent` | Notification list; drives the header bell badge. |
| `corrections` | Lessons | `Corrections.load()` then `renderPanel()` | `/api/corrections`, `/api/tool-failures` | Lessons learned and tool-failure rollups. |
| `overview` | Fleet (overflow drawer) | `Panels.showFleetOverview()` + `FleetSections` | `/api/fleet`, `/api/workload`, `/api/topology`, `/api/recovery/*` | Collapsible sections including `bus` and `recovery`. |
| `merit` | Merit (overflow) | `Merit.renderPanel()` | `/api/merit`, `/api/roles` | Merit/role standings. |
| `gary` | Gary Status (overflow) | `GaryPanel.renderPanel()` | Gary status endpoint | an RFC: **nav-only** -- never auto-rendered and never polled. |
| `bus` | (redirect) | -- | -- | Redirects to `overview` then `FleetSections.expand('bus')`. |
| `recovery` | (redirect) | -- | -- | Redirects to `overview` then `FleetSections.expand('recovery')`. |
| (implicit) node click | -- | `App.showNodeMessages()` -> `Messages.renderChat()` | `/api/messages/*` for that node | Per-node chat view. |

Always-on surfaces (rendered regardless of active tab):

| Surface | DOM id | Module | Endpoint | Notes |
|---|---|---|---|---|
| Node list | `#node-nav-list` | `js/nodes.js` | `/api/fleet`, `/api/dashboard/heartbeats` | Canonical liveness surface (replaced the BB pill). |
| Fleet Health card | `#fleet-health` | `js/nodes.js` | `/api/fleet`, `/api/health` | In the left nav (moved there). |
| Active RFCs | `#cairn-recent` | `js/cairn-recent.js` | `/api/cairn/filter?status=ideation,rfc,in_round,ratified&limit=30` | Intel card. Invalidated by CAIRN events. |
| Resilience | `#resilience-card` | `js/resilience-card.js` | `/api/resilience_incidents` (relative -> proxy) | **Feature-flagged OFF.** Enable with `localStorage.setItem('resilienceCard','1')`. |
| Failure Episodes | `#failure-episodes-card` | `js/failure-episodes.js` | `/api/failure-episodes` | Always on. |
| Tool Cost | `#tool-cost-card` | `js/tool-cost-panel.js` | `/api/tool_costs` | **Default ON** via `window.TOOL_COST_WIDGET_ENABLED = true` (an RFC-P5 AC18). |
| OPERATOR Feedback | `#feedback-box` | `js/feedback.js` | CAIRN scratch write | "Scratch it" quick-note box. |
| Header stats | `#stat-tasks`, `#stat-events`, `#stat-uptime`, `#stat-fleet-refresh` | `js/app.js` | `/api/tasks`, `/api/events`, `/api/health` | `#stat-fleet-refresh` shows time since last fresh `/api/fleet`. |

Footer status bar:

| DOM id | Source | Meaning |
|---|---|---|
| `#status-coordinator` | `/api/health` on the coordinator | Coordinator reachability. |
| `#status-db` | coordinator health payload | Database status. |
| `#status-sw` | `navigator.serviceWorker` | `active` / `insecure` (when `!window.isSecureContext`) / `none`. |
| `#status-build` | **`/api/version` (superdash-local)**, via `js/version-stamp.js` | Build stamp; colour computed by joining server git facts with the live SW cache version, localStorage rev and IndexedDB rev. Clickable for diagnostics. |
| `#status-deploy` | **`/api/deploy_status` (superdash-local)**, via `js/deploy-pending-banner.js` | Deploy drift pill. |
| `#status-sse` | `js/sse.js` | See 4.3. Normally `degraded (poll)`. |
| `#status-molt` | hidden (`display:none`) | Retired . |
| `#status-cairn` | `js/cairn.js` | CAIRN drawer toggle. |
| `#live-dot` / `#status-live-text` | `js/app.js` | Global connected/degraded indicator. |

### 4.5 Per-module endpoint index

Derived by grepping each `js/*.js` module for `/api/` literals.

| Module | Endpoints referenced |
|---|---|
| `js/app.js` | `/api/fleet`, `/api/health`, `/api/dashboard/heartbeats` |
| `js/nodes.js` | `/api/fleet`, `/api/dashboard/heartbeats` |
| `js/taskboard.js` | `/api/tasks`, `/api/swats`, `/api/swats/count` |
| `js/review-pipeline.js` | `/api/review-pipeline` |
| `js/messaging.js`, `js/messages.js` | `/api/messages/recent`, `/api/messages/*` |
| `js/broadcast.js` | `/api/messages` (broadcast) |
| `js/guestbook.js` | `/api/molt/history`, `/api/opa/active`, `/api/opa/audit` |
| `js/merit.js` | `/api/merit`, `/api/roles` |
| `js/motd.js` | `/api/motd` |
| `js/corrections.js` | `/api/corrections` |
| `js/tool-failures.js` | `/api/tool-failures` |
| `js/boomerang.js` | `/api/boomerangs` |
| `js/recovery.js`, `js/recovery-status-panel.js` | `/api/recovery/*`, `/api/topology` |
| `js/bus-panel.js` | `/api/fleet` (plus breathbus hosts from `CONFIG.BREATHBUS`) |
| `js/fleet-sections.js` | `/api/fleet`, `/api/workload` |
| `js/tool-cost-panel.js` | `/api/tool_costs` |
| `js/failure-episodes.js` | `/api/failure-episodes`, `/api/resilience_incidents` |
| `js/resilience-card.js`, `js/resilience-incidents.js` | `/api/resilience_incidents` |
| `js/cairn*.js` | `/api/cairn/trail`, `/api/cairn/filter`, `/api/cairn/recent`, `/api/cairn/kb`, `/api/cairn/scratch`, `/api/cairn/search`, `/api/cairn/approval_events`, plus CAIRN write verbs (`star`, `signal`, `frame`, `seed`, `transition`, `rfc/{id}/respond`, `/ratify`, `/notes`) |
| `js/docs.js`, `js/scripts.js`, `js/files-panel.js` | `/api/files/*`, `/api/scripts` |
| `js/images.js` | image service on `:<FILES_PORT>` (not the coordinator) |
| `js/sse.js` | `/api/events` |
| `js/version-stamp.js` | `/api/version` (superdash-local) |
| `js/deploy-pending-banner.js` | `/api/deploy_status` (superdash-local) |
| `js/deploy.js` | `/api/deploy-status` (coordinator, hyphenated -- a **different** endpoint) |

#### Known endpoint-name drift (real, verified)

| Client uses | Coordinator implements | Status |
|---|---|---|
| `/api/resilience_incidents` (underscore) | `/api/resilience-incidents` (hyphen) at `coordinator/server.py` | **Mismatch.** No compatibility alias was found. Unresolved -- see section 12. |
| `/api/deploy-status` (hyphen, `js/deploy.js`) | coordinator endpoint | Distinct from the superdash-local `/api/deploy_status` (underscore). Two different endpoints with near-identical names. |

### 4.6 Unresolved (route map)

* Response shapes for `/api/merit`, `/api/roles`, `/api/motd`, `/api/corrections`,
  `/api/tool-failures`, `/api/failure-episodes`, `/api/review-pipeline`, `/api/boomerangs`,
  `/api/recovery/*`, `/api/topology`, `/api/scripts`, `/api/files/*`, `/api/cairn/filter`,
  `/api/cairn/recent` and `/api/cairn/approval_events` were not individually confirmed against
  coordinator source.
* Whether the `/api/resilience_incidents` mismatch is currently failing silently in the browser
  (the card is default-hidden, which would mask it).

---

## 5. Front-end architecture

### 5.1 Current contract

* **No build step. No bundler. No transpiler. No framework.** Files are served exactly as they
  exist on disk. `npm install` is needed only to run the Playwright tests.
* **Globals-based module pattern.** Every module declares one `var` global
  (`var API`, `var App`, `var SSE`, `var FleetState`, `var Cairn`, ...) in ES5-compatible syntax.
  Load order in `index.html` is the dependency order and is load-bearing.
* **All 52 module scripts are `defer`.** `marked.min.js` is the sole non-deferred script.
  Because `defer` scripts execute after parsing and before `DOMContentLoaded`, the trailing
  inline bootstrap must itself wait for `DOMContentLoaded`:

  ```html
  <script>
  document.addEventListener('DOMContentLoaded', function() { PerfGuard.init(); });
  </script>
  ```

  Without that wrapper the bare inline script runs at parse time, before any deferred script,
  and throws `PerfGuard is not defined`.
* **Cache-busting is by `?v=<cache-label>` on every `<script src>` and `<link href>`**, paired with
  the server's `immutable` policy (section 2.5) and policed by `scripts/Lint-CacheStamps.ps1`.

### 5.2 Implementation evidence: `index.html` asset manifest (genericized)

The stylesheet block, preserved in design order -- it encodes both the cascade order and the current
cache-bust labels:

```html
<script src="marked.min.js?v=<cache-label>"></script>
<link rel="stylesheet" href="css/base.css?v=<cache-label>">
<link rel="stylesheet" href="css/components.css?v=<cache-label>">
<link rel="stylesheet" href="css/cairn.css?v=<cache-label>">
<link rel="stylesheet" href="css/responsive.css?v=<cache-label>">
<link rel="stylesheet" href="css/messaging.css?v=<cache-label>">
<link rel="stylesheet" href="css/scratch-threads.css?v=<cache-label>">
<link rel="stylesheet" href="css/scratch-limits.css?v=<cache-label>">
<link rel="stylesheet" href="css/bus-panel.css?v=<cache-label>">
<link rel="stylesheet" href="css/recovery-panel.css?v=<cache-label>">
<link rel="stylesheet" href="css/fleet-sections.css?v=<cache-label>">
<link rel="stylesheet" href="css/merit.css?v=<cache-label>">
<link rel="stylesheet" href="css/corrections.css?v=<cache-label>">
<link rel="stylesheet" href="css/overrides.css?v=<cache-label>">
<link rel="stylesheet" href="css/chat.css?v=<cache-label>">
<link rel="stylesheet" href="css/tool-cost-panel.css?v=<cache-label>">
<link rel="stylesheet" href="css/resilience-card.css?v=<cache-label>">
<link rel="stylesheet" href="css/failure-episodes.css?v=<cache-label>">
<link rel="stylesheet" href="css/deploy-pending-banner.css?v=<cache-label>">
<link rel="stylesheet" href="css/electric-border.css?v=<cache-label>">
<link rel="stylesheet" href="css/gary-panel.css?v=<cache-label>">
```

The script block, preserved in design order -- **this is the canonical module load order**:

```html
<script src="js/config.js?v=<cache-label>" defer></script>
<script src="js/api.js?v=<cache-label>" defer></script>
<script src="js/datastore.js?v=<cache-label>" defer></script>
<script src="js/components.js?v=<cache-label>" defer></script>
<script src="js/api-resilience.js?v=<cache-label>" defer></script>
<script src="js/notify.js?v=<cache-label>" defer></script>
<script src="js/notifications-panel.js?v=<cache-label>" defer></script>
<script src="js/nodes.js?v=<cache-label>" defer></script>
<script src="js/panels.js?v=<cache-label>" defer></script>
<script src="js/messages.js?v=<cache-label>" defer></script>
<script src="js/docs.js?v=<cache-label>" defer></script>
<script src="js/scripts.js?v=<cache-label>" defer></script>
<script src="js/broadcast.js?v=<cache-label>" defer></script>
<script src="js/motd.js?v=<cache-label>" defer></script>
<script src="js/messaging.js?v=<cache-label>" defer></script>
<script src="js/taskboard.js?v=<cache-label>" defer></script>
<script src="js/layout-resizer.js?v=<cache-label>" defer></script>
<script src="js/guestbook.js?v=<cache-label>" defer></script>
<script src="js/cairn-panel.js?v=<cache-label>" defer></script>
<script src="js/images.js?v=<cache-label>" defer></script>
<script src="js/files-panel.js?v=<cache-label>" defer></script>
<script src="js/cairn.js?v=<cache-label>" defer></script>
<script src="js/cairn-board.js?v=<cache-label>" defer></script>
<script src="js/cairn-scratch.js?v=<cache-label>" defer></script>
<script src="js/scratch-threads.js?v=<cache-label>" defer></script>
<script src="js/scratch-limits.js?v=<cache-label>" defer></script>
<script src="js/cairn-kb.js?v=<cache-label>" defer></script>
<script src="js/cairn-search.js?v=<cache-label>" defer></script>
<script src="js/cairn-cache.js?v=<cache-label>" defer></script>
<script src="js/approval-throughline.js?v=<cache-label>" defer></script>
<script src="js/cairn-recent.js?v=<cache-label>" defer></script>
<script src="js/bus-panel.js?v=<cache-label>" defer></script>
<!-- bb-pill.js orphaned (the analyst node, OPERATOR-direct): BB header widget removed; node list is the canonical liveness surface. -->
<script src="js/recovery-status-panel.js?v=<cache-label>" defer></script>
<script src="js/gary-panel.js?v=<cache-label>" defer></script>
<script src="js/tool-cost-panel.js?v=<cache-label>" defer></script>
<script src="js/resilience-incidents.js?v=<cache-label>" defer></script>
<script src="js/resilience-card.js?v=<cache-label>" defer></script>
<script src="js/failure-episodes.js?v=<cache-label>" defer></script>
<script src="js/fleet-sections.js?v=<cache-label>" defer></script>
<script src="js/merit.js?v=<cache-label>" defer></script>
<script src="js/boomerang.js?v=<cache-label>" defer></script>
<script src="js/tool-failures.js?v=<cache-label>" defer></script>
<script src="js/corrections.js?v=<cache-label>" defer></script>
<script src="js/deploy.js?v=<cache-label>" defer></script>
<script src="js/deploy-pending-banner.js?v=<cache-label>" defer></script>
<script src="js/feedback.js?v=<cache-label>" defer></script>
<script src="js/sse.js?v=<cache-label>" defer></script>
<script src="js/boot-loader.js?v=<cache-label>" defer></script>
<script src="js/review-pipeline.js?v=<cache-label>" defer></script>
<script src="js/app.js?v=<cache-label>" defer></script>
<script src="js/perf-guard.js?v=<cache-label>" defer></script>
<script src="js/version-stamp.js?v=<cache-label>" defer></script>
```

Page skeleton (structural summary of the `<body>`):

```
div.ambient                       ambient background animation layer
div.grid-overlay                  grid texture layer
svg.electric-border-svg           hidden shared feTurbulence filter (?electric=1 accent)
div.cockpit
  header.header                   brand + pulse + boot-loader + 4 stats + clock + bell + refresh + nav toggle
  nav.nav#node-nav                #node-nav-list  +  .intel-card.nav-fleet-health (#fleet-health)
  main.main
    div.main-tabs#main-tabs       8 visible tabs + .tabs-overflow-wrap (3 legacy items)
    div.glass-panel#main-panel    .panel-header (#main-panel-title, #main-panel-badge)
                                  .main-content#main-content   <- every tab renders here
  button#taskboard-height-resizer draggable separator, aria-valuemin 360 / aria-valuemax 780
  aside.intel                     MOLT Control (display:none) | Active RFCs | Resilience (hidden)
                                  | Failure Episodes | Tool Cost | OPERATOR Feedback
  footer.status-bar               9 status items (see 4.4) + .status-live
div.cairn-overlay#cairn-overlay
div.cairn-drawer#cairn-drawer     header (brand, 4 cairn-tabs, filter bar, close) + #cairn-body
```

### 5.3 State handling: the four-layer cache stack

This stack is deliberate. Each layer solves a different failure mode. **Do not collapse it.**

| Layer | Module | Storage | Purpose |
|---|---|---|---|
| L1 | `js/datastore.js` (`FleetState`) | in-memory | Endpoint registry with per-endpoint `maxAgeMs` / `pollIntervalMs` / `critical`; dedups in-flight promises; subscriber-driven polling; pause/resume via `PerfGuard`. |
| L2 | `js/api-resilience.js` (`APICache`) | `localStorage`, key prefixes `zb_cache_` and `zb_meta_` | Survives reload. Retry/backoff, stale-while-revalidate, maintenance detection. |
| L3 | `sw.js` | Cache API (`zb-superdash-<version-label>-precache-sync`, `zb-api-<version-label>`) | Survives offline. Network-first for both static and API. |
| L4 | `js/cairn-cache.js` | IndexedDB `zb_cairn_cache` <version-label> | CAIRN-specific bulk data + offline client-side search. Stores: `trail`, `forums`, `kb`, `kbList`, `scratch`, `meta`. |

#### L1: `FleetState` endpoint registry

| Endpoint | `maxAgeMs` | `pollIntervalMs` | `critical` |
|---|---:|---:|---|
| `/api/fleet` | 15000 | yes |
| `/api/health` | 15000 | yes |
| `/api/dashboard/heartbeats` | 15000 | yes |
| `/api/tasks?include_completed=false` | 15000 | no |
| `/api/tasks?include_completed=true` | 15000 | no |
| `/api/cairn/recent` | 15000 | no |
| `/api/cairn/filter?...` | 15000 | no |
| `/api/boomerangs` | 15000 | no |
| `/api/review-pipeline` | 15000 | no |
| `/api/molt/status` | 30000 | no |
| `/api/workload` | 30000 | no |
| `/api/opa/active` | 30000 | no |
| `/api/opa/audit?limit=10` | 30000 | no |
| `/api/messages/recent?limit=100` | 30000 | no |
| `/api/cairn/trail` | 15000 | no |
| `/api/cairn/kb?limit=500` | 60000 | no |
| `/api/cairn/scratch` | 30000 | no |
| `/api/molt/history` | 60000 | no |

`var DataStore = FleetState;` is retained as a back-compat alias.

#### L2: `APICache` rules

* Key prefixes `zb_cache_` (payload) and `zb_meta_` (timestamps/revision).
* TTL map is aligned so that **L2 never outlives L1**.
* **Fail-SAFE allowlist.** After the cache-safety change the old blocklist was inverted: only
  endpoints on an explicit `CACHEABLE` allowlist are persisted. Anything unknown is not cached.
* 3 attempts with jittered backoff at 1 s / 2 s / 4 s.
* 10 s `AbortController` timeout per request.
* HTTP `503` is classified as `MAINTENANCE` and is **non-retryable**.
* Stale-while-revalidate with a **clickable stale badge** so the operator can force a refresh.

#### L4: CAIRN cache and the SSE invalidation contract

`js/cairn-cache.js` monkey-patches `SSE.handleEvent` and maintains two tables,
`CAIRN_OUTBOX_EVENTS` and `CAIRN_SUBSTRINGS`, that **must be kept mirrored** with
`_CAIRN_OUTBOX_EVENTS` / `_CAIRN_SUBSTRINGS` in `js/sse.js`. This reciprocal-drift hazard is
documented in both files.

There is a **real matching asymmetry between the two**:

* `js/sse.js` uses **word-anchored segment matching** -- it splits the event kind on `_` and
  compares whole segments, specifically so that `ship` does not match `relationship_changed`.
* `js/cairn-cache.js` still uses plain `indexOf` substring matching.

On a matching event, a **500 ms debounced** force-refresh is issued for
`CAIRN_RECENT_ENDPOINTS`:

```
/api/cairn/filter?status=ideation,rfc,in_round,ratified&limit=30
/api/tasks?include_completed=true
/api/tasks?include_completed=false
```

### 5.4 Service worker and the cache-version scheme

Two caches:

| Cache name | Contents | Lifecycle |
|---|---|---|
| `zb-superdash-<version-label>-precache-sync` (`CACHE_VERSION`) | 72 precached static assets | Deleted on `activate` whenever `CACHE_VERSION` changes. |
| `zb-api-<version-label>` (`API_CACHE`) | up to 40 API responses, FIFO-trimmed | **Never** version-rotated; survives `CACHE_VERSION` bumps. |

Strategy, revision `4c-r4`: **network-first for both static assets and API calls.** The prior
cache-first static strategy produced a 17-times-repeated "shipped but invisible" failure mode
where JS/HTML/CSS changes were invisible to the operator until `CACHE_VERSION` bumped, the SW
activated, and the page reloaded. Network-first with a **3000 ms** race timeout
(`STATIC_NET_TIMEOUT_MS`) preserves offline capability while guaranteeing freshness.

Bypassed entirely (never intercepted): non-`GET` requests, `chrome-extension:` URLs,
`/api/events`, and any path starting with `/api/stream`.

Message channel commands (page -> SW): `SKIP_WAITING`, `CACHE_CLEAR`, `CACHE_CLEAR_API`,
`CACHE_STATUS`, `PRECACHE_UPDATE`.

`CACHE_VERSION` is consumed in three places, which is why bumping it is a fleet-visible act:

1. The SW itself, to name and rotate the precache.
2. `superdash-server.py` `_read_sw_cache_version()`, regex-parsed from the first 4096 bytes and
   returned as `/api/version.sw_cache_version`.
3. `js/version-stamp.js`, which compares the server-reported value against the live SW's
   reported value to colour the footer `Build:` pill.

**SW self-heal**: a `controllerchange` event triggers exactly **one**
reload, double-guarded by an in-memory `App._swReloading` flag and
`sessionStorage['zb-sw-reloaded']`, to prevent reload loops. When `!window.isSecureContext` the
service worker is not registered at all and `#status-sw` renders `insecure` -- relevant because
Superdash is served over plain HTTP on a hostname, so **whether the SW runs at all depends on
the browser's secure-context rules** (it does run for `localhost`/`<host-address>`).

#### `sw.js` genericized excerpt

The service worker is intentionally small. The design-relevant mechanics are the cache-version
constant, an install-time precache, activation cleanup, cache-first handling for versioned static
assets, network-first handling for HTML and API requests, and a message API that lets the page ask
which service-worker version is active.

```javascript
const CACHE_VERSION = '<cache-version>';
const STATIC_CACHE = `superdash-static-${CACHE_VERSION}`;
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/css/base.css',
  '/js/config.js',
  '/js/api.js',
  '/js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith('superdash-') && key !== STATIC_CACHE)
      .map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return; // never cache API data
  if (url.searchParams.has('v')) {
    event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
    return;
  }
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});
```

### 5.5 Error and degraded-state handling

| Layer | Degraded behaviour |
|---|---|
| `App.refresh()` | Uses `Promise.allSettled` so one failing endpoint cannot abort the refresh cycle. After `errorCount > 3` it renders `Components.errorBanner({ message: 'Cannot reach coordinator API at ' + CONFIG.API_BASE })`. |
| `FleetState.connected` | **Tri-state.** An endpoint is "broken" only after >= 3 consecutive errors; "no cache yet" counts as *loading*, not *error*. This was an OPERATOR P1 fix -- the previous boolean produced a red banner flash on every page load. |
| `APICache` | 3 jittered retries (1 s / 2 s / 4 s), 10 s abort timeout, stale-while-revalidate with a clickable stale badge, `503` -> non-retryable `MAINTENANCE` state. |
| Service worker | Network-first with 3 s timeout -> cached copy -> precached `index.html` for HTML requests -> `503 Offline`. For API: cached copy -> `503 {"error":"offline","cached":false}`. |
| `js/sse.js` | `connected` -> `degraded (poll)` -> `reconnecting` -> `offline` after 10 retries. |
| `API.getSwats()` | Fetches stages `open`, `in_review`, `fixed` in parallel (`limit=200` each) and **throws `SwatCompletenessError`** if any page lacks a `swats` array. By design, `fixed` is real unclosed workload and must not be silently dropped. Counts come from the authoritative `/api/swats/count` via `API.getSwatsCount()`. |
| `API.cairnTrail()` | Has `USE_FIELDS_CARD = false` (flipped off per OPERATOR: the lean projection dropped `author_id`). Falls back to `/api/cairn/search?query=SEED OR RFC&scope=seeds,rfcs&limit=500` when `/api/cairn/trail` returns no `columns`. |
| `API.cairnSearch()` | Wraps queries in double quotes so the backend FTS engine treats hyphens as literals rather than operators. |

### 5.6 Unresolved (front end)

* Whether the `cairn-cache.js` substring matcher versus the `sse.js` word-anchored matcher
  asymmetry causes real over-invalidation in production.
* `css/resilience-card.css` documents reuse of `css/phase-badge.css` rules, but
  `phase-badge.css` is not linked from any page.

---

## 6. Design system

### 6.1 Current contract

`DESIGN.md` is the **single source of truth** for all visual values (an RFC, owner and validators are role placeholders). Its enforcement rules are explicit:

* This file is the SINGLE SOURCE for design values.
* CSS files must reference `var(--token-name)`, not raw hex/rgba.
* Future: a linter validates that no raw colour values exist in CSS/JS outside this spec.
* Token changes require RFC or PM approval (visual consistency is a fleet asset).

### 6.2 `DESIGN.md` genericized excerpt

````markdown
# DESIGN.md -- ZEROBRAIN Superdash <version-label>

> Machine-parseable design token specification.
> Single source of truth for all visual decisions. No duplicate values elsewhere.
> Format: YAML token blocks + minimal prose. Agents can extract tokens programmatically.
>
> **RFC:** an RFC | **Owner:** the analyst node | **Validators:** a builder node, the architect node

---

## Tokens

### colors

```yaml
colors:
  # Backgrounds
  bg-deep: "#080b12"
  bg-mid: "#0c1018"

  # Glass morphism layers
  glass-1: "rgba(16, 22, 36, 0.72)"
  glass-2: "rgba(20, 28, 44, 0.58)"
  glass-3: "rgba(24, 34, 52, 0.45)"
  glass-border: "rgba(88, 166, 255, 0.12)"
  glass-highlight: "rgba(255, 255, 255, 0.04)"

  # Brand / accent
  accent: "#58a6ff"
  accent-glow: "rgba(88, 166, 255, 0.3)"
  accent-soft: "rgba(88, 166, 255, 0.08)"
  gold: "#e3b341"           # OPERATOR sacred color -- do not use casually
  gold-soft: "rgba(227, 179, 65, 0.1)"

  # Semantic
  success: "#3fb950"
  warning: "#d29922"
  error: "#f85149"
  purple: "#d2a8ff"
  pink: "#f778ba"

  # Text hierarchy
  text-primary: "#e6edf3"   # Primary body text (alias: --text)
  text-secondary: "#8b949e" # Descriptions, metadata
  text-dim: "#6e7681"       # Timestamps, tertiary labels
  text-tertiary: "#484f58"  # Disabled, decorative

  # Status -- node health
  status-healthy: "#3fb950"
  status-stale: "#d29922"
  status-offline: "#f85149"
  status-molting: "#d2a8ff"

  # Status -- task states
  task-ready: "#58a6ff"
  task-in-progress: "#3fb950"
  task-review: "#d2a8ff"
  task-blocked: "#f85149"
  task-done: "#6e7681"
```

### typography

```yaml
typography:
  font-family-sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
  font-family-mono: "'JetBrains Mono', 'Cascadia Code', monospace"

  # Scale
  h1:
    size: "20px"
    weight: 700
    line-height: 1.3
  h2:
    size: "16px"
    weight: 600
    line-height: 1.4
  h3:
    size: "14px"
    weight: 600
    line-height: 1.4
  body-md:
    size: "14px"
    weight: 400
    line-height: 1.55
  body-sm:
    size: "12px"
    weight: 400
    line-height: 1.5
  label:
    size: "11px"
    weight: 500
    line-height: 1.3
    letter-spacing: "0.3px"
  mono:
    size: "13px"
    weight: 400
    line-height: 1.5

  # Weight scale (canonical)
  weight-regular: 400
  weight-medium: 500
  weight-semibold: 600
  weight-bold: 700
```

### spacing

```yaml
spacing:
  # 4px base scale
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
```

### radius

```yaml
radius:
  sm: "8px"
  md: "14px"
  lg: "20px"
  pill: "9999px"
```

### elevation

```yaml
elevation:
  shadow-glass: "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04)"
  shadow-elevated: "0 16px 48px rgba(0, 0, 0, 0.6), 0 4px 16px rgba(0, 0, 0, 0.3)"
  shadow-card: "0 4px 12px rgba(0, 0, 0, 0.3)"
  shadow-none: "none"

  # Z-index scale (prevents z-index wars)
  z-base: 0
  z-card: 10
  z-sticky: 100
  z-overlay: 200
  z-modal: 300
  z-toast: 400
  z-tooltip: 500
```

### animation

```yaml
animation:
  duration-fast: "100ms"
  duration-normal: "200ms"
  duration-slow: "350ms"
  duration-ambient: "20s"    # Background drift animations

  easing-default: "cubic-bezier(0.4, 0, 0.2, 1)"
  easing-bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)"
  easing-linear: "linear"

  # Composite shorthand (most common)
  transition-default: "0.3s cubic-bezier(0.4, 0, 0.2, 1)"
  transition-fast: "0.15s ease"
```

### layout

```yaml
layout:
  # Breakpoints
  breakpoint-sm: "640px"
  breakpoint-md: "768px"
  breakpoint-lg: "1024px"
  breakpoint-xl: "1440px"

  # Container widths
  max-width-content: "1200px"
  max-width-panel: "600px"
  max-width-card: "360px"

  # Icon sizes
  icon-sm: "14px"
  icon-md: "18px"
  icon-lg: "24px"
```

### opacity

```yaml
opacity:
  disabled: 0.4
  loading: 0.6
  hover-overlay: 0.06
  active-overlay: 0.1
  dimmed: 0.7
```

### components

```yaml
components:
  card:
    background: "var(--glass-1)"
    border: "1px solid var(--glass-border)"
    radius: "var(--radius-md)"
    padding: "var(--spacing-lg)"
    shadow: "var(--shadow-glass)"

  button-primary:
    background: "var(--accent)"
    color: "#ffffff"
    radius: "var(--radius-sm)"
    padding: "8px 16px"
    font-weight: 500
    font-size: "13px"

  button-secondary:
    background: "rgba(255, 255, 255, 0.06)"
    color: "var(--text-secondary)"
    border: "1px solid var(--glass-border)"
    radius: "var(--radius-sm)"
    padding: "8px 16px"

  badge-status:
    padding: "3px 8px"
    radius: "var(--radius-pill)"
    font-size: "11px"
    font-weight: 500

  node-indicator:
    size: "10px"
    radius: "50%"
    glow-spread: "8px"

  tab-active:
    color: "var(--text-primary)"
    border-bottom: "2px solid var(--accent)"
    font-weight: 600

  tab-inactive:
    color: "var(--text-secondary)"
    border-bottom: "2px solid transparent"
    font-weight: 400
```

---

## Variable Alias Map

Canonical aliases to resolve current drift:

| Used in code | Canonical token | Value |
|---|---|---|
| `--text` | `text-primary` | `#e6edf3` |
| `--text-primary` | `text-primary` | `#e6edf3` |
| `--text-dim` | `text-dim` | `#6e7681` |
| `--text-secondary` | `text-secondary` | `#8b949e` |
| `--text-tertiary` | `text-tertiary` | `#484f58` |
| `--node-color` | Per-node dynamic | `var(--accent)` fallback |

---

## Enforcement

- This file is the SINGLE SOURCE for design values
- CSS files must reference `var(--token-name)` not raw hex/rgba
- Future: linter validates no raw color values in CSS/JS outside this spec
- Token changes require RFC or PM approval (visual consistency is a fleet asset)
````

### 6.3 Implementation evidence: `css/base.css` `:root` genericized excerpt

This is what actually ships. Reproduce it exactly to reproduce the visual design.

```css
/* ZEROBRAIN Superdash <version-label> -- Base styles: variables, layout, panels, header/status */

/* ZEROBRAIN Superdash <version-label> -- Main Stylesheet */
/* Design: the analyst node | Cockpit glass morphism | Gold = OPERATOR sacred color */

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap');

:root {
  /* -- Backgrounds (deep dark, navy-violet tinted) -- */
  --bg-deep: #080b12;
  --bg-mid: #0c1018;

  /* -- Glass surfaces (layered translucency for depth) -- */
  --glass-1: rgba(16, 22, 36, 0.72);
  --glass-2: rgba(20, 28, 44, 0.58);
  --glass-3: rgba(24, 34, 52, 0.45);
  --glass-border: rgba(88, 166, 255, 0.12);
  --glass-highlight: rgba(255, 255, 255, 0.04);

  /* -- Accent (primary brand blue, GitHub-inspired) -- */
  --accent: #58a6ff;
  --accent-glow: rgba(88, 166, 255, 0.3);
  --accent-soft: rgba(88, 166, 255, 0.08);

  /* -- Semantic -- */
  --gold: #e3b341;
  --gold-soft: rgba(227, 179, 65, 0.1);
  --success: #3fb950;
  --warning: #d29922;
  --error: #f85149;
  --purple: #d2a8ff;
  --pink: #f778ba;

  /* -- Text (5-step ramp on light-on-dark) -- */
  --text: #e6edf3;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-dim: #6e7681;
  --text-tertiary: #484f58;

  /* -- Radii -- */
  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;

  /* -- Shadows -- */
  --shadow-glass: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 var(--glass-highlight);
  --shadow-elevated: 0 16px 48px rgba(0, 0, 0, 0.6), 0 4px 16px rgba(0, 0, 0, 0.3);

  /* -- Motion -- */
  --transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1); /* @kind other */

  /* -- Typography -- */
  --font-mono: 'JetBrains Mono', 'Consolas', monospace; /* @kind font */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; /* @kind font */
}
```

Global scrollbar treatment, applied to every scroll surface:

```css
* {
  scrollbar-width: thin;
  scrollbar-color: var(--glass-border) transparent;
}
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--glass-border);
  border-radius: 8px;
  border: 2px solid transparent;
  background-clip: padding-box;
  transition: background var(--transition);
}
::-webkit-scrollbar-thumb:hover { background: var(--accent-glow); background-clip: padding-box; }
::-webkit-scrollbar-thumb:active { background: var(--accent); }
```

### 6.4 Documented drift between spec and implementation

Reported honestly rather than papered over.

| Drift | Detail |
|---|---|
| Missing token families | `base.css :root` implements colours, radii, shadows, motion and fonts. It does **not** declare the `spacing`, `z-index`, `opacity` or `layout` token families from `DESIGN.md`. Those values exist only as literals in individual stylesheets. |
| Added tokens | `base.css` adds `--transition`, `--font-mono`, `--font-sans`, `--shadow-glass`, `--shadow-elevated` -- the latter two are the spec's `elevation.shadow-glass`/`shadow-elevated`, but `shadow-card` and `shadow-none` are absent. |
| Font family mismatch | `DESIGN.md` specifies `font-family-sans: "'Inter', ..."` and `font-family-mono: "'JetBrains Mono', 'Cascadia Code', monospace"`. `base.css` defines `--font-sans` **without** Inter (system stack only) and `--font-mono` with `'Consolas'` instead of `'Cascadia Code'`, even though it `@import`s Inter from Google Fonts. |
| Competing `:root` | `css/merit.css` declares its own `:root` colour block. |
| Third `:root` | `operator.html` contains an inline `:root` token block duplicating `DESIGN.md` values, and imports Google Fonts independently. |
| External dependency | The Google Fonts `@import` is a **live internet dependency** at CSS parse time. On an air-gapped rebuild, fonts silently fall back. |

### 6.5 Unresolved (design)

* The "future linter" referenced in the Enforcement section was never found in the repository.
  `scripts/Lint-CacheStamps.ps1` lints cache stamps, not design tokens.

---

## 7. Authentication and operator authority

### 7.1 Current contract: four credentials, three actors

| Credential | Header | Who holds it | What it proves |
|---|---|---|---|
| Fleet bearer token | `Authorization: <redacted> <FLEET_BEARER_TOKEN>` (or `X-Auth-Token: <FLEET_BEARER_TOKEN>`) | The dashboard front end, every fleet node, any operator CLI | "You are inside the fleet." It does **not** identify who you are. |
| Node session token | `X-Node-Token` (also accepted as `X-Session-Token`, or a JWT) | Each node, issued at bootstrap | "You are node N." Identifies the caller. |
| Operator token | `X-Operator-Token` | The human OPERATOR at the dashboard | Break-glass operator authority -- see 7.4. |
| Boot passphrase | request body | Nodes on first `check_inbox` | Boot-time anti-replay. Not used by the dashboard. |

The **superdash server itself performs no authentication at all.** Its four local endpoints are
unauthenticated, and it forwards (only) `Authorization` and `X-Node-Token` to the coordinator.
All authority decisions happen in `service:coordinator`.

### 7.2 Implementation evidence: `js/config.js` genericized (token redacted)

```javascript
/* Superdash <version-label> -- Configuration */

var CONFIG = (function() {
  // Auto-detect: use same hostname browser used to reach us, but coordinator port
  var host = window.location.hostname || '<host-address>';
  return {
    API_BASE: 'http://' + host + ':<COORD_PORT>',
    AUTH_TOKEN: '<FLEET_BEARER_TOKEN>',
    POLL_INTERVAL: 60000,
  FLEET_POLL_INTERVAL: 60000,
  TASK_POLL_INTERVAL: 60000,
  HEALTH_POLL_INTERVAL: 45000,
  NODE_COLORS: {
    "<node-a>": "#f0883e",
    "<node-b>": "#58a6ff",
    "<node-c>": "#3fb950",
    "<node-d>": "#d2a8ff",
    "<node-e>": "#d29922",
    "<node-f>": "#f778ba"
  },
  HOSTS: {
    "<HOST_ID>": ["<node-a>", "<node-b>"]
  },
  BREATHBUS: {
    "<HOST_ID>": { port: "<DAEMON_PORT>", ip: "<host-address>" }
  },
  BUS_POLL_INTERVAL: 30000
  };
})();

// an RFC-P5 AC18: enable the tool-cost intel widget by default. The P3.5 backend
// (GET /api/tool_costs) is shipped and tool_telemetry has accreted, so the widget
// is promoted from default-OFF to default-ON. Reversible: set to false here (or
// localStorage.removeItem('toolCostWidget')) to hide it again.
window.TOOL_COST_WIDGET_ENABLED = true;
```

> **Authentication boundary.** The reference frontend expects a browser-visible
> `AUTH_TOKEN` in its configuration. A browser-visible token is not a secret from that browser's
> user. The included image service instead requires `IMAGE_SERVICE_TOKEN` from its environment
> and rejects an absent or placeholder value at startup. Before connecting real agents,
> replace browser-wide privileged tokens with an authenticated gateway or scoped session flow.
> The public Pages demo loads no API client or credentials and makes no coordinator calls.

`API_BASE` is derived from `window.location.hostname`, so the dashboard works under any
hostname or IP that reaches the coordinator host, but **always assumes the coordinator is on the same host at
port <COORD_PORT>.** There is no configuration for a remote coordinator.

### 7.3 Client-side credential handling (`js/api.js`)

| Helper | Headers sent | Credential source |
|---|---|---|
| `API.get`, `API.post`, `API.put`, `API.getRaw` | `Authorization: <redacted> <FLEET_BEARER_TOKEN>` | `CONFIG.AUTH_TOKEN` |
| `API.operatorPost`, `API.updateTask` | fleet bearer **plus** `X-Operator-Token` | `localStorage['cairn_operator_token']`; if absent, a `window.prompt()` asks the operator |
| `API.nodePut` (used by `cairnScratchEdit`) | fleet bearer **plus** `X-Node-Token` | `localStorage['cairn_node_token']`; prompted the same way |
| `API.cairnKbFlag` | fleet bearer **only** -- deliberately | flagging is non-destructive |

**Token lifecycle:** on a `401` or `403` response, `operatorPost` / `nodePut` call
`localStorage.removeItem(...)` on the offending key and return
`{ error: 'Invalid operator token -- cleared. Try again.' }`. The next call re-prompts. There is
no expiry handling, no refresh, and no logout button -- clearing localStorage is the logout.

`localStorage` keys used for credentials:

| Key | Purpose | Also touched by |
|---|---|---|
| `cairn_operator_token` | `X-Operator-Token` value | `js/cairn.js`, `js/cairn-board.js` |
| `cairn_node_token` | `X-Node-Token` value | `js/api.js` only |
| `op_cairn_token` | `operator.html`'s own separate token store | `operator.html` only |

> The `operator.html` console uses a **different localStorage key** from the main dashboard.
> Authenticating in one does not authenticate the other.

### 7.4 Coordinator-side authority model

Traced in the coordinator reference implementation.

**Authentication order** (`coordinator/api_auth.py`, `:22`):

1. A valid `X-Node-Token` / `X-Session-Token` / JWT -- authenticates **and identifies**.
2. `X-Auth-Token` equal to `AUTH_TOKEN` -- authenticates only.
3. `Authorization: <redacted> <AUTH_TOKEN>` -- authenticates only.

**Failure responses:**

| Condition | Status | Body |
|---|---|---|
| `AUTH_TOKEN` unset on the server | `503` | `{"error":"API authentication not configured. Set AUTH_TOKEN."}` |
| No credential presented | `401` | `{"error":"Authentication required"}` |
| Malformed `Authorization` scheme | `401` | `{"error":"Invalid authorization format..."}` |
| Wrong token value | `403` | `{"error":"Invalid token"}` |

**Public (no auth):** `GET /api/health`, `GET /api/events`.
**Bypassing the middleware (handler-level auth instead):** `/api/stream*`, `/api/lifecycle/*`.

**`?token=` query-parameter auth works for `GET /api/stream*` only** -- because `EventSource`
cannot set request headers. Note the trap: `js/sse.js` appends `?token=` to `/api/events`, but
`/api/events` does not authenticate via that parameter at all -- it is simply a public endpoint
and FastAPI ignores the unexpected query parameter. The token is nevertheless placed in a URL,
and therefore in browser history and any access log. Flag this on rebuild.

#### `X-Operator-Token` has two distinct meanings

`coordinator/api.py`:

| Meaning | Trigger | Effect |
|---|---|---|
| **(a) Break-glass operator credential** | header value equals `AUTH_TOKEN` | Caller is treated as actor `"OPERATOR"`. An `emergency_operator_override` audit record is written. |
| **(b) Deprecated alias for a node session token** | header value is a valid node session token | Works, but emits a deprecation audit entry and returns `Deprecation`, `Sunset` and `Link` response headers. |

Endpoints requiring `X-Node-Token` **or** `X-Operator-Token` (`coordinator/api.py`):
`PUT /api/tasks/{id}`, and the CAIRN writes `star`, `signal`, `frame`, `seed`, `transition`,
`rfc/{id}/respond`, `/ratify`, `/notes`.

Failure bodies:

| Case | Status | Body |
|---|---|---|
| CAIRN write, no token | `401` | `{"error":"X-Node-Token or X-Operator-Token required"}` |
| CAIRN write, bad token | `401` | `{"error":"Invalid or expired X-Node-Token / X-Operator-Token"}` |
| Task update, no token | `403` | `{"error":"Task updates require X-Node-Token or X-Operator-Token"}` |

> **Critical rebuild constraint:** `X-Operator-Token` is **not** forwarded by the superdash
> reverse proxy (section 2.4). Every operator-authority call must therefore go direct to
> port <COORD_PORT>, which is exactly what `js/api.js` does.

#### `X-Node-Token` issuance

Issued at node bootstrap and stored in `node_identities.session_token` plus the
`node_session_tokens` table (`coordinator/database.py`). an RFC adds a short-lived
JWT variant obtained from `POST /api/auth/refresh` with `ttl_seconds: 900`. Validation order is
JWT -> in-memory map -> database.

### 7.5 DASHBOARD versus node-token callers

This is the core of the authority model. `coordinator/api.py` (`_get_verified_caller()`) labels a
caller that presents a valid fleet credential **but no node-token header** as `"DASHBOARD"`.

| Capability | DASHBOARD | Node token | Evidence |
|---|---|---|---|
| Read any node's inbox | **Yes** | Own node only (or PM/sudo) | `coordinator/api.py` |
| Subscribe to fleet-wide `GET /api/stream` | **Yes** | PM/sudo only | `:22` |
| Grant / revoke OPA elevation | **Yes** | **No -- rejected 403** | `:22` |
| Privileged CAIRN ops (ratify, star, frame) | Yes, via operator break-glass | Role-gated | `:22` |
| Create / publish / archive KB entries | **No** | Yes (knowledge-worker roles) | `:22` |
| Create scratch entries | **No** | Yes | `:22` |
| Send messages / broadcast | **No** | Yes (`from_node` forced to caller) | `:22` |
| Submit review ACKs | **No** | Yes (`node_id` forced to caller) | `:22` |
| Request sudo | **No** | Yes | gate registry, `request_sudo` |

The design intent is clear and worth preserving: **DASHBOARD is a supervisory identity, not a
fleet participant.** It can observe everything and authorise anything, but it cannot masquerade
as a node -- it cannot speak in the fleet's voice, write knowledge, or approve its own work.
Node tokens are the reverse: they can act, but only as themselves.

### 7.6 The in-app authority gate registry (implementation evidence)

`js/guestbook.js` `renderGateRegistry()` renders an operator-facing catalogue of the fleet's
authority gates, grouped by authority area. It is a static data structure in
the front end (not fetched), so it is a **documentation artifact that ships with the UI** and is
worth preserving. Reproduced below in tabular form.

> Three `gate` / `requires` labels are not established by the available contract.
> They are marked `[unverified auth label]`. Verify the backend's actual authorization
> requirements before implementing these catalog entries.

**Auth and Boot** (icon [auth])

| API | Gate | Requires |
|---|---|---|
| REST middleware | `[unverified auth label]` | Valid bearer token or session token. All `/api/*` endpoints authenticated via `AUTH_TOKEN` header or `X-Node-Token`. |
| REST middleware | AUTH_TOKEN fail-closed | `AUTH_TOKEN` configured. All REST endpoints reject requests when the `AUTH_TOKEN` env var is unset on the server. |
| REST middleware | X-Node-Token identity | Valid node session token. Allows a node session token to bypass `[unverified auth label]` and identify the caller. |
| REST middleware | X-Auth-Token shared secret | `X-Auth-Token == AUTH_TOKEN`. Fleet-level REST auth fallback via shared secret header. |
| MCP write tools | session identity | Valid `_session_token` resolving to a node. |
| MCP read tools | identified caller | Verified identity via token/bootstrap. |
| Boot passphrase | `validate_boot_passphrase` | Correct passphrase on first `check_inbox` after bootstrap, when enforcement is active. |
| `POST /api/shutdown` | `coordinator_shutdown` | `[unverified auth label]` or PM/sudo. |
| `POST /api/graceful-restart` | `coordinator_restart` | `[unverified auth label]` or PM/sudo. |
| `PUT /api/passphrase-enforcement` | `set_passphrase_enforcement` | PM role or sudo grant. |
| `POST /api/release-session` | self-service | Authenticated node matching body `node_id`. |
| MCP `release_session` | self-only | Authenticated node matching `node_id`. |
| `GET /api/boot-manifest/{id}` | `get_boot_manifest` | Self node or PM/sudo. |
| MCP `get_boot_manifest` | self-or-privileged | Own node or PM/sudo. |
| MCP `request_sudo` | authenticated-node | Authenticated node (**not DASHBOARD**). |
| MCP `grant_sudo` | PM/OPERATOR | PM role or OPERATOR/DASHBOARD. |
| MCP `revoke_sudo` | PM/OPERATOR | PM role or OPERATOR/DASHBOARD. |
| MCP `update_identity` | self or PM/sudo | Self edits always allowed; cross-node needs PM. |
| DB `issue_authority_token` | issuer role | PM role (unless DASHBOARD) or sudo. |
| DB `update_identity` | privileged-field gate | PM role or sudo for protected fields (`operator_notes`, etc.). |

**Lifecycle and MOLT** (icon )

| API | Gate | Requires |
|---|---|---|
| `POST /api/molt/request` | `request_node_restart` | PM role or sudo grant. Writes an OPA audit record. |
| `POST /api/molt/execute` | `execute_molt` | PM role or sudo grant. Acquires lock, kills and reboots. |
| `POST /api/molt/moratorium` | `set_molt_moratorium` | PM role or sudo grant. Blocks all MOLT requests when active. |
| `POST /api/molt/confirm-self` | self-target token | Target node's own session token **plus** a self-MOLT token. For unreachable hosts. |
| MCP `execute_molt` | PM/sudo | PM role or sudo grant. |
| MCP `set_molt_moratorium` | PM/sudo | PM role or sudo grant. |
| MCP `set_node_lifecycle` | self-benign or PM/sudo | Nodes may self-set benign states (`running`/`saving`); all others need PM/sudo. |
| DB `request_node_restart` | restart privilege | PM or sudo; self-nomination always allowed. ESG-A1 safety gates: KB validation, cooldown, circuit breaker. |

**Node Management** (icon )

| API | Gate | Requires |
|---|---|---|
| MCP `set_role` | `set_role` | PM role or sudo grant. Roles: architect, builder, reviewer, analyst, pm. |
| MCP `set_node_active_status` | `set_node_active_status` | PM role or sudo grant. **Controls superdash visibility** as well as broadcasts. |
| MCP `clear_session_lock` | `clear_session_lock` | `AUTH_TOKEN` plus a stale/recovery target. |
| MCP `create_peer_challenge` | `create_peer_challenge` | PM role or sudo grant. HMAC peer health challenge, rate-limited to 1 per pair per 5 min. |
| `PUT /api/topo/static` | `set_topo_static` | PM role or sudo grant. |
| `GET /api/topo/static/history` | `set_topo_static` | PM role or sudo grant. |

**Task Management** (icon )

| API | Gate | Requires |
|---|---|---|
| `POST /api/tasks/{id}/review-ack` | node-token | Authenticated node (**not DASHBOARD**). Caller `node_id` forced to the authenticated identity. |
| MCP `cancel_task` | `cancel_task` | PM role or sudo grant. |
| DB `update_task` (-> review) | deliverable gate | Non-PM needs at least one deliverable (scratch or artifact); PM bypasses. |
| DB `update_task` (-> done) | review ACK gate | Non-PM needs >= 1 approved review ACK; PM bypasses. |
| DB `add_review_ack` | self-ACK blocked | Reviewer must differ from the task assignee (unless PM). |

**Messaging** (icon )

| API | Gate | Requires |
|---|---|---|
| `POST /api/messages` | sender identity | Authenticated node (**not DASHBOARD**). `from_node` forced to caller. |
| `POST /api/messages/broadcast` | sender identity | Authenticated node (**not DASHBOARD**). `from_node` forced to caller. |
| `GET /api/messages/{node_id}` | `read_cross_node` | Self node or PM/sudo. |
| `GET /api/wait/{node_id}` | `read_cross_node` | Self node or PM/sudo. |
| `GET /api/stream/{node_id}` | per-node SSE | Self node or PM/sudo. |
| `GET /api/stream` | fleet SSE | **DASHBOARD** or PM/sudo. |
| `GET /api/events/{node_id}` | `subscribe_sse` | Self node or PM/sudo. Legacy. |

**Fleet Operations** (icon )

| API | Gate | Requires |
|---|---|---|
| `POST /api/interrupt/all` | role: analyst\|pm | Analyst or PM role. Triggers immediate check-in fleet-wide. |
| `POST /api/interrupt/{id}` | role: self\|analyst\|arch\|pm | Self, analyst, architect, or PM. |
| MCP `set_fleet_attention` | `set_fleet_attention` | Analyst/PM, or sudo for `HOT`. Modes HOT/WARM/COLD. |
| `POST /api/maintenance/mode` | `maintenance_mode` | PM role or sudo grant. |

**CAIRN and Knowledge** (icon )

| API | Gate | Requires |
|---|---|---|
| MCP `cairn_wave` | PM-only | PM role. Opens an RFC discussion wave. |
| MCP `cairn_close_wave` | PM-only | PM role. |
| MCP `cairn_synthesize` | PM-only | PM role. Writes the wave synthesis summary. |
| MCP `cairn_solidplan` | PM-only | PM role. Attaches the consensus seal. |
| MCP `cairn_ratify` | OPERATOR-only | OPERATOR only. After vote gates are met. |
| MCP `cairn_star` | OPERATOR-only | OPERATOR only. Starring a seed auto-promotes it to RFC. |
| MCP `cairn_frame` | OPERATOR-only | OPERATOR only. Adds OPERATOR framing to a response. |
| MCP `cairn_archive` | PM/architect/OPERATOR | PM, architect, or OPERATOR. |
| MCP `cairn_edit_response` | author-only | Response author only, and the wave must be open. |
| MCP `cairn_kb_create` | knowledge-worker | Architect, PM, reviewer, or analyst. |
| MCP `cairn_kb_publish` | knowledge-worker | Architect, PM, reviewer, or analyst. Draft -> published. |

**Scripts and Files** (icon )

| API | Gate | Requires |
|---|---|---|
| MCP `delete_script` | `delete_script` | PM role or sudo grant. |
| `POST /api/drop/{id}` | drop delete | Authenticated node with ownership. |

The renderer counts the gates at runtime and renders each row collapsible
(`Guestbook.toggleGateRow(key)`, `data-gate-key` / `data-gate-desc` attributes), with the whole
registry collapsible via `Guestbook.gateRegistryCollapsed`.

### 7.7 `operator.html` -- the separate console

A completely independent authentication surface:

1. Reads a token from the **URL hash**, then immediately clears the hash.
2. Falls back to `localStorage['op_cairn_token']`.
3. Validates by calling `GET /api/health` with an `X-Node-Token` header.
4. Its internal `api()` helper always sends `X-Node-Token`, and adds `X-Operator-Token` when the
   call site passes `useOperatorToken: true`.

It shares no code with `index.html`: its own inline `:root` design tokens, its own Google Fonts
import, its own fetch helper.

### 7.8 Unresolved (auth)

* The exact provisioning procedure for `AUTH_TOKEN` on a fresh coordinator (it is set in
  `_start-coordinator.cmd`; the value was intentionally not retrieved).
* Whether `X-Operator-Token` meaning (b) has an actual sunset date set in the `Sunset` header.
* Whether any reverse proxy or TLS terminator was ever placed in front of port <DASHBOARD_PORT>. All
  observed traffic is plain HTTP.

---

## 8. Legacy versus current

### 8.1 Current

| Surface | Status | Location |
|---|---|---|
| `index.html` on `service:superdash` (`:<DASHBOARD_PORT>`) | **CURRENT canonical dashboard.** | superdash-<version-label> deploy worktree |
| `fleet-recovery.html` | **CURRENT**, standalone, unlinked. | same tree |
| `operator.html` | **CURRENT**, standalone, unlinked. | same tree |
| `service:superdash` local `/api/health|version|deploy_status|lane_health` | **CURRENT.** | `superdash-server.py` |

### 8.2 Retired: FORTed `/dashboard` aliases

**There are no active `/dashboard` or `/dashboard/*` HTML routes on the coordinator.**
`coordinator/server.py` explicitly documents their **removal**: the bundled HTML
predated the fleet and caused stale-bundle confusion, because operators could not tell whether
they were looking at the coordinator's embedded copy or the real dashboard. The canonical
Superdash is the separate `:<DASHBOARD_PORT>` service.

The only similarly-named surviving route is a **data** endpoint, not a page:
`GET /api/dashboard/heartbeats` (`coordinator/api.py`), which the current dashboard
uses for node liveness.

### 8.3 Retired: the coordinator's embedded UI bundle

Still present in the coordinator repository but **legacy and commented as such**:

| File | Served by | Status |
|---|---|---|
| `coordinator/static/index.html` | `GET /static/{filepath}` (`coordinator/server.py`) | Retired bundle. Do not rebuild. |
| `coordinator/static/cockpit.html` | same | Retired bundle. |
| `coordinator/static/marked.min.js` | same | Vendor file for the retired bundle. |

There are no `ui/` or `www/` directories in the coordinator repository.

### 8.4 Orphaned files inside superdash-<version-label>

Present on disk, referenced by no HTML, and absent from the service-worker precache list:

| File | Reason |
|---|---|
| `js/bb-pill.js` | BB header pill removed (OPERATOR-direct). The node list is the canonical liveness surface. The removal is documented by an HTML comment at the former script-tag location and at the former markup location. |
| `js/phase-vocab.js` | an RFC-B4 phase-vocabulary render axis. Never wired in. |
| `css/phase-badge.css` | Same. `css/resilience-card.css` comments claim it reuses these styles, but the stylesheet is not linked from any page -- a latent styling bug if the Resilience card is ever enabled. |

### 8.5 Retired UI elements whose markup or CSS is deliberately retained

| Element | Removed | Retained because |
|---|---|---|
| Top-of-page deploy-pending banner |, OPERATOR: "deploy state belongs in the footer `Deploy:` pill, not a page-spanning announcement" | `css/deploy-pending-banner.css` still colours `#status-deploy`; `js/deploy-pending-banner.js` now drives the pill only. |
| Active Tasks intel card |, OPERATOR-direct | Redundant with the Task Board; Active RFCs now shows an inline task counter. Markup fully deleted, comment retained. |
| MOLT Control intel card and MOLT footer pill |, OPERATOR | Markup kept with `style="display:none" aria-hidden="true"` for future restoration; CSS `display:none` prevents render and layout cost. |
| SSE toast pop-ups | (U4 <version-label>) | Replaced by the notification bell plus queue (`js/notify.js`, `js/notifications-panel.js`). |
| Boomerang tab | superseded by the Notifications tab | `js/boomerang.js` is still loaded and still precached -- it supplies boomerang data to other surfaces. |
| Fleet tab as a first-class tab | moved to the overflow drawer (the analyst node addendum) | Lazy-loaded: `FleetSections.init` runs only when `overview` is selected. |

The overflow drawer in `index.html` carries an explicit extension point comment:
`<!-- LEGACY-DRAWER-EXTENSION-POINT: add deprecated tabs here as menuitem buttons (data-tab="<tab-name>") -->`.
That is the sanctioned place to demote a tab rather than delete it.

### 8.6 Three distinct deploy surfaces -- do not merge them

A recurring source of confusion, documented in the header comment of
`js/deploy-pending-banner.js`:

| Module | Reads | Shows |
|---|---|---|
| `js/version-stamp.js` | `/api/version` (superdash-local) | Footer `Build:` pill -- what code is running. |
| `js/deploy-pending-banner.js` | `/api/deploy_status` (superdash-local) | Footer `Deploy:` pill -- deploy-vs-master drift. |
| `js/deploy.js` | `/api/deploy-status` (coordinator, hyphen) | 4C-E3 `last-deploy.json` widget -- a different, coordinator-side deploy record. |

### 8.7 Unresolved (legacy)

* Whether the staging worktrees (`superdash-<version-label>-feature-*`, `-staging-*`) contain unmerged work that should be preserved before decommission.
  **Recommended action before decommission: `git bundle` or clone the whole repository
  including all refs, not just `master`.**

---

## 9. Deployment and provenance

### 9.1 Deployment topology

```
<shared-root>\
  superdash-<version-label>\          git worktree, branch master      <- development, commits land here
  superdash-<version-label>-deploy\   git worktree, DETACHED HEAD      <- SERVED by the NSSM service
  superdash-<version-label>-svc\      NSSM stdout/stderr logs          <- outside the served tree
  logs\superdash-perf.jsonl                               <- per-request perf log
  superdash-<version-label>-<feature>\ feature/staging worktrees
```

Both content worktrees share one `.git` object store. `master` is a ref; the deploy worktree is
a detached checkout of whatever `master` pointed at when it was last promoted. This is why
`/api/version.git_branch` reports `"HEAD"` in production.

### 9.2 Service definition (NSSM)

Installed by `install-superdash-<version-label>-service.ps1` (evidence locator
`<shared-root>\scripts\`).

| NSSM parameter | Value |
|---|---|
| Service name | `superdash-<version-label>` |
| DisplayName | `Superdash <version-label> - Fleet Dashboard (:<DASHBOARD_PORT>)` |
| `Application` | `<python>` |
| `AppParameters` | `<DeployTree>\superdash-server.py` |
| `AppDirectory` | `<DeployTree>` |
| `Start` | `SERVICE_AUTO_START` |
| `AppStdout` | `<...>\superdash-<version-label>-svc\superdash-<version-label>.out.log` |
| `AppStderr` | `<...>\superdash-<version-label>-svc\superdash-<version-label>.err.log` |

The installer's post-install verification is important and should be preserved: it calls
`GET /api/health` and **asserts that the returned `.directory` equals the intended deploy tree**.
This catches the single most damaging misconfiguration -- serving the development worktree, or a
stale copy, instead of the deploy tree.

### 9.3 Promote procedure

`promote-superdash-<version-label>-master.ps1`:

1. `git -C <deployTree> reset --hard <master-tip>`
2. `git -C <deployTree> clean -fd`
3. Assert the deploy worktree HEAD now equals the master tip.
4. Assert the worktree is clean.
5. HTTP-verify `GET /api/health` and confirm `.directory` is the deploy tree.
6. HTTP-verify `GET /js/cairn.js` returns `200` (a canary that the static tree is intact).

**No service restart is required for file-only promotes** -- the static server reads from disk on
every request. A restart is required only when `superdash-server.py` itself changes (the Python
process has the old code loaded) or when the cached git facts in `/api/version` must be
refreshed. This is exactly why `/api/deploy_status` does live git lookups: it stays correct
across a restart-free promote while `/api/version` goes stale.

The script uses `System.Diagnostics.Process` with `CreateNoWindow` to invoke git, to avoid
console-window flashes on the operator's desktop.

### 9.4 Deploy discipline

From `docs/SUPERDASH-DEPLOY-DISCIPLINE.md`. Four disciplines:

| # | Discipline | Mechanism |
|---|---|---|
| 1 | **Reconcile at session start** | `scripts/superdash-deploy-reconcile.ps1` compares deploy worktree HEAD against `master` and emits a verdict: `CONVERGENT`, `AHEAD`, `BEHIND`, or `DIVERGENT`. Exits non-zero on anything but `CONVERGENT`, so it can gate automation. |
| 2 | **Commit on deploy** | Never edit files in the live served tree. Edit in `superdash-<version-label>`, commit to `master`, then promote. |
| 3 | **Cache-buster label validation** | Every changed `.js`/`.css` must get a new `?v=<cache-label>` label in `index.html`, or the immutable-cache policy will serve the old file forever. |
| 4 | **Tracked deploy receipts** | `scripts/superdash-deploy-receipt.ps1 -Author <n> -Verifier <n> -Notes "<text>"` writes `deploy-receipts/<UTC>-<sha-short>.txt`, which is committed. Receipts are committed with each promotion. |

#### The cache-stamp gate

`scripts/Lint-CacheStamps.ps1` exists because cache-buster discipline was repeatedly violated:
*Correct* code fixes shipped and were invisible because the `?v=<cache-label>` label had not been changed, so browsers kept the immutable cached copy.

| Mode | Behaviour |
|---|---|
| `-Check` (default) | Recomputes the SHA-256 of every stamped asset and compares it against `.cache-stamp-manifest.json`. **Exit 1** if any file's content changed while its stamp did not. |
| `-Init` | Seeds the manifest from the current tree. |
| `-Bump` | Rewrites the stamp for changed files to `<yyyyMMdd>-<sha8>` and updates the manifest. |
| `-SelfTest` | Validates the linter itself. |

Manifest structure (`.cache-stamp-manifest.json`), a map of asset path to stamp and hash:

```json
{
  "css/base.css":       { "stamp": "<date-stamp>-perf-e-reduced-motion", "sha256": "<64-hex>" },
  "js/app.js":          { "stamp": "<date-stamp>-<id>",              "sha256": "<64-hex>" }
}
```

#### Automation on the coordinator host

| Script | Purpose |
|---|---|
| `check-superdash-drift.ps1` | Scheduled drift check. Supports `-AutoPromote`. |
| `register-superdash-drift-task.ps1` | Registers the above as a Windows scheduled task. |
| `mirror-superdash-<version-label>.ps1` | Pushes the repository to the `backup` bare mirror. |
| `register-superdash-<version-label>-mirror-task.ps1` | Registers the mirror as a scheduled task. |
| `ensure-superdash-<version-label>-peer-clone.ps1` | Ensures peer nodes have a clone. |

### 9.5 How revision and cache version are embedded and observed

| Fact | Embedded by | Observed at runtime via |
|---|---|---|
| Git SHA / short SHA / branch / commit time | `superdash-server.py` runs `git rev-parse` and `git log -1 --format=%cI` **once at process start** (2 s timeout each) | `GET /api/version` -> `git_sha`, `git_sha_short`, `git_branch`, `git_commit_time`; footer `Build:` pill |
| Service-worker cache version | `_read_sw_cache_version()` regex-parses `CACHE_VERSION\s*=\s*['"]([^'"]+)['"]` from the **first 4096 bytes** of `sw.js` at process start | `GET /api/version` -> `sw_cache_version`; compared client-side against the live SW's own reported version |
| Live deploy drift | `git rev-parse HEAD`, `git rev-parse master`, `git rev-list --count` on **every request** | `GET /api/deploy_status`; footer `Deploy:` pill |
| Per-asset content version | `?v=<cache-label>` in `index.html`, policed by `Lint-CacheStamps.ps1` | the request URLs themselves |
| Process identity | `START_TIME` / `_SERVER_STARTED_AT` at import | `GET /api/health.uptime_seconds`, `GET /api/version.server_started_iso` |
| Served tree identity | `os.path.dirname(os.path.abspath(__file__))` | `GET /api/health.directory` -- the deploy verifier's assertion target |

**Important constraint on the cache-version parse:** `CACHE_VERSION` must appear within the
first 4096 bytes of `sw.js`. Keep it near the start of the file. If you reorder `sw.js` and
push the declaration past 4 KB, `/api/version.sw_cache_version` silently becomes `""` and the
footer `Build:` pill loses its staleness signal.

### 9.6 Unresolved (deployment)

* Whether the NSSM service is currently the running supervisor. Live `/api/health` reported
  ~6.5 days of uptime at capture, consistent with a service, but the service control manager was
  not queried (read-only investigation; no service commands were issued).
* Rotation policy for `logs/superdash-perf.jsonl` and the NSSM `.out`/`.err` logs. No rotation
  logic exists in the application.

---

## 10. Rebuild procedure

Ordered, copy-pasteable. Target: a fresh Windows host. Assumes the coordinator
(`service:coordinator`) is or will be reachable on `<host-address>:<COORD_PORT>` of the same host.

#### Step 0 -- Before the original machines are destroyed

```powershell
# CRITICAL. The repository has no origin. Capture ALL refs, not just master.
git clone --mirror <shared-root>\superdash-<version-label> <preservation-mirror>\superdash-<version-label>.git
# or, if the dev worktree is unreachable, use the backup mirror:
git clone --mirror <backup-mirror>\superdash-<version-label>.git <preservation-mirror>\superdash-<version-label>.git

# Verify you captured the feature/staging branches too.
git --no-pager -C <preservation-mirror>\superdash-<version-label>.git branch -a
```

#### Step 1 -- Prerequisites on the new host

```powershell
# Python 3 (any supported Python 3 runtime will run this stdlib-only server).
# Install to <path> so the NSSM AppPath below matches, or adjust the path.
<python> --version     # expect: Python 3.x

# Git must be on PATH -- the server shells out to it for revision facts.
git --version

# NSSM (service supervisor).
nssm version
```

No `pip install` is required. The server has zero third-party dependencies.

#### Step 2 -- Lay down the repository and the two worktrees

```powershell
$root = '<shared-root>'
New-Item -ItemType Directory -Force -Path $root | Out-Null

# Development worktree on master.
git clone <preservation-mirror>\superdash-<version-label>.git "$root\superdash-<version-label>"
git -C "$root\superdash-<version-label>" checkout master

# Deploy worktree: DETACHED at the master tip. This is what gets served.
git -C "$root\superdash-<version-label>" worktree add --detach "$root\superdash-<version-label>-deploy" master

# Log directories, deliberately OUTSIDE the served tree.
New-Item -ItemType Directory -Force -Path "$root\superdash-<version-label>-svc" | Out-Null
New-Item -ItemType Directory -Force -Path "$root\logs" | Out-Null
```

#### Step 3 -- Smoke-test the server in the foreground

```powershell
cd <shared-root>\superdash-<version-label>-deploy
<python> .\superdash-server.py
```

Expect:

```
Superdash <version-label> server starting on port <DASHBOARD_PORT>
Serving: <shared-root>\superdash-<version-label>-deploy
Health:  http://<dashboard-host>:<DASHBOARD_PORT>/api/health
Version: http://<dashboard-host>:<DASHBOARD_PORT>/api/version
Deploy:  git=<sha7> branch=HEAD sw=zb-superdash-<version-label>-precache-sync
Lane:    http://<dashboard-host>:<DASHBOARD_PORT>/api/lane_health (probes git-ssh <host-address>:<GIT_SSH_PORT>)
```

Then `Ctrl+C`.

#### Step 4 -- Ensure the coordinator is configured

The dashboard is useless without `service:coordinator`. On the coordinator host:

* Set the `AUTH_TOKEN` environment variable before starting the coordinator. If it is unset,
  **every** authenticated endpoint returns
  `503 {"error":"API authentication not configured. Set AUTH_TOKEN."}`.
* Bind the coordinator to `<bind-address>:<COORD_PORT>` (its defaults, `coordinator/config.py`).

Then set the matching value in the dashboard:

```powershell
# Set CONFIG.AUTH_TOKEN in js/config.js to the SAME value as the coordinator's AUTH_TOKEN env var.
# Do NOT commit a real token to a repository that leaves the trust boundary.
notepad <shared-root>\superdash-<version-label>\js\config.js
```

If you change `js/config.js`, you must also bump its `?v=<cache-label>` label in `index.html` and run
`scripts\Lint-CacheStamps.ps1 -Bump`, then commit and promote.

#### Step 5 -- Install the service

```powershell
$deploy = '<shared-root>\superdash-<version-label>-deploy'
$svclog = '<shared-root>\superdash-<version-label>-svc'

nssm install superdash-<version-label> "<python>" "$deploy\superdash-server.py"
nssm set superdash-<version-label> DisplayName  "Superdash <version-label> - Fleet Dashboard (:<DASHBOARD_PORT>)"
nssm set superdash-<version-label> AppDirectory $deploy
nssm set superdash-<version-label> Start        SERVICE_AUTO_START
nssm set superdash-<version-label> AppStdout    "$svclog\superdash-<version-label>.out.log"
nssm set superdash-<version-label> AppStderr    "$svclog\superdash-<version-label>.err.log"
nssm start superdash-<version-label>
```

#### Step 6 -- Verify

```powershell
# 6a. The service answers, and is serving the DEPLOY tree (not the dev tree).
$h = Invoke-RestMethod http://<dashboard-host>:<DASHBOARD_PORT>/api/health
$h | ConvertTo-Json -Compress
if ($h.directory -ne '<shared-root>\superdash-<version-label>-deploy') { throw "WRONG SERVE ROOT: $($h.directory)" }
if ([string]$h.port -ne '<DASHBOARD_PORT>' -or $h.service -ne 'superdash-<version-label>') { throw 'Unexpected health payload' }

# 6b. Revision provenance is populated (git is on PATH and the worktree is a real repo).
$v = Invoke-RestMethod http://<dashboard-host>:<DASHBOARD_PORT>/api/version
$v | ConvertTo-Json -Compress
if (-not $v.git_sha) { throw 'git_sha empty -- git not on PATH or not a repository' }
if (-not $v.sw_cache_version) { throw 'sw_cache_version empty -- CACHE_VERSION past the 4096-byte window in sw.js' }

# 6c. Deploy is convergent with master.
$d = Invoke-RestMethod http://<dashboard-host>:<DASHBOARD_PORT>/api/deploy_status
$d | ConvertTo-Json -Compress
if ($d.drift) { throw "DRIFT: behind=$($d.deploy_behind) ahead=$($d.deploy_ahead)" }

# 6d. Lane probe answers (red is acceptable if you have no git-over-SSH lane).
Invoke-RestMethod http://<dashboard-host>:<DASHBOARD_PORT>/api/lane_health | ConvertTo-Json -Compress

# 6e. Static asset canary (the same one the promote script uses).
(Invoke-WebRequest http://<dashboard-host>:<DASHBOARD_PORT>/js/cairn.js -UseBasicParsing).StatusCode   # expect 200

# 6f. Immutable-cache policy is active on versioned assets.
(Invoke-WebRequest 'http://<dashboard-host>:<DASHBOARD_PORT>/js/app.js?v=<cache-label>' -UseBasicParsing).Headers['Cache-Control']
# expect: public, max-age=<long-lived-seconds>, immutable

# 6g. HTML is never cached.
(Invoke-WebRequest http://<dashboard-host>:<DASHBOARD_PORT>/index.html -UseBasicParsing).Headers['Cache-Control']
# expect: no-cache, must-revalidate

# 6h. The proxy reaches the coordinator and relays its auth decision.
try { Invoke-WebRequest http://<dashboard-host>:<DASHBOARD_PORT>/api/fleet -UseBasicParsing }
catch { $_.Exception.Response.StatusCode.value__ }
# expect 401 (coordinator up, auth required) -- NOT 502
```

#### Step 7 -- Optional: the image service

```powershell
# Only if the Files > Images view is needed. Requires FastAPI + uvicorn.
python -m pip install fastapi uvicorn
New-Item -ItemType Directory -Force -Path <shared-root>\uploads | Out-Null
python <shared-root>\superdash-<version-label>-deploy\services\image-service.py   # binds :<FILES_PORT>
```

#### Step 8 -- Optional: the test suite

```powershell
cd <shared-root>\superdash-<version-label>
npm install                 # installs @playwright/test only
npx playwright install      # browser binaries
npm run test:smoke          # the smoke gate tests against baseURL http://<dashboard-host>:<DASHBOARD_PORT>
```

Off the coordinator host, override the base URL with the `PLAYWRIGHT_BASE_URL` environment variable.

#### Step 9 -- Open the dashboard

Browse to `http://<host>:<DASHBOARD_PORT>/`. Expect within a few seconds:

* Node list populated in the left nav.
* Task Board rendered as the default tab.
* Footer `Coordinator:` and `DB:` green.
* Footer `Build:` showing the short SHA.
* Footer `Deploy:` showing no drift.
* Footer `SSE:` showing `degraded (poll)` -- **this is the expected normal state**, not a fault.
* Footer `SW:` showing `active` on `localhost`, or `insecure` when reached over plain HTTP by
  hostname (browser secure-context rules).

---

## 11. Acceptance tests

### 11.1 Locally-implemented endpoints, healthy state

| # | Request | Expected |
|---|---|---|
| A1 | `GET :<DASHBOARD_PORT>/api/health` | `200`, `application/json`, `Cache-Control: no-store`, `Access-Control-Allow-Origin: *`; body `{"status":"ok","service":"superdash-<version-label>","port":<DASHBOARD_PORT>,"uptime_seconds":<float>,"directory":"<deploy tree>"}` |
| A2 | `GET :<DASHBOARD_PORT>/api/version` | `200`; `git_sha` a 40-hex string; `git_branch` == `"HEAD"` for a detached deploy worktree; `sw_cache_version` == the `CACHE_VERSION` literal in `sw.js` |
| A3 | `GET :<DASHBOARD_PORT>/api/deploy_status` | `200`; `drift:false`, `deploy_behind:0`, `deploy_ahead:0`, `drift_commits:0` when convergent |
| A4 | `GET :<DASHBOARD_PORT>/api/lane_health` | `200`; `status:"green"`, `healthy:true`, `banner` starting `"SSH-"` when the lane is up |

Reference responses captured live from `http://<dashboard-host>:<DASHBOARD_PORT>` (host placeholder, timestamp omitted):

```
GET /api/health
{"status":"ok","service":"superdash-<version-label>","port":"<DASHBOARD_PORT>","uptime_seconds":"<seconds>","directory":"<shared-root>\superdash-<version-label>-deploy"}

GET /api/version
{"git_sha":"<git-sha>","git_sha_short":"<id>","git_branch":"HEAD","git_commit_time":"<date>","sw_cache_version":"zb-superdash-<version-label>-precache-sync","server_started_at":"<epoch-seconds>","server_started_iso":"<timestamp>","server_now":"<epoch-seconds>","server_uptime_seconds":"<seconds>"}

GET /api/deploy_status
{"deploy_sha":"<git-sha>","deploy_sha_short":"<id>","master_sha":"<git-sha>","master_sha_short":"<id>","drift":false,"deploy_behind":0,"deploy_ahead":0,"drift_commits":0,"checked_at":"<timestamp>"}

GET /api/lane_health
{"lane":"git-ssh-lane","host":"<host-address>","port":<GIT_SSH_PORT>,"status":"green","healthy":true,"connect_ok":true,"banner_ok":true,"banner":"SSH-2.0-OpenSSH_for_Windows_<version>","latency_ms":"<latency-ms>","error":null,"probe_timeout_s":1.5,"checked_at":"<timestamp>"}
```

### 11.2 Proxy behaviour

| # | Request | Expected |
|---|---|---|
| B1 | `GET :<DASHBOARD_PORT>/api/fleet` with **no** `Authorization` header, coordinator **up** | `401` with the coordinator's own body `{"error":"Authentication required"}`. **Verified live.** |
| B2 | `GET :<DASHBOARD_PORT>/api/canonical-domains` with no auth, coordinator up | `401 {"error":"Authentication required"}`. **Verified live.** |
| B3 | `GET :<DASHBOARD_PORT>/api/nonexistent-xyz` with no auth, coordinator up | `401 {"error":"Authentication required"}` -- the auth middleware fires before routing. **Verified live.** |
| B4 | `GET :<DASHBOARD_PORT>/api/fleet` with a valid `Authorization: <redacted> <FLEET_BEARER_TOKEN>` | `200` with the coordinator's fleet payload, relayed verbatim. |
| B5 | `GET :<DASHBOARD_PORT>/api/health?x=1` | **Proxied**, not served locally -- the local match is exact-string. Returns the coordinator's public health payload. |
| B6 | Any `POST` to `:<DASHBOARD_PORT>/api/anything` | `501 Unsupported method ('POST')` from `SimpleHTTPRequestHandler`. There is no `do_POST`. |

### 11.3 Degraded states

| # | Condition | Expected |
|---|---|---|
| C1 | **Coordinator process stopped.** `GET :<DASHBOARD_PORT>/api/fleet` | `502`, `Content-Type: application/json`, body `{"error":"superdash_proxy_upstream_failed","detail":"<urlopen error ...>"}`. The four local endpoints keep returning `200`. |
| C2 | **Coordinator hangs >10 s.** | Same `502` shape; `detail` names a timeout. |
| C3 | **Coordinator running with `AUTH_TOKEN` unset.** | `503 {"error":"API authentication not configured. Set AUTH_TOKEN."}` relayed through the proxy. |
| C4 | **Wrong bearer token.** | `403 {"error":"Invalid token"}` relayed. |
| C5 | **sshd on the lane port stopped** (e.g. `Stop-Service sshd`). `GET :<DASHBOARD_PORT>/api/lane_health` | `200` with `status:"red"`, `healthy:false`, `connect_ok:false`, `banner_ok:false`, `latency_ms:null`, `error` starting `"connect: "`. |
| C6 | **Lane port open but no SSH banner** (hung sshd, or a non-SSH listener bound to <GIT_SSH_PORT>). | `200` with `status:"degraded"`, `healthy:false`, `connect_ok:true`, `banner_ok:false`, `error:"port open but no SSH banner (sshd hung / wrong service?)"`. **This is the false-GREEN case the two-tier probe exists to catch.** |
| C7 | **`git` not on PATH, or the served tree is not a git worktree.** | `/api/version` returns empty strings for all `git_*` fields; `/api/deploy_status` returns `deploy_sha:""`, `master_sha:""`, `drift:false`. Service still serves static files normally. |
| C8 | **`CACHE_VERSION` moved past byte 4096 of `sw.js`.** | `/api/version.sw_cache_version` is `""`; the footer `Build:` pill loses its staleness comparison. |
| C9 | **Deploy worktree behind master.** | `/api/deploy_status` -> `drift:true`, `deploy_behind:N>0`, `deploy_ahead:0`, `drift_commits:N`. Footer `Deploy:` pill goes off-nominal. |
| C10 | **Feature branch left checked out in the served tree.** | `drift:true`, `deploy_behind:0`, `deploy_ahead:M>0`, `drift_commits:M`. |
| C11 | **Browser offline, service worker installed.** | Static assets served from `zb-superdash-<version-label>-precache-sync`; HTML requests with no cache entry fall back to precached `./index.html`; API requests with no cache entry return `503 {"error":"offline","cached":false}`. |
| C12 | **Coordinator unreachable from the browser for >3 refresh cycles.** | `App.refresh()` renders `Components.errorBanner` with `Cannot reach coordinator API at http://<host>:<COORD_PORT>`. Note it reports `API_BASE`, i.e. port **<COORD_PORT>**, even though the page itself came from <DASHBOARD_PORT>. |
| C13 | **A single endpoint failing.** | Only that surface degrades. `Promise.allSettled` prevents cascade. An endpoint is marked broken only after >= 3 consecutive errors; "no cache yet" is treated as loading, not error. |
| C14 | **`/api/swats` returns a page without a `swats` array.** | `API.getSwats()` throws `SwatCompletenessError` rather than silently under-reporting. By design, the `fixed` stage is real unclosed workload. |
| C15 | **`!window.isSecureContext`.** | No service worker is registered; `#status-sw` renders `insecure`; all four cache layers except L3 still function. |

### 11.4 Caching and compression

| # | Request | Expected header |
|---|---|---|
| D1 | `GET /index.html` | `Cache-Control: no-cache, must-revalidate` |
| D2 | `GET /` | `Cache-Control: no-cache, must-revalidate` |
| D3 | `GET /js/app.js?v=<cache-label>` | `Cache-Control: public, max-age=<long-lived-seconds>, immutable` |
| D4 | `GET /js/app.js` (no query) | `Cache-Control: no-cache, must-revalidate` **and** `ETag: "<mtime_ns>-<size>"` |
| D5 | Repeat D4 with `If-None-Match: <that ETag>` | `304`, empty body |
| D6 | `GET /css/base.css` with `Accept-Encoding: gzip` | `Content-Encoding: gzip`, `Vary: Accept-Encoding` (file is > 512 bytes) |
| D7 | `GET /css/deploy-pending-banner.css` (507 bytes) with `Accept-Encoding: gzip` | **No** `Content-Encoding` -- below the 512-byte threshold |
| D8 | `GET /css/base.css` **without** `Accept-Encoding` | No `Content-Encoding` |
| D9 | Any `/api/*` | `Cache-Control: no-store` |
| D10 | After a `promote` (which touches mtime) | The ETag from D4 changes even if file content is identical. This is intentional. |

### 11.5 Automated suite

```powershell
cd <superdash-<version-label> tree>
npm run test:smoke        # smoke tests -- the machine-checkable gate
npm test                  # full suite
npm run test:dirty-cache  # --grep @dirty-cache
python -m pytest tests/test_lane_probe.py   # lane-probe unit tests
```

Pre-existing degraded-state coverage worth preserving:

| Test ID | Asserts |
|---|---|
| `AC-P5-9` | Tool Cost widget on an HTTP non-200: red dot, retry affordance, error banner. |
| `AC-P5-10` | `cache_age_ms > stale_threshold_ms`: yellow dot **and** banner, but the data table remains visible (degraded, not blank). |
| `B4.error` | Resilience card error state. |
| `B4.truncated` | Resilience card truncated-payload state. |
| `view-independent-invalidation` | Cache invalidation must not depend on which tab is active. |
| `count-freshness` | SWAT counts come from the authoritative count endpoint. |
| `cairn-recent-sse-invalidation` | Active RFCs card refreshes on a CAIRN event. |

---

## 12. Unresolved and unknown items

Explicitly listed. Nothing below was verified; do not treat any of it as contract.

### 12.1 Endpoint contract gaps

1. **`/api/resilience_incidents` (underscore) versus `/api/resilience-incidents` (hyphen).**
   The front end (`js/resilience-card.js`, `js/resilience-incidents.js`,
   `js/failure-episodes.js`) requests the underscore form; the coordinator implements the hyphen
   form at `coordinator/server.py`. No compatibility alias was found. Because the
   Resilience card is feature-flagged off by default, a silent 404 here could have gone
   unnoticed. **Test this explicitly on rebuild.**
2. Response shapes were **not** individually verified for: `/api/merit`, `/api/roles`,
   `/api/motd`, `/api/corrections`, `/api/tool-failures`, `/api/failure-episodes`,
   `/api/review-pipeline`, `/api/boomerangs`, `/api/recovery/*`, `/api/topology`,
   `/api/scripts`, `/api/files/*`, `/api/cairn/filter`, `/api/cairn/recent`,
   `/api/cairn/approval_events`, `/api/tool_costs`, `/api/workload`.
3. Whether the coordinator sets CORS headers permitting the `:<DASHBOARD_PORT>` origin to call `:<COORD_PORT>`
   directly. The dashboard's primary path depends on it, so it must work, but the header
   configuration was not read.

### 12.2 Secrets and provisioning

4. The real value of `AUTH_TOKEN` -- deliberately not retrieved and deliberately not recorded.
   It comes from the coordinator's `AUTH_TOKEN` environment variable, set in
   `_start-coordinator.cmd`. The dashboard's copy in `js/config.js` must be set to the same
   value by hand.
5. Whether any operator token differs from `AUTH_TOKEN` in practice, or whether break-glass
   always uses the identical value.
6. Whether `X-Operator-Token` meaning (b) (deprecated node-token alias) has a firm sunset date.

### 12.3 Repository and preservation risk

7. Whether the `backup` bare mirror at `<backup-destination>\superdash-<version-label>.git` is
   itself replicated anywhere outside the estate being decommissioned. **If not, this is the
   single greatest data-loss risk in this system.**
8. Whether the `superdash-<version-label>-feature-*` and `superdash-<version-label>-staging-*` worktrees hold unmerged work.
   Mitigation: `git clone --mirror` (captures all refs), not a branch clone.

### 12.4 Runtime and operations

9. Whether the NSSM service is the current supervisor on the coordinator host. Live `/api/health` showed ~6.5
   days uptime, consistent with a service, but the service control manager was not queried
   (read-only constraint).
10. Log rotation policy for `logs/superdash-perf.jsonl`, `superdash-<version-label>.out.log` and
    `superdash-<version-label>.err.log`. No rotation exists in code.
11. Whether any TLS terminator or reverse proxy fronts port <DASHBOARD_PORT>. All observed traffic is plain
    HTTP, which also means the service worker registers only under browser localhost exemptions.
12. Whether `services/image-service.py` is currently running on `:<FILES_PORT>`, and under what
    supervisor. It is not started by the superdash service.

### 12.5 Front-end behaviour

13. Whether the substring-versus-word-anchored matching asymmetry between `js/cairn-cache.js`
    and `js/sse.js` causes measurable over-invalidation.
14. `js/phase-vocab.js` and `css/phase-badge.css` -- whether an RFC-B4 intended these to ship and
    they were simply never wired in, or whether they were deliberately shelved.
15. Whether `fleet-recovery.html` and `operator.html` are discoverable by operators at all, given
    that neither is linked from `index.html`. Their discovery path appears to be direct URL only.
16. Whether the service-worker precache list being **unversioned** (no `?v=<cache-label>` while `index.html`
    requests **versioned** URLs means the precache never actually serves a cache hit for those
    assets. Under the network-first strategy this is a warm-start optimisation only, so it would
    degrade performance rather than correctness -- but it was not measured.
17. The intended behaviour of the `?electric=1` query-parameter accent
    (`css/electric-border.css`, the tracked change) was not traced end to end.

### 12.6 Unverified authorization labels

18. Three `gate` / `requires` labels in the `js/guestbook.js` authority registry are not verified
    backend contracts. They are cosmetic entries in an operator-facing catalogue, not
    functional enforcement. Establish the actual checks from the rebuilt backend rather than
    treating these entries as sufficient authorization evidence.

---

## Part B: Design intent

Sections 13-16 are **design intent**, not raw evidence. Where a source comment, commit message, or
design document states a reason, it is quoted genericized and cited. Where no stated reason exists and
the rationale is reconstructed from behaviour, it is explicitly marked `[inference]`.

---

### 13. Design rationale: the decision register

Each entry: the decision, the stated or inferred reason, the alternatives that existed, and the
tradeoff that was accepted.

#### 13.1 Server and transport

##### D1. The static server is Python 3 standard library only, no web framework

| | |
|---|---|
| **Decision** | `superdash-server.py` subclasses `http.server.SimpleHTTPRequestHandler` and `socketserver.ThreadingTCPServer`. Zero third-party runtime dependencies. |
| **Stated reason** | None in source. |
| **Inferred reason** | `[inference]` The fleet already required Python 3 on every host for the coordinator toolchain. A dependency-free server can be copied to any host and started with one command, with no virtualenv, no lockfile, and no supply-chain surface. The whole server is 567 lines and can be read in one sitting. |
| **Alternatives** | nginx or IIS for static files; a FastAPI/Flask app; serving the UI directly from the coordinator. |
| **Tradeoff accepted** | Gave up production-grade HTTP (no HTTP/2, no TLS, no connection reuse tuning, no battle-tested static handler) in exchange for zero install friction and total auditability. The cost showed up later and had to be paid back by hand: threading, queue depth, reverse-DNS, gzip, and ETag were all bolted on in separate commits (`<id>`, `<id>`, `<id>`, `<id>`, `<id>`). |
| **Rebuild note** | This is **negotiable**. See Section 14.6. A rebuild on nginx or Caddy is legitimate provided the invariants in Section 14 are preserved. |

##### D2. `/api/*` is reverse-proxied through the dashboard origin instead of calling the coordinator directly

| | |
|---|---|
| **Decision** | Any `/api/*` GET the dashboard does not implement locally is proxied to `<host-address>:<COORD_PORT>`. |
| **Stated reason** | Quoted from `superdash-server.py` `_proxy_to_coord` docstring: *"The B4/P5 widgets fetch coord-canonical (hyphen) `/api/*` paths relative to the superdash origin (:<DASHBOARD_PORT>). Superdash answers a few local /api endpoints (health/version/deploy_status, matched BEFORE this clause) but holds no coord data, so anything else under /api/ is proxied to the coordinator. ... the browser sees same-origin (no CORS)."* |
| **Commit** | `<id>` / `<id>`, "the tracked change: superdash :<DASHBOARD_PORT> reverse-proxy /api/\* -> coord :<COORD_PORT>". |
| **Alternatives** | Configure CORS on the coordinator and let the browser call `:<COORD_PORT>` directly; duplicate coordinator data into the dashboard. |
| **Tradeoff accepted** | Accepted an extra network hop and a single-threaded-ish `urllib` call per API request, in exchange for eliminating CORS configuration entirely and keeping one origin for cookies, caching, and the service worker. The whole front end can then treat `/api/...` as a relative path with no origin logic anywhere. |

##### D3. The proxy forwards the client's `Authorization` header verbatim and holds no token of its own

| | |
|---|---|
| **Decision** | `_proxy_to_coord` copies only `Authorization` and `X-Node-Token` from the inbound request. It never reads a token from the environment and never injects one. |
| **Stated reason** | Quoted from the same docstring: *"forwarding it genericized keeps the coord token off the superdash side (no env lookup, no token surfaced in superdash)."* |
| **Alternatives** | Give the dashboard server its own service credential and let it authenticate to the coordinator on the browser's behalf. |
| **Tradeoff accepted** | The dashboard process is credential-free and therefore not a credential-theft target; compromising the static server yields no fleet access. The cost is that the **browser** must hold the credential, which is what produced the hardcoded-token weakness described in Section 7 and Section 17.2. The security boundary was moved, not removed. |

##### D4. The proxy is GET-only

| | |
|---|---|
| **Decision** | `do_POST`, `do_PUT`, `do_DELETE` are not implemented. Only `do_GET` proxies. |
| **Stated reason** | Quoted: *"GET-only by design -- the dashboard widgets are read-only."* |
| **Consequence** | Every **write** the dashboard performs (`API.post`, `API.put`, `API.del`) goes to `CONFIG.API_BASE`, which targets the coordinator origin directly, not the proxy. Reads and writes therefore take different network paths. |
| **Tradeoff accepted** | A smaller, simpler, safer proxy, at the cost of an asymmetry that is easy to miss: read paths are same-origin, write paths are cross-origin. A rebuilder who proxies everything will find the system still works and is arguably cleaner; a rebuilder who proxies nothing will break every widget. |

##### D5. Four endpoints are implemented locally rather than in the coordinator

`/api/health`, `/api/version`, `/api/deploy_status`, `/api/lane_health`.

**Stated reason**, for `/api/version`, quoted from source: *"the tracked change: deploy-version stamp for OPERATOR self-diagnose. Returns server-side deploy facts (git SHA, branch, commit time) + precomputed SW cache version."*

**Inferred reason** `[inference]`: these four are the only facts the coordinator structurally cannot know. The coordinator does not know which git revision of the dashboard is on disk, what the service worker cache version is, whether the served worktree has drifted from `master`, or whether the coordinator host SSH lane is up. Putting them in the coordinator would require the coordinator to reach back into the dashboard host.

**Tradeoff accepted**: a second, small API surface on a service otherwise described as "static files plus a proxy". The payoff is that the dashboard can diagnose *itself* even when the coordinator is completely down -- which is precisely when an operator needs it most. This is the single most valuable design idea in the service and should be preserved. See Section 14.4.

##### D6. `ETag` is derived from mtime and size, deliberately **not** from content hash

| | |
|---|---|
| **Decision** | `etag = f'"{st.st_mtime_ns}-{st.st_size}"'` |
| **Stated reason** | Quoted genericized from `superdash-server.py`: *"rotates per-deploy even on unchanged content -- forces revalidation on every ship and prevents the 60s staleness-after-ship window. Do NOT 'optimize' by switching to content-hash without re-thinking deploy-bust semantics (the analyst node)."* |
| **Commit** | `<id>`, "docs(superdash-cache): pin ETag-via-mtime as intentional deploy-bust mechanism". |
| **Alternatives** | Content hash (the conventional choice, and what most engineers will reflexively "fix" this to). |
| **Tradeoff accepted** | Sacrificed cache efficiency -- a no-op redeploy invalidates every client's copy of every file -- to guarantee that **a deploy is always visible**. The promote procedure is `git reset --hard`, which touches mtime on every file regardless of content change, so mtime is a reliable per-deploy nonce and content hash is not. This is a deliberate inversion of the usual priority and is the most likely thing for a rebuilder to break. |

##### D7. Two-mode cache policy keyed on the presence of a `?v=<cache-label>` query string

**Stated reason**, quoted: *"(b) URL has no query string -> no-cache, must-revalidate (legacy). Some assets (config.js, scripts.js, etc.) are not version-stamped; fall back to ETag-driven revalidation per the fix (the analyst node -- prior max-age=60 left a 60s post-ship stale window). Audit hygiene: any new `<script>`/`<link>` in index.html SHOULD include `?v=<cache-label>` so it benefits from path (a). Unversioned assets degrade gracefully to (b)."*

The design is a **graceful-degradation ladder**, not a rule: versioned assets get `immutable` year-long caching and are free; unversioned assets still cannot go stale, they just cost a revalidation round-trip. Nothing breaks if you forget the stamp; it only gets slower. That property is why the policy survived.

#### 13.2 Delivery and caching

##### D8. The service worker is network-first for static assets, not cache-first

| | |
|---|---|
| **Commit** | `<id>`, "fix(sw): network-first for static assets to end OPERATOR-stale-screen pattern". |
| **Stated reason** | The commit subject is the rationale: a cache-first service worker produced an operator looking at a dashboard that had not changed after a fix was shipped. |
| **Alternatives** | Cache-first with explicit versioned cache names (the textbook PWA pattern). |
| **Tradeoff accepted** | Gave up offline-first speed for **freshness**. This is correct for the use case: an operator dashboard that shows stale fleet state is worse than one that fails to load, because a blank panel is obviously broken and a stale panel is invisibly wrong. The cache is retained purely as an offline fallback. |

##### D9. One-shot self-healing reload on `controllerchange`

**Stated reason**, quoted from `js/app.js`: *"SW self-heal delivery: when a NEW service worker takes control (a guard-ship / asset update), reload ONCE so the page picks up the new JS instead of a stale cache-first SW serving old code indefinitely. This is the durable fix for 'shipped a fix but the client never gets it.' Double-guarded (in-flight flag + once-per-session sessionStorage cap) so it can NEVER become a reload loop."*

Note the shape of the guard, which is the reusable idea: an auto-reload is a dangerous primitive, so it is protected by **two independent** mechanisms -- an in-memory flag (`App._swReloading`) and a `sessionStorage` key (`zb-sw-reloaded`) -- with an explicit `catch` so that losing `sessionStorage` degrades to the in-memory guard rather than removing all protection.

##### D10. A three-layer cache stack (L1 memory / L2 localStorage / L3 service worker) that is deliberately not collapsed

**Stated reason**, quoted from `js/datastore.js`: *"this is a deliberate L1(memory)/L2(localStorage)/L3(Service-Worker-cache) layered cache stack -- FleetState (L1, this file) calls API.get(), which APICache below (api-resilience.js, L2) wraps with a localStorage cache, which itself flows through sw.js's fetch-interception cache (L3, offline fallback). The layering is intentional and should NOT be collapsed to a single cache."*

Each layer solves a different problem: L1 deduplicates concurrent panel requests within a page, L2 survives a reload, L3 survives a network outage.

The same comment records the **invariant that binds them**, which is the part a rebuilder must keep: *"L2's TTL_MAP previously held LONGER lifetimes than L1's maxAgeMs for several shared endpoints (e.g. /api/tasks: L1=15000 vs L2=60000) -- meaning L1 could consider its copy stale and ask L2 to refresh, only for L2 to silently serve an up-to-4x-staler cached response instead of hitting the network, defeating L1's own freshness intent."* See invariant **I-C3**.

##### D11. Cacheability is an allowlist, not a blocklist (fail-safe over fail-unsafe)

**Stated reason**, quoted in full from `js/api-resilience.js`:

> *"the tracked change: inverted blocklist -> allowlist. Previous policy was fail-UNSAFE: a NO_CACHE blocklist of explicit endpoints, with everything else defaulting to 'cache with 30-300s TTL'. Any new endpoint added to the coord API silently inherited stale-while-revalidate semantics until someone remembered to add it to NO_CACHE. a tracked change was exactly this failure (/api/cairn/rfc/forum added without NO_CACHE update -> OPERATOR saw stale wave/synthesis data for 60s). New policy is fail-SAFE: only endpoints in the CACHEABLE allowlist below get cached. Everything else hits the network on every call. Adding a new endpoint to the coord API -> renders fresh by default; the engineer must make a deliberate, documented decision to opt into caching."*

This is the clearest statement of the project's governing principle anywhere in the source: **the default for an unconsidered case must be the safe one, even when the safe one is more expensive.** It generalises well beyond caching and is worth carrying into any rebuild.

#### 13.3 Front-end architecture

##### D12. A single shared data-layer singleton (`FleetState`), not per-panel fetching

**Stated reason**, quoted from `js/datastore.js`: *"RFC-FDDB12: Centralizes ALL API data fetching for superdash panels. Single poll loop per endpoint (not N timers from N panels); Subscriber-driven polling: polling starts when first subscriber joins; Deduplicates concurrent requests to the same endpoint; Stale-while-revalidate ...; Per-endpoint error tracking with global connectivity derivation; Page Visibility API: pauses polling when tab is hidden."*

**Problem it solved**: with roughly 30 panels each owning a timer, the dashboard issued duplicate requests for the same endpoint and leaked timers. The migration was staged over `<id>` (Phase 1 singleton), `<id>` (Phase 2 components helper), `<id>` (Phase 3 Fleet Overview retrofit) -- and was still being finished a month later in `<id>`, "route BusPanel's fleet-fetch fallback through FleetState". The `var DataStore = FleetState` alias at the bottom of the file exists to keep pre-migration consumers working.

**Tradeoff accepted**: a global singleton with subscriber lists, in a codebase with no module system, in exchange for one poll per endpoint and a single place to derive connectivity state.

##### D13. `PerfGuard`: visibility-aware polling, in-flight guards, dirty-checks, and a scheduled self-reload

Quoted from the module header, `js/perf-guard.js`:

> *"Prevents browser freeze by: 1. Pausing ALL polling when tab is hidden (visibilitychange); 2. Guarding App.refresh() against overlapping calls; 3. Skipping DOM rewrites when data hasn't changed (hash compare); 4. Throttling SSE-triggered refreshes; 5. Auto-reload after MAX_UPTIME_MS of no user interaction; 6. Periodic cache cleanup (localStorage + SW API cache); 7. Adaptive poll frequency based on SSE health."*

Items 5 and 6 are unusual and deserve explanation. The dashboard is left open on an operator's screen for days. Commits `<id>` ("fix: memory leaks causing Firefox 4GB crash"), `<id>` ("perf: add auto-maintenance to prevent Firefox crashes"), and `<id>` ("fix(perf): patch 5 memory leak vectors causing 3.5GB Firefox bloat") record that this actually happened, repeatedly.

The accepted tradeoff is a **pragmatic** one: rather than chase every leak to zero, the design bounds the blast radius with `MAX_UPTIME_MS = 4h` and `IDLE_RELOAD_MS = 30min` (only after 2h uptime, and only while idle, so it never interrupts an operator mid-task). A rebuild with a modern framework and disciplined listener teardown may not need this. A rebuild that keeps the global-singleton pattern almost certainly will.

##### D14. Degraded transport must be **labelled** degraded

| | |
|---|---|
| **Commit** | `<id>`, "fix: label SSE poll-fallback 'degraded (poll)' + var(--warning), not 'live (poll)' + var(--success)". |
| **Reason** | The footer previously showed a green "live (poll)" while the app was actually polling because the event stream was unavailable. Green plus the word "live" told the operator the realtime path was healthy when it was not. |
| **Principle** | A degraded path that presents as healthy is worse than an outage, because it removes the operator's ability to distinguish "the fleet is quiet" from "I am not receiving events". |

This is the same principle as D8 and as D22 below. It recurs often enough to be treated as a project-level rule; see invariant **I-U1**.

##### D15. No build step, no bundler, no framework

The UI is plain HTML with roughly 52 `<script defer>` tags and ES5-style global namespace objects (`App`, `API`, `CONFIG`, `SSE`, `FleetState`, `Cairn`, `PerfGuard`, ...).

**Stated reason**: none. `[inference]` The system is edited by multiple agents and operators directly on the served host, and a promote is `git reset --hard` with no build. Removing the build step means "what is in git is what is served", which makes the provenance chain in Section 9 (`/api/version` reporting a real git SHA of the actual served bytes) trivially true. With a bundler, the served artefact would no longer be the source artefact, and the entire deploy-drift detection design would need rebuilding.

**Tradeoff accepted**: no tree-shaking, no minification, no type checking, no module isolation, and a manual `?v=<cache-label>` cache-stamp discipline that had to be enforced by a custom linter (D16). In return: edit a file, `git reset --hard`, done -- and every byte served is traceable to a commit.

`<id>` ("add defer to all 52 script tags, fix render-blocking load") shows the cost of the approach being paid down rather than the approach being abandoned.

#### 13.4 Operational design

##### D16. The cache-stamp lint gate is mandatory and fails **closed**

| | |
|---|---|
| **Commits** | `<id>` ("Add Lint-CacheStamps deploy-gate: fail if asset content changed but ?v= stamp not bumped"), `<id>` ("Wire Lint-CacheStamps -Check as mandatory un-skippable gate in deploy-receipt flow"), `<id>` ("Harden cache-stamp gate to fail-CLOSED on pwsh-missing (the reviewer node (c))"). |
| **Problem** | D15 requires a human to bump `?v=<cache-label>` by hand whenever an asset's content changes. Humans forget. When they forget, the fix is deployed to the server and never reaches the browser -- the exact "shipped a fix but the client never gets it" failure in D9. |
| **Design** | A linter (`scripts/Lint-CacheStamps.ps1` + `.cache-stamp-manifest.json`) compares content hashes against recorded stamps and fails the deploy if content moved without the stamp moving. |
| **The important detail** | `<id>` hardens it to fail-closed when PowerShell itself is missing. A gate that silently skips when its runtime is unavailable is not a gate. This is D11's principle applied to tooling. |
| **Rebuild note** | If you adopt a bundler with content-hashed filenames, this entire mechanism becomes unnecessary -- the hash *is* the stamp. That is a legitimate simplification. See Section 17.3. |

##### D17. Promote is `git reset --hard` in a detached worktree, with no service restart

**Reason** `[inference]`, supported by `docs/SUPERDASH-DEPLOY-DISCIPLINE.md`: the server resolves files from disk per request and holds no compiled state, so a file-only change needs no restart. Skipping the restart removes the dashboard's only downtime window -- valuable for a service whose entire purpose is to be watchable during incidents.

**The catch, and it is stated in source**: `/api/version` caches git facts **at process start**, so after a restart-free promote it reports the *old* SHA. Quoted from `_handle_deploy_status`: *"Distinct from /api/version (which caches git facts at startup and goes stale post-promote because promote-superdash-<version-label>-master.ps1 does `git reset --hard` without server [restart])."*

This is why `/api/deploy_status` exists and why it is computed **live on every request**. The pair is the design: `/api/version` answers "what was running when this process started", `/api/deploy_status` answers "what is on disk right now". The difference between them **is** the drift signal, and the footer deploy-pending pill (`js/deploy-pending-banner.js`, `<id>`) renders exactly that difference. A rebuilder who "fixes" `/api/version` to read git live destroys the drift detector.

##### D18. The lane health probe is two-tier because a one-tier probe lied

Quoted from `superdash-server.py`:

> *"the architect node review: a bare TCP-connect has a false-GREEN blind spot -- port-open-but-sshd-hung reports reachable while git-over-SSH is actually broken (reproduced from a remote node: connect to :<GIT_SSH_PORT> succeeded but `ssh -T` timed out 'during banner exchange'). So we add a second tier."*

Result: `green` requires TCP connect **and** an `SSH-` banner; connect-without-banner is `degraded`, not green. Note the same pattern as D14 -- the middle state was given its own name rather than being rounded to the nearest binary.

Also quoted, on why the probe runs per-request rather than on a timer: *"A live per-request probe means /api/lane_health flips RED within one dashboard poll cycle when the lane drops (e.g. Stop-Service sshd)."* And on env-overridability: *"Host/port are env-overridable for testability and for a future off-host probe."*

##### D19. Counts come from an authoritative unbounded `COUNT(*)`, never from the length of a page

Quoted from `js/api.js`: *"the tracked change: authoritative unbounded COUNT(\*) for badge surfaces. Server endpoint /api/swats/count?status=... returns {count: N} with no LIMIT ... Use this for top-of-board badge + column-header total; never relies on len(page)."*

A badge reading "12" that actually means "the first page held 12" is a lie with no visible symptom. `taskboard.js` goes further and *surfaces* the authoritative-vs-rendered difference when they disagree, rather than hiding it.

##### D20. Fail loud on incomplete data rather than rendering a partial view

`API.getSwats` fetches each stage separately and then validates:

```js
pages.forEach(function(data, index) {
  if (!data || !Array.isArray(data.swats)) {
    var err = new Error('Incomplete SWAT response for stage ' + allow[index]);
    err.name = 'SwatCompletenessError';
    err.stage = allow[index];
    throw err;
  }
});
```

Commit `<id>` is titled exactly "Fail loud on incomplete active SWAT data". The stated reason for fetching per-stage is quoted at `js/api.js`: *"Server accepts one stage per request. Fetch each active stage separately so closed history cannot consume the shared page cap before the client filters it."* -- a paginated fetch-then-filter would let closed items crowd out open ones and silently undercount active work.

The operator's own words are preserved in the source at `js/api.js`: *"superdash needs to be accurate and up to date at all times, it is my only view into workloads -- OPERATOR"*. That sentence is the product requirement for the entire service.

##### D21. `DESIGN.md` is the canonical design-token source

CSS and JS are expected to consume tokens rather than restate raw values, with the stated rule *"Token changes require RFC or PM approval (visual consistency is a fleet asset)"*.

**Status**: partially honoured. Section 6 documents the drift -- `base.css :root` omits whole token families, and `merit.css` and `operator.html` declare competing `:root` blocks. `<id>` ("the tracked change: token parity (base.css :root  catalog)") shows parity was being pursued in phases and was never completed. Treat `DESIGN.md` as the intent and `base.css` as the incomplete implementation.

---

### 14. Constraints and invariants

**This is the most important section in the document.**

It separates the properties that are **load-bearing** -- remove them and the system is wrong, often
silently -- from the ones that are **incidental**, where a rebuilder should feel free to choose
differently.

Each invariant is stated as a property, not as an implementation. The coordinator-host implementation is given
as one example of satisfying it.

#### 14.1 Contract invariants (the wire)

| ID | Invariant | Why it is load-bearing | the coordinator host implementation |
|---|---|---|---|
| **I-A1** | The browser must reach **all** fleet data through a **single origin**. | The front end has no origin-selection logic anywhere; every read is a relative `/api/...` path. Splitting origins reintroduces CORS, breaks the service worker scope, and breaks same-origin credential handling. | Reverse proxy on `:<DASHBOARD_PORT>` -> `<host-address>:<COORD_PORT>`. |
| **I-A2** | Locally-implemented endpoints must be matched **before** the proxy fallback. | If `/api/health` proxied, the dashboard would report the coordinator's health as its own and could never self-diagnose while the coordinator is down. | Exact-match dispatch table checked first in `do_GET`. |
| **I-A3** | The proxy must relay the upstream **status code and body faithfully**, not normalise them. | Widgets distinguish 401 (not authenticated) from 404 (endpoint gone) from 502 (coordinator down) and render different states. Collapsing these to 500 makes every failure look identical. | `except urllib.error.HTTPError` relays `exc.code` and `exc.read()`; stated reason in source: *"so the widget sees the real upstream status, not a generic 500."* |
| **I-A4** | A coordinator that is unreachable must produce a **distinct, identifiable** error, not a hang and not a generic failure. | The dashboard's degraded-state UI keys on it. | `502 {"error":"superdash_proxy_upstream_failed","detail":"..."}` with a 10s timeout. |
| **I-A5** | Endpoint paths are part of the contract and are **not** interchangeable between hyphen and underscore forms. | Section 12 records a live defect caused by exactly this: the client calls `/api/resilience_incidents`, the coordinator implements `/api/resilience-incidents`. Commit `<id>` fixed the same class of bug once already ("fix B4 widget endpoint spelling (_incidents -> -incidents)"). | Not enforced. This is an unfixed hazard -- see Section 17.4. |

#### 14.2 Security invariants

| ID | Invariant | Why it is load-bearing |
|---|---|---|
| **I-B1** | The static/proxy server must hold **no fleet credential**. | Stated design intent (D3). It makes the web tier a non-target: compromising it yields no fleet access. Any rebuild that gives the web tier a service token changes the threat model and must say so explicitly. |
| **I-B2** | The proxy must forward only an **explicit allowlist** of headers. | It currently forwards `Authorization` and `X-Node-Token` only. Forwarding arbitrary client headers upstream is a header-injection and privilege-confusion vector. |
| **I-B3** | `X-Operator-Token` must **not** be forwarded by the proxy. | On the coordinator this header can mean break-glass operator authority (Section 7). Silently relaying a browser-supplied break-glass header through a same-origin proxy would let any dashboard user attempt privilege escalation. Its absence from the forward list is a security property, not an oversight. |
| **I-B4** | A dashboard-authority caller must be able to **read broadly** but must **not** be able to speak as a node. | The coordinator's `_get_verified_caller()` labels a fleet-credentialed, node-token-less caller `"DASHBOARD"`. That identity can read any inbox and grant/revoke OPA, but cannot create KB entries, create scratch, send messages, or submit review ACKs. This separation is what keeps the audit trail meaningful: an action attributed to a node must have come from that node. |
| **I-B5** | Write operations must be authenticated **independently** of the read path. | Reads flow through the GET-only proxy; writes go direct. A rebuild that unifies them must ensure the unified path still authenticates writes and still refuses to let the proxy synthesise credentials. |
| **I-B6** | No credential may be committed to the repository. | **Violated in the coordinator host implementation.** `js/config.js` and `services/image-service.py` hardcode the bearer token in plaintext. This is documented as a known weakness in Section 7 and must not be reproduced. See Section 17.2 for the recommended replacement. |

#### 14.3 Delivery and caching invariants

These are the invariants most likely to be broken by a well-meaning rebuilder, because each one
inverts a conventional best practice for a specific, documented reason.

| ID | Invariant | Why it is load-bearing |
|---|---|---|
| **I-C1** | **A deploy must always become visible to an already-open browser tab.** | This is the single most-repaired property in the project's history. It is the root of D6, D7, D8, D9, D16, and at least six distinct incidents. Any caching scheme is acceptable *provided* it satisfies this. |
| **I-C2** | The validator used for static assets must change on **every deploy**, including deploys that do not change content. | Corollary of I-C1 under the coordinator host deploy model (`git reset --hard` touches all mtimes). If you switch to content hashing, you must ensure some other mechanism guarantees I-C1, because content hashing explicitly does *not* change on a no-op redeploy. Source comment: *"Do NOT 'optimize' by switching to content-hash without re-thinking deploy-bust semantics."* |
| **I-C3** | **No outer cache layer may hold data longer than the inner layer's freshness window.** | Stated in `datastore.js`. If L2's TTL exceeds L1's `maxAgeMs`, L1 asks for a refresh and L2 silently answers with staler data -- L1's freshness intent is defeated invisibly. Generalise: in any layered cache, TTLs must be **monotonically non-increasing** from inner to outer. |
| **I-C4** | Cacheability must be **opt-in** (allowlist), never opt-out. | D11. A new endpoint must render fresh by default. |
| **I-C5** | Pattern-matched policy tables scanned in order must list **specific patterns before generic ones**. | `getTTL()` does an in-order `indexOf(pattern) === 0` scan. `/api/molt/history` listed after `/api/molt` was unreachable dead code for an unknown period. Any prefix-matched table has this hazard. |
| **I-C6** | Automatic page reloads must be guarded by **at least two independent** mechanisms. | D9. A single-guard auto-reload becomes an infinite reload loop the first time the guard's storage is unavailable. The coordinator-host implementation uses an in-memory flag plus `sessionStorage`, with the storage access wrapped in `try/catch` so that losing storage degrades to one guard rather than zero. |
| **I-C7** | If the service worker precaches a list of assets, that list must stay in sync with the assets the page actually requests. | `<id>` ("fix stale/incomplete Service Worker precache list") records the drift happening. Section 5 documents that the current list has exact 72/72 parity but is **unversioned** while the page requests **versioned** URLs -- so precache entries are different cache keys and function only as a warm-start optimisation under network-first. A rebuilder should either make this correspondence exact or drop precaching. |

#### 14.4 Observability and provenance invariants

| ID | Invariant | Why it is load-bearing |
|---|---|---|
| **I-D1** | **The dashboard must be able to diagnose itself while the coordinator is down.** | D5. This is the reason the local endpoint set exists at all. If every endpoint proxies, a coordinator outage produces a dashboard that can tell the operator nothing -- including nothing about itself. |
| **I-D2** | The running service must report the **git revision of the bytes it is serving**. | Provenance. Without it, "is the fix deployed?" is unanswerable except by reading files on the host, which is exactly what is unavailable during an incident. |
| **I-D3** | There must be a way to detect **served-tree drift from the intended revision**, computed live. | D17. `/api/version` (cached at start) and `/api/deploy_status` (computed per request) are deliberately different, and their *difference* is the signal. Collapsing them into one endpoint removes the drift detector. |
| **I-D4** | The service-worker cache version must be **observable from the server** and comparable against what the client actually has. | It is how "the client is running old code" is detected remotely. In the coordinator host this is `sw_cache_version` in `/api/version`, joined client-side against the live `SW.CACHE_VERSION` by `js/version-stamp.js`. |
| **I-D5** | **Implementation constraint, the coordinator host-specific but easy to reproduce accidentally:** the server extracts `CACHE_VERSION` by scanning only the **first 4096 bytes** of `sw.js`. If the declaration moves past that offset, `sw_cache_version` silently becomes `""` and I-D4 fails with no error. | A silent truncation-based parse is a latent failure. A rebuild should read the whole file or export the version from a dedicated file. |

#### 14.5 Truthfulness invariants (the UI must not lie)

This family is central to the dashboard's design: uncertainty and incomplete evidence must stay visible.

| ID | Invariant | Evidence |
|---|---|---|
| **I-U1** | A degraded transport must be **labelled degraded**, with warning affordance -- never presented as healthy. | `<id>`: "label SSE poll-fallback 'degraded (poll)' + `var(--warning)`, not 'live (poll)' + `var(--success)`". |
| **I-U2** | Counts and totals must come from an **authoritative unbounded count**, never from the length of a fetched page. | `js/api.js`; `<id>` "render-hookup -- badge sources from authoritative count". |
| **I-U3** | Incomplete data must **fail loudly**, not render as a partial success. | `<id>` "Fail loud on incomplete active SWAT data"; `SwatCompletenessError`. |
| **I-U4** | Mock or placeholder data must be **visibly marked** as such. | `<id>` "add visible mock data warning banner in boomerang panel"; `<id>` "gate mock footer by `_usingMock` flag". |
| **I-U5** | A completion indicator must not claim 100% while a blocking gate remains open. | `<id>` "the tracked change: suppress unqualified '100%' when open ship-gate blocks"; source comment at `cairn-board.js` cites `an RFCx1` as the exemplar that showed "100%" while a ship-gate was open. |
| **I-U6** | An empty state must say it is empty in words, not render misleading numerals. | `<id>`: "empty-state copy 'ratified  awaiting task bind' (drops misleading 0-of-0 numerals that italic-rendered as 8-of-8)". A genuinely excellent bug: `0-of-0` in the italic display face was being misread as `8-of-8`. |
| **I-U7** | An error state must show the **real** error, not a generic one, and must not show a **false** error. | `<id>` "surface real API error"; `<id>` "show error feedback instead of infinite Loading..."; and the converse, `<id>` "suppress false-red 'Cannot reach coordinator API' banner on initial load". Both directions matter: a false red is as corrosive to trust as a hidden failure. |
| **I-U8** | Any user-supplied or fleet-supplied string rendered into the DOM must be escaped. | `<id>` "fix(security): XSS in onclick handlers"; `<id>` "XSS escape assigned_to/thrown_by". Note the vector: values interpolated into inline `onclick` attributes, not just into text nodes. |

#### 14.6 Explicitly negotiable -- change these freely

A rebuilder should not treat the following as requirements. They are artefacts of the environment,
the era, or of incremental growth, and every one of them is a reasonable thing to do differently.

| Incidental choice | Notes for a rebuilder |
|---|---|
| Python `http.server` as the runtime | Any static server satisfying Section 14.1 and 14.3 is fine. nginx or Caddy would be better. |
| Port `<DASHBOARD_PORT>`, and the coordinator on `<COORD_PORT>` | Arbitrary. Keep them configurable rather than hardcoded -- they currently are not. |
| Windows, UNC paths, NSSM as the supervisor | Entirely environmental. systemd, a container, or a managed service are all fine. |
| No build step, global-namespace ES5 modules | A module system and a bundler are improvements. But see D15 -- if you bundle, you must re-establish I-D2 provenance another way. |
| Manual `?v=<cache-label>` cache stamps and the lint gate that enforces them | Content-hashed filenames make both obsolete. Preferred. |
| 10 s poll interval, 15 s / 30 s / 60 s TTLs | Tunable, subject to I-C3. |
| The specific 72-entry precache list | Regenerate it; do not transcribe it. Subject to I-C7. |
| The `.html` / `/` no-cache rule, gzip level 6, 512-byte gzip floor | Ordinary tuning. |
| `ThreadingTCPServer`, `request_queue_size = 128`, the `address_string()` reverse-DNS override | Workarounds for `http.server` specifically. Irrelevant on a real server. |
| The exact panel inventory and tab layout | Product surface. Rebuild to whatever the operator needs. |
| CSS file split, class names, the specific colour hexes | Reproduce from `DESIGN.md` (Section 6) if visual fidelity is wanted; otherwise free. |
| `X-Operator-Token`'s deprecated node-token-alias meaning | Already deprecated upstream, emitting `Deprecation`/`Sunset` headers. Do not reimplement the alias; implement only the break-glass meaning, or neither. |

---

### 15. Pitfalls and caveats

Every entry below is code that exists **because something broke**. A rebuilder who does not know
these will reintroduce the bugs. Each entry states the failure, the guard that prevents it, and the
generalisable lesson.

The included source comments and design contracts record failure classes, guards, and review
reasoning. The following lessons are useful independently of any deployment's source history.

#### 15.1 The delivery-staleness family (the dominant failure mode)

This one failure -- *"we shipped a fix and the operator never saw it"* -- recurs across at least six
separate incidents and is responsible for more of the architecture than any other single cause.

| # | Failure observed | Guard introduced | Commit |
|---|---|---|---|
| S1 | Cache-first service worker served old JS indefinitely; operator stared at an unchanged screen after a fix shipped. | Service worker switched to **network-first** for static assets. | `<id>` |
| S2 | `max-age=60` on CSS/JS left a 60-second window after every ship in which clients still got the old file. | `no-cache` + `ETag` for `.css`/`.js`. | `<id>` |
| S3 | Content-identical redeploys would not bust caches. | ETag derived from **mtime+size**, not content hash -- pinned with an explicit "do NOT optimize" warning. | `<id>` |
| S4 | A duplicate `ETag` header was emitted on the `304` path. | Removed.  Caught in review. | `<id>` |
| S5 | An asset's content changed but its `?v=<cache-label>` stamp was not bumped, so browsers never refetched it. | `Lint-CacheStamps.ps1` deploy gate comparing content hashes against `.cache-stamp-manifest.json`. | `<id>`, `<id>` |
| S6 | The lint gate could be skipped when `pwsh` was missing, silently. | Gate hardened to **fail closed**. | `<id>` |
| S7 | Even with a network-first SW, an *already-open tab* kept running old JS until manually reloaded. | One-shot self-healing reload on `controllerchange`, double-guarded. | `<id>` |
| S8 | The service worker precache list drifted from the assets the page actually loads. | Precache list resynchronised; parity now 72/72. | `<id>` |

**Lesson.** In a system where an operator leaves a tab open for days, "deployed" and "delivered"
are different events, and only the second one matters. Invariant **I-C1** exists because this was
learned eight times.

#### 15.2 The stale-data family

| # | Failure observed | Guard | Evidence |
|---|---|---|---|
| S9 | A new coordinator endpoint (`/api/cairn/rfc/forum`) was added without being added to the `NO_CACHE` blocklist, so it silently inherited 60 s stale-while-revalidate. Operator saw stale wave/synthesis data. | Blocklist inverted to a **CACHEABLE allowlist**. New endpoints are now fresh by default. | `<id>`, comment at `api-resilience.js` |
| S10 | After the inversion, already-open operator tabs still held `localStorage` entries for endpoints that were cacheable under the *old* policy, and would keep serving them for up to 5 minutes. | A **one-shot migration purge** at module load that removes any cached entry whose endpoint is no longer on the allowlist. | `api-resilience.js` |
| S11 | L2 (`localStorage`) TTLs were longer than L1 (memory) `maxAgeMs` for shared endpoints -- L1 asked for a refresh and L2 answered with data up to 4x staler, silently defeating L1's freshness intent. | L2 TTLs aligned to L1 `maxAgeMs` for every shared endpoint. | `<id>`, comments at `datastore.js` and `api-resilience.js` |
| S12 | `/api/molt/history` (TTL 120 s) was listed *after* the generic `/api/molt` (60 s) in an in-order prefix-scan table, making the specific entry **unreachable dead code**. | Reordered: specific before generic. | `<id>`, comment at `api-resilience.js` |
| S13 | Cache invalidation was gated on the *view* rather than the *data*: in-component memoization (`Cairn.kbData`, `Cairn.forumCache`, `CairnPanel._data`, ...) was cleared only if the relevant view was visible. A write succeeded, IndexedDB cleared -- but a different tab's memoization held stale state and served it on navigate-back. Observed **n=17** times. | In-component memoization is now cleared **unconditionally** on any matching event, regardless of which view is active. DOM re-render remains only as a courtesy. | `<id>`, comment at `cairn-cache.js` |
| S14 | A KB cache layer had no TTL at all. | 2-minute TTL on all KB cache entries, labelled "P0 stale data fix". | `<id>` |
| S15 | An SSE-triggered refresh raced the cache and re-populated it with pre-write data. | `forceFresh` option to bypass the cache on event-driven refresh. | `<id>` |

**Lesson.** Three of these (S9, S11, S12, S13) are the *same* bug in different clothing: a caching
decision was made by a proxy for the thing that actually matters -- an endpoint list instead of
freshness intent, a table order instead of specificity, a visible view instead of data identity.
Cache invalidation should key on the **data**, never on the UI state that happens to be showing it.

#### 15.3 The silent-mismatch family (allowlists that drifted)

Two modules maintain parallel tables of CAIRN event names: `js/cairn-cache.js` decides **cache
invalidation**, `js/sse.js` decides **notification display**. They must agree.

Quoted from `js/sse.js`:

> *"CANONICAL SOURCE: js/cairn-cache.js lines 619-646 (CAIRN_OUTBOX_EVENTS + CAIRN_SUBSTRINGS + _matchesCairn). If you add an event type there, mirror it here. Backend-emitted cairn events must (a) match an explicit key below, OR (b) contain one of the substring tokens. **Drift between the two tables causes silent notification loss.**"*

| # | Failure | Guard | Evidence |
|---|---|---|---|
| S16 | The notification allowlist matched `cairn_rfc_created` / `cairn_wave_opened` -- names the backend **never emits**. The backend emits `wave_opened`, `rfc_ratified`, `solidplan_attached` without a `cairn_` prefix. The cache layer was invalidating correctly the whole time, so data was fresh but **notifications were silently absent**. | Allowlists reconciled against canonical backend event names; an explicit "canonical source" pointer added in **both** files. | `<id>`, `<id>`, `<id>`, comment at `sse.js` |
| S17 | A substring matcher matched `ship` inside `relationship_changed`, producing false-positive CAIRN notifications. | `sse.js` uses a **word-anchored** matcher: split `event_type` on `_` and require a segment to equal a token exactly. | `<id>`, comment at `sse.js` |
| S18 | An RFC-ID regex `\bRFC\d{2,4}(?:p\d+)?\b` failed on the `x`-suffix taxonomy. The trailing `\b` did not match because **digit-to-letter is not a word boundary**, so `an RFCx1` lost even its `an RFC` prefix match. 20 live tasks were affected. | Suffix class widened to `[xpc]`. | `<id>`, comment at `cairn-panel.js` |

**Note a remaining asymmetry, unresolved:** `cairn-cache.js._matchesCairn` still uses plain
`indexOf` substring matching while `sse.js._matchesCairnEvent` uses the hardened word-anchored
matcher. Only one of the two tables received the S17 fix. A rebuild should implement **one**
matcher in **one** place and have both consumers call it. See Section 17.4.

**Lesson.** Two hand-maintained tables that must agree will eventually disagree, and the failure is
silent by construction. The comments pointing at a "canonical source" are an admission that the
right fix -- a single table -- was not made.

#### 15.4 The resource-exhaustion family

| # | Failure | Guard | Commit |
|---|---|---|---|
| S19 | Firefox growing to **4 GB** and crashing with the dashboard left open. | Memory-leak fixes plus `PerfGuard` auto-maintenance: bounded uptime (`MAX_UPTIME_MS` 4 h), idle reload (30 min idle after 2 h uptime), periodic cache cleanup every 10 min, SW API cache capped at 40 entries. | `<id>`, `<id>` |
| S20 | Recurrence: **3.5 GB** Firefox bloat from five distinct leak vectors. | Five vectors patched. | `<id>` |
| S21 | Panels each registered their own `pause`/`resume`, so some timers were never paused when the tab was hidden. | All pause/resume unified under `PerfGuard`. Later extended to *all* panel timers and watchdogs. | `<id>`, `<id>` |
| S22 | Aggressive parallel pre-loading overloaded the system. | **Reverted.** | `<id>` |
| S23 | `http.server` served assets serially; concurrent asset loads blocked each other. | `ThreadingTCPServer`. | `<id>` |
| S24 | Every request performed a reverse-DNS lookup via `getfqdn()`, adding roughly 2 s per request. | `address_string()` overridden to return the raw IP. Per-request timing instrumentation added, `request_queue_size` raised to 128. | `<id>`, `<id>` |
| S25 | Full `content.innerHTML =` teardown on **every** 15 s poll tick, even when data was unchanged -- destroying `<details>` open state (operator reported the blocked-banner "randomly collapsing"), resetting scroll, and re-triggering the stale-data badge every 15-30 s. | Render-signature dirty-check (`_lastRenderSig`) skips the rebuild when nothing rendered actually changed. | `<id>`, comment at `taskboard.js` |
| S26 | Same class, other panels. | Dirty-check guards added to `BusPanel.render` and `renderBoard()`; textarea content and scroll position preserved across `renderDetail()`. | `<id>`, `<id>` |
| S27 | 52 script tags loaded render-blocking. | `defer` on all of them. | `<id>` |

**Lesson, and it is subtle.** S25 is not primarily a performance bug -- it is a **UI state
destruction** bug that happened to be caused by a performance anti-pattern. Re-rendering unchanged
data is not merely wasteful; in a DOM that carries user state (open/closed disclosure, scroll
position, in-progress textarea content, transient badges), it is actively destructive. The comment
records that a previous comment claiming the state "survives re-render" was *true for incremental
patching and false for full `innerHTML` replace* -- the kind of drift between a comment and its code
that a rebuilder should expect to find.

#### 15.5 The interruption family (do not reset the operator)

A distinct cluster: background refresh interfering with an operator who is actively reading or
typing.

| # | Failure | Guard | Commit |
|---|---|---|---|
| S28 | A courtesy re-render reset the CAIRN reader while the operator was reading a KB article or seed. Escalated **P1**. | Guard: suppress the re-render while a detail view is being read. Landed in two parts. | `<id>`, `<id>` |
| S29 | A board reload fired on every CAIRN event. | Debounced to at most 1 per 8 s. | `<id>` |
| S30 | A search input was cleared out from under the user by a refresh. | Fixed, with badge-spam suppression. | `<id>` |
| S31 | Rebuilding `filters.innerHTML` discarded in-progress filter state. | Guarded. | comment at `cairn-board.js` |
| S32 | A column blacked out during auto-refresh. | Silent board auto-refresh (no visible blackout). Labelled **P1**. | `<id>` |
| S33 | A "ratify" button silently failed -- the click did nothing, with no feedback. | Symmetric UI pre-gate plus in-flight disable. | `<id>`, `<id>` |
| S34 | Drawer open state drifted from actual DOM state, so the toggle became inverted. | Open state synced with the DOM. | `<id>` |

**Lesson.** The dashboard's refresh loop and the operator's attention are in direct conflict. Every
automatic refresh must ask whether the user is currently depending on the thing it is about to
replace. A rebuild using a reactive framework with keyed reconciliation gets most of this for free --
which is a strong argument for using one (Section 17.1).

#### 15.6 The security and correctness family

| # | Failure | Guard | Commit |
|---|---|---|---|
| S35 | XSS through values interpolated into inline `onclick` handler attributes. | Escaping. Note the vector is attribute context, not text context. | `<id>` |
| S36 | XSS via `assigned_to` / `thrown_by` fields. | Escaped; API errors surfaced rather than swallowed. | `<id>` |
| S37 | Mock data rendered indistinguishably from live data. | Visible mock-data warning banner; mock footer gated behind an explicit `_usingMock` flag. | `<id>`, `<id>` |
| S38 | A page-capped SWAT fetch let closed history consume the page cap before client-side filtering, silently undercounting open work. | Per-stage fetch plus `SwatCompletenessError` on any malformed page. | `<id>`, `<id>` |
| S39 | Badge counts derived from `len(page)` rather than a real total. | Authoritative `/api/swats/count` (unbounded `COUNT(*)`); authoritative-vs-rendered difference surfaced when they disagree. | `<id>`, `taskboard.js` |
| S40 | The `fixed` stage was excluded from "active" SWATs, undercounting real unclosed workload relative to the coordinator. | Default stage set now `['open','in_review','fixed']`. | `<id>` |
| S41 | A TCP-connect-only lane probe reported **false GREEN** when sshd was hung (port open, banner never sent). Reproduced by a reviewer from another host. | Two-tier probe: banner required for `green`; connect-without-banner is `degraded`. | `<id>` |
| S42 | A false-red "Cannot reach coordinator API" banner appeared on initial load before the first fetch resolved. | Suppressed on initial load. | `<id>` |
| S43 | An OPA authorization trail was fetched but never rendered -- the data was on the wire and invisible in the UI. | Surfaced in the Guestbook audit view. | `<id>` |
| S44 | Fleet-wide animation with no reduced-motion support. | `prefers-reduced-motion` honoured fleet-wide. | `<id>` |
| S45 | Collapsible headers were non-semantic elements, unreachable by keyboard and unannounced to assistive tech. | Rewritten as `<button>` with ARIA. | `<id>` |

#### 15.7 Fail-open versus fail-closed: the explicit choices

The codebase makes this choice deliberately and differently in different places. The pattern is
consistent and worth copying.

| Site | Choice | Rationale |
|---|---|---|
| Cacheability policy | **Fail-closed** (allowlist; uncached by default) | An unconsidered endpoint must render fresh. Cost of being wrong: a wasted request. Cost of the alternative: invisible stale data. |
| Cache-stamp deploy gate on missing `pwsh` | **Fail-closed** (block the deploy) | A gate that skips when its runtime is missing is not a gate. |
| Lane health probe without a banner | **Fail-closed** (`degraded`, not `green`) | Never round an ambiguous state up to healthy. |
| Incomplete SWAT page | **Fail-closed** (throw `SwatCompletenessError`) | A silently short list is indistinguishable from a genuinely short list. |
| `localStorage` unavailable | **Fail-open** (`catch`, continue uncached) | Caching is an optimisation; losing it must not break the page. Explicit comment: *"localStorage unavailable -- non-critical"*. |
| `sessionStorage` unavailable in the SW reload guard | **Fail-open, but degraded to the second guard** | Explicit comment: *"sessionStorage unavailable -- in-flight flag still guards"*. Never fails open to *zero* guards. |
| IndexedDB `open()` failure | **Fail-open** (null-safe accessors) | `<id>`: prevented the CAIRN drawer hanging entirely when IDB was unavailable. |
| gzip failure | **Fail-open** (serve uncompressed) | Compression is an optimisation. |
| Coordinator unreachable | **Fail-closed, but loudly and specifically** | `502` with a distinct error code, so the UI can render a correct degraded state rather than a blank one. |

**The rule these follow**: fail **closed** on anything that determines *correctness or freshness of
displayed data*; fail **open** on anything that is purely an *optimisation* -- and when failing
open, degrade to a weaker guard rather than to no guard.

---

### 16. Evolution: what migrated from what, and why

Understanding the direction of travel matters as much as the current state, because several
constructs in the codebase exist only to bridge an old shape to a new one.

#### 16.1 Migrations you can still see in the code

| From | To | Why | Bridge still present? |
|---|---|---|---|
| Per-panel `fetch` + per-panel timers | `FleetState` singleton with subscriber-driven polling | Duplicate requests, leaked timers, no shared connectivity state | **Yes** -- `var DataStore = FleetState` alias at the end of `js/datastore.js`, plus consumers still calling `DataStore.get(...)`. Both names are live. |
| `NO_CACHE` blocklist | `CACHEABLE` allowlist | Fail-unsafe default (S9) | **Yes** -- a one-shot `localStorage` purge (`api-resilience.js`) that exists solely to clean up entries created under the old policy in long-lived tabs. Safe to delete in a rebuild; there are no old tabs. |
| Cache-first service worker | Network-first | Stale-screen pattern (S1) | The cache remains, repurposed as an offline fallback only. |
| `max-age=60` on assets | Two-mode: `?v=<cache-label>` immutable, else `no-cache`+ETag | 60 s post-ship stale window (S2) | **Yes, by design** -- the unversioned branch is a permanent graceful-degradation path, not a temporary bridge. |
| Direct browser calls to the coordinator origin | Same-origin `/api/*` reverse proxy | CORS elimination (D2) | Partially: **writes still bypass the proxy** (D4). This migration is incomplete. |
| `cairn_rfc_created`-style prefixed event names | Canonical unprefixed names (`wave_opened`, `rfc_ratified`, ...) | The prefixed names were never emitted (S16) | **Yes** -- tolerant readers: both an explicit key table *and* a token matcher, so old and new shapes both match. |
| RFC ID suffix taxonomy `pN` | `xN`, later `cN` | Taxonomy expansion; `p` is "being phased out per OPERATOR taxonomy discussion but those RFCs are still on the active board" | **Yes** -- regex `[xpc]` deliberately keeps `p` for backfill. An explicit tolerant reader with a documented sunset. |
| `/api/messages/send` | `/api/messages` | Coordinator endpoint rename | No bridge; client updated (`<id>`). |
| `include_read=true` | `status=all` | Coordinator query-param rename | No bridge (`<id>`). |
| MOTD `content` / `from_node` | `message` / `created_by` | Coordinator field rename | No bridge (`<id>`). |
| `_incidents` | `-incidents` | Coordinator canonicalised on hyphens | Fixed once (`<id>`) -- **and regressed**: `js/resilience-incidents.js` currently calls `/api/resilience_incidents`. See Section 12 and 17.4. |
| Kanban "Backlog" column | SWAT listing (`open`/`in_review`/`fixed`) | Column repurposed for incident tracking | `<id>`; test assertions updated separately in `<id>`, which is itself evidence that the rename broke a test. |
| Mock-backed widgets | Live coordinator endpoints | Widgets were built before their backend shipped | **Yes** -- an RFC-B4 and an RFC-P5 widgets contain mock fallbacks gated behind `_usingMock`, with a visible banner, and commit `<id>` notes "mock 7/8 GREEN; **LIVE auto-promotes on coord restart**". A deliberate build-ahead-of-backend pattern. |
| Toast notifications on SSE events | Notification bell + a Notifications tab | Toasts were disruptive; note the sequence `<id>` (suppress) -> `<id>` (revert) -> `<id>` (proper bell + tab, "nuke SSE toasts") | Completed. |
| `/dashboard` HTML routes on the coordinator | Superdash <version-label> on `:<DASHBOARD_PORT>` | Single canonical UI | Removal documented at `coordinator/server.py`. Only `GET /api/dashboard/heartbeats` survives, and it is a **data** endpoint whose name is a fossil. |

#### 16.2 Feature flags and staged rollout

The project uses feature flags as a migration device rather than as configuration.

- `js/config.js` gates the tool-cost intel card. Quoted: *"an RFC-P5 AC18: enable the tool-cost intel widget by default. The P3.5 backend [endpoint shipped + telemetry accreted]"*. The flag was flipped default-ON in `<id>` only after the backend was live -- the flag existed to let the front end ship first.
- `?electric=1` query flag gates the electric-border accent (`<id>`), an opt-in visual experiment.
- an RFC-B4 shipped in explicitly numbered batches with **no consumer wire-up** (`<id>` "Batch-2, no consumer wire-up"; `<id>` "Batch-1, no consumer wire-up"), meaning render helpers were landed dormant and wired later. `js/phase-vocab.js` and `css/phase-badge.css` are orphans today precisely because they are Batch-1 artefacts whose consumer never landed (Section 8).

**Lesson for a rebuilder**: dormant, unwired modules in this codebase are usually *not* dead code
left behind -- they are forward-staged code whose consumer was never written. Check the commit that
introduced a module before deleting it.

---

## Part C: Assessment

---

### 17. What I would do differently

> **This section is opinion, not evidence.** It is the documenting engineer's assessment, written
> from the implementation references and design contracts. It is deliberately separated from Parts A
> and B. A rebuilder is free to disagree with all of it. Nothing here should be cited as a fact
> about the original system.

#### 17.1 Use a real component framework, and let it solve the state-destruction problem

**Assessment: the largest single win available.**

Sections 15.4 and 15.5 describe roughly a dozen incidents that share one root cause: full
`innerHTML` replacement destroying DOM-carried user state (disclosure open/closed, scroll position,
textarea content, focus, in-flight filter text). The project's answer was to add a hand-written
dirty-check to each panel, one incident at a time -- `taskboard.js`, `BusPanel`, `renderBoard`,
`renderDetail`, the CAIRN reader guards, the filter-rebuild guard, the search-input guard.

Every one of those is a manual reimplementation of keyed reconciliation. Any framework with a
virtual DOM or fine-grained reactivity (React, Preact, Svelte, Lit, Vue) makes this class of bug
structurally impossible, because it patches rather than replaces.

I would accept the build step (see 17.3) specifically to buy this.

**Counter-argument I take seriously**: the no-build design is what makes provenance (I-D2) trivially
true, and the system is edited by agents directly on the host. That is a real property worth
preserving, and any framework choice must not break it. A framework that compiles to a single
content-hashed bundle plus a build-provenance file would satisfy both, but it *is* strictly more
machinery.

#### 17.2 Fix the credential model properly

**Assessment: the most serious defect in the system.**

`js/config.js` hardcodes a bearer token in plaintext, in a git repository, and ships it to every
browser. `services/image-service.py` hardcodes the same value. Section 7 documents this; Section
14.2 marks it as a violated invariant (**I-B6**).

It is not a small problem. It means:

- Every operator's browser holds a full fleet credential in a file served over plain HTTP.
- The credential is in git history and therefore cannot be rotated by editing one file.
- The "dashboard authority" concept on the coordinator is doing real work (I-B4), but the thing
  that authenticates *to* it is a shared static secret with no per-user identity, so the audit
  trail cannot distinguish operators.

What I would build instead, in increasing order of effort:

1. **Minimum**: move the token out of the repository entirely; have the dashboard server inject it
   at request time. This contradicts D3 (credential-free web tier) and I should be honest that it
   is a genuine tradeoff, not a free win -- it makes the web tier a credential holder. But a
   server-side secret with a rotation path beats a client-side secret in git.
2. **Better**: a real session. Operator authenticates once, the server sets an `HttpOnly`,
   `SameSite=Strict`, `Secure` session cookie, and the proxy exchanges the session for upstream
   credentials. The browser then never holds a fleet token at all, and D3's *intent* (no token
   visible to the client) is better served than by the current design.
3. **Best**: per-operator identity with short-lived tokens, so the coordinator's audit trail names
   a person rather than "DASHBOARD".

Whatever is chosen, TLS is a prerequisite. A bearer token over plain HTTP on a shared network is
readable by anyone on the path, and none of the above matters without it.

#### 17.3 Replace manual cache stamps with content-hashed filenames

**Assessment: eliminates an entire tooling subsystem.**

The current chain is: hand-edit `?v=<cache-label>` in `index.html` -> maintain `.cache-stamp-manifest.json` ->
run `Lint-CacheStamps.ps1` as a mandatory fail-closed deploy gate -> hope nobody bypasses it. That
is three artefacts and a process step existing solely to compensate for the absence of a build.

Content-hashed filenames (`app.4f3a9c.js`) make the problem definitionally impossible: changed
content produces a different URL. `.cache-stamp-manifest.json`, `Lint-CacheStamps.ps1`, the
`?v=<cache-label>` two-mode server logic, and the 4096-byte `CACHE_VERSION` scan (I-D5) all
disappear together.

The ETag-via-mtime decision (D6) would also become unnecessary for hashed assets, though it should
be **kept for `index.html`**, which cannot itself be hashed. I want to be careful here: D6 is
correct for the system as built, and I am not proposing to "fix" it in place -- I am proposing to
remove the conditions that made it necessary. Those are different things, and confusing them is
exactly what the source comment warns against.

#### 17.4 Deduplicate the parallel truth-tables

**Assessment: cheap, high-value, and the defect is live today.**

Three concrete instances:

1. **The CAIRN event matcher exists twice.** `cairn-cache.js._matchesCairn` (substring `indexOf`)
   and `sse.js._matchesCairnEvent` (word-anchored segment match). The S17 hardening was applied to
   only one of them. Both files carry comments naming the other as "canonical source", which is an
   admission that the real fix -- one function, one table, two callers -- was deferred. Do that fix.
2. **The endpoint-name mismatch is unfixed.** The client calls `/api/resilience_incidents`; the
   coordinator implements `/api/resilience-incidents`. This exact class of bug was fixed once
   already (`<id>`) and came back. A single generated endpoint constants module, shared or
   validated against the coordinator's route table, closes it permanently.
3. **The L1/L2 TTL alignment is enforced by a comment.** `datastore.js` and `api-resilience.js`
   hold two tables that must satisfy `L2.ttl <= L1.maxAgeMs` (I-C3), and the only thing enforcing
   it is a long comment explaining how it broke last time. Derive L2's table from L1's, or assert
   the relation at load time and log loudly on violation.

There is a general principle here the codebase found but did not finish applying: **if two tables
must agree, generate one from the other or merge them. A comment saying "keep these in sync" is a
scheduled outage.**

#### 17.5 Make the degraded SSE path honest, or delete it

**Assessment: the current state is confusing rather than harmful.**

Today the app probes `/api/events`, gets JSON rather than `text/event-stream`, and falls back to
10 s polling -- **every time, on every load**. The coordinator *does* maintain a genuine
`__dashboard__` SSE channel with a 4096-entry replay ring and 22 event kinds, reachable at
`/api/stream`, and the dashboard does not consume it. The footer therefore permanently reads
`degraded (poll)`.

To the project's credit, this is *labelled honestly* (I-U1, D14) rather than dressed up as healthy.
But a permanently-degraded indicator trains operators to ignore it, which costs the label its
meaning at the exact moment something is genuinely wrong.

Two acceptable resolutions, and I have no strong preference:

- **Connect it.** Consume `/api/stream`, use the replay ring for gap-free reconnects, and let
  `degraded (poll)` mean something again. This is what the backend was clearly built for.
- **Delete the pretence.** If polling at 10 s is adequate -- and for a dashboard a human is watching,
  it probably is -- remove the probe and the fallback machinery, and label the transport "poll (10s)"
  with a neutral affordance. Simpler, honest, and removes a whole code path.

What I would not do is leave it as-is, because "permanently degraded" and "currently degraded" look
identical.

#### 17.6 Stop the write path bypassing the proxy

**Assessment: finish an incomplete migration.**

D4 made the proxy GET-only, which was right at the time. The consequence is that reads are
same-origin and writes are cross-origin, which means the system needs CORS after all for exactly
the requests where getting it wrong is most costly, and it means there are two different auth paths
to reason about (I-B5).

I would proxy writes too, with an explicit method allowlist and the same header allowlist
discipline (I-B2, I-B3). The stated reason for GET-only -- "the dashboard widgets are read-only" -- is
no longer true and has not been true since the Task Board gained write actions (`<id>`, May 21).

#### 17.7 Configuration should not be source code

`PORT = <DASHBOARD_PORT>` and `http://<coordinator-host>:<COORD_PORT>` are literals in `superdash-server.py`. The lane probe, by
contrast, *is* env-overridable, with a stated reason: *"Host/port are env-overridable for
testability and for a future off-host probe."* That instinct was right and should have been applied
everywhere. Port, upstream URL, timeouts, and the served directory should all come from environment
with the current values as defaults.

#### 17.8 Things I would deliberately keep

I want to be clear that the following are not accidents of an old codebase -- they are good ideas
that a modern rewrite would be tempted to discard, and should not.

| Keep | Why |
|---|---|
| **Local self-diagnostic endpoints that work while the backend is down** (D5, I-D1) | The best idea in the system. Most dashboards cannot tell you anything about themselves during the outage you are using them to investigate. |
| **The `/api/version` (cached) versus `/api/deploy_status` (live) pair as a drift detector** (D17, I-D3) | Genuinely clever. It turns a limitation (startup-cached git facts) into a signal. Keep it even if you fix the underlying restart model, because served-tree drift is real regardless. |
| **The truthfulness invariants** (Section 14.5) | Every one of I-U1 through I-U8 was learned from a real incident. They cost almost nothing to honour and they are what makes the tool trustworthy. |
| **Fail-closed on correctness, fail-open on optimisation** (Section 15.7) | A clean, teachable rule the codebase applies consistently. |
| **Degrading to a weaker guard rather than to no guard** (I-C6) | The `sessionStorage`-unavailable branch in the SW reload guard is a small masterpiece of defensive thinking. |
| **The deploy-receipt practice** | Deploy receipts recording live-verified evidence, with peer cosign, on a *dashboard*, is heavier process than most teams would accept -- but it is why this document could reconstruct intent at all. The audit trail is the reason this system is documentable. |
| **Incident IDs in code comments** | 357 references linking code to the incident that caused it. This is the single highest-value documentation practice in the repository and it cost nothing at the time. Do this. |

#### 17.9 Honest summary of my assessment

This is a system built under real operational pressure, by multiple agents, with an operator
watching it live and reporting bugs by screenshot. Judged as an artefact of that process it is
**better than it looks**: the architecture is mostly reactive accretion, but the *values* encoded in
it -- fail-closed on correctness, never lie about state, label degradation -- are more disciplined
than most professionally-built dashboards.

Its two genuine defects are the credential model (17.2) and the absence of a component framework
(17.1), and both are consequences of the same reasonable early decision to have no build step. The
caching complexity, the dirty-check proliferation, the cache-stamp linter, and the manual truth
tables are all downstream of that one choice.

A rebuild should keep the invariants in Section 14, keep the scar tissue knowledge in Section 15,
and feel free to throw away nearly all of the implementation.

---

*End of document.*
