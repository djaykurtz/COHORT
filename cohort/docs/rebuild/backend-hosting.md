# Backend Hosting and the Fleet Coordinator Service

Permanent rebuild documentation for the ZEROBRAIN fleet backend. This page is written to be
sufficient for an engineer with no access to the original machines to stand the backend up on
fresh hardware.

## 0. Scope, sources, and reading conventions

### 0.1 Current contract

This page covers **backend hosting only**: the coordinator service process, its database
substrate, its transport-layer authentication, its event/streaming surfaces, and the
breathbus liveness daemon that the coordinator depends on for node life-services gating.

Out of scope (documented elsewhere in this repository): the dashboard (`superdash`, port <DASHBOARD_PORT>),
node-side agent behaviour, skills, and fleet governance process.

### 0.2 Primary sources (stable references)

The stable inputs for this page are the coordinator repository and the Breathbus liveness-daemon
repository. This document deliberately omits source-hosting remotes, commit hashes, local checkout
paths, machine names, and other identifiers from the original deployment. Repository-relative file
names are kept as source anchors where they explain a mechanism.

The original remotes were machine-local backup paths. A rebuild must start from a clean archive of
these repositories and then create new source-hosting remotes for the rebuilt environment.

### 0.3 Section structure

Every major section below is split into:

- **Current contract** -- the behaviour a rebuild must reproduce.
- **Implementation evidence** -- where in source that behaviour is defined.
- **Deployment evidence** -- how it was actually deployed on the retiring hardware.
- **Unresolved** -- what could not be verified from source.

### 0.3.1 How claims are labelled: evidence, intent, opinion

This document mixes three kinds of statement. They are never blended inside a paragraph, and
every section that contains more than one is labelled.

| Layer | Label used | What it means | How to treat it |
|---|---|---|---|
| A | *Verified evidence* (sections 0-12, and the "Evidence" column of every table in 13-16) | Read directly out of source at the pinned commits, or out of deployment scripts on the retiring hosts. Identifiers are quoted exactly. | Trust it. Reproduce the behaviour, not necessarily the code. |
| B | *Design intent / rationale* (sections 13-16) | Why a decision was made. Quoted from source comments, docstrings, runbooks, or incident IDs where the code states a reason; otherwise marked as inferred. | Use it to decide what to keep and what to redesign. |
| C | *Assessment* (section 17 only) | The author's engineering opinion about what was over-complex, fragile, or worth reconsidering. Not evidence. | Argue with it freely. |

Sections 13-17 were added after the original twelve to serve reconstruction rather than
cloning. **Section 14 is the most important section in this document.** If a rebuilder reads
only one thing, read section 14: it separates the properties that are load-bearing from the
choices that are incidental.

### 0.4 Secrets

No real secret value, token, password, PAT, or credential-bearing connection string appears in
this document. Secrets are written as shapes or placeholders, with a pointer to where the real
value came from. Several files in the source repository **do** contain literal production
credentials (notably `_start-coordinator.cmd`, `_start-coordinator-dev.cmd`,
`_start-coordinator-test.cmd`, and `docs/deploy-guide.md`, all of which embed the literal
`AUTH_TOKEN`). Those values are deliberately omitted here, and must be rotated rather than
reused on rebuild.

## 1. Service inventory

### 1.1 Current contract

The backend is five process classes. Only the production coordinator and PostgreSQL are required for
a minimal backend; the development/test coordinator instances, Breathbus, and the dashboard-facing
surface add isolation, liveness, and observability.

| Service ID | Role | Host role | Port placeholder | Protocol | Startup contract |
|---|---|---|---|---|---|
| `coordinator` | REST API, MCP JSON-RPC, and SSE broker | the coordinator host | `<COORD_PORT>` | HTTP/1.1 | `scripts\_launch-prod.ps1` execs `scripts\serve_dualstack.py coordinator.server:app --port <COORD_PORT>` |
| `coordinator-dev` | Development instance with isolated state | the coordinator host | `<COORD_DEV_PORT>` | same | development launcher or equivalent |
| `coordinator-test` | Test instance with isolated state | the coordinator host | `<COORD_TEST_PORT>` | same | test launcher or equivalent |
| `coordinator-pg` | PostgreSQL write-of-record | the coordinator host | `loopback:<DB_PORT>` | PostgreSQL wire protocol | service-managed `postgres.exe -D <pg-root>\data` |
| `breathbus-node` | Host-local rider liveness daemon | each host that runs riders | `<DAEMON_PORT>` plus named pipe | HTTP + named pipe | service-managed `breathbus-node.exe --config=<config-path>` |
| `superdash` | Dashboard consumer, not part of this backend | dashboard host | `<DASHBOARD_PORT>` | HTTP | out of scope |

Protocol notes:

- The coordinator serves FastAPI REST, MCP JSON-RPC 2.0 at `POST /mcp`, and SSE from the same ASGI
  app and the same production port. There is no separate MCP process.
- SSE endpoints are `/events`, `/events/{node_id}`, `/api/stream`, and `/api/stream/{node_id}`.
- PostgreSQL binds loopback only and is never exposed off-host.
- Development and test ports are placeholders, not reserved deployment facts. Choose them fresh and
  keep their state isolated.

### 1.2 Host registry

The coordinator has a compiled host registry. It is intentionally fail-loud: `get_host_fqdn` raises
`KeyError` if a host entry is missing or drifted, instead of guessing.

| Field | Rebuild rule |
|---|---|
| Host ID | Use a generic `<HOST_ID>` for each physical host. |
| FQDN / network name | Point to the new host name only; do not carry old names forward. |
| Remote prefix | Use `<shared-root>` or `<backup-destination>` placeholders in docs. |
| Local tools root | Use `<node-home>` or another logical location. |
| Logical nodes | Use role names such as the PM node, the architect node, the reviewer node, a builder node, the analyst node, and the operations node. |

Prefer FQDN-style remote prefixes over short names if the new environment has the same latency
profile. The rule is performance-driven, not tied to the original host names.

### 1.3 Implementation evidence

| Fact | Evidence |
|---|---|
| Host/FQDN/UNC registry | `coordinator/hosts.py`, `_SEED_HOSTS` |
| ASGI app object, router mounting | `coordinator/server.py`app = FastAPI(`), `-`include_router`) |
| MCP endpoint on the same app | `coordinator/server.py`mcp_endpoint`) |
| Prod launcher | `scripts/_launch-prod.ps1` |
| Real process entry point | `scripts/serve_dualstack.py` |
| PostgreSQL topology | `coordinator/rfc603/README.md` |
| Breathbus service definition | `breath-bus` `internal/service/service.go`const ServiceName = "breathbus-node"`) |

### 1.4 Deployment evidence

All three coordinator instances and the PostgreSQL cluster ran on the coordinator host. The dev and test
instances exist purely for DB isolation (separate database files / schemas, section 5) and
were started on demand, not supervised.

### 1.5 Unresolved

- `cairn_service.py` in the coordinator repository defines a standalone service reading
  `CAIRN_PORT` (default <CAIRN_PORT>) and `COORDINATOR_URL` (default `http://<coordinator-host>:<COORD_DEV_PORT>`).
  **Verified at source: it did not run in production.** Neither port was listening, and no
  process carried it on its command line. It is a stale scaffold; do not deploy it.
- `gateway-test/gateway.py` reads `GATEWAY_PORT` (<COORD_PORT>) and `BACKEND_PORT` (<COORD_DEV_PORT>). This is a
  test scaffold, not a production service.

## 2. Runtime prerequisites

### 2.1 Current contract

| Requirement | Value | Notes |
|---|---|---|
| Operating system | Windows (Server or 10/11 class) | Hard dependency. The supervision, launch, backup, and watchdog layers are PowerShell + Windows SCM + NSSM + Windows Scheduled Tasks. Named pipes (`<network-host>\pipe\breathbus-<HOST>`) are used by breathbus. |
| Python | Python 3.x (Python 3.x verified on the coordinator host) | Runs from a repo-local virtualenv at `<repo>\.venv\Scripts\python.exe`. An earlier draft recorded a different Python minor version from a peer machine; the production host was 3.13, a different minor version. Superdash runs on a separate system Python, not this venv (see `website-superdash.md`). |
| PowerShell | 7 or newer (`pwsh.exe`) | **Required, not optional.** `scripts/_launch-prod.ps1` hard-exits if `$PSVersionTable.PSVersion.Major -lt 7`. Never invoke launchers with Windows PowerShell 5.1 (`powershell.exe`). |
| PostgreSQL | 16-class | EnterpriseDB portable distribution. Cluster initialised with `scram-sha-256` auth, `UTF8` encoding, `listen_addresses='loopback'`, `port=<DB_PORT>`. |
| Go toolchain | `a compatible Go toolchain` | Only needed to rebuild the breathbus binaries. Not needed to run the coordinator. |
| NSSM | any recent build | Used to define the `coordinator-pg` service (and a deliberately-disabled `coordinator` service). Observed at `<nssm>` (evidence locator). |

### 2.2 Runtime dependency manifest

Do not reproduce the old `pip freeze` verbatim in this design document. The rebuild needs one lock
file, generated from the rebuilt source tree and enforced at build time.

Required dependency categories:

- ASGI API stack: FastAPI, Starlette, Uvicorn, Pydantic, and their runtime dependencies.
- SQLite compatibility: `aiosqlite`, retained for tests, legacy paths, and Cairn while Cairn remains
  SQLite-backed.
- PostgreSQL runtime: an async PostgreSQL driver and a psycopg-compatible driver. This is
  load-bearing: installing the runtime requirements without the PostgreSQL drivers will not boot a
  PostgreSQL coordinator.
- Migration tooling: Alembic, SQLAlchemy, and templating support.
- Watchdog and diagnostics: process inspection and profiler tooling used by the out-of-band wedge
  diagnostics.
- HTTP, YAML, JSON-schema, and test support used by the scripts and validation suite.

Critical defect to carry forward as a principle: the reference runtime manifest under-declared the
packages needed by the PostgreSQL production posture. A rebuild must fail the build if the installed
environment diverges from the single lock file.

### 2.3 Development / test dependency manifest

Development and test dependencies extend the runtime lock with the pytest stack, HTTP clients,
configuration parsers, and the same PostgreSQL drivers used at runtime. The development manifest
must not be the only place PostgreSQL drivers are declared once PostgreSQL is the write-of-record.

`pyproject.toml` in the reference repository contains pytest settings only; it is not a dependency
manifest. Use a single lock file for rebuilds and enforce it in CI or an equivalent build gate.

### 2.4 Implementation evidence

| Fact | Evidence |
|---|---|
| PowerShell 7 hard gate | `scripts/_launch-prod.ps1` (version guard near top of file) |
| Runtime pins | `requirements.txt` |
| Test pins, asyncpg/psycopg placement | `requirements-dev.txt` |
| pytest-only pyproject | `pyproject.toml`, `[tool.pytest.ini_options]` |
| PostgreSQL version and cluster settings | `coordinator/rfc603/README.md` |
| Go module and single dependency | `breath-bus` `go.mod`a compatible Go toolchain`, `golang.org/x/sys <version>`) |

### 2.5 Deployment evidence

Production ran from `<repo>\.venv` on the coordinator host. PostgreSQL binaries lived at
`<pg-root>\pgsql\bin\` with the cluster at
`<pg-root>\data\` and role secrets in
`<secrets-dir>\` (gitignored). These are evidence locators; the
rebuild may place them anywhere as long as the configuration in section 4 is updated.

### 2.6 Unresolved

- Whether the checked-in development manifest or an external lock built the original runtime is unknown. For a rebuild, make the generated lock file authoritative.

## 3. Process model, supervision, restart, and shutdown

### 3.1 Current contract

**The process entry point is `scripts/serve_dualstack.py`, not `python -m uvicorn`.**
`serve_dualstack.py` creates an `AF_INET6` socket with `IPV6_V6ONLY=0` and `SO_REUSEADDR`,
binds `::`, and hands the socket to `uvicorn.Server.run(sockets=[sock])`. The reason is
concrete: an IPv4-only bind caused roughly two-second IPv6-SYN-timeout stalls on every request
addressed by FQDN or by `localhost`. A rebuild that drops the dual-stack socket will reintroduce
that latency.

**The literal argv tokens are load-bearing.** `scripts/restart-coordinator.ps1` locates, kills,
and verifies the coordinator process by regex-matching both `coordinator.server:app` and
`--port <PORT>` in the process command line. Changing the invocation shape breaks supervision.

**Boot gates**, all enforced before the port is bound:

| Gate | Behaviour | Exit code |
|---|---|---|
| `validate_branch()` | Refuses to serve if the checkout is not on `master` | 77 |
| `Assert-ProdLaunchSafe` (launcher-side) | Dirty tree / unsafe launch conditions | 78 |
| `validate_workers()` | Refuses `--workers` other than 1 | 79 |
| `database.boot_gate_or_exit()` | Instance-singleton lease check; prevents two coordinators on one DB | non-zero |
| argparse failure | Bad arguments | 2 |

`--workers 1` is an **invariant, not a tuning knob**: the SSE broker (section 8) holds
subscriber queues and ring buffers in process memory. A second worker would serve a disjoint
set of subscribers.

**Supervision model.** There is an NSSM-defined Windows service named `coordinator`, and it is
deliberately held **Stopped and Disabled**. This is anti-spawn-loop hardening: Win32 StartType
`Disabled`, NSSM `AppExit Default = Exit`, `AppRestartDelay = 300000` ms, `AppThrottle = 60000` ms.
The prior service state was captured to
`scripts/.configure-nssm-coordinator.pre-config-backup.json` before hardening. The coordinator is
therefore **not** supervised by NSSM in steady state; it is started by the launcher and watched
out of band (section 3.2).

`scripts/install-coord-autostart.ps1` registers an `AtStartup` scheduled task
`the coordinator autostart task` **only when NSSM is absent**. If a service named `coordinator-svc` or
`coordinator` exists, it defers and exits 0, to avoid a double-boot port-bind race.

**Launch mechanics.** `scripts/_launch-prod.ps1` starts the child with
`Start-Process -WindowStyle Hidden -PassThru` -- deliberately **not** `-NoNewWindow`. The child
needs its own console so that it survives the launcher window closing, and so that a graceful
`CTRL_BREAK_EVENT` can be delivered. Environment is inherited from the launcher; re-parenting
the process by WMI would lose the feature-flag environment (section 4.4).

Logs go to `logs\coordinator-prod-<stamp>.out.log` and `.err.log`, with a `.startup-env`
breadcrumb sidecar recording the environment the process was launched with. Log retention keeps
the newest 60 files (20 runs times 3 files).

**Graceful stop** is by `CTRL_BREAK_EVENT`, which triggers the uvicorn lifespan shutdown path
and a 40-second drain. Raw force-kill is a last resort, never the default.

### 3.2 Out-of-band health watchdog

`scripts/coord-health-watchdog.ps1` exists because a process can stay alive with its port bound while the shared write connection is dead. In-process and service-manager checks can therefore report false-healthy; the database read/write probe must run out of band.

| Property | Value |
|---|---|
| Registered as | Windows Scheduled Task `the coordinator health watchdog task` (by `scripts/register-coord-health-watchdog.ps1`) |
| Cadence | every 1 minute, the required privilege level |
| Independence | runs outside the coordinator process and outside any agent session |
| Probe | `GET /api/health`, asserting **both** `db_read` and `db_write` are true |
| `-Endpoint` | default `http://<coordinator-host>:<COORD_PORT>` |
| `-TimeoutSec` | **15** -- must exceed the server's own `_HEALTH_DB_PROBE_TIMEOUT_S` (12.0 s by default). A too-short value causes false-positive restarts. The relationship is guarded by `Test-WatchdogTimeoutExceedsServerHealthProbeBound` in `coord-health-watchdog.Tests.ps1`. |
| `-FailThreshold` | 3 consecutive failures |
| `-CooldownMinutes` | 10 |
| `-StateFile` | `<repo>\logs\coord-health-watchdog.state.json` |
| Other params | `-DeployingNode WATCHDOG`, `-Toast`, `-DryRun` |
| Action on breach | write an **out-of-band alert file** (the coordinator *is* the messaging channel, so alerts must not depend on it), optional toast, then `restart-coordinator.ps1 -AssumeCoordWedged -SkipReserve`, then cooldown |

### 3.3 Canonical restart lever

`scripts/restart-coordinator.ps1` (approximately 150 KB) is the only sanctioned restart path.
Its ordered steps:

| Step | Purpose |
|---|---|
| 1 | Validate source tree |
| 1.4 | HEAD-freshness gate |
| 1.5 | `master`-branch hard gate -- **not** skippable with `-Force` |
| 1.5b | Intended-SHA pin check |
| 1.6 | Skill-invocation token gate (RFC340) |
| 2 | Dirty-tree guard |
| 2.5 | Smoke checks |
| 2.6 | `pytest -m v1` gate (default OFF; enable with `-EnableV1Gate`) |
| 3 | Locate coordinator processes |
| 3.1 | Zombie reaper |
| 3.5 | Fire-imminent notice + restart reservation |
| 4 | Pre-restart fleet broadcast |
| 4.4 | Pre-kill SHA re-verification |
| 4.5 | MOLT-lease verify gate |
| 5.4 | Clear stale instance-singleton lease |
| 5.5 / 5.6 | Orphan launcher window cleanup |
| 6 | Start exactly one coordinator via `pwsh` |
| 7 | Health-check loop (default 60 s) |
| 7.5 | MCP round-trip check |
| 7.6 | SSE no-buffering smoke test |
| 8 | Post-restart MCP-resume broadcast |
| 11.5 | Release restart reservation |

Parameters: `-Port <COORD_PORT>`, `-HealthTimeoutSeconds 60`, `-GracefulStopTimeoutSeconds 45`,
`-StopOnly`, `-StartOnly`, `-AssumeCoordWedged`, `-SkipReserve`, and
`-RebootClass planned-restart|crash-recover|MOLT-induced|hot-config-reload`.

Restart-specific exit codes: **7** = SSE degraded (advisory), **8** = SSE degraded with hard
rollback.

### 3.4 Application lifespan startup order

`coordinator/server.py`lifespan`) runs, in order:

1. `assert_backend_is_postgresql()` -- refuse to boot on a non-PostgreSQL backend in production.
2. RFC385 WAL recovery (`recover_sqlite_wal_at_startup`) -- legacy SQLite safety.
3. `get_db()` -- open the shared connection.
4. `enforce_parity_registry_at_boot()` -- AST boot-scan of the parity registry; **raises and
   refuses to serve** on drift.
5. `init_writer_pool()` / `init_reader_pool()` -- SQLite-era pools (skipped on PostgreSQL).
6. `pg_pool.init_pg_pools()` -- per-lane asyncpg pools.
7. `pg_boot_wireup.apply_og12_boot_wireup()` -- event partitioning / `events_all` view wiring.
8. `restart_intents.initialize()`
9. `court_leak_audit.init_module()`
10. `start_dual_write_shadow_worker()`
11. `release_all_orphan_molt_leases_at_boot()`
12. `maintenance_startup.emit_startup_maintenance()`
13. `restart_storm_detector.record_startup_and_check_storm()`
14. `quiesce.boot_reconcile()`
15. Background loops (below).

Long-lived background tasks started by the lifespan, listed in `coordinator/server.py`:

| Task | Line | Purpose |
|---|---|---|
| `_kb_index_boot_self_heal_bounded` | 1520 | Knowledge-base index self-heal, bounded |
| `_auto_renew_loop` | 1573 | Lease/credential auto-renewal |
| `_motd_ticker_loop` | 1577 | Message-of-the-day ticker |
| `_gary_reaper_loop` | 1587 | Gary test reaper (flag-gated) |
| `_integration_tip_drift_loop` | 1593 | Integration tip drift detection |
| `_ssh_probe_loop` | 1598 | SSH reachability probe |
| `_build_citation_verify_loop` | 1605 | Build citation verification |
| `_outbox_relay_loop` | 1721 | Cairn outbox to dashboard SSE relay (section 8) |
| `_coord_outbox_drain_loop` | 1762 | Durable outbox dispatch (section 8) |

### 3.5 Implementation evidence

| Fact | Evidence |
|---|---|
| Dual-stack socket, exit codes 77/79, boot gate | `scripts/serve_dualstack.py` |
| PS7 gate, prod env, hidden-window Start-Process, log retention | `scripts/_launch-prod.ps1` |
| Restart step sequence and exit codes 7/8 | `scripts/restart-coordinator.ps1` |
| NSSM held-disabled target state | `scripts/configure-nssm-coordinator.ps1` |
| Autostart deferral | `scripts/install-coord-autostart.ps1` |
| Watchdog behaviour and timeout invariant | `scripts/coord-health-watchdog.ps1`, `scripts/register-coord-health-watchdog.ps1`, `tests/.../coord-health-watchdog.Tests.ps1` |
| Lifespan order and background tasks | `coordinator/server.py` onward |

### 3.6 Deployment evidence

On the coordinator host the coordinator ran as a hidden-console child of a `pwsh` launcher, not as a service.
Supervision was the 1-minute out-of-band scheduled task plus operator-invoked
`restart-coordinator.ps1`. The `coordinator` NSSM service existed but was Stopped/Disabled by
design; `coordinator-pg` was the only NSSM service actually running, as
a low-privilege service account with automatic start.

### 3.7 Unresolved

- `docs/deploy-guide.md` describes a different supervision model -- `Stop-ScheduledTask` /
  `Start-ScheduledTask -TaskName 'the coordinator production task'` -- and explicitly says "Do NOT use
  Start-Process". This **contradicts** the current model, in which `_launch-prod.ps1` does use
  `Start-Process`. Treat the deploy guide as historical. Which model was last live could not be
  resolved from source alone; the restart lever and launcher are internally consistent and were
  clearly the maintained path (the deploy guide also still embeds a literal `AUTH_TOKEN`,
  another sign of age).
- The `_start-coordinator*.cmd` files invoke bare uvicorn with `--host all interfaces` (no dual-stack
  socket, no boot gates). They appear legacy. `install-coord-autostart.ps1` nevertheless still
  references `_start-coordinator.cmd` for its non-NSSM fallback path. Prefer `_launch-prod.ps1`.

## 4. Configuration

### 4.1 Current contract

Configuration is **entirely environment-variable driven**. There is no config file for the
coordinator service itself. `coordinator/config.py` (622 lines) is the single module that reads
most variables at import time; additional variables are read ad hoc across the package.
Boolean feature flags are frequently read through a helper `_is_truthy_env(NAME)` rather than
`os.getenv`, so they do not carry a literal default string in source.

Because `config.py` reads at **module import time**, most configuration is **not hot-reloadable**.
Changing a variable requires a process restart (section 3.3). This is explicit for at least
`COORD_PG_WRITER_POOL_ENABLED`, which is documented as deliberately read once so a mid-flight
flip cannot corrupt transaction attribution.

### 4.2 Required variables

These must be set for a correct production boot. Everything else has a usable default.

| Variable | Required | Meaning | Default | Notes |
|---|---|---|---|---|
| `AUTH_TOKEN` | **Yes** | Fleet-wide shared bearer token guarding `/api/*` | `""` | **Fail-closed**: if unset, every `/api/*` route returns HTTP 503. Secret -- generate a fresh high-entropy value on rebuild. |
| `ENVIRONMENT` | Yes | Environment label, echoed in the `X-ZB-Environment` response header and `/health` | `prod` | Set explicitly per instance (`prod` / `dev` / `test`). |
| `PORT` | Yes | Listen port | -- | <COORD_PORT> / <COORD_DEV_PORT> / <COORD_TEST_PORT>. Also passed as `--port` on argv, which supervision regex-matches. |
| `HOST` | No | Listen address | `all interfaces` | Overridden in practice by the dual-stack `::` bind in `serve_dualstack.py`. |
| `ALLOWED_NODES` | Yes | Comma-separated allowlist of node IDs permitted to register | `""` | Set to the comma-separated node IDs allowed in the rebuilt fleet. |
| `LIFECYCLE_TOKEN` | Yes (for lifecycle ops) | Separate privileged token for `/api/lifecycle/*` | `""` | Must be **different** from `AUTH_TOKEN` -- presenting `AUTH_TOKEN` is explicitly denied. Shape: `<lifecycle-token-prefix><random>`, minimum 16 characters. Secret. |
| `JWT_SECRET` | Yes | HS256 signing secret for RFC093 node JWTs | `""` | Must be at least 32 bytes. If unset, an ephemeral 64-byte random secret is generated with a warning, which invalidates every JWT on each restart. Secret. |
| `COORD_DB_BACKEND` | **Yes** | Primary DB engine selector | `sqlite` | Production **must** be `postgres`. The default is the legacy value. |
| `COORD_ACTIVE_PRIMARY_DIALECT` | **Yes** | SQL dialect used by the dialect translator | `sqlite` | Production **must** be `postgres`. |
| `COORD_PG_DSN` | Yes on PostgreSQL | PostgreSQL connection string, **without** password | `host=loopback port=<DB_PORT> dbname=coordinator user=coordinator` | See shape rules in 4.3. |
| `COORD_PG_PASSWORD_FILE` | Yes on PostgreSQL | Path to a file containing the `coordinator` role password | `<install-root>\coordinator-pg\pg-secrets\coordinator-role.pw` (evidence locator) | The file must be outside version control. Alternative: `COORD_PG_PASSWORD`. |
| `COORD_SCHEMA_MIGRATIONS_ENABLED` | Yes | Enables the migration registry at boot | off | Set `true` in production. See section 5.3. |

### 4.3 Connection string and secret shapes

**Never place a password in the DSN.** The code reads the password separately and injects it
into the asyncpg connection; the DSN is logged in places where a password would leak.

```text
# COORD_PG_DSN  -- shape only, no credentials
host=<PG_HOST> port=<PG_PORT> dbname=<PG_DATABASE> user=<PG_ROLE>

# Production shape as deployed (host/port/db/role are not secret):
host=loopback port=<DB_PORT> dbname=coordinator user=coordinator
```

```text
# COORD_PG_PASSWORD_FILE  -- a file containing ONLY the password, no newline decoration
<absolute path>\coordinator-role.pw
```

```text
# Alembic-only override of the secret file location
COORD_PG_SECRET_FILE=<absolute path to password file>
```

Secret inventory. **None of these values appear in this document.** On rebuild, every one of
them must be generated fresh; do not carry the retiring values forward.

| Secret | Shape | Where the real value came from |
|---|---|---|
| `AUTH_TOKEN` | opaque high-entropy string | Was embedded literally in `_start-coordinator*.cmd` and `docs/deploy-guide.md`. Those files must be treated as compromised credential stores. |
| `LIFECYCLE_TOKEN` | `<lifecycle-token-prefix><random>`, min 16 chars | Operator-held environment variable on the coordinator host. |
| `JWT_SECRET` | >= 32-byte random string | Operator-held environment variable. |
| `COUNCIL_AUDIT_SECRET` | opaque | Operator-held environment variable. |
| `RFC340_SKILL_INVOCATION_TOKEN` | opaque | Minted by the `coordinator-restart` skill; gates restart step 1.6. |
| PostgreSQL `coordinator` role password | opaque | File at `COORD_PG_PASSWORD_FILE`, gitignored. |
| Per-node session token | opaque | Minted by the coordinator; stored in `node_session_tokens`; distributed in each node's `fleet-identity.json`. |
| Per-node `node_secret` | `secrets.token_urlsafe(32)` | Minted by the coordinator; only the SHA-256 hash is stored server-side (`node_identities.node_secret_hash`). Plaintext lives only in the node's `fleet-identity.json`. |
| Bootstrap token | opaque | Minted by the coordinator; **only the SHA-256 hash is persisted** (`bootstrap_tokens.token_hash`). Plaintext is never stored server-side. |
| `daemon_post_token` | opaque, PID-bound | Minted by `POST /api/breathbus/mint_daemon_post_token`; only the hash is stored. |

### 4.4 Production environment as launched

`scripts/_launch-prod.ps1` sets the following before starting the process. This is the
authoritative production feature-flag posture; a rebuild that omits these will run with a
different (mostly legacy/SQLite-shaped) posture.

```text
ENVIRONMENT=prod
ALLOWED_NODES=<comma-separated node id allowlist>
PORT=<COORD_PORT>
DB_PATH=<legacy sqlite path, retained>
PYTHONUNBUFFERED=1
PYTHONIOENCODING=utf-8

# Database substrate
COORD_DB_BACKEND=postgres
COORD_ACTIVE_PRIMARY_DIALECT=postgres
COORD_DB_IDLE_TXN_TIMEOUT_S=30
COORD_SCHEMA_MIGRATIONS_ENABLED=true
COORD_PG_WRITER_POOL_ENABLED=true
COORD_MCP_DISPATCH_LANE_ROUTING_ENABLED=true
COORD_OG11_READ_LOCK_BYPASS_ENABLED=true

# Event partitioning / retention
COORD_PG_PARTMAN_ENABLED=true
COORD_PG_EVENTS_SPLIT_ENABLED=true
COORD_OG12_NATIVE_PARTITION=true
COORD_PG_NATIVE_RETENTION_ENABLED=true
COORD_EVENT_DECOUPLE_ENABLED=true

# Application feature flags
CODECRETE_V1_ENABLED=true
HANDOFF_V1_ENABLED=true
SWATTER_V1_ENABLED=true
GOVERNOR_SUGGESTIONS_ENABLED=true
```

Note that `CAIRN_DB_BACKEND` is **deliberately not set**, so Cairn remains on SQLite in
production while coordinator core runs on PostgreSQL. This decoupling is intentional; see
section 5.5.

### 4.5 Environment variable inventory

The complete list of all variables, with defaults, is in [`backend-reference-tables.md`](backend-reference-tables.md) section 1. This section summarizes them by category.

The reference implementation reads configuration from environment variables in `coordinator/config.py`
and a smaller number of ad hoc call sites. Keep the generated inventory in the source repository,
not as a deployment-specific table in this design document.

The variables fall into these rebuild categories:

| Category | Examples | Rebuild rule |
|---|---|---|
| Required identity and auth | `AUTH_TOKEN`, `ALLOWED_NODES`, `JWT_SECRET`, `LIFECYCLE_TOKEN` | Generate fresh secrets and allowlists. Never reuse original values. |
| Instance selection | `ENVIRONMENT`, `PORT`, `HOST`, `DB_PATH` | Set per instance. `PORT` must match the argv token used by supervision. |
| PostgreSQL substrate | `COORD_DB_BACKEND`, `COORD_ACTIVE_PRIMARY_DIALECT`, `COORD_PG_DSN`, `COORD_PG_PASSWORD_FILE`, `COORD_PG_*_TIMEOUT*`, `COORD_PG_POOL_*_SIZE` | Production uses PostgreSQL with a password supplied outside the DSN. Keep pool lanes separate. |
| Schema and migrations | `COORD_SCHEMA_MIGRATIONS_ENABLED`, `COORD_PG_PARTMAN_ENABLED`, `COORD_PG_EVENTS_SPLIT_ENABLED`, `COORD_PG_NATIVE_RETENTION_ENABLED` | Enable together when using the PostgreSQL event partitioning path. |
| Feature gates | `CODECRETE_V1_ENABLED`, `HANDOFF_V1_ENABLED`, `SWATTER_V1_ENABLED`, `GOVERNOR_SUGGESTIONS_ENABLED`, and subsystem-specific flags | Treat flags as boot-time posture, not hot-reload controls. |
| Cairn | `CAIRN_DB_BACKEND`, `CAIRN_DB_PATH` | Leave `CAIRN_DB_BACKEND` unset unless deliberately migrating Cairn. |
| Scaffolds and tests | `RUN_LIVE_COORD_TESTS`, `COORD_PG_TEST_DSN`, gateway and standalone Cairn variables | Do not promote scaffold defaults into production. |

`_is_truthy_env` flags are effectively off unless set to a truthy value. If a flag is not listed in
the production launcher posture, assume it is intentionally off until the source says otherwise.

### 4.6 Selected variables explained

| Variable | Meaning / why it matters |
|---|---|
| `COORD_PG_STATEMENT_TIMEOUT_MS` (30000) | Server-side PostgreSQL `statement_timeout` GUC. Bounds a running statement. |
| `COORD_PG_LOCK_TIMEOUT_MS` (15000) | Server-side `lock_timeout`. Matches the SQLite-era `DB_BUSY_TIMEOUT_MS` constant (15000, a module constant, not an environment variable). |
| `COORD_PG_COMMAND_TIMEOUT_S` (45) | **Client-side** asyncpg `command_timeout`. Added after a live incident in which a half-open TCP socket caused an unbounded await that no server-side GUC could break. Must stay comfortably above the highest server-side `statement_timeout` (30 s) so it only fires on a genuinely dead connection. |
| `COORD_PG_IDLE_IN_TXN_TIMEOUT_MS` (60000) | `idle_in_transaction_session_timeout`. Added after a long-duration wedge caused by a write that opened a transaction on the shared write connection and never committed. Bounds idle time *between* statements inside an open transaction, so it never kills an actively running transaction. |
| `COORD_PG_HEALTH_PROBE_TIMEOUT_MS` (10000) | Outer bound on the health write-probe's acquire-plus-write through the shared write connection. Derives `_HEALTH_DB_PROBE_TIMEOUT_S = value/1000 + 2.0` = 12.0 s, which the out-of-band watchdog's `-TimeoutSec 15` must exceed. |
| `COORD_PG_POOL_*_SIZE` (4/8/2/0/4) | Per-lane asyncpg pool sizes for heartbeat / interactive / bulk / long-poll / cairn lanes. Heartbeat is a small reserved lane so a bulk runaway can never queue a life-services heartbeat. Long-poll is 0 because SSE should not hold a backend connection. |
| `COORD_ALLOW_NON_PG_BACKEND` | Escape hatch that disables the production PostgreSQL boot assertion. Use only for deliberate legacy/SQLite work. |
| `CAIRN_DB_BACKEND` / `CAIRN_DB_PATH` | Cairn's own, independent backend selector and SQLite path. Default `sqlite` / `cairn.db`. |
| `CORS_EXTRA_ORIGINS` | Comma-separated list of additional full origin URLs appended to the auto-discovered CORS origin set. |
| `FALLBACK_DIR` / `FALLBACK_ENABLED` / `FALLBACK_HEARTBEAT_INTERVAL` | File-based fallback channel (default `<fallback-root>`, enabled, 30 s) used when the coordinator is unreachable. |
| `COORD_WATCHDOG_ALERT_DIR` | Directory where the out-of-band watchdog writes alert files. Must not depend on the coordinator being up. |
| `COORD_SHADOW_*` | Dual-write shadow comparison worker: enable flag, queue max size 1024, schema recheck 900 s, drop log `logs/shadow_drops.jsonl`, instance-confirmed guard. |
| `COORD_RESTART_STORM_THRESHOLD` / `_WINDOW_MIN` | Restart-storm detector, evaluated at boot. |
| `RUN_LIVE_COORD_TESTS` | Opt-in for `@pytest.mark.live` tests, which are deselected by default. |

### 4.7 Implementation evidence

| Fact | Evidence |
|---|---|
| Central config module | `coordinator/config.py` (622 lines) |
| PostgreSQL boot assertion | `coordinator/config.py`assert_backend_is_postgresql`) |
| DSN default | `coordinator/config.py` |
| Password file default | `coordinator/config.py` |
| Timeout rationale comments | `coordinator/config.py` |
| Pool sizing rationale | `coordinator/config.py` |
| `ALLOWED_NODES`, `LIFECYCLE_TOKEN` | `coordinator/config.py` |
| `DB_BUSY_TIMEOUT_MS` is a constant, not an env var | `coordinator/config.py` |
| Production environment as launched | `scripts/_launch-prod.ps1` |
| Alembic secret-file override | `coordinator/alembic/env.py` |

### 4.8 Unresolved

- The `_is_truthy_env` flags have no literal defaults in source; their effective default is
  "off unless set". Where a flag's production value is not listed in section 4.4, its live
  value on the coordinator host is unknown.
- A handful of variables (`USER`, `USERNAME`, `ZEROBRAIN_ENV`, `ZB_DB_PATH`, `SWAT0015_COORD_SHA`)
  appear in utility or test code; whether they were ever set in production is unverified.

## 5. Database

### 5.1 Current contract

**PostgreSQL 16-class is the production write-of-record for coordinator core.** The SQLite to
PostgreSQL is the required production posture. SQLite is retained for tests, for the legacy code
paths, and -- critically -- for Cairn, which was deliberately **not** cut over (section 5.5).

A production coordinator **refuses to boot** on a non-PostgreSQL backend:
`config.assert_backend_is_postgresql()` runs first in the lifespan. The only escape hatches are
running under pytest, or setting `COORD_ALLOW_NON_PG_BACKEND=1`.

| Property | Value |
|---|---|
| Role of this database | Production write-of-record for all coordinator core state |
| Engine and version | PostgreSQL 16-class (EnterpriseDB portable distribution) |
| Database / owner role | database `coordinator`, owned by login role `coordinator` |
| Bind | `loopback:<DB_PORT>`, `scram-sha-256`, `UTF8` |
| Backup format | `pg_dump -Fc` custom-format archive (`snap.dump`); SQLite path produces `snap.db` |
| Integrity gate | PostgreSQL: `pg_restore --list` TOC entry count must be > 0. SQLite: `PRAGMA quick_check` stdout must contain literal `ok` (full `integrity_check` with `-FullIntegrity`) |
| Retention | Keep enough local and off-host snapshots to cover the recovery window; never prune an unverified or unshipped snapshot. |
| Restore authority | `scripts/BACKUP-RESTORE-README.md` plus `scripts/backup-snapshot.ps1`. Restore itself is manual (section 5.7); `recover-db.ps1` was never built. |

### 5.2 Runtime connection model

On PostgreSQL the coordinator uses a **single shared write connection** obtained through
`get_db()`, serialized by an in-process asyncio op-lock. This is the RFC603 "one-write-conn"
substrate. The SQLite-era `writer_pool` and `reader_pool` are skipped on PostgreSQL. Per-lane
asyncpg pools are initialised by `pg_pool.init_pg_pools`, and write routing through them is
activated only when **both** `COORD_PG_WRITER_POOL_ENABLED` and
`COORD_MCP_DISPATCH_LANE_ROUTING_ENABLED` are true (both are true in production).

SQL in the codebase is written in SQLite dialect and rewritten at execute time by
`translate_dialect` in `coordinator/rfc603/db_backend.py`. **A rebuild must keep this
translator**: the application does not emit native PostgreSQL SQL.

### 5.3 Schema creation and migration -- three layered mechanisms

A rebuild must understand that there is no single migration tool. Three mechanisms coexist.

**1. `database.py::_init_tables()` -- the authoritative cumulative schema.**
Idempotent `CREATE TABLE IF NOT EXISTS` statements plus roughly 120 "ALTER probes" (attempt a
`SELECT` of a column; on failure, `ALTER TABLE ... ADD COLUMN`). This runs on every boot and is
the real definition of the schema.

**2. `coordinator/migrations.py` plus the generated `coordinator/_og5_p2_registry.py`.**
A linear applied-set registry (roughly 209 KB of generated entries) keyed by zero-padded string
versions, recorded in the table `schema_migrations`. Gated by
`COORD_SCHEMA_MIGRATIONS_ENABLED`_ENV_FLAG`, `coordinator/migrations.py`). Two lanes:

| Lane | `kind` | Failure behaviour | Timeout |
|---|---|---|---|
| DDL | `ddl` | fail-fast (boot aborts) | -- |
| Backfill | `backfill` | fail-open (logged, boot continues) | `BACKFILL_TIMEOUT_S` = 90 s |

On the first boot the probe path runs and then bulk-stamps the registry; on subsequent boots
the stamp gates execution. **Hard rule from the source: never add a registry entry without
also adding the corresponding DDL to `_init_tables`.**

**3. Alembic -- stamp-only and inert.**
`coordinator/alembic.ini` with a single revision `0001_rfc603_baseline`. Alembic did **not**
build the PostgreSQL schema. The schema was materialised by
`coordinator/rfc603/sync_sqlite_to_pg.py`, which bulk-copied the SQLite schema/data into PostgreSQL and upgraded selected JSON-text columns. One malformed legacy value forced a table to keep an all-text shape. Alembic was then pointed at the result with `alembic stamp 0001_rfc603_baseline`.

To adopt an existing database into Alembic:

```powershell
python -m alembic -c coordinator\alembic.ini stamp 0001_rfc603_baseline
python -m alembic -c coordinator\alembic.ini current
```

**Migration history locations:**

| History | Location |
|---|---|
| Applied-set registry (authoritative at runtime) | table `schema_migrations`, entries generated into `coordinator/_og5_p2_registry.py` |
| Cumulative DDL | `coordinator/database.py::_init_tables()` |
| Alembic baseline | `coordinator/alembic/versions/0001_rfc603_baseline_as_built.py` |
| Canonical schema snapshot (SQLite shape) | `test-fixtures/schema-snapshots/001-schema.sql` -- 86 tables, 109 indexes, 2 virtual tables, 9 triggers. Regenerate with `python scripts\capture-schema-snapshot.py`; guarded by `tests/test_schema_snapshots.py`. |

**PostgreSQL bootstrap grant.** `coordinator/rfc603/pg_bootstrap.sql` issues
`GRANT pg_monitor TO :coord_role;`. This is **required**, not cosmetic: the `/health` probes
call functions such as `pg_ls_waldir()` that need it. Apply with:

```powershell
psql -U <superuser> -d <coord_db> -v coord_role=<role> -f coordinator\rfc603\pg_bootstrap.sql
```

**Deliberate omissions from the PostgreSQL schema.** SQLite FTS5 virtual tables and their
shadow tables are skipped by the sync because they are derived and rebuildable; a PostgreSQL
`tsvector`/GIN equivalent was deferred. `TIMESTAMP` columns remain `TEXT` ISO strings;
conversion to `timestamptz` was deferred.

### 5.4 Table inventory

The exact table, index, trigger, and view counts are source-derived and belong in the schema dump
captured for the rebuild. The design contract is the grouping and the invariants below, not the
historical counts.

| Source | Role |
|---|---|
| `coordinator/database.py` | Coordinator core schema and boot-time ALTER probes. |
| `coordinator/cairn.py` | Cairn RFC/KB substrate plus SQLite FTS tables while Cairn remains SQLite-backed. |
| `cairn_core.py` | Standalone Cairn scaffold; not the production source of truth. |
| `coordinator/schema/cairn_pg_schema.sql` | PostgreSQL Cairn schema, available but not applied unless Cairn is migrated deliberately. |
| `test-fixtures/schema-snapshots/001-schema.sql` | Regression snapshot; regenerate from the rebuilt source and compare in tests. |

A rebuild should capture a fresh schema-only dump before migration and use it as the authoritative
DDL reference.

#### 5.4.1 Core tables -- full detail

These are the tables a rebuild cannot get wrong. Source anchors are in `coordinator/database.py`.

**`nodes`** -- node registration and liveness.

| Column | Type / default | Purpose |
|---|---|---|
| `node_id` | TEXT PRIMARY KEY | Fleet-unique node identifier |
| `capabilities` | TEXT DEFAULT `'[]'` | JSON array of capability strings |
| `role` | TEXT DEFAULT `'builder'` | Role name from `coordinator/roles.py` |
| `working_dir` | TEXT | Node working directory. Classified `NODE_INTERNAL_FIELDS` -- filtered from responses. |
| `status` | TEXT DEFAULT `'online'` | Liveness status |
| `registered_at`, `registered_at_epoch_ms` | TEXT / INTEGER | Registration time, both ISO and epoch-ms |
| `last_seen`, `last_seen_epoch_ms` | TEXT / INTEGER | Heartbeat freshness |

Many additional columns are added by the ALTER probes and the OG5 registry, including
`life_services_confirmed`, `life_services_confirmed_at`, `life_services_confirmed_at_epoch_ms`,
`life_services_gating_enabled`, `life_services_proof` (section 9), and
`last_real_work_receipt_at_epoch_ms`. For the complete column list, consult
`test-fixtures/schema-snapshots/001-schema.sql`.

**`tasks`** -- unit of work.

| Column | Type / default | Purpose |
|---|---|---|
| `task_id` | TEXT PRIMARY KEY | |
| `assigned_to` | TEXT, FK to `nodes` | Owning node |
| `title`, `description`, `notes` | TEXT | |
| `status` | TEXT DEFAULT `'ready'` | |
| `priority` | INTEGER DEFAULT 3 | 1 critical, 2 high, 3 normal, 4 low |
| `output_branch` | TEXT | Git branch the work lands on |
| `project`, `cluster_id` | TEXT | Grouping |
| `review_acks` | TEXT DEFAULT `'[]'` | JSON array of reviewer acknowledgements |
| `created_at`, `updated_at` (+ `_epoch_ms`) | | |

Related: **`task_deps`** ( PRIMARY KEY `(task_id, depends_on)`),
**`tasks_archive`** ( mirrors `tasks` plus `archived_at`),
**`artifacts`** ( FK to `tasks`).

**`messages`** -- the fleet inbox. This is the backbone of node-to-node communication.

| Column | Type / default | Purpose |
|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `from_node`, `to_node` | TEXT | Sender / recipient node IDs |
| `msg_type` | TEXT DEFAULT `'info'` | |
| `subject`, `content` | TEXT | |
| `ref_task_id` | TEXT | Optional task linkage |
| `status` | TEXT DEFAULT `'unread'` | `unread` / read / archived |
| `is_broadcast` | INTEGER | Fan-out flag |
| `priority` | INTEGER DEFAULT 3 | |
| `requires_ack`, `attention` | INTEGER | Acknowledgement and attention flags |
| `expires_at` | TEXT | |
| `created_at`, `read_at`, `delivered_at`, `archived_at` (each with `_epoch_ms` twin) | | |
| `idempotency_key` | TEXT | De-duplication on resend |
| `payload_fingerprint` | TEXT | Content fingerprint |

**`message_router_audit`** -- every routing decision.

| Column | Notes |
|---|---|
| `audit_id` | PK |
| `message_id` | **Nullable** FK -- a held message may have no row in `messages` |
| `disposition` | `CHECK (disposition IN ('relayed','held'))` |
| `hold_reason` | |
| `author_id`, `reviewer_id` | |
| `hold_expires_at_epoch_ms` | |
| `recorded_at` | |

**`events`** -- the append-only event log.

| Column | Notes |
|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |
| `node_id`, `task_id` | |
| `event_type`, `message` | |
| `timestamp`, `timestamp_epoch_ms` | |

**`events_all`** is a view. On SQLite it is the identity view
`CREATE VIEW IF NOT EXISTS events_all AS SELECT * FROM events`. On PostgreSQL,
`pg_boot_wireup.apply_events_all_view` replaces it with a three-table `UNION` once the event
split is active. **All readers should query `events_all`, never `events` directly.**

**`node_session_tokens`** -- per-node session tokens.

| Column | Notes |
|---|---|
| `node_id` | |
| `token` | PRIMARY KEY / UNIQUE -- the value presented in `X-Node-Token` |
| `created_at`, `created_at_epoch_ms` | |

Backfilled from `node_identities.session_token`.

**`bootstrap_tokens`** -- the rotating onboarding credential. Deliberately a
**separate** credential from the shared-scripts repository `AUTH_TOKEN`.

| Column | Notes |
|---|---|
| `token_hash` | PRIMARY KEY, SHA-256. **Plaintext is never persisted.** |
| `node_id`, `fingerprint` | |
| `valid_from`, `valid_to` | Validity window |
| `rotation_generation` | Monotonic rotation counter |
| `revoked_at`, `revoked_reason` | |
| `first_onboarded_at`, `last_seen_at` | |
| `session_token_binding` | Links the bootstrap token to the session token it minted |
| `created_at`, `created_at_epoch_ms` | |

Index: `ix_bootstrap_tokens_node`.

**`bootstrap_onboard_attempts`** -- brute-force defence. A row is written on **every**
onboard call, valid or invalid. Two indexes. Rate limits are per-token-per-hour and
global-per-minute.

**`daemon_post_tokens`** -- PID-bound tokens for the breathbus daemon.

| Column | Notes |
|---|---|
| `token_hash` | PRIMARY KEY |
| `node_id`, `copilot_pid` | Binding |
| `revoked_at` | Minting a new token for a `node_id` revokes prior active tokens |
| `created_at`, `created_at_epoch_ms` | |

**`rider_liveness`** -- agent-process ("rider") liveness.

| Column | Notes |
|---|---|
| `node_id` | PRIMARY KEY |
| `copilot_pid` | |
| `bonded_at_utc`, `rider_last_seen_utc`, `rider_died_at_utc` | |
| `exit_code`, `exit_reason` | |
| `parent_process_died`, `console_handle_lost` | Death-cause discriminators |
| `wer_report_id`, `crash_cluster_id` | Windows Error Reporting linkage |
| `death_acknowledged_at_utc` | |
| `updated_at`, `updated_at_epoch_ms` | |

`rider_alive` is **derived at read time** (bond established AND `rider_last_seen` fresh AND no
unacknowledged `rider_died`). It is never stored.

**`ops_elevations`** -- the OPA (operator authorization) grant table.

| Column | Notes |
|---|---|
| `id` | PK |
| `node_id` | Grantee |
| `scope_type` | `CHECK (scope_type IN ('action','task','time'))` |
| `granted_by` | DEFAULT `'OPERATOR'` |
| `expires_at` | |
| `consumed`, `consumed_at`, `consumed_by_action` | Single-use accounting |
| `reason` | |
| `source` | DEFAULT `'console'` |
| `revoked_at`, `revoked_by` | |
| `delegated_by`, `delegation_chain` | Delegation lineage |
| `created_at` | |

Index: `idx_opa_node(node_id, consumed, revoked_at)`.

**`reboot_requests`** -- coordinated fleet reboot.

| Column | Notes |
|---|---|
| `reboot_id` | PK |
| `initiated_by`, `reason`, `status` | |
| `target_nodes`, `acked_nodes` | JSON arrays, DEFAULT `'[]'` |
| `ack_deadline`, `min_ack_threshold` | Quorum control |
| `created_at`, `completed_at` | |

**Audit and attestation tables:**

| Table | Line | Purpose |
|---|---|---|
| `audit_log` | ` | General audit trail |
| `authority_tokens` | ` | Authority-bearing tokens |
| `agency_sha_attestations` | ` | Append-only; protected by `BEFORE UPDATE` and `BEFORE DELETE` triggers that `RAISE(ABORT)` |
| `real_work_receipts` | ` | Append-only observation, flag-gated by `COORD_REAL_WORK_RECEIPT_TRACKER_ENABLED` (default off). O(1) reads come from `nodes.last_real_work_receipt_at_epoch_ms`, never a table scan. |

**`coord_outbox`** -- durable at-least-once dispatch (section 8.3).

| Column | Notes |
|---|---|
| `outbox_id` | PK |
| `surface` | Dispatch target, e.g. `audit_log`, `event` |
| `kind` | Payload discriminator |
| `payload_json` | |
| `created_at`, `created_at_epoch_ms` | |
| `delivered_at`, `delivered_at_epoch_ms` | NULL while pending |
| `attempts`, `last_error` | Retry accounting |

Indexes: `idx_coord_outbox_pending`, `idx_coord_outbox_delivered_recent`.

#### 5.4.2 SWAT tables

SWAT is the incident / remediation workflow. Its tables are created in `database.py` and
surfaced by the `*_swat` MCP tools (section 6.3). Ownership of a SWAT build is leased;
`SWAT_BUILD_OWNERSHIP_LEASE_MS` defaults to 45 minutes. Ancestry gating is controlled by
`COORD_SWAT_ANCESTRY_GATE_ENABLED`.

#### 5.4.3 Cairn tables

`coordinator/cairn.py` creates 45 tables plus FTS5 virtual tables. Grouped by purpose:

| Group | Tables |
|---|---|
| RFC documents and revisions | `rfcs`, `rfc_revisions`, `rfc_responses`, `rfc_response_versions`, `rfc_comments`, `rfc_tags`, `tag_synonyms`, `solidplan_revisions` |
| RFC governance | `rfc_votes`, `rfc_signals`, `rfc_gates`cairn_rfc_gates`), `rfc_standing_opa`, `rfc_operator_notes`, `rfc_deployments`, `rfc_waves`, `cairn_wave_directives_sent`, `cairn_approval_events` |
| Council | `cairn_council_firings`, `cairn_council_annotations`, `cairn_council_annotations_archive`, `cairn_council_annotation_access_audit`, `rfc353_council_autofire_attempts`, `rfc353_council_autofire_fires`, `rfc353_verdict_history` |
| Knowledge base | `cairn_kb`, `cairn_kb_history` |
| Scratch space | `cairn_scratch`, `cairn_scratch_audit` |
| Identity and lineage | `cairn_ancestry_edges`, `cairn_id_aliases`, `cairn_id_counter`, `cairn_id_free_list`, `cairn_id_recycle_audit` |
| Lifecycle | `lifecycle_audit`, `lifecycle_transitions`, `audit_lifecycle_event`, `audit_idle_handler_fire` |
| Structure | `blocks`, `archive_pin`, `cairn_active_projects_trigger_fires` |
| Full-text search (SQLite FTS5 virtual) | `cairn_fts`, `cairn_kb_fts`, `cairn_scratch_fts` |

The `body` and `content` columns in `cairn.py` remain the authoritative source for both the
render cache and full-text search.

#### 5.4.4 Event partitioning and retention (PostgreSQL native)

| Destination | Contents | Partitioning | Retention |
|---|---|---|---|
| `events_short` | `*_evaluated` events | daily partitions | 3 days |
| `events_long` | mission-critical events | weekly partitions | 90 days |
| `events` (base) | residue carve-outs | none | see below |

Drop-oldest is performed by native RANGE partition detach-and-drop via `pg_partman`, never by
`DELETE`.

Residue carve-outs that **must** remain in the base `events` table:

| Event type | Retention | Notes |
|---|---|---|
| `migration_partial_observed` | 365 days | |
| `flag_drift_detected` | -- | De-duplicated by the partial-UNIQUE index `idx_events_flag_drift_dedupe` |

Activation requires **all** of `COORD_SCHEMA_MIGRATIONS_ENABLED`, `COORD_PG_PARTMAN_ENABLED`,
and `COORD_PG_EVENTS_SPLIT_ENABLED`coordinator/events_router.py`,
`coordinator/pg_partman.py`). Retention additionally requires
`COORD_PG_NATIVE_RETENTION_ENABLED`coordinator/pg_retention.py`).

### 5.5 Coordinator versus Cairn: two databases, one service

This is the single most easily-misconfigured part of the rebuild.

| | Coordinator core | Cairn |
|---|---|---|
| Backend in production | PostgreSQL 16-class | **SQLite** |
| Selector variable | `COORD_DB_BACKEND` (prod: `postgres`) | `CAIRN_DB_BACKEND` (**left unset**, so `sqlite`) |
| Storage | database `coordinator` on `loopback:<DB_PORT>` | file `cairn.db` |
| Per-instance isolation | separate databases / schemas | per-port file map |

Per-port maps:

| Port | Coordinator DB (SQLite legacy/test) | Cairn SQLite file | Cairn PostgreSQL schema (only if flipped) |
|---|---|---|---|
| <COORD_PORT> | `coordinator.db` | `cairn.db` | `cairn_prod` |
| <COORD_DEV_PORT> | `coordinator-dev.db` | `cairn-dev.db` | `cairn_dev` |
| <COORD_TEST_PORT> | `coordinator-test.db` | `cairn-test.db` | `cairn_test` |

**Why Cairn is decoupled.** Originally a single backend selector governed both. When the
coordinator's PostgreSQL cutover was activated, Cairn was flipped at the same time to an
un-migrated `cairn_<port>` schema containing zero tables, producing fleet-wide
`relation does not exist` errors. The remediation (a remediation note) introduced the independent
`CAIRN_DB_BACKEND` selector and left Cairn on SQLite. Flipping Cairn to PostgreSQL requires,
in order: applying `coordinator/schema/cairn_pg_per_port.sql` and
`coordinator/schema/cairn_pg_schema.sql`, migrating the data, and validating parity. **Do not
flip it as part of a rebuild.**

**Required restore order:**

1. Restore the PostgreSQL `coordinator` database first (`pg_restore` of `snap.dump`).
2. Then restore the Cairn SQLite file (`cairn.db`).
3. Only then start the coordinator.

Rationale: the coordinator boot path opens the core database, runs the schema/migration gate,
and then wires Cairn. A Cairn file restored over a running coordinator, or a Cairn file from a
different point in time than the core database, will produce cross-referential drift between
`rfcs`/`cairn_kb` identifiers and the coordinator-side task and event references.

### 5.6 Backup contract

Script: `scripts/backup-snapshot.ps1` (RFC079 Phase 0; made backend-aware by RFC603 BLOCKER-2).

- `-Backend` defaults to `$env:COORD_DB_BACKEND` and accepts `sqlite` or `postgres`.
- SQLite path: venv Python `sqlite3.connect().backup()` -- a WAL-safe **online** backup producing
  a self-contained `snap.db`.
- PostgreSQL path: `pg_dump -Fc` against `COORD_PG_DSN`, with the password read from
  `COORD_PG_PASSWORD_FILE`, never placed in the DSN. Produces `snap.dump`.
- **Integrity gate** (see table in 5.1). A corrupt or empty artifact is refused, never shipped.
- **Hash verification**: SHA-256 is computed locally, recomputed on the bytes that landed on the
  remote share, and compared. A mismatch fails loud.
- **Atomic publish**: every file is written as `.tmp` on the destination volume and then
  `Move-Item`-renamed. `status.json` is published **last** and is the commit marker.
- **Lockfile**: `.backups\.backup.lock`, an exclusive .NET `CreateNew` handle; a lock older than
  30 minutes is auto-reclaimed.
- **Failure behaviour**: on UNC failure a local `status.json` with `transfer_status: FAILED` is
  written, the snapshot is **preserved**, and the script exits non-zero so the next run reships.
- **Credentials**: inline credentials in the script are prohibited. Access to the destination
  admin share was granted by placing the coordinator host machine account in a worker host's local Administrators
  group -- no stored secret.

Destinations:

| Role | Path (evidence locator) | Retention |
|---|---|---|
| Offsite, primary recovery source | `<network-host> worker host\c$\fleet-backups\snapshots\<timestamp>\` | 48 directories |
| Local reship buffer | `<repo>\.backups\<timestamp>\` | 4 directories (`-MaxLocalDirs` 48) |

Each snapshot directory contains `snap.db` or `snap.dump`, a `.sha256` sidecar, and
`status.json`. A `status-latest.json` pointer sits at each root.

Retention never trims before a verified-good newer copy is durably published, and never prunes
an unshipped local snapshot.

Scheduling: Windows Scheduled Task `fleet-backup-snapshot`, 30-minute repetition, principal
`SYSTEM`, the required privilege level, invoked as
`pwsh.exe -NoProfile -File <repo>\scripts\backup-snapshot.ps1`.

**Retired paths -- do not use:** tombstone any obsolete backup location and name it clearly so audits do not mistake it for the active recovery source. Do not carry old path names into the rebuild.

**Deployment conflict: the jobs that actually ran were not this contract.** At the last at-source
check the scheduled backup work on the coordinator host was two hourly tasks,
`the coordinator backup task` and `the Cairn backup task`, plus a daily rollup. All of them copied SQLite files.
The coordinator job copied `coordinator.db`, which is the **retired** SQLite store, frozen at the
PostgreSQL cutover. So every coordinator backup after the cutover was a byte-identical copy of stale
data, while the jobs exited 0 and logged success. The offsite copy replicated the same stale files.
The Cairn backups were real, because `cairn.db` is still Cairn's live store.

The design lesson (pitfalls 13 and 14 in section 15.2): a backup must resolve its source through the
same configuration the application uses, and it must be proven by an automated restore that checks
restored content, not by the job's exit code. For a rebuild, schedule `backup-snapshot.ps1
-Backend postgres` (or an equivalent `pg_dump -Fc`), back Cairn up separately, and add a periodic
restore-into-scratch check that asserts the newest restored row is recent.

### 5.7 Restore procedure

`recover-db.ps1` was planned for Phase 1 and **was never built**. Restore is manual.

Recovery selection: choose the latest dated directory whose `status.json` has
`integrity_check == "ok"` **and** `transfer_status == "OK"`, then verify that
`Get-FileHash snap.db` (or `snap.dump`) matches the `.sha256` sidecar.

```powershell
# 1. Stop the coordinator process. (The NSSM service stays Stopped by design.)
#    Use the canonical lever so the stop is graceful:
pwsh -NoProfile -File <repo>\scripts\restart-coordinator.ps1 -StopOnly -Port <COORD_PORT>

# 2. Verify the snapshot hash matches its sidecar.
$snap = '<snapshot dir>\snap.dump'
(Get-FileHash $snap -Algorithm SHA256).Hash
Get-Content "$snap.sha256"

# 3a. PostgreSQL: restore into a freshly created empty database.
& '<pg bin>\pg_restore.exe' --clean --if-exists --no-owner `
    --dbname 'host=loopback port=<DB_PORT> dbname=coordinator user=coordinator' $snap

# 3b. SQLite (legacy / Cairn): move the current file aside, never delete it.
Move-Item <repo>\coordinator.db <repo>\coordinator.db.pre-restore-<utcstamp>
Copy-Item '<snapshot dir>\snap.db' <repo>\coordinator.db

# 4. Delete stale WAL/SHM sidecars. They are NOT shipped, and sqlite3 .backup()
#    produces a self-contained database; a stale -wal will corrupt the restore.
Remove-Item <repo>\coordinator.db-wal, <repo>\coordinator.db-shm -ErrorAction SilentlyContinue

# 5. Restore the Cairn SQLite file (same move-aside-then-copy pattern).

# 6. Restart via the canonical lever and confirm readiness + SSE reconnect.
pwsh -NoProfile -File <repo>\scripts\restart-coordinator.ps1 -Port <COORD_PORT>
```

**Verified by drill, with corrections.** This procedure was executed end to end against a live
deployment. Two corrections matter:

1. **Restoring into a new database needs privileges the application role does not have.**
   `CREATE DATABASE` requires a superuser (or `CREATEDB`) role, and the restore should then be run
   as that role with ownership remapped, not as the application user:

   ```powershell
   # as a superuser role
   CREATE DATABASE <target> OWNER <app-role>;
   & '<pg bin>\pg_restore.exe' -U <superuser> -h loopback -p <DB_PORT> `
       -d <target> --no-owner --role=<app-role> '<snapshot dir>\snap.dump'
   ```

2. **A non-zero exit status does not necessarily mean the restore failed.** In the observed drill
   `pg_restore` exited 1 while the data restored correctly. Both errors came from the
   `pg_stat_statements` extension: the application role cannot create it (it needs superuser, and
   the cluster loads it via `shared_preload_libraries`), so its two views are missing afterwards.
   Either pre-create the extension in the target database as superuser before restoring, or exclude
   it. The extension carries no data. Validate the restore with a parity check, not the exit code:
   the public table count (180 in production, 178 after a restore without the extension), row counts
   on the core tables (`messages`, `nodes`, `tasks`), and `max(id)` on the busiest table.

3. **Keep the least-privilege split, and write it into the runbook.** The application role had
   `rolsuper=false` and `rolcreatedb=false`. It cannot create databases or extensions. The secrets
   directory held two separate credentials, one for the application role and one for a superuser,
   and a restore needs the superuser one. This is good design and worth keeping. A runbook that
   mentions only the application credential will strand the operator mid-restore. Every local and
   loopback `pg_hba` line used `scram-sha-256`; there was no `trust` authentication anywhere.

### 5.8 Implementation evidence

| Fact | Evidence |
|---|---|
| Boot assertion | `coordinator/config.py` |
| Core DDL | `coordinator/database.py::_init_tables`, line numbers in 5.4.1 |
| Migration registry and flag | `coordinator/migrations.py`, `coordinator/_og5_p2_registry.py` |
| Alembic baseline | `coordinator/alembic.ini`, `coordinator/alembic/versions/0001_rfc603_baseline_as_built.py` |
| PostgreSQL materialisation | `coordinator/rfc603/sync_sqlite_to_pg.py`, `jsonb_upgrade.py`, `replicate_schema_to_pg.py` |
| Dialect translation | `coordinator/rfc603/db_backend.py::translate_dialect` |
| One-write-conn substrate | `coordinator/database.py` `get_db()` PG path |
| Per-lane pools | `coordinator/pg_pool.py::init_pg_pools` |
| Event split wiring | `coordinator/pg_boot_wireup.py`, `coordinator/events_router.py`, `coordinator/pg_partman.py`, `coordinator/pg_retention.py` |
| Cairn per-port maps | `coordinator/cairn.py`_PORT_CAIRN_DB_MAP`), `CAIRN_DB_PATH`), `_PORT_CAIRN_PG_SCHEMA_MAP`), `get_cairn_db`) |
| Backup contract | `scripts/backup-snapshot.ps1`, `scripts/BACKUP-RESTORE-README.md` |
| PostgreSQL grant | `coordinator/rfc603/pg_bootstrap.sql` |
| Parity tooling | `coordinator/rfc603/parity_check.py`, `g4_shadow_compare.py`, `g5_rollback_drill.py` |

### 5.9 Deployment evidence

PostgreSQL runs as a service-managed local database on loopback. The database service should use a low-privilege account; the application role remains least-privilege and separate from restore/admin credentials.

### 5.10 Unresolved

- **Evidence conflict (do not merge):** older overview prose still describes SQLite as the primary database. Treat that prose as historical; the source of truth for a rebuild is `coordinator/config.py` plus `scripts/_launch-prod.ps1`, which set and assert `postgres`.
- **Prose lag:** `scripts/BACKUP-RESTORE-README.md` says backup "will shift to
  pg_dump/pg_restore ... Until then, this SQLite backup remains the primary recovery
  mechanism". This is out of date: `backup-snapshot.ps1` already implements the PostgreSQL path
  and auto-selects it from `$env:COORD_DB_BACKEND`. Trust the script.
- **Pre-cutover framing:** older PostgreSQL migration notes still warn not to enable PostgreSQL. Treat them as historical once the launcher and boot assertion require PostgreSQL.
- A restore drill should be performed in the rebuilt environment and its corrections folded into the runbook.
- The wide mutable `nodes` row is design input: duplicate text and epoch-ms timestamps, empty string instead of NULL, and mixed write cadences should be reconsidered in a future schema revision.
- **Schema evolution is not Alembic.** The Alembic tree has exactly one baseline
  (`0001_rfc603_baseline_as_built`), and nobody has verified that it reproduces the live schema.
  The `schema_migrations` ledger is the real evolution mechanism. Dump the source schema before migration and treat it as the authoritative DDL.**

## 6. API surface

### 6.1 Current contract

The coordinator exposes two contracts on the same port:

1. A **FastAPI REST surface** -- 188 live routes.
2. An **MCP JSON-RPC 2.0 surface** at `POST /mcp` -- 219 tools.

Router prefixes, applied where the routers are mounted in `coordinator/server.py`:

| Source module | Router prefix |
|---|---|
| `coordinator/api.py` | `/api`APIRouter(prefix="/api", tags=["superdash"])`, `) |
| `coordinator/merit.py` | `/api/merit` |
| `coordinator/recovery.py` (main router) | `/api/recovery` |
| `coordinator/recovery.py`lifecycle_router`, `) | `/api/lifecycle` |
| `coordinator/role_registry.py` | `/api/roles` |
| `@app.*` decorators in `coordinator/server.py` | none (root-level) |

Route counts by source: `api.py` 146, `server.py` 22, `recovery.py` 7 plus lifecycle 5,
`merit.py` 5, `role_registry.py` 3 -- **188 total**.

Five further route declarations exist in `coordinator/db_lanes.py`/api/foo`, `/example`,
`/graceful-restart/status`, with handlers `foo_handler`, `example_handler`, `status_handler`).
These are **docstring examples, not live routes**, and are excluded from the table below.

### 6.2 Authentication requirement per route

Rather than repeat an auth column on 188 rows, auth is determined by a small set of rules
evaluated by the middleware stack (section 7):

| Rule | Effect |
|---|---|
| Default for everything under `/api/` | Requires `AUTH_TOKEN` (or a valid node session token / JWT). Returns **503** if `AUTH_TOKEN` is unset -- fail-closed. |
| Path in `PUBLIC_PATHS` | Middleware auth bypassed; the handler performs its own auth if any. Set: `/health`, `/api/health`, `/api/health/ssh`, `/api/mcp-health`, `/api/events`, `/api/cairn/approval_events`, `/onboard.ps1`, `/mcp`, `/api/onboard/manifest`, `/api/breathbus/rider_alive`, `/api/breathbus/rider_died` |
| Path under a `PUBLIC_PATH_PREFIXES` entry | Same bypass. Prefixes: `/api/scripts`, `/api/lifecycle/`, `/api/stream`, `/api/auth/` |
| `/api/lifecycle/*` | Handler-level auth against `LIFECYCLE_TOKEN` (section 7.4). Presenting `AUTH_TOKEN` is explicitly **denied**. |
| `/api/onboard/manifest` | Handler-level auth against a **bootstrap token** (`Authorization: Bearer`), not the fleet token. |
| `/api/breathbus/rider_alive`, `/api/breathbus/rider_died` | Handler-level auth against a PID-bound `daemon_post_token`Authorization: Bearer`). |
| `/api/stream*` | Node session token, accepted in `X-Node-Token` **or** as a `?token=` query parameter (EventSource cannot set headers). A fleet-wide `?token=<AUTH_TOKEN>` fallback was deliberately rejected. |
| `/mcp` | Identity resolved per-call from `X-Node-Token` or the injected `_session_token` tool argument (section 7.5). Unidentified callers are blocked from every write tool. |
| Root-level non-`/api` routes (`/ping`, `/events*`) | No middleware auth. |

#### 6.2.1 Route surface by family

The complete route table (method, path, handler) is in [`backend-reference-tables.md`](backend-reference-tables.md) section 2.

The exact generated route list belongs in the API reference produced from the source. For rebuild
purposes, preserve these route families and their auth rules:

| Family | Representative paths | Contract |
|---|---|---|
| Health and readiness | `/ping`, `/health`, `/api/health`, `/api/mcp-health`, `/api/health/ssh` | `/ping` is no-DB; `/api/health` performs real DB read/write checks. |
| Fleet, nodes, tasks, messages | `/api/fleet*`, `/api/nodes*`, `/api/tasks*`, `/api/messages*`, `/api/wait/{node_id}` | Authenticated operational state and inbox surfaces. |
| Maintenance and restart | `/api/restart/*`, `/api/graceful-restart*`, `/api/maintenance/*`, `/api/shutdown` | Guarded operations; lifecycle privilege is separate where applicable. |
| Lifecycle and recovery | `/api/lifecycle/*`, `/api/recovery/*` | Uses lifecycle token checks; fleet auth alone is not enough. |
| Cairn and governance | `/api/cairn/*`, `/api/opa/*`, `/api/merit/*`, `/api/roles/*`, `/api/molt/*`, `/operator/gary-status` | Governance, knowledge, authorization, and lifecycle workflows. |
| Files, scripts, artifacts | `/api/files*`, `/api/scripts*`, `/api/artifacts/*`, `/static/*`, `/onboard.ps1` | Distribution and bootstrap support; public prefixes still perform handler-level checks where required. |
| Streaming and events | `/events*`, `/api/stream*`, `/api/events*` | SSE-aware middleware must not buffer these paths. |
| MCP | `/mcp` | JSON-RPC endpoint on the same ASGI app and same port. |

The reference route table included file/line evidence. Those line numbers are intentionally omitted
here; carry the source files and generated API reference forward instead.

### 6.3 MCP JSON-RPC surface

#### 6.3.1 Protocol

| Property | Value |
|---|---|
| Endpoint | `POST /mcp` (same app, same port) |
| Protocol | JSON-RPC 2.0 |
| MCP protocol version returned by `initialize` | source-defined protocol version |
| `MCP_SCHEMA_VERSION` | `31`coordinator/mcp_handler.py`) |
| `SERVER_INFO` | `{"name": "zerobrain-fleet-coordinator", "version": "0.8.0"}` |
| `SERVER_CAPABILITIES` | `{"tools": {"listChanged": false}}` |
| Supported methods | `initialize`, `tools/list`, `tools/call`, `notifications/initialized` |

**Notification handling is a compatibility contract.** A JSON-RPC message with no `id` is a
notification and must be answered with **HTTP 202 and an empty body**. Returning a response
object with `id: null` breaks the MCP bridge proxy from version <bridge-version> onward.

**`_session_token` injection.** `handle_tools_list` injects a `_session_token` string property
into the `inputSchema` of **every** tool. This exists because MCP proxies cannot forward the
`X-Node-Token` header, so the caller identity has to travel inside the tool arguments.

**Discovery filtering.** `handle_tools_list` removes `_HIDDEN_TOOLS | _HARD_REMOVED_TOOLS` from
the advertised list.

| Set | Evidence | Discoverable | Callable | Members |
|---|---|---|---|---|
| `_HIDDEN_TOOLS` | `coordinator/mcp_handler.py` | No | **Yes** | `register_node`, `grant_sudo`, `acknowledge_message`, `add_knowledge`, `get_knowledge`, `promote_knowledge`, `retire_knowledge`, `cairn_kb_read`, `cairn_kb_search` |
| `_HARD_REMOVED_TOOLS` | `coordinator/mcp_handler.py` | No | No | `fetch_file`, `request_sudo`, `revoke_sudo` |

#### 6.3.2 Tool inventory by domain

The entries in the `TOOLS` list (`coordinator/mcp_handler.py`), grouped by domain.
Grouping is derived from tool-name semantics; it is a reading aid, not a structure present in
source. Note that `fetch_file`, `request_sudo`, and `revoke_sudo` appear in `TOOLS` but are
hard-removed at dispatch.


| Domain | Tool names |
|---|---|
| Authorization / OPA / consensus | `consume_opa`, `get_agency_sha_consensus`, `get_standing_authorizations`, `grant_opa`, `grant_sudo`, `pin_authorization`, `reaffirm_authorization`, `request_sudo`, `revoke_authorization`, `revoke_opa`, `revoke_sudo`, `verify_opa` |
| Boomerang (deferred work) | `catch_boomerang`, `get_boomerangs`, `return_boomerang`, `throw_boomerang` |
| Cairn RFC / KB / wave / council | `cairn_activation_auth_create`, `cairn_approval_event`, `cairn_archive`, `cairn_close_gate`, `cairn_close_wave`, `cairn_council_set_enabled`, `cairn_declare_gate`, `cairn_edit_response`, `cairn_edit_rfc`, `cairn_frame`, `cairn_get`, `cairn_get_firing`, `cairn_get_for_routing`, `cairn_interactions`, `cairn_kb`, `cairn_kb_archive`, `cairn_kb_create`, `cairn_kb_edit`, `cairn_kb_flag`, `cairn_kb_publish`, `cairn_kb_quarantine`, `cairn_kb_read`, `cairn_kb_search`, `cairn_kb_set_status`, `cairn_kb_unquarantine`, `cairn_lesson_auto_archive_set_threshold_days`, `cairn_lesson_sentinel_run`, `cairn_list`, `cairn_list_active`, `cairn_list_gates`, `cairn_open_gate`, `cairn_promote_seed`, `cairn_ratify`, `cairn_respond`, `cairn_revise`, `cairn_rfc`, `cairn_rfc_demote`, `cairn_rfc_promote`, `cairn_rfc_recycle`, `cairn_rfc_rename`, `cairn_rfc_reparent`, `cairn_scratch`, `cairn_scratch_list`, `cairn_scratch_pin`, `cairn_scratch_read`, `cairn_search`, `cairn_search_set_default_weights`, `cairn_seed`, `cairn_set_category`, `cairn_set_gate_state`, `cairn_set_meta`, `cairn_set_related_rfcs`, `cairn_set_short_description`, `cairn_set_status`, `cairn_set_tags`, `cairn_set_title`, `cairn_ship`, `cairn_signal`, `cairn_solidplan`, `cairn_star`, `cairn_summon_council`, `cairn_synthesize`, `cairn_vote`, `cairn_wave` |
| Cohort release | `get_cohort_release_state`, `get_current_fleet_released`, `lift_cohort_hold`, `maintenance_release`, `publish_cohort_snapshot`, `release_lease`, `release_session`, `republish_cohort_snapshot`, `walker_tick_cohort_release` |
| Design review | `claim_review`, `close_design_review`, `design_input_invite`, `design_input_respond`, `open_design_review`, `skip_design_review` |
| Gary (agent supervision) | `start_gary_test`, `stop_gary_test` |
| Identity, registration, bootstrap | `bootstrap_node`, `get_bootstrap_metrics`, `get_identity`, `get_node_lifecycle`, `node_check`, `register_node`, `set_node_active_status`, `set_node_lifecycle`, `update_identity` |
| MOLT / lifecycle / restart | `check_same_host_molt_conflict`, `claim_relaunch_intent`, `complete_relaunch_intent`, `confirm_self_molt`, `execute_molt`, `get_molt_status`, `get_post_molt_respawn_latency`, `mark_molt_ponr`, `request_molt`, `request_node_restart`, `set_molt_moratorium` |
| Maintenance / MOTD / silence | `clear_motd`, `get_motd`, `maintenance_acquire`, `set_motd`, `silence_mode_get`, `silence_mode_log`, `silence_mode_set` |
| Memory, knowledge, lessons | `add_knowledge`, `get_knowledge`, `get_memory_tier_integrity`, `graduate_lesson`, `memory_block_audit`, `memory_block_read`, `memory_block_write`, `promote_knowledge`, `retire_knowledge`, `store_lesson`, `update_lesson` |
| Messaging and inbox | `acknowledge_message`, `broadcast_message`, `bulk_acknowledge`, `check_inbox`, `get_messages`, `memory_block_rollback`, `poll_and_ack`, `refresh_content_acks`, `send_message`, `submit_review_ack` |
| Other / general | `ask_operator`, `ask_user`, `attest_agency_sha`, `attest_snapshot_staged`, `batch`, `canonical_master_ref`, `clear_session_lock`, `confirm_life_services`, `confirm_state_saved`, `create_peer_challenge`, `create_report`, `fetch_file`, `finding_to_seed`, `fleet_check`, `get_boot_manifest`, `get_correction_history`, `get_delivery_state`, `get_diary_recall_hit_rate`, `get_fleet_shared_canonical_manifest`, `get_fleet_state`, `get_leadership_drift_summary`, `get_resilience_incidents`, `get_rider_liveness`, `get_sleep_trigger_false_positive_rate`, `list_roles`, `reactivate_correction`, `replace_accomplishments`, `report_pin_ledger_drift`, `resolve_service_uri`, `respond_peer_challenge`, `send`, `set_fleet_attention`, `set_manual_mode`, `set_role`, `subscribe_events`, `topology_resolve` |
| PostgreSQL operations | `pg_activity`, `pg_maintenance` |
| SWAT (incident/remediation) | `claim_swat`, `close_swat`, `correct_swat_fix_commit`, `create_swat`, `edit_swat`, `get_swat`, `list_swats`, `reassign_swat_reviewer`, `reopen_swat`, `set_swat_cluster`, `set_swat_fix_commit`, `submit_swat_verdict`, `update_swat_refs` |
| Script distribution | `get_script`, `list_scripts`, `publish_script` |
| Spyglass (observability) | `spyglass_get`, `spyglass_ingest`, `spyglass_stats`, `spyglass_tag` |
| Task and work management | `claim_build`, `create_task`, `generate_pm_handoff`, `get_my_tasks`, `get_ratified_ready_tasks`, `get_task_board`, `get_workload`, `handoff_save`, `record_task_evidence`, `release_build`, `update_task`, `update_task_refs` |
| Telemetry and health | `fleet_health_query`, `get_breathbus_sync_status`, `get_fleet_status`, `get_peer_challenge_status` |

#### 6.3.3 Dispatch-time metadata injection

Before dispatching a tool call, the server **strips any client-supplied values** for the
following argument names and injects its own un-spoofable values:

| Injected argument | Source |
|---|---|
| `_caller_node_id` | Resolved identity (token or bootstrap) |
| `_client_ip` | Transport peer address |
| `_identity_proof` | `"token"` or `"bootstrap"` |
| `_caller_role` | `SELECT role FROM nodes WHERE node_id = ?` |
| `_caller_schema_version` | Client-declared schema version |

Other dispatch constants:

| Constant | Value | Purpose |
|---|---|---|
| `REGISTER_RATE_WINDOW` | 60.0 s | Registration rate-limit window, per client IP |
| `REGISTER_RATE_MAX` | 5 | Max registrations per window per IP |
| `RESERVED_NAMES` | `SYSTEM`, `OPERATOR`, `UNKNOWN`, `AMBIGUOUS` | Cannot be claimed as node IDs |
| Priority map | `{critical: 1, high: 2, pm_request: 2, normal: 3, low: 4}` | Message/task priority normalisation |

### 6.4 Implementation evidence

| Fact | Evidence |
|---|---|
| Router mounting and prefixes | `coordinator/server.py`, `coordinator/api.py` |
| MCP endpoint | `coordinator/server.py`mcp_endpoint`) |
| Protocol constants | `coordinator/mcp_handler.py`, `, `handle_initialize`) |
| Tool list filtering and `_session_token` injection | `coordinator/mcp_handler.py`handle_tools_list`) |
| Dispatch | `coordinator/mcp_handler.py`handle_tools_call`) |
| Rate-limit constants | `coordinator/mcp_handler.py` |
| Public path sets | `coordinator/api_auth.py`PUBLIC_PATHS`, `PUBLIC_PATH_PREFIXES`) |
| Batch endpoint | `coordinator/api.py` |

### 6.5 Unresolved

- Per-tool input schemas are not reproduced here. They live in the `TOOLS` list in
  `coordinator/mcp_handler.py` onward and in `docs/mcp-tool-arg-reference.md`; a rebuild
  must carry the source file, since the schemas are the contract every node depends on.
- Per-route request and response models are not enumerated. `docs/api-reference.md` in the
  coordinator repository is the companion reference.

## 7. Transport-layer authentication and authorization

### 7.1 Current contract -- credential types

| Credential | Header(s) | Scope | Storage |
|---|---|---|---|
| Fleet auth token (`AUTH_TOKEN`) | `Authorization: Bearer <token>`, or `X-Auth-Token` | All `/api/*` | Environment variable only. **Fail-closed**: unset means every `/api/*` returns 503. |
| Node session token | `X-Node-Token` (alias `X-Session-Token`); on `/api/stream*` only, also `?token=` | Identifies a specific node | Table `node_session_tokens` |
| Node JWT (RFC093) | `Authorization: Bearer <JWT>` | Identifies a specific node | Not stored; verified by signature |
| Bootstrap token | `Authorization: Bearer <token>` on `/api/onboard/manifest` | One-time node onboarding | Table `bootstrap_tokens`, **SHA-256 hash only** |
| Daemon post token | `Authorization: Bearer <token>` on breathbus rider endpoints | PID-bound daemon writes | Table `daemon_post_tokens`, hash only |
| Lifecycle token (`LIFECYCLE_TOKEN`) | `X-Lifecycle-Token`, else `X-Fleet-Token`, else `Authorization: Bearer` | `/api/lifecycle/*` | Environment variable only |
| CSRF token | `X-CSRF-Token` | Browser-originated non-`/api` state changes | In-memory secret, regenerated per process start |

### 7.2 JWT details (RFC093)

| Property | Value |
|---|---|
| Algorithm | HS256 |
| Issuer (`iss`) | `coordinator` |
| Subject (`sub`) | node ID |
| TTL | `JWT_TTL_SECONDS`, default 900 s |
| Clock skew allowance | `JWT_SKEW_SECONDS`, default 60 s |
| Signing secret | `JWT_SECRET`, minimum 32 bytes. If unset, an ephemeral 64-byte random secret is generated **with a warning**, invalidating all JWTs on every restart. |
| Required claims | `iss`, `sub`, `exp`, `iat` |

JWTs are obtained by exchanging a `node_secret` at `POST /api/auth/refresh`
(`coordinator/api.py`). The `node_secret` is a `secrets.token_urlsafe(32)` value; only its
SHA-256 hash is stored server-side in `node_identities.node_secret_hash`. The plaintext exists
only in the node's local `fleet-identity.json`.

### 7.3 Middleware stack

Added innermost to outermost in `coordinator/server.py`:

1. `SecurityHeadersMiddleware`
2. `RateLimitMiddleware`
3. `AuthMiddleware`
4. `CSRFMiddleware`coordinator/api_auth.py`)
5. `SensitiveDataFilterMiddleware`
6. `CORSMiddleware`
7. `NormalizeOriginMiddleware` (added last, therefore outermost)

Plus `EnvironmentHeaderMiddleware` (adds `X-ZB-Environment`) and `CairnNoStoreMiddleware`
(sets `Cache-Control: no-store` on `GET /api/cairn/*`).

**SSE-aware base class.** All of the above derive from `SSEAwareMiddleware`, which performs a
pure-ASGI pass-through for `STREAMING_PATH_PREFIXES = {"/api/stream", "/events", "/sse"}` using
segment-boundary matching, with `EXACT_NON_STREAMING_OVERRIDES = {"/events/timeline"}`. This is
**required**: Starlette's `BaseHTTPMiddleware` buffers response bodies, which hangs an SSE
stream forever. A rebuild that uses plain `BaseHTTPMiddleware` will break streaming.

| Middleware | Behaviour |
|---|---|
| Rate limit | 30 `POST`/`PUT`/`DELETE` per 60 s window, keyed by resolved node ID else client IP. Returns 429 with `Retry-After`. Carve-out: `/api/internal/court_leak_audit` at 120/min. |
| CSRF | Requires `X-CSRF-Token` on state-changing requests but **skips everything under `/api/`** and all `PUBLIC_PATHS`, because bearer-authenticated APIs are not browser-CSRF-vulnerable. `_CSRF_SECRET = secrets.token_hex(32)` generated at startup. Token issued by `GET /api/csrf-token`. |
| CORS | Origins auto-discovered at startup by `_discover_cors_origins(dashboard_port=<DASHBOARD_PORT>)`: hostname, FQDN, every local IPv4, reverse-DNS name, `localhost`, `loopback`. Extended by `CORS_EXTRA_ORIGINS` (comma-separated full origin URLs). `allow_credentials=True`. Allowed headers: `Authorization`, `Content-Type`, `X-Node-Token`, `X-Session-Token`, `X-Auth-Token`, `X-Operator-Token`. |
| Security headers | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`, a CSP beginning `default-src 'self'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera, microphone, and geolocation. |
| Sensitive data filter | Strips `OPERATOR_ONLY_FIELDS = {startup_instructions, operator_notes, corrections_log}` and `NODE_INTERNAL_FIELDS = {working_dir}` from responses to non-privileged callers. |

### 7.4 Lifecycle authorization

`coordinator/recovery.py`_check_lifecycle_auth`) implements a deliberately separate
privilege tier:

1. Read the presented token from `X-Lifecycle-Token`, else `X-Fleet-Token`, else
   `Authorization: Bearer`.
2. Read the caller ID from `X-Caller-Id` (default `OPERATOR`).
3. If `LIFECYCLE_TOKEN` is unset, return an error.
4. **If the presented token equals `AUTH_TOKEN`, explicitly deny.** The fleet messaging token
   must never grant lifecycle privilege.
5. Otherwise the token must equal `LIFECYCLE_TOKEN`.

Every lifecycle call is audited by `_audit_lifecycle`, which writes an event with
`event_type = 'lifecycle_action'` and `node_id = 'COORDINATOR'` through
`events_router.route_events_write`.

Lifecycle routes:

| Route | Auth | Behaviour |
|---|---|---|
| `GET /api/lifecycle/token/status` | **None** | Returns `{configured: <bool>, token_prefix: "<first 12 chars>..."}`. Note this deliberately leaks a 12-character prefix for operator diagnosis. |
| `POST /api/lifecycle/token/rotate` | Current valid lifecycle token | Body `{"new_token": "<lifecycle-token-prefix>..."}`. Validates length >= 16 and the `<lifecycle-token-prefix>` prefix. Returns `status: "prepared"` plus instructions. **It does not actually rotate anything** -- rotation is an environment-variable change followed by a restart. |
| `POST /api/lifecycle/service/{service}/restart` | Current valid lifecycle token | Service restart request |

### 7.5 Bootstrap onboarding

`POST /api/onboard/manifest`coordinator/api.py`).

- Auth: `Authorization: Bearer <bootstrap_token>` -- **not** the fleet auth token.
- Body: `{node_id, role, bootstrap_fingerprint, requested_at, client_version}`. `node_id` and
  `bootstrap_fingerprint` are required; missing either yields 422.
- Delegates to `db.onboard_via_bootstrap_token(...)`.
- **Enumeration resistance:** 401 and 403 outcomes are funnelled through
  `_onboard_error_response`, which pads the elapsed request time to
  `_ONBOARD_ENUMERATION_RESISTANCE_TARGET_MS` and returns a generic `unauthorized` body, so
  response timing cannot distinguish "unknown token" from "known but invalid token".
- Every attempt, valid or invalid, is recorded in `bootstrap_onboard_attempts`.

### 7.6 MCP identity resolution

In `mcp_endpoint`coordinator/server.py`), identity is resolved in this order:

1. `X-Node-Token` header, via `identity.resolve_by_token` then `database.resolve_token_from_db`.
2. A `_session_token` value in the tool arguments.
3. For `register_node` / `bootstrap_node` only, the supplied `node_id` on **first contact
   only**. This never overrides a caller already identified by token.

Callers that remain unidentified are blocked from every tool in `_MCP_WRITE_TOOLS`, returning
JSON-RPC error `-32603`.

### 7.7 Role gating

Roles are defined in `coordinator/roles.py` as the `ROLES` dictionary; each entry carries a
title, personality, sub-skills, and approach. Known role names include `architect`, `builder`,
`reviewer`, and `ops`. A node's role is stored in `nodes.role` (default `builder`) and is
injected into every MCP dispatch as `_caller_role`. The role registry is exposed over REST at
`/api/roles`.

Operator elevation above a node's standing role is granted through the OPA mechanism, backed by
the `ops_elevations` table (section 5.4.1) and surfaced by `GET /api/opa/active`
(`coordinator/api.py`) and the authorization MCP tools.

### 7.8 Implementation evidence

| Fact | Evidence |
|---|---|
| Middleware classes, public path sets, security headers | `coordinator/api_auth.py` (`add_api_security`, `CSRFMiddleware`) |
| JWT implementation | `coordinator/auth_jwt.py` |
| JWT refresh endpoint | `coordinator/api.py` |
| Middleware registration order and CORS discovery | `coordinator/server.py` |
| Lifecycle auth and audit | `coordinator/recovery.py` |
| Onboarding | `coordinator/api.py` |
| MCP identity resolution | `coordinator/server.py` |
| Roles | `coordinator/roles.py` |

### 7.9 Unresolved

- Whether any production caller actually used the JWT path (as opposed to `X-Node-Token`) could
  not be determined from source.
- The `X-Operator-Token` header is in the CORS allow-list; its full server-side handling was not
  traced.

## 8. Event and streaming surfaces

### 8.1 Current contract

`coordinator/notifications.py` is the live SSE broker. It is **in-process**, which is why
`--workers 1` is an invariant (section 3.1).

`coordinator/event_bus.py` is explicitly a **dead scaffold** -- marked `# @ux: deprecated` with
zero callers. Do not rebuild it.

| Property | Value |
|---|---|
| Subscriber model | One queue per node, plus a `"__dashboard__"` channel |
| Event IDs | Monotonic per broker |
| Ring buffer | `_RING_BUFFER_SIZE = 4096` events per channel (roughly 6.8 minutes at 10 events/s) |
| Retention floor | `_RING_RETENTION_FLOOR_SECONDS = 60.0`; a breach increments the `eviction_under_60s_total` counter exposed by `get_ring_buffer_stats()` |
| Replay | `replay_since(channel, last_event_id)`, driven by the client's `Last-Event-ID` header |

### 8.2 Endpoints

| Endpoint | Type | Purpose |
|---|---|---|
| `GET /events/{node_id}` | SSE | Legacy per-node stream |
| `GET /events?nodes=A,B,C` | SSE | Multiplexed stream. This is the breathbus "mux" mode. |
| `GET /api/stream` | SSE | Dashboard (superdash v2) push channel |
| `GET /api/stream/{node_id}` | SSE | Per-node dashboard push |
| `GET /api/events` | JSON | Polling twin of the stream |
| `GET /api/events/timeline` | JSON | Timeline query. **Explicitly not streaming** -- listed in `EXACT_NON_STREAMING_OVERRIDES` so middleware does not pass it through. |

### 8.3 Durable outbox dispatch

`coord_outbox` (RFC392 Phase 5) provides at-least-once delivery for side effects that must
survive a crash. Table definition is in section 5.4.1.

- Drain loop: `_coord_outbox_drain_loop`coordinator/server.py`).
- Dispatchers are registered with `register_coord_outbox_dispatcher(surface, fn)`
  (`coordinator/server.py`). Registered surfaces: `audit_log` and `event`.
- **Rows with an unknown `surface` are left pending forever, not dropped.** This is deliberate:
  an unregistered surface is a deployment error, and silently discarding the row would lose data.
- Observability: `database.coord_outbox_stats()` is surfaced on `/api/health` as `coord_outbox`
  plus `outbox_oldest_pending_age_s`; the last drain tick is available from
  `server.get_coord_outbox_last_tick()`.

### 8.4 Render-cache channel

`_outbox_relay_loop`coordinator/server.py`) drains the **Cairn-side** `cairn_outbox`
table for rows with `surface = 'dashboard'` and re-broadcasts each Cairn lifecycle event onto
the `"__dashboard__"` SSE channel.

This exists for a specific reason: the dashboard's render-cache invalidator never observed
`wave_*` events, because Cairn writes went to the Cairn database and never reached the
coordinator's broker. The relay closes that gap. A rebuild that omits it will produce a
dashboard whose Cairn views silently go stale.

The `body` and `content` columns in `coordinator/cairn.py` remain the authoritative render-cache
and full-text-search source.

### 8.5 Implementation evidence

| Fact | Evidence |
|---|---|
| Broker, ring buffer, replay | `coordinator/notifications.py` |
| Dead scaffold marker | `coordinator/event_bus.py` |
| SSE routes | `coordinator/server.py` |
| Streaming middleware pass-through | `coordinator/api_auth.py`SSEAwareMiddleware`, `STREAMING_PATH_PREFIXES`) |
| Outbox dispatcher registry | `coordinator/server.py` |
| Relay and drain loops | `coordinator/server.py` |
| Outbox helpers | `coordinator/database.py` |

### 8.6 Unresolved

- The dashboard-side consumer of `/api/stream` is out of scope for this page and is not
  documented here.

## 9. Breathbus -- the liveness service

### 9.1 Current contract

Breathbus is a Go daemon, one instance per physical host, that supervises the agent processes
("riders") on that host and reports their liveness to the coordinator. The coordinator uses that
liveness to gate work through the **LIFE_SERVICES_GATE**.

| Property | Value |
|---|---|
| Repository | Breathbus liveness-daemon repository |
| Go module | `<your-module-path>/breathbus` |
| Binaries | `cmd/breathbus-node` and `cmd/breathbus-alarm` |
| Deployment shape | `breathbus-node.exe --config=<config-path>` as a native service on every rider host |
| Service name | `breathbus-node` |
| Service account | A low-privilege service account appropriate for the host |
| Recovery actions | Restart on failure with bounded backoff; reset the failure count after a cooldown window |
| HTTP listen port | `<DAEMON_PORT>` |
| Named pipe | `<breathbus-pipe>` |

### 9.2 Configuration

Per-host JSON configs live in the Breathbus repository and are deployed to a protected runtime
location such as `<shared-root>\breathbus\breathbus-<HOST_ID>.json`. Repository examples must not
contain secrets. Runtime configs may reference secret files or service environment variables.

Generic config shape:

```json
{
  "version": 2,
  "host_id": "<HOST_ID>",
  "node_id": "breathbus-<HOST_ID>",
  "mode": "doorbell",
  "sse_mode": "mux",
  "coordinator": {
    "url": "http://<coordinator-host>:<COORD_PORT>",
    "sse_endpoint": "/events?nodes=<node-a>,<node-b>",
    "reconnect_backoff": { "initial_ms": 5000, "max_ms": 60000, "multiplier": 2.0 }
  },
  "riders": [
    {
      "node_id": "<NODE_ID>",
      "working_dir": "<node-home>",
      "alarm_binary": "breathbus-alarm.exe",
      "identity_file": "<node-home><path-separator>fleet-identity.json"
    }
  ],
  "daemon": {
    "listen_port": "<DAEMON_PORT>",
    "log_level": "info",
    "log_file": "<log-dir><path-separator>breathbus-node.log",
    "fleet_shared_sync": {
      "enabled": false,
      "interval_s": 900,
      "timeout_per_op_s": 150,
      "repo_path": "<shared-root>",
      "remote": "<remote-name>",
      "branch": "master"
    }
  },
  "pipe": { "name": "<breathbus-pipe>" },
  "heartbeat_interval": 300,
  "pid_file": "<node-home><path-separator>breathbus-node.pid"
}
```

The node's credentials are **not** in this file. They are read from the rider's `identity_file`,
which holds the per-node session token.

**Invariant (RFC624x1):** `fleet_shared_sync.interval_s >= timeout_per_op_s * 2`. All six
`fleet_shared_sync` fields must ship atomically when flipping `enabled` to true.

Defaults from `internal/config/config.go` include the `/events` SSE endpoint, the dashboard heartbeat
endpoint, rider confirmation and retry limits, DB/WAL watchdog intervals, and version-pin intervals.
Most optional feature gates default to false in repository configs.

### 9.3 Daemon HTTP surface (port <DAEMON_PORT>)

| Path | Purpose |
|---|---|
| `/health` | Daemon health |
| `/wait-for-wake` | Long-poll wake signal for a rider |
| `/pending` | Pending work indicator |
| `/messages` | Message passthrough |
| `/riders`, `/riders/` | Rider inventory and per-rider detail |
| `/court-watch/reload` | Reload court-watch configuration |

### 9.4 Contract with the coordinator

**MCP calls** (`POST /mcp`, authenticated with `X-Node-Token`):

| Tool | Cadence / trigger |
|---|---|
| `check_inbox` | Heartbeat, every 300 s |
| `confirm_life_services` | On rider bond; clears the LIFE_SERVICES_GATE |
| `get_messages` | On demand |
| `send_message` | On demand |
| `bulk_acknowledge` | On demand |

**REST calls:**

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/breathbus/mint_daemon_post_token` | `X-Node-Token` | Mints a PID-bound `daemon_post_token`. Arguments: `node_id`, `copilot_pid`. |
| `POST /api/breathbus/rider_alive` | `Authorization: Bearer <daemon_post_token>` | Rider heartbeat. In `PUBLIC_PATHS`; handler-level auth. |
| `POST /api/breathbus/rider_died` | `Authorization: Bearer <daemon_post_token>` | Rider death report, with exit code and cause discriminators. In `PUBLIC_PATHS`. |
| `GET /api/breathbus/rider_liveness` | fleet auth | Reads derived rider liveness |
| `POST /api/breathbus_sync_status` | `X-Node-Token` or JWT | Reports the shared-scripts repository sync state |

`POST /api/breathbus_sync_status` (`coordinator/server.py`) validation:

- The `node_id` in the body must match the auth-resolved node, else 403.
- `snapshot_at_epoch_ms` must be within +/- 60 s of coordinator time, else 400.
- Missing or invalid auth yields 401.
- Returns `{stored, row_id, pruned, node_id, snapshot_at_epoch_ms}`.
- Persisted by `store_breathbus_sync_status` with prune-on-insert retention.

**Daemon identity.** The daemon self-identifies as `breathbus-<HOST>` using the
`_BB_DAEMON_SCOPE_PREFIX` convention, so its telemetry keys by physical host regardless of
which rider's token it borrowed to make the call.

### 9.5 LIFE_SERVICES_GATE

The gate is **fail-closed**. Backing columns on `nodes`: `life_services_confirmed`,
`life_services_confirmed_at`, `life_services_confirmed_at_epoch_ms`,
`life_services_gating_enabled`, `life_services_proof`.

When the gate blocks an operation, the caller receives a payload of the form
`{"error": "LIFE_SERVICES_GATE", ...}` -- raised at `coordinator/database.py` and
`coordinator/mcp_handler.py`.

The gate is cleared by the rider calling `confirm_life_services`. `set_manual_mode` merges
manual-mode flags into `life_services_proof` **without** touching `life_services_confirmed`, so
manual mode does not forge a life-services confirmation.

### 9.6 Implementation evidence

| Fact | Evidence (`breath-bus` repo) |
|---|---|
| Service definition and install | `internal/service/service.go`, `internal/service/install.go` |
| Config defaults | `internal/config/config.go` |
| Coordinator client | `internal/coordinator/client.go` (`mcpCall`, `CheckInbox`, `ConfirmLifeServices`, `restPost`, `MintDaemonPostToken`, `PostRiderAlive`, `PostRiderDied`) |
| Daemon HTTP routes | `internal/health/health.go`, `internal/rider/api.go`, `cmd/breathbus-node/main.go` |
| Per-host configs | `configs/breathbus-the operations node.json`, `configs/breathbus-a worker host.json`, `configs/README.md` |

Coordinator side: `coordinator/server.py`; `coordinator/database.py`;
`coordinator/mcp_handler.py`.

### 9.7 Unresolved

- The breathbus repository was on a **a detached source checkout** at the commit above. Whether that commit
  matched the deployed binaries could not be verified, because no build-provenance record was
  found. A rebuild should stamp the source commit into the binary (for example with Go
  `-ldflags "-X main.commit=..."`) and expose it on `/health`.
- Resolved: the coordinator host service pointed at the top-level `breathbus-the coordinator host.json` under the shared-scripts repository
  (see 12.2).
- The "retirement" mode (a `.bb4-retired` sentinel, in which the daemon owns the poll entirely and
  the model makes no MCP calls on an empty beat) was designed but **never activated on any node**.
  Do not assume it works.

## 10. Rebuild procedure

This is the ordered, copy-pasteable sequence to stand the backend up on fresh Windows hardware.
Placeholders are written as `<ANGLE_BRACKETS>`. Substitute real values; never reuse the
retiring secrets.

Throughout, `<REPO>` is the working copy of `the coordinator repository` in the reference implementation.

### Step 1 -- Provision the host

1. Windows Server or Windows 10/11 class host.
2. Install **PowerShell 7 or newer**. Verify:

```powershell
$PSVersionTable.PSVersion
# Major must be >= 7
```

3. Install **Python Python 3.x** (production ran Python 3.x). Verify:

```powershell
python --version
```

4. Install **NSSM** (needed for the PostgreSQL service definition).
5. Optional, only if rebuilding breathbus binaries: install a **compatible Go toolchain**.

### Step 2 -- Restore the repositories

The original git remotes were UNC paths on machines that will no longer exist. Restore from
whatever archive was taken before decommission.

```powershell
git clone <COORDINATOR_REPO_ARCHIVE> <REPO>
cd <REPO>
git checkout master
git rev-parse HEAD     # expect the approved rebuild commit
```

The `master`-branch requirement is enforced by `validate_branch()` at boot (exit 77) and by the
restart lever's step 1.5. It cannot be bypassed.

### Step 3 -- Create the Python environment

```powershell
cd <REPO>
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
# Do NOT install requirements.txt alone. It omits asyncpg/psycopg, alembic, SQLAlchemy,
# py-spy, psutil and more. Build from the verified production manifest in section 2.2:
# save that list as requirements-lock.txt (one package per line), then:
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
```

Verify the load-bearing packages are importable:

```powershell
.\.venv\Scripts\python.exe -c "import asyncpg, psycopg, alembic, sqlalchemy, psutil, fastapi, uvicorn; print('deps ok')"
.\.venv\Scripts\py-spy.exe --version
```

### Step 4 -- Install and initialise PostgreSQL 16-class

```powershell
# 1. Unpack the EnterpriseDB portable PostgreSQL 16-class distribution, e.g. to <PGROOT>\pgsql
# 2. Initialise the cluster with scram-sha-256 and UTF8.
$env:PGPASSWORD = '<SUPERUSER_PASSWORD>'
& '<PGROOT>\pgsql\bin\initdb.exe' -D '<PGROOT>\data' -E UTF8 -U postgres `
    --auth-host=scram-sha-256 --auth-local=scram-sha-256 --pwfile=<PWFILE>
```

Edit `<PGROOT>\data\postgresql.conf`:

```text
listen_addresses = 'loopback'
port = <DB_PORT>
```

Register the service with NSSM and start it:

```powershell
nssm install coordinator-pg '<PGROOT>\pgsql\bin\postgres.exe' '-D' '<PGROOT>\data'
nssm set coordinator-pg ObjectName '<low-privilege-service-account>'
nssm set coordinator-pg Start SERVICE_AUTO_START
nssm start coordinator-pg
```

Create the role, the database, and the secret file:

```powershell
& '<PGROOT>\pgsql\bin\psql.exe' -U postgres -p <DB_PORT> -c "CREATE ROLE coordinator LOGIN PASSWORD '<COORD_ROLE_PASSWORD>';"
& '<PGROOT>\pgsql\bin\psql.exe' -U postgres -p <DB_PORT> -c "CREATE DATABASE coordinator OWNER coordinator;"

# Store the password in a file OUTSIDE version control. This file is the only place
# the password lives; the DSN must never contain it.
New-Item -ItemType Directory -Force '<PGROOT>\pg-secrets' | Out-Null
Set-Content -NoNewline -Path '<PGROOT>\pg-secrets\coordinator-role.pw' -Value '<COORD_ROLE_PASSWORD>'
```

Apply the bootstrap grant. This is **required** -- `/health` calls functions such as
`pg_ls_waldir()` that need `pg_monitor`:

```powershell
& '<PGROOT>\pgsql\bin\psql.exe' -U postgres -p <DB_PORT> -d coordinator `
    -v coord_role=coordinator -f <REPO>\coordinator\rfc603\pg_bootstrap.sql
```

### Step 5 -- Restore data, or start empty

**Restoring from a snapshot (preferred).** Follow section 5.7. The order is mandatory:

1. `pg_restore` the coordinator `snap.dump` into the `coordinator` database.
2. Copy the Cairn `cairn.db` SQLite file into `<REPO>\cairn.db`.
3. Remove any `cairn.db-wal` / `cairn.db-shm` sidecars.
4. Only then continue to step 6.

**Starting empty.** Skip the restore. `_init_tables()` will create the full schema on first
boot (section 5.3). Then stamp Alembic so future baselines line up:

```powershell
cd <REPO>
.\.venv\Scripts\python.exe -m alembic -c coordinator\alembic.ini stamp 0001_rfc603_baseline
.\.venv\Scripts\python.exe -m alembic -c coordinator\alembic.ini current
```

### Step 6 -- Generate secrets

Generate fresh values. Do not reuse anything from the retiring fleet.

```powershell
# Fleet auth token, JWT secret, lifecycle token
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$AUTH_TOKEN = [Convert]::ToBase64String($bytes)

[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$JWT_SECRET = [Convert]::ToBase64String($bytes)

[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$LIFECYCLE_TOKEN = '<lifecycle-token-prefix>' + [Convert]::ToBase64String($bytes)
```

`LIFECYCLE_TOKEN` **must** differ from `AUTH_TOKEN`, must be at least 16 characters, and must
carry the `<lifecycle-token-prefix>` prefix.

Store these where the launcher can read them. **Do not commit them, and do not embed them in
`_start-coordinator*.cmd` or any documentation** -- that is exactly the mistake present in the
retiring repository.

### Step 7 -- Configure the launcher

Edit `<REPO>\scripts\_launch-prod.ps1` so it sets the environment from section 4.4, sourcing
secrets from your secret store rather than literals. The minimum production posture:

```text
ENVIRONMENT=prod
PORT=<COORD_PORT>
ALLOWED_NODES=<comma-separated node ids>
AUTH_TOKEN=<from secret store>
LIFECYCLE_TOKEN=<from secret store>
JWT_SECRET=<from secret store>

COORD_DB_BACKEND=postgres
COORD_ACTIVE_PRIMARY_DIALECT=postgres
COORD_PG_DSN=host=loopback port=<DB_PORT> dbname=coordinator user=coordinator
COORD_PG_PASSWORD_FILE=<PGROOT>\pg-secrets\coordinator-role.pw
COORD_SCHEMA_MIGRATIONS_ENABLED=true
COORD_PG_WRITER_POOL_ENABLED=true
COORD_MCP_DISPATCH_LANE_ROUTING_ENABLED=true
COORD_OG11_READ_LOCK_BYPASS_ENABLED=true
COORD_PG_PARTMAN_ENABLED=true
COORD_PG_EVENTS_SPLIT_ENABLED=true
COORD_OG12_NATIVE_PARTITION=true
COORD_PG_NATIVE_RETENTION_ENABLED=true
COORD_EVENT_DECOUPLE_ENABLED=true
COORD_DB_IDLE_TXN_TIMEOUT_S=30
CODECRETE_V1_ENABLED=true
HANDOFF_V1_ENABLED=true
SWATTER_V1_ENABLED=true
GOVERNOR_SUGGESTIONS_ENABLED=true
PYTHONUNBUFFERED=1
PYTHONIOENCODING=utf-8
```

Leave `CAIRN_DB_BACKEND` **unset** (section 5.5).

Also update `coordinator/hosts.py::_SEED_HOSTS` to describe the new hosts. That registry is
fail-loud; a missing entry raises `KeyError` rather than guessing.

### Step 8 -- Start the coordinator

```powershell
cd <REPO>
pwsh -NoProfile -File .\scripts\_launch-prod.ps1
```

Do **not** invoke `python -m uvicorn` directly. The dual-stack socket in
`scripts/serve_dualstack.py` is required to avoid a roughly two-second IPv6-SYN-timeout stall on
every FQDN and `localhost` request, and the literal argv tokens `coordinator.server:app` and
`--port <COORD_PORT>` are what supervision matches on.

Expected process command line:

```text
<REPO>\.venv\Scripts\python.exe <REPO>\scripts\serve_dualstack.py coordinator.server:app --port <COORD_PORT>
```

If the process exits, read the code:

| Exit code | Meaning |
|---|---|
| 2 | Bad arguments (argparse) |
| 77 | Not on `master` |
| 78 | `Assert-ProdLaunchSafe` failed (dirty tree or unsafe launch) |
| 79 | `--workers` was not 1 |
| non-zero, with an instance-lease message | `boot_gate_or_exit()`: another coordinator holds the singleton lease |

Logs are at `<REPO>\logs\coordinator-prod-<stamp>.out.log` and `.err.log`, with a
`.startup-env` sidecar recording the launch environment.

### Step 9 -- Install supervision

```powershell
# Out-of-band health watchdog (1-minute cadence, independent of the coordinator)
pwsh -NoProfile -File <REPO>\scripts\register-coord-health-watchdog.ps1

# Backup snapshots on the selected cadence as the chosen task principal
#   (edit backup-snapshot.ps1 destinations for the new topology first)
Register-ScheduledTask -TaskName 'fleet-backup-snapshot' `
  -Action (New-ScheduledTaskAction -Execute 'pwsh.exe' `
      -Argument "-NoProfile -File <REPO>\scripts\backup-snapshot.ps1") `
  -Trigger (New-ScheduledTaskTrigger -Once -At (Get-Date) `
      -RepetitionInterval (New-TimeSpan -Minutes 30)) `
  -Principal (New-ScheduledTaskPrincipal -UserId '<task-principal>' -RunLevel Highest)
```

Confirm the watchdog's `-TimeoutSec` (15) still exceeds the server's derived
`_HEALTH_DB_PROBE_TIMEOUT_S` (`COORD_PG_HEALTH_PROBE_TIMEOUT_MS / 1000 + 2.0`; default 12.0 s).
Violating that relationship causes false-positive restarts; the invariant is guarded by
`Test-WatchdogTimeoutExceedsServerHealthProbeBound`.

Do **not** enable an NSSM service for the coordinator itself. The `coordinator` service is held
Stopped and Disabled by design to prevent a spawn loop
(`scripts/configure-nssm-coordinator.ps1`).

### Step 10 -- Build and install breathbus

```powershell
cd <BREATHBUS_REPO>
go build -o <breathbus-root>\breathbus-node.exe .\cmd\breathbus-node
go build -o <breathbus-root>\breathbus-alarm.exe .\cmd\breathbus-alarm
```

Write a per-host config (shape in section 9.2), then install the service. The binary's own
installer registers the SCM entry, the recovery actions, and the event-log source:

```powershell
<breathbus-root>\breathbus-node.exe --install --config=<CONFIG_PATH>
Start-Service breathbus-node
```

Point `coordinator.url` at `http://<coordinator-host>:<COORD_PORT>` and set `sse_endpoint` to
`/events?nodes=<comma-separated riders on this host>`.

### Step 11 -- Verify

Run the acceptance tests in section 11. The backend is not considered up until all of them pass.

## 11. Acceptance tests

### 11.1 Process liveness

```powershell
curl.exe -s http://<coordinator-host>:<COORD_PORT>/ping
```

Expected: HTTP 200 with a JSON body of the shape:

```json
{"status": "ok", "pid": 12345, "uptime_s": 42.7}
```

`/ping` is declared `declare_no_db`, so it distinguishes "server down" from "database locked".
If `/ping` succeeds but `/api/health` fails, the process is alive and the database path is the
problem.

### 11.2 Database read and write health

```powershell
curl.exe -s -o - -w "`nHTTP %{http_code}`n" http://<coordinator-host>:<COORD_PORT>/api/health
```

Expected: HTTP 200 with `db_read` **and** `db_write` both true. This endpoint performs a real
read, then escalates to a real write (an `INSERT` followed by a `DELETE` on the `health_check`
table). It returns **503** on failure. Results are cached for 10 s, so allow up to 10 s for a
state change to be reflected. The probe is bounded by `_HEALTH_DB_PROBE_TIMEOUT_S` (12.0 s by
default).

This is exactly the assertion the out-of-band watchdog makes, and it is the check that would
have caught a dead-write-connection outage.

### 11.3 Full health surface

**`/health` and `/api/health` are two different surfaces, not one surface at two depths.**
The two surfaces expose overlapping but different key sets. Reaching for the wrong one during an incident returns a confidently incomplete
answer.

| Surface | Character | Representative keys |
| --- | --- | --- |
| `/health` | Fleet and governance | `service`, `writer_pool_health`, `reader_pool_health`, `pg_pool_health`, `sse_connections`, `sse_expected_not_connected`, `startup_sha`, `governance`, `startup_sha_health`, `high_water_check`, `integration_tip_drift`, `ssh_probe`, `db_backend`, `uptime_s` |
| `/api/health` | Database, pool and operations | `uptime_seconds`, `started_at`, `running_git_sha`, `db_read`, `db_write`, `db_write_rmw_verified`, `node_count`, `nodes_online`, `message_count`, `coord_outbox`, `readiness_stages`, `recovery_mode`, `degraded_nodes`, `caps`, `restart_intent_active`, `pg_pool`, `circuit_breaker`, `spyglass_health`, `effective_flags` |

```powershell
curl.exe -s http://<coordinator-host>:<COORD_PORT>/health       # fleet / governance
curl.exe -s http://<coordinator-host>:<COORD_PORT>/api/health   # database / pools / ops
```

Expected: HTTP 200 from both. `coord_outbox` and `outbox_oldest_pending_age_s` live on
**`/api/health`**, not `/health`.

Every additive surface on `/health` is best-effort and never raises. On error the drift summary
returns an explicit `unavailable` or stale shape -- **never a zeroed shape**, because a zeroed
shape reads as "healthy with no drift" and is indistinguishable from good news.

Check specifically that `outbox_oldest_pending_age_s` is not growing unboundedly; a growing
value means an unregistered outbox `surface` is accumulating pending rows (section 8.3).

### 11.4 MCP initialize

```powershell
curl.exe -s -X POST http://<coordinator-host>:<COORD_PORT>/mcp `
  -H "Content-Type: application/json" `
  -H "X-Node-Token: <NODE_SESSION_TOKEN>" `
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

Expected: HTTP 200, and a result containing:

```json
{
  "protocolVersion": "<MCP_PROTOCOL_VERSION>",
  "capabilities": {"tools": {"listChanged": false}},
  "serverInfo": {"name": "zerobrain-fleet-coordinator", "version": "0.8.0"}
}
```

### 11.5 MCP tools/list

```powershell
curl.exe -s -X POST http://<coordinator-host>:<COORD_PORT>/mcp `
  -H "Content-Type: application/json" `
  -H "X-Node-Token: <NODE_SESSION_TOKEN>" `
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

Expected: a `tools` array. Assertions:

- The advertised list equals the source `TOOLS` list minus the hidden and hard-removed sets.
- `register_node`, `add_knowledge`, and `cairn_kb_search` are **absent** from the list but still
  callable.
- `fetch_file`, `request_sudo`, and `revoke_sudo` are absent **and** rejected if called.
- Every tool's `inputSchema.properties` contains a `_session_token` string property.

### 11.6 MCP notification handling

```powershell
curl.exe -s -o NUL -w "HTTP %{http_code}`n" -X POST http://<coordinator-host>:<COORD_PORT>/mcp `
  -H "Content-Type: application/json" `
  -d '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'
```

Expected: **HTTP 202 with an empty body.** A response body containing `"id": null` is a
regression that breaks the MCP bridge proxy from version <bridge-version> onward.

### 11.7 MCP round trip with a real tool

```powershell
curl.exe -s -X POST http://<coordinator-host>:<COORD_PORT>/mcp `
  -H "Content-Type: application/json" `
  -H "X-Node-Token: <NODE_SESSION_TOKEN>" `
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"check_inbox","arguments":{}}}'
```

Expected: HTTP 200 with a non-error result. This is the same call the breathbus daemon makes
every 300 s, so a failure here means liveness reporting is broken.

If the node has not confirmed life services, expect an error payload of the form
`{"error": "LIFE_SERVICES_GATE", ...}` -- that is a **correct** fail-closed response, not a
backend fault. Clear it by calling `confirm_life_services`.

### 11.8 Authentication is fail-closed

```powershell
# No credential at all
curl.exe -s -o NUL -w "HTTP %{http_code}`n" http://<coordinator-host>:<COORD_PORT>/api/fleet/status
```

Expected: **401/403** when `AUTH_TOKEN` is set, or **503** when `AUTH_TOKEN` is unset. A 200
here means the fail-closed guard is broken.

```powershell
# Fleet token must NOT grant lifecycle privilege
curl.exe -s -o NUL -w "HTTP %{http_code}`n" -X POST http://<coordinator-host>:<COORD_PORT>/api/lifecycle/token/rotate `
  -H "Authorization: Bearer <AUTH_TOKEN>" -H "Content-Type: application/json" `
  -d '{"new_token":"<lifecycle-token-prefix>xxxxxxxxxxxxxxxx"}'
```

Expected: **denied**. The lifecycle checker explicitly rejects a presented token that equals
`AUTH_TOKEN`.

```powershell
# Lifecycle token configuration status (no auth required by design)
curl.exe -s http://<coordinator-host>:<COORD_PORT>/api/lifecycle/token/status
```

Expected: HTTP 200 with a `configured` boolean. Do not assert `configured: true` -- the lifecycle
token is an optional deployment feature, and a deployment that does not use it correctly reports
`{"configured": false}`.

### 11.9 SSE is not buffered

The stream endpoint is **`/events`**, authenticated by the `X-Node-Token` **header**. A token
passed as a query parameter is rejected.

```powershell
# Should emit bytes immediately and keep the connection open.
curl.exe -N -s --max-time 10 -H "X-Node-Token: <NODE_SESSION_TOKEN>" `
  "http://<coordinator-host>:<COORD_PORT>/events?nodes=<NODE_ID>"
```

Expected: an `event: connected` frame arrives within a second or two and the connection stays
open. If the command hangs with no output and then returns everything at once on timeout, the
SSE-aware middleware pass-through is broken -- Starlette's `BaseHTTPMiddleware` is buffering the
body. This is the same condition the restart lever's step 7.6 checks; it reports exit code 7
(advisory) or 8 (hard rollback).

Also verify replay:

```powershell
curl.exe -N -s --max-time 10 -H "X-Node-Token: <NODE_SESSION_TOKEN>" `
  -H "Last-Event-ID: <SOME_ID>" "http://<coordinator-host>:<COORD_PORT>/events?nodes=<NODE_ID>"
```

Expected: buffered events after `<SOME_ID>` are replayed from the ring buffer (4096 events per
channel, roughly 6.8 minutes at 10 events/s).

### 11.10 Breathbus daemon

```powershell
curl.exe -s http://<worker-host>:<DAEMON_PORT>/health
curl.exe -s http://<worker-host>:<DAEMON_PORT>/riders
Get-Service breathbus-node | Select-Object Name, Status, StartType
```

Expected: HTTP 200 from both endpoints, the rider inventory matching the host's config, and the
service `Running` with `StartType` `Automatic`.

Then confirm the coordinator sees it:

```powershell
curl.exe -s -H "Authorization: Bearer <AUTH_TOKEN>" http://<coordinator-host>:<COORD_PORT>/api/breathbus/rider_liveness
```

Expected: a row per rider, with `rider_alive` derived true for riders that are bonded and fresh.

### 11.11 PostgreSQL grants and cluster

```powershell
& '<PGROOT>\pgsql\bin\psql.exe' -U coordinator -p <DB_PORT> -d coordinator `
  -c "SELECT pg_has_role('coordinator','pg_monitor','member');"
```

Expected: `t`. If this is `f`, `/health` will fail on `pg_ls_waldir()` and the bootstrap grant
was not applied (step 4).

```powershell
& '<PGROOT>\pgsql\bin\psql.exe' -U coordinator -p <DB_PORT> -d coordinator `
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
& '<PGROOT>\pgsql\bin\psql.exe' -U coordinator -p <DB_PORT> -d coordinator `
  -c "SELECT count(*) FROM schema_migrations;"
```

Expected on a restored dataset: the public table count and `schema_migrations` count match the source schema dump taken for the rebuild. On a fresh empty build, the count depends on conditional tables. `schema_migrations` becomes non-zero once `COORD_SCHEMA_MIGRATIONS_ENABLED=true` has run one boot.

Cluster settings are rebuild inputs, not historical facts. Keep PostgreSQL loopback-only, size `max_connections` above the sum of all configured pool lanes plus administrative headroom, and monitor pool acquire wait under expected load.

### 11.12 Schema parity (migration window only; NOT a steady-state acceptance test)

`coordinator\rfc603\parity_check.py` compares the SQLite store with PostgreSQL. It was a validation
tool for the dual-write migration window. After the cutover the SQLite store is frozen, so this
check **correctly reports FAIL** on any healthy post-cutover system because the SQLite source is frozen and PostgreSQL continues changing. Do not run it as an acceptance test. Use it only if a rebuild repeats a
SQLite-to-PostgreSQL migration with a dual-write window.

For steady-state acceptance, use the table and row-count checks in 11.11 and the restore parity
check in 5.7.

### 11.13 Test suite gate

```powershell
cd <REPO>
.\.venv\Scripts\python.exe -m pytest -m v1 --timeout=60 --timeout-method=thread
```

Intended result: all selected tests pass. This is the curated pre-restart gate.
Subcategories: `v1_critical`, `v1_task`, `v1_auth`, `v1_cairn`, `v1_schema`. The `v1` marker is
applied **per test, never as a module-level `pytestmark`**, and every `v1` test must carry
exactly one subcategory -- both rules are enforced at collection time in `tests/conftest.py`.

Run this gate on a host where the coordinator is not already holding local test database files. Historical live-host results are intentionally omitted.

Live tests are deselected by default; opt in with `RUN_LIVE_COORD_TESTS=1` or `--run-live`.

Schema snapshot regression:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_schema_snapshots.py
```

### 11.14 Backup round trip

```powershell
pwsh -NoProfile -File <REPO>\scripts\backup-snapshot.ps1 -Backend postgres
```

Expected: a new dated directory at both destinations containing `snap.dump`, `snap.dump.sha256`,
and `status.json`, with `status.json` reporting `integrity_check: "ok"` and
`transfer_status: "OK"`. Verify:

```powershell
$dir = '<offsite root>\<newest dated dir>'
(Get-FileHash "$dir\snap.dump" -Algorithm SHA256).Hash
Get-Content "$dir\snap.dump.sha256"
Get-Content "$dir\status.json" | ConvertFrom-Json | Select-Object integrity_check, transfer_status
```

## 12. Evidence conflicts, unverified items, and unresolved questions

> Sections 13-17 follow this one. They were added to serve reconstruction rather than cloning, and
> they carry their own unresolved-item subsections. Section 17 is explicitly assessment. Read section
> 14 first if you are short of time.

### 12.1 Labelled evidence conflicts

These conflicts are recorded rather than silently reconciled.

| # | Conflict | Follow |
|---|---|---|
| 1 | Older overview prose says SQLite is the primary database, while the launcher and boot assertion require PostgreSQL. | Follow the launcher and boot assertion: PostgreSQL is the coordinator write-of-record. |
| 2 | Older deployment prose describes a scheduled-task start/stop model, while the maintained launcher uses `Start-Process` and the restart lever. | Follow the launcher and restart lever; treat the older guide as historical and credential-bearing. |
| 3 | Older backup prose describes SQLite as the primary recovery mechanism, while `backup-snapshot.ps1` has a PostgreSQL path. | Use the backend-aware backup contract and verify with restore drills. |
| 4 | Migration notes retain pre-cutover warnings about PostgreSQL. | Treat them as historical once the production launcher sets PostgreSQL. |
| 5 | Legacy `.cmd` launchers invoke bare uvicorn and may embed credentials. | Use `scripts/_launch-prod.ps1` and `scripts/serve_dualstack.py`. |
| 6 | Runtime dependency manifests under-declare PostgreSQL and migration packages. | Build from one enforced lock file that includes the PostgreSQL runtime and migration stack. |
| 7 | Scheduled backup jobs may copy stale stores while reporting success. | Back up through the same backend selector the application uses, and prove recovery by restoring. |
| 8 | Development/test port observations came from one deployment. | Pick fresh isolated ports for the rebuild. |

### 12.2 Unverified

- The backup round trip through the backend-aware PostgreSQL path must be executed in the rebuild.
- Breathbus binary provenance should be stamped into the binary and exposed on `/health`.
- The JWT path exists, but whether any caller uses it is deployment-specific.
- The `X-Operator-Token` header is allowed by CORS; any server-side semantics should be traced in
  source before depending on it.
- Per-tool MCP input schemas and per-route request/response models are not reproduced here. Carry
  forward `coordinator/mcp_handler.py`, `docs/api-reference.md`, and
  `docs/mcp-tool-arg-reference.md`.
- Superdash has its own dependency environment; see `website-superdash.md`.

### 12.3 Unresolved questions for a rebuilder

1. **Does the rebuild need multiple hosts?** A single-host backend is viable if the host registry is
   reduced consistently and backup/liveness roles are still covered.
2. **Should Cairn migrate to PostgreSQL during the rebuild?** Prefer rebuilding with SQLite Cairn
   first, then migrate Cairn separately with parity validation.
3. **Should the FTS5 search substrate be reimplemented?** If Cairn moves to PostgreSQL, replace the
   SQLite FTS tables with a PostgreSQL search design.
4. **What replaces the off-host backup destination?** Choose a secretless or separately credentialed
   path and document its restore proof.
5. **Which optional feature gates are part of the target posture?** Keep the production-minimum set
   in section 4.4, then enable additional gates deliberately.

## 13. Design rationale by subsystem

**Design intent.** This section explains *why* each subsystem in sections 1-9
is shaped the way it is: the problem it solves, the alternative that was rejected, and the
tradeoff that was accepted. Where the source states the reason, it is quoted verbatim and
attributed to an evidence locator. Where no reason is stated in source, the entry is marked
**(inferred)** and should be treated as a hypothesis, not a fact.

### 13.1 Why one process, one worker, one host (relates to sections 1 and 3)

**Decision.** The coordinator is a single uvicorn process, `--workers 1`, on one host, fronting
one database. It is not clustered, not load-balanced, and not horizontally scalable.

**Stated reason.** The SSE broker is in-process. `scripts/serve_dualstack.py` makes this an
explicit, fail-loud deploy gate:

> "The coordinator's SSE broker is IN-PROCESS. Under a multi-worker model (uvicorn `--workers >1`
> / gunicorn pre-fork) an event emitted on worker A never reaches a client connected to worker B
> -- the superdash/live streams silently degrade. RFC599's solidplan makes `--workers=1` a
> LOAD-BEARING hard precondition and directs it be 'baked as a deploy gate'. ... the gate makes
> that invariant EXPLICIT + FAIL-LOUD: it accepts `--workers` (default 1) and REFUSES to launch
> with any other value, so a future refactor that tries to wire multi-worker aborts at startup
> instead of shipping a silently-broken SSE lane. Lift only when a shared/cross-worker SSE broker
> replaces the in-process one."

Evidence: `scripts/serve_dualstack.py` module docstring; `validate_workers()`; exit code
`WORKERS_GATE_EXIT = 79`.

**Alternative rejected.** Multi-worker pre-fork with a shared broker (Redis pub/sub, PostgreSQL
`LISTEN/NOTIFY`, or a dedicated broker process). Explicitly parked as an "RFC599 out-of-scope
follow-up", not refused on principle.

**Tradeoff accepted.** All coordinator throughput is bounded by one Python event loop, and the
coordinator is a single point of failure for the whole fleet. In exchange, the event bus,
replay ring buffers, the outbox dispatcher registry, the render-cache channel, rate-limit
counters, and the maintenance/quiesce freeze state can all be plain in-process Python objects
with no distributed-state problem to solve. For a fleet of roughly six nodes this is the correct
trade; it stops being correct somewhere well before it stops being obvious.

**Consequence for a rebuild.** If you keep the in-process broker, keep the gate. If you replace
the broker with an external one, the single-worker constraint dissolves and a large amount of
other machinery (the instance-singleton boot gate, the single shared write connection, the
process-wide `_write_lock`) becomes negotiable at the same time. These decisions are coupled.

### 13.2 Why a dual-stack socket instead of `uvicorn --host` (relates to section 3)

**Decision.** The process entry point is `scripts/serve_dualstack.py`, which pre-creates an
`AF_INET6` socket with `IPV6_V6ONLY=0` and `SO_REUSEADDR`, binds `::`, and hands it to
`uvicorn.Server.run(sockets=[...])`.

**Stated reason.** A measured fleet-wide latency defect:

> "Clients resolve the coordinator FQDN (and `localhost`) to an AAAA / IPv6 record FIRST. With
> uvicorn bound IPv4-only (`--host all interfaces`) the IPv6 connect finds no listener -> the SYN goes
> unanswered -> the client stalls ~2s on the connect timeout -> only THEN falls back to the IPv4
> A-record. That ~2 second penalty hit every node's MCP/HTTP call (measured: FQDN <measured-value> /
> localhost <measured-value> vs loopback 7-<measured-value>). The coordinator itself answers in single-digit ms; the
> latency was entirely the IPv6-first-resolution fallback."

With the validated result recorded in the same docstring:

> "loopback : fast -> fast; localhost : <measured-value> -> <measured-value>; [loopback] : ERR -> <measured-value>; FQDN : <measured-value> -> <measured-value>"

Evidence: `scripts/serve_dualstack.py` module docstring.

**Alternative rejected.** `uvicorn --host ::`. Rejected because "Windows defaults
`IPV6_V6ONLY=1`, so a bare `uvicorn --host ::` would listen IPv6-ONLY and break IPv4 (loopback)
clients -- and uvicorn's CLI cannot set V6ONLY."

**Tradeoff accepted.** A bespoke launcher script instead of a stock uvicorn command line, and a
`--host` argument that is accepted and deliberately ignored ("honoring an IPv4-only `--host`
would defeat it").

**Consequence for a rebuild.** The *invariant* is "one listening socket that answers both
address families". The *implementation* is a Windows workaround. On Linux, where
`net.ipv6.bindv6only` defaults to 0, `--host ::` alone is sufficient and this file can be
deleted.

### 13.3 Why the launcher passes redundant-looking argv tokens (relates to section 3)

**Decision.** The production command line is
`python scripts/serve_dualstack.py coordinator.server:app --port <COORD_PORT>`, even though the script
hard-codes both defaults.

**Stated reason.**

> "The trailing `coordinator.server:app --port <COORD_PORT>` tokens are LOAD-BEARING, not cosmetic:
> restart-coordinator.ps1 finds/kills/verifies the coordinator process by regex-matching BOTH
> `coordinator\.server:app` AND `--port\s+<PORT>` in the process command line (Steps 3/5.5/7). A
> bare `python serve_dualstack.py` cmdline contains neither token, so the dual-stack proc would
> be INVISIBLE to the restart machinery -- the deadman rollback could not kill it (IPv4 relaunch
> then collides on the port -> INV_PORT_FREE abort -> safety net broken), and future restarts
> would orphan it on the port. Passing the literals as argv keeps the proc detectable with ZERO
> change to restart-coordinator.ps1. The values are honest: this IS coordinator.server:app on
> that port."

Evidence: `scripts/serve_dualstack.py` module docstring; `parse_args()` docstring.

**Alternative rejected.** Teaching `restart-coordinator.ps1` a new detection pattern. Rejected
on change-surface grounds ("ZERO change to restart-coordinator.ps1").

**Tradeoff accepted.** Process identity is carried by an unstructured command-line string rather
than a PID file, a lock file, or a service handle. This is the weakest link in the supervision
design and is discussed again in section 17.

**Consequence for a rebuild.** The invariant is "the supervisor must be able to identify the
coordinator process unambiguously and must not mistake a sibling for it". A PID file written
under the instance-singleton lease, or a systemd unit, discharges that invariant far more
cleanly than argv matching.

### 13.4 Why the process refuses to start from a non-master checkout (relates to section 3)

**Decision.** Two independent branch gates: `Assert-ProdLaunchSafe -RequiredBranch master` in
`scripts/_launch-prod.ps1`, and `validate_branch()` in `scripts/serve_dualstack.py` exiting 77.

**Stated reason.**

> "a remediation note: master-branch guard -- refuse to serve from a non-master checkout. During
> a a historical point incident, prod served from the analyst node/rfc599-w4-observability (8 commits behind master)
> after a dirty-tree guard passed but the branch guard was missing here. `_launch-prod.ps1`
> checks via `Assert-ProdLaunchSafe -RequiredBranch master`, but serve_dualstack.py is the actual
> process entry point and must enforce independently."

Evidence: `scripts/serve_dualstack.py`REQUIRED_BRANCH`, `BRANCH_GATE_EXIT = 77`,
`validate_branch`).

**Design principle being expressed.** *The guard belongs at the actual entry point, not only at
the convenient wrapper.* The PowerShell wrapper can be bypassed; the Python entry point cannot.
This "enforce independently at the real boundary" pattern recurs throughout the codebase
(see also the instance-singleton gate in 13.5 and `assert_local_db_path` in 15).

**Scope limit, stated in source and worth preserving.**

> "SCOPE (the architect node Finding-1): this guard owns the BRANCH/DETACHED-HEAD axis only. It does NOT
> check tip-freshness (local master behind origin/master). Stale-tip is covered by deploy_gate
> selfcheck + restart-coordinator.ps1 pre-kill SHA-reverify (HEAD == intended-SHA pin). Do not
> record this guard as closing the stale-tip axis."

**Correction to an earlier reading of this document.** The branch gate is **not** absolutely
unbypassable. `--allow-branch-drift` downgrades it from FATAL to WARN, and is used for
`-RecoverAfterReboot` recovery flows. Additionally, if `git` is absent or times out, the gate
emits `WARN ... branch is UNVERIFIED` and **allows the launch** (fail-open). Both are deliberate
availability choices; a rebuild should decide consciously whether to keep the fail-open.

### 13.5 Why there is an instance-singleton boot gate (relates to sections 3 and 5)

**Decision.** Before `uvicorn.run()` binds the port, `acquire_instance_singleton()` claims a
row in `coord_instance_holder` keyed by hostname, with a 90 second TTL
(`COORD_INSTANCE_TTL_MS = 90_000`, "3x the 30s heartbeat cadence").

**Stated reason.**

> "Raised by the boot-gate when a live coordinator already holds this host. Carries the live
> holder's pid/host/boot in the message so the operator (and NSSM, once re-enabled) sees a clear
> 'refusing to start second instance' signal instead of an opaque EADDRINUSE crash-loop."

and

> "The caller (`server.main()`) runs this BEFORE `uvicorn.run()` binds the port, so a second
> instance exits with the clear holder-detected error and never reaches EADDRINUSE."

Evidence: `coordinator/database.py`InstanceSingletonError`,
`acquire_instance_singleton`, `_pid_is_alive`).

**The refinement that matters most.** A TTL alone was wrong, and the source says why:

> "a not-yet-expired TTL is NOT sufficient to declare a live sibling. A hard-killed predecessor
> (Stop-Process/crash) skips the graceful `release_instance_singleton` (lifespan-only), leaving a
> future-TTL row for up to COORD_INSTANCE_TTL_MS. Only a pid that is ACTUALLY ALIVE on this host
> blocks us; a dead holder's row is stale -> take over immediately (else the 60s restart
> health-window < 90s TTL fails every restart by default)."

This is a *lease plus liveness-proof* design, not a plain lease. The liveness proof is only
valid because the holder row is hostname-keyed, so the gate only ever inspects a PID on its own
host. That coupling is load-bearing and is called out in source.

**Self-sufficiency requirement.** The gate creates its own table:

> "self-provision the holder table so the boot-gate is fully self-sufficient. It runs BEFORE
> pool-init / schema-sync / every other subsystem, so it cannot depend on `_init_tables` (SQLite)
> or `sync_sqlite_to_pg` (PG) having run first -- else a PG first-boot would error 'relation does
> not exist'."

**Tradeoff accepted.** The mutual-exclusion primitive lives in the same database whose
availability it is supposed to protect. If the database is unreachable the gate cannot run at
all. A rebuild on a platform with a real process supervisor (systemd, Kubernetes) gets this for
free and should not reimplement it.

### 13.6 Why supervision was deliberately disabled (relates to section 3)

**Decision.** The NSSM Windows service wrapping the coordinator is held **Stopped and Disabled**.
Restart is skill-mediated through `scripts/restart-coordinator.ps1`, with an out-of-band
PowerShell watchdog (`scripts/coord-health-watchdog.ps1`) as the only automatic actor.

**Stated reason.** The supervisor itself caused a host outage:

> "a remediation note fix #2: idempotent NSSM coordinator-service hardening config. ... Applies /
> rolls back the NSSM service config that prevents the spawn-loop class which crashed the coordinator host host
> historically (a remediation note)."

Four layered knobs, each with its reason recorded:

| Knob | Target | Stated reason (quoted/condensed) |
|---|---|---|
| Win32 `StartType` | `Disabled` | "Manual lets any 'Start-Service coordinator' from any shell re-arm the spawn-loop -- that's the failure mode the remediation change hit. Disabled forces the restart skill to flip Manual -> start -> Disabled within its sequence, and a stray Start-Service call without the StartType flip fails loudly." |
| NSSM `AppExit Default` | `Stop` (was `Restart`) | "NSSM supervisor will NOT auto-respawn the wrapped process on exit. Coord lifecycle is entirely skill-mediated post-the remediation change. THIS is the primary respawn-cadence defense; #3+#4 below are layered fallbacks." |
| NSSM `AppRestartDelay` | <measured-value> (was 30000) | "Defense-in-depth: if AppExit ever resets to Restart, the respawn cadence stretches from the 30s that crashed the coordinator host to 5min, giving the operator a visible spawn cadence to react to." |
| NSSM `AppThrottle` | <measured-value> (was 1500) | "Tertiary defense ... Largely inert when AppExit=Stop; relevant only in the unlikely AppExit-reset path." |

Evidence: `scripts/configure-nssm-coordinator.ps1` comment-based help.

**Design principle being expressed.** *Defence in depth with an explicit primary and explicitly
labelled fallbacks.* The script does not pretend all four knobs matter equally; it names which
one is doing the work and which ones exist only for the case where the first is reverted.

**Operational hazard recorded in the same file, and worth carrying forward verbatim:**

> "APPLY-ORDERING WARNING ... `Set-Service -StartupType Disabled` does NOT stop a RUNNING
> service. If the coordinator service is in State=Running at apply-time, this script's -Apply
> leaves the running process alone ... To halt an actively-running spawn-loop, OPERATOR must run
> `nssm stop coordinator` BEFORE this script's -Apply."

**Tradeoff accepted.** Automatic crash recovery was traded away for blast-radius control. The
coordinator does not come back by itself after an unclean exit unless the out-of-band watchdog
notices; the watchdog is therefore load-bearing, and its timeout is coupled to the health
endpoint's timeout (see 13.7).

**Consequence for a rebuild.** Do not read this as "supervisors are bad". Read it as: *a
restart policy with a short fixed delay and no crash-loop backoff will take the host down.* Any
supervisor you choose must have exponential backoff, a rate limit, and a start-limit that ends
in a terminal failed state rather than an infinite loop. `systemd`'s
`Restart=on-failure` + `RestartSec` + `StartLimitIntervalSec`/`StartLimitBurst`, or a Kubernetes
`CrashLoopBackOff`, satisfy this directly.

### 13.7 Why health-check timeouts are derived, never hard-coded (relates to sections 3 and 8)

**Decision.** `/health`'s outer probe bound is computed:
`_HEALTH_DB_PROBE_TIMEOUT_S = config.COORD_PG_HEALTH_PROBE_TIMEOUT_MS / 1000.0 + 2.0`.

**Stated reason -- two incidents, in order.** First, the hang:

> "RFC603c2 fix#2 (post-incident a historical point): BOUND the probe with a hard timeout. A wedged DB
> conn makes db_health_check() HANG (an awaited coroutine that never returns), NOT raise -- so
> the try/except below never fired and /health hung for 7.5h, blinding every liveness check
> (process alive + port bound, but /health never answered, so NSSM/watchdog saw nothing wrong).
> asyncio.wait_for => a wedge surfaces as TimeoutError => FAIL FAST to 503 so external liveness
> (fix#3 watchdog, NSSM) can DETECT the wedge instead of hanging on the same dead conn."

Then, the over-correction:

> "a remediation note (overnight soak): the hardcoded 5.0s here was SHORTER than
> db_health_check()'s own inner write-probe timeout (config.COORD_PG_HEALTH_PROBE_TIMEOUT_MS, 10s
> default) -- the exact same outer-tighter-than-inner mismatch class as the
> command_timeout/statement_timeout bug fixed earlier this SWAT. The inner probe is explicitly
> designed to tolerate brief real write-path contention ... for up to 10s before gracefully
> reporting 'degraded' -- but this outer wrapper always fired first at 5.0s, converting that
> designed graceful-degrade into a raw TimeoutError -> 503 -> full watchdog auto-restart.
> Confirmed live: 3 separate incidents overnight (02:10/02:24/03:03 UTC), all with an
> near-identical ~5.13-5.14s elapsed_ms and all threads idle in the py-spy dump by the time it
> was captured moments later (i.e. NOT a sustained hang -- a brief write-path contention window
> that had already cleared). Derive this bound FROM the inner probe's own configured timeout (+2s
> margin for the read-test + overhead) so the two can never drift apart again structurally."

Evidence: `coordinator/api.py`.

**The generalisable rule.** This codebase discovered, twice, the same bug class: **nested
timeouts where an outer bound is tighter than an inner bound**. The result is never a useful
error; it is the loss of a designed graceful-degradation path and its replacement by a hard
failure. The fix pattern adopted is to *derive outer bounds from inner bounds arithmetically*,
so they cannot drift.

The same rule is applied at two further layers:

- `COORD_PG_COMMAND_TIMEOUT_S` (45s, client side) must exceed the highest server-side
  `statement_timeout` (30s), so a statement's own bound fires first and produces a meaningful
  PostgreSQL error rather than an opaque client-side cancellation.
  Evidence: `coordinator/config.py`.
- The watchdog's `-TimeoutSec` (raised 6 -> 15) must exceed the server's health probe bound
  (12.0s), enforced by a named test, `Test-WatchdogTimeoutExceedsServerHealthProbeBound`.

**This chain is a single invariant with three links.** It is restated in section 14 as the
"timeout ladder".

### 13.8 Why the client-side `command_timeout` exists at all (relates to section 4)

**Stated reason.** Server-side GUCs cannot bound a half-open socket:

The `config.py` rationale block records that a server-side `statement_timeout` only fires when
the server is actually executing; if the TCP connection is half-open (the classic silent-drop
case behind a NAT or a flaky link), the client waits forever because the server never gets the
chance to time anything out. A **client-side** `command_timeout` is the only bound that survives
that case. Evidence: `coordinator/config.py` (a remediation note, with
a remediation note/0010 for the related idle-in-transaction hard cap, "the 6.5h wedge
signature").

**Consequence for a rebuild.** Every database client must have both: a server-side statement
bound *and* a client-side command bound, with the client bound strictly larger.

### 13.9 Why there are per-lane connection pools (relates to sections 4 and 5)

**Decision.** After the PostgreSQL cutover, writes and reads are routed by a *label* to one of
four asyncpg pools: `heartbeat`, `interactive`, `bulk`, `cairn`.

**Stated reason -- pool isolation is a safety property, not a performance tuning knob:**

> "Pool-isolation from heartbeat/interactive/bulk is the load-bearing safety property --
> containment for Cairn saturation must not starve coord-core life-services."

> "The unlabeled reader_conn() (check_inbox read-lift, the bb4 life-services hot path) +
> auth/node-identity reads route to the HEARTBEAT reserved lane so a bulk/analytical runaway can
> never starve life-services. Analytical / reporting / monitoring reads route to the capped BULK
> lane. Everything else (board/message/task latency-sensitive reads) defaults to the INTERACTIVE
> main lane."

Evidence: `coordinator/pg_pool.py`.

**The core concept.** There is a privileged class of traffic called **life-services** -- node
heartbeat, inbox check, node registration, node restart intent. If life-services traffic stops,
every node in the fleet stalls, because nodes poll the coordinator to learn what to do. Every
other kind of traffic is, by comparison, expendable. The lane design exists to guarantee that no
volume of ordinary work can starve life-services.

**Asymmetric opt-in, with the reason stated:**

> "CRITICAL SEMANTIC (the architect node Q3): explicit-set membership is STRICTER for writer-side than
> reader-side -- a mis-labeled writer routing to bulk/heartbeat unintentionally could starve
> life-services OR route a life-services write to an under-provisioned lane. So Slice-1 opts IN
> only the 4 CROSS-MODE-CRITICAL labels from the manifest, and everything else stays on the
> bridge."

Unmapped labels fall back to the legacy single shared write connection ("the bridge"). This is
a *fail-to-old-behaviour* default, which is safe in the sense that it cannot mis-route, and
unsafe in the sense that it silently keeps traffic on the contended path -- which is exactly the
failure that recurred twice (see section 15, a remediation note and a remediation note).

**Alternative rejected.** A single pool with a larger `max_size`. Rejected because pool size
does not provide isolation: a burst of 62 Cairn writes will consume any shared pool's
connections and the heartbeat write will queue behind them regardless of how large the pool is.
Reservation, not capacity, is what protects a priority class.

**Tradeoff accepted.** Routing correctness now depends on a hand-maintained label-to-lane
mapping spread across several frozensets, with a documented rule ("interactive family
co-located UNLESS substrate-analysis proves no cross-writer ordering invariant") that must be
applied by a human on every new write path. This is the single largest source of latent bugs in
the subsystem.

**Consequence for a rebuild.** Keep the *concept* -- a reserved lane for life-services that no
other workload can exhaust. Do not keep the *mechanism*. Make the lane a required parameter of
the write primitive so that an unlabelled write is a type error rather than a silent fallback.

### 13.10 Why writes are serialised at all (relates to section 5)

**Decision.** A process-wide `_write_lock` serialises writes; on PostgreSQL there was, for a
period, a single shared write connection.

**Stated reason (inferred, with strong supporting evidence).** This is inherited from SQLite.
`coordinator/rfc603/canary_harness.py` records the property that the migration had to preserve:

> "Why it is the load-bearing cutover proof: under SQLite the implicit single-writer guarantee..."

Under SQLite in WAL mode there is exactly one writer at a time, enforced by the engine. A large
amount of application code was written against that guarantee without ever stating it. Moving to
PostgreSQL removes the guarantee. Rather than audit every write path for concurrency safety, the
cutover *preserved* the single-writer property in the application layer, and has been
incrementally relaxing it since, lane by lane, with per-label evidence and cosign.

**Tradeoff accepted.** A correct-but-slow migration over a fast-but-risky one. The cost was
real: the shared bridge connection became the coordinator's principal availability hazard
(sections 15.4 and 15.5 document two multi-hour outages caused by it).

**Consequence for a rebuild.** If you are writing this fresh against PostgreSQL, do not
reproduce the global write lock. Use ordinary transactions and let the database do isolation.
The lock is scar tissue from a migration, not a design.

### 13.11 Why reads must use `events_all`, and why the events table is split (relates to section 5)

**Decision.** Event rows are routed at write time to one of three physical tables
(`events`, `events_short`, `events_long`); all readers query the `events_all` view.

**Stated reason -- the carve-outs are the interesting part:**

> "RFC629 OG12 residue carve-outs: event types that MUST stay in the single `events` table on
> Python retention, NEVER the partitioned split. Checked FIRST in route_events_write (precedence
> over the `_evaluated` suffix rule) so any future `*_evaluated` type that acquires a special
> constraint carves-out correctly instead of silently landing in a partition.
>   - `migration_partial_observed`: 365-day retention > events_long's 90-day partition retention
>     => placing it in events_long would silently DROP rows at 90d = data loss of migration
>     forensics.
>   - `flag_drift_detected`: has a partial-UNIQUE dedupe index (idx_events_flag_drift_dedupe)
>     that PG cannot recreate on a partitioned table (a partitioned UNIQUE index must include the
>     partition key timestamp_epoch_ms); routing it to a partition would drop the dedupe
>     guarantee (governance-trail regression)."

And the accepted imprecision:

> "Option-D accepted tradeoff: non-`_evaluated` event types with retention < 90d
> (7d/14d/30d/60d) route to events_long (90d) and are thus OVER-retained (kept longer than
> intended), NOT deleted early -- no data loss. Intentional design choice for split simplicity; a
> future `events_medium` (30d, weekly) third tier is parked, NOT part of the MVP."

Evidence: `coordinator/events_router.py`.

**Two transferable principles.**

1. *When in doubt, over-retain.* The routing rule is deliberately biased so that every error mode
   keeps data longer than intended rather than deleting it early. Retention bugs that delete are
   unrecoverable; retention bugs that keep are a disk-space ticket.
2. *Partitioning is not free for constraints.* A partitioned unique index must include the
   partition key. Any table whose correctness depends on a partial unique index cannot be
   naively partitioned. This is a PostgreSQL fact that will bite any rebuilder who re-derives
   the split without re-deriving the carve-outs.

### 13.12 Why SSE bypasses the middleware stack (relates to sections 7 and 8)

**Decision.** `SSEAwareMiddleware` subclasses Starlette's `BaseHTTPMiddleware` but overrides
`__call__` to perform a pure-ASGI pass-through for streaming path prefixes.

**Stated reason.**

> "SSE / streaming responses MUST bypass the body-buffering filters below. `_read_body` (used by
> every `_filter_*` / `_redact_token` branch) consumes `response.body_iterator` to completion
> before returning; for text/event-stream endpoints (e.g. /api/stream, /api/stream/{node_id})
> that iterator NEVER completes (SSE keepalive loop), which caused the /api/stream 4s+
> timeout-with-zero-bytes that broke superdash's EventSource probe and forced the JSON-poll
> fallback."

Evidence: `coordinator/api_auth.py`.

**The matching-rule refinement, itself scar tissue:**

> "a remediation note the architect node request_changes: segment-boundary match + explicit overrides to
> prevent loose-prefix false-positives. `/events/timeline` is an existing JSON endpoint under the
> /events/ prefix; bypassing the full middleware stack for it would silently lose SecurityHeaders
> + Drain + Maintenance enforcement. Future similar carve-outs should be added here, NOT to
> STREAMING_PATH_PREFIXES."

So the match is `path == prefix or path.startswith(prefix + "/")`, never a bare `startswith`,
and an `EXACT_NON_STREAMING_OVERRIDES` set always wins.

**Transferable principle.** *A security bypass keyed on a URL prefix must match on segment
boundaries.* `/api/streamlined` must not inherit `/api/stream`'s exemption. This is a generic
class of bug (prefix-based authorisation) and the mitigation here is the correct one.

**Alternative rejected.** Rewriting all the response filters to be streaming-aware. Not
attempted; the bypass was cheaper and the streaming endpoints do not carry the payload shapes
the filters exist to redact.

### 13.13 Why SSE accepts a token in the query string, but only there (relates to section 7)

**Stated reason.**

> "SSE compat: on GET /api/stream* requests only, also honour `?token=` query param -- browser
> EventSource cannot send custom headers. Path-scoped to the SSE endpoints (per the operations node
> review) so the URL-token blast radius is minimal -- never accepted on write paths or arbitrary
> GETs where proxy / access logs would record the secret."

Evidence: `coordinator/api_auth.py`.

**Transferable principle.** A browser limitation (`EventSource` has no header API) forced a
credential into a URL. The mitigation was not to refuse, and not to accept it everywhere, but to
scope the exemption to the narrowest possible path set and to write down why. A rebuild targeting
modern browsers should prefer `fetch` + `ReadableStream` (or WebSocket) and avoid the exemption
entirely.

### 13.14 Why `/mcp` and the onboarding paths bypass the auth middleware (relates to section 7)

**Decision.** `PUBLIC_PATHS` exempts a small, enumerated set from the REST auth middleware.

**Stated reason, per entry:**

> "/mcp and /events have their own handler-level auth -- they must NOT be double-gated by the
> middleware or AUTH_TOKEN changes break MCP transport."

> "a remediation note (RFC599): PRE-session-token onboarding. Auth is handler-level
> (bootstrap-token, a SEPARATE credential from the shared-scripts repository auth_token this middleware
> checks) -- must NOT be double-gated here, exactly like /mcp above."

> "a remediation note: breathbus rider-liveness sidecar. rider_alive/rider_died run on the
> SEPARATE daemon_post_token (PID-bound, minted via mint_daemon_post_token which DOES use the
> normal session_token middleware -- only these two need the exemption, same posture as
> /api/onboard/manifest above)."

Evidence: `coordinator/api_auth.py`.

**The pattern being expressed.** Every "public" path is public *at the middleware layer only*
and has a different credential checked at the handler layer. There are four distinct credential
types in play by design:

| Credential | Checked where | Why it is separate |
|---|---|---|
| `AUTH_TOKEN` (the shared-scripts repository) | REST auth middleware | Coarse gate on `/api/*`. |
| Per-node session token (`X-Node-Token`) | Handler / MCP dispatch | Identifies *which* node. |
| Bootstrap token | `/api/onboard/manifest` handler | Must work *before* a session token exists; separately rotatable so onboarding credentials and steady-state credentials have independent blast radius. |
| `daemon_post_token` (PID-bound) | breathbus rider endpoints | Issued to a specific daemon process; a leaked one is useless once that PID exits. |
| `LIFECYCLE_TOKEN` | lifecycle endpoints | Must differ from `AUTH_TOKEN`; presenting `AUTH_TOKEN` is explicitly denied, so a leaked read credential cannot restart the fleet. |

**Transferable principle.** *Credential separation by blast radius and by lifetime.* Do not
collapse these into one token in a rebuild, even though it would simplify the middleware. Each
separation exists because the two things being separated fail differently.

### 13.15 Why bootstrap tokens are stored as hashes and mints are timing-padded (relates to section 7)

**Stated reason.**

> "sha256 hex digest. Plaintext bootstrap-tokens are NEVER persisted -- only this hash."

> "Mint a new bootstrap-token bound to (node_id, fingerprint). Returns the RAW token ONCE (only
> its hash is persisted)."

Evidence: `coordinator/database.py+`_hash_bootstrap_token`, `create_bootstrap_token`,
`rotate_bootstrap_token`).

The token is bound to a `(node_id, fingerprint)` pair, so a stolen token is not portable to a
different machine. Onboarding 401/403 responses carry a timing pad so that an attacker cannot
distinguish "unknown node" from "wrong token" by response latency.

**Transferable principle.** Bootstrap credentials are the highest-value target in a fleet
system, because they are the credentials that exist before any other identity is established.
Treat them like passwords: hash at rest, show once, bind to an identity, rate-limit, and make
failures indistinguishable.

### 13.16 Why MCP notifications return HTTP 202 with an empty body (relates to section 6)

**Stated reason.**

> "Notifications (no id) -- acknowledge per MCP Streamable HTTP spec (202, no body). Returning
> JSON with id:null breaks the MCP bridge <bridge-version>+ proxy (ResponseBody enum parse failure in
> server_transport/http.rs)."

And a second instance of the same client fragility:

> "the remediation change follow-up: guard against a non-dict `arguments` (e.g. a caller sending a JSON
> array). Without this, the tool_args.keys() snapshot below -- and the .pop('_session_token') a
> few lines down -- raise AttributeError, which escapes as an HTTP-500 with a null body (breaks
> the MCP bridge <bridge-version>+ proxy parse). Return a proper JSON-RPC -32602 invalid_params instead so the
> caller gets an actionable error."

Evidence: `coordinator/server.py`, `:2886-2893`.

**Transferable principle.** The MCP client in use parses response bodies into a strict enum and
cannot tolerate a null body or a null `id`. Two rules follow, and both are load-bearing for any
rebuild that must serve the same clients:
1. A JSON-RPC notification (no `id`) gets `202` with **zero bytes**, never a JSON envelope.
2. **No code path may return an untyped HTTP 500 with an empty body.** Every error must be
   marshalled into a well-formed JSON-RPC error object. Input validation exists specifically to
   prevent Python exceptions from escaping as bare 500s.

### 13.17 Why `_session_token` is injected into every tool schema (relates to sections 6 and 7)

**Decision.** Every MCP tool's `inputSchema` carries an optional `_session_token` property, and
`server.mcp_endpoint` pops it out of `arguments` before dispatch.

**Reason (verified behaviour, partly inferred intent).** MCP proxies between the agent and the
coordinator do not forward arbitrary HTTP headers, so `X-Node-Token` cannot be relied upon to
survive the hop. The token therefore has to travel *inside* the JSON-RPC payload. Because the
tool surface is generated, the property is injected schema-wide rather than declared per tool.

Evidence: `coordinator/mcp_handler.py`TOOLS` construction); `coordinator/server.py`
(`tool_args.pop("_session_token")`, and the `-32602` guard that exists because that `.pop` would
otherwise crash on a non-dict).

**Tradeoff accepted.** A credential in the request body, visible to any intermediary that logs
payloads, and a synthetic property leaking into every tool's public schema. The alternative -- a
transport that preserves headers -- was not available.

### 13.18 Why the outbox never drops an unknown surface (relates to section 8)

**Decision.** `coord_outbox` rows whose `surface` has no registered dispatcher remain `pending`
indefinitely. They are never dropped, never dead-lettered, never marked failed.

**Reason (inferred from behaviour; no single comment states it).** The outbox is the durable
half of every side-effecting notification. A row with an unknown surface almost always means a
deploy skew: the writer knows about a surface the reader has not learned yet. Dropping the row
would lose the side effect permanently; leaving it pending means it is delivered as soon as the
dispatcher registry catches up. The cost is unbounded growth of a poison queue, which is a
monitoring problem rather than a correctness problem.

**Transferable principle.** *In a system where writer and reader deploy independently, unknown
values must be retained, not rejected.* This is the same tolerant-reader discipline that appears
in the `role_boot_sop` comment: "legacy clients ignore unknown keys; null-return is
self-documenting absence, never an error."

### 13.19 Why breathbus exists as a separate Go daemon (relates to section 9)

**Decision.** Liveness is produced by a small Go binary per node, not by the Python agent itself.

**Reason (inferred, strongly supported by the deployment shape).** The thing being measured is
"is this node's agent still breathing". An agent that is wedged cannot report that it is wedged.
A separate process, written in a language with no GIL and no dependency on the agent's runtime,
can. Go was chosen for a single static binary with one dependency (`golang.org/x/sys`), which
deploys by copying a file.

The contract is deliberately thin: the rider daemon POSTs `rider_alive` / `rider_died` to two
coordinator endpoints using a **PID-bound** `daemon_post_token`, and the coordinator *derives*
`rider_alive` at read time rather than storing it. Evidence: `coordinator/api_auth.py`,
`coordinator/database.py`rider_liveness`), `coordinator/api.py`.

**Transferable principle.** *Liveness must be observed from outside the thing whose liveness is
in question,* and derived state must not be stored. Storing `rider_alive` would create a value
that can be stale and wrong; deriving it from the last heartbeat timestamp at read time cannot
be.

### 13.20 Why the backup publishes `status.json` last (relates to sections 5 and 10)

**Decision.** `scripts/backup-snapshot.ps1` writes the snapshot artefacts first and writes
`status.json` **last**, as the commit marker. Retention never trims until a verified-good newer
copy exists.

**Reason (inferred from the code order and the retention guard).** This is a poor-man's atomic
commit on a filesystem that has no transactional rename across all the artefacts. A restore
tool that keys on `status.json` can never see a half-written snapshot, because the marker does
not exist until every other byte is on disk. The retention rule is the mirror-image guarantee:
never destroy the last known-good copy in order to make room for one that has not been verified.

**Transferable principle.** *Write the manifest last; delete the old only after the new is
verified.* Both halves are required; either alone leaves a window with zero valid backups.

### 13.21 Why Cairn's WAL maintenance runs on a daemon thread and cannot restart the process

Covered by pitfall 6 in section 15.2. The design intent worth stating
here is the principle it encodes: **a maintenance subsystem must never be able to escalate its
own failure into an outage of the thing it maintains.** The original design let a WAL checkpoint
failure count toward a restart trigger; three failures restarted the coordinator; a reader-pinned
WAL guaranteed the failures would continue; the result was a fleet-wide wedge. The rewritten
design degrades (alert plus exponential backoff to a 15-minute cap) and never restarts.

### 13.22 Unresolved questions for this section

- No architecture decision record (ADR) directory exists in `the coordinator repository`. Rationale is
  recovered from inline comments, docstrings, runbook prose, and SWAT/RFC identifiers only. The
  RFC bodies themselves live in the Cairn database, not in the repository, so for most RFC
  numbers cited in code comments the full text was **not** available at documentation time.
- Where an entry above is marked **(inferred)**, no source comment states the reason. Those are
  the author's reconstruction from behaviour and should be re-derived rather than trusted.

---

## 14. Load-bearing constraints and invariants

**Design intent, anchored to the evidence above.**

This is the most important section in the document. It separates the properties that **must
remain true in any reimplementation** from the choices that are merely how it happened to be
built on Windows in 2026.

A property is listed as load-bearing if violating it produces one of: silent data loss, silent
security bypass, a wedge that liveness checks cannot detect, or a fleet-wide stall. Properties
that merely cost performance or convenience are listed as negotiable.

### 14.1 Load-bearing invariants

#### Group A -- process identity and single-instance

| # | Invariant | Why it is load-bearing | What breaks if violated | Evidence |
|---|---|---|---|---|
| A1 | Exactly one coordinator process serves a given port and database at a time. | The event broker, rate-limit counters, maintenance-freeze state and write serialisation are all in-process. Two instances means two divergent views of the same fleet. | Duplicate outbox dispatch, split SSE subscriber sets, two writers believing they hold the write lock. | `coordinator/database.py` `acquire_instance_singleton` |
| A2 | The single-instance check runs **before** the listening socket is bound. | If it runs after, the loser fails with `EADDRINUSE` and the operator sees an opaque crash-loop instead of a diagnosis. | Crash-loop with no actionable error; combined with an auto-restarting supervisor this is the a remediation note host-crash shape. | `coordinator/database.py` |
| A3 | A lease alone is not proof of liveness; a holder claim must be validated against actual process liveness on the same host. | A hard-killed predecessor never releases its lease. A TTL longer than the restart health-window makes every restart fail closed. | Every restart fails for up to the TTL; operators learn to bypass the gate, which removes the protection entirely. | `coordinator/database.py`, `:5692-5700` |
| A4 | The single-instance table must be self-provisioning and must not depend on any migration having run. | It executes before schema init on a first boot. | First boot on a fresh database fails with "relation does not exist" -- i.e. the gate breaks exactly the scenario it must survive. | `coordinator/database.py` |
| A5 | If the in-process SSE broker is retained, the server must run exactly one worker, and the constraint must be enforced at launch, not documented. | An event emitted on worker A never reaches a client on worker B. The failure is **silent**: streams simply go quiet. | Dashboards and live streams silently degrade; no error anywhere. | `scripts/serve_dualstack.py` `validate_workers`, exit 79 |
| A6 | The supervisor must be able to identify the coordinator process unambiguously. | Restart, deadman rollback, and port-free verification all depend on it. | Orphaned process holding the port; rollback cannot kill it; `INV_PORT_FREE` aborts and the safety net is gone. | `scripts/serve_dualstack.py` module docstring |

#### Group B -- the timeout ladder

This is one invariant expressed at four layers. **Each outer bound must be strictly greater than
the inner bound it wraps.**

| # | Invariant | Why it is load-bearing | What breaks if violated | Evidence |
|---|---|---|---|---|
| B1 | Client-side command timeout > server-side statement timeout. (Deployed: 45s > 30s.) | The server-side bound produces a meaningful, attributable error. The client-side bound is a blunt cancellation. | Every slow query surfaces as an opaque client cancellation with no query attribution; root-causing becomes impossible. | `coordinator/config.py` |
| B2 | A client-side command timeout must exist at all, independently of server-side GUCs. | A server-side `statement_timeout` cannot fire on a half-open TCP socket, because the server is not executing anything. | The classic infinite hang: a dropped connection the client never notices. | `coordinator/config.py` |
| B3 | The health endpoint's outer probe bound must be **derived from** the inner probe's configured bound, not hard-coded. | Any hard-coded outer bound will eventually drift below the inner bound as the inner one is tuned. | The inner probe's designed graceful-degrade path is converted into a hard timeout, producing false 503s and unnecessary automated restarts. Observed three times in one night. | `coordinator/api.py` |
| B4 | The external watchdog's request timeout must exceed the server's own health-probe bound. | Otherwise the watchdog declares the server dead while the server is still legitimately answering. | The watchdog restarts a healthy coordinator. | `scripts/coord-health-watchdog.ps1`, `Test-WatchdogTimeoutExceedsServerHealthProbeBound` |
| B5 | Every awaited database call must be bounded by something. | A wedged connection makes an awaited coroutine hang rather than raise; `try/except` never fires. | The a historical point incident: `/health` hung for many hours; process alive, port bound, every liveness check blind. | `coordinator/api.py` |

#### Group C -- liveness must be externally observable

| # | Invariant | Why it is load-bearing | What breaks if violated | Evidence |
|---|---|---|---|---|
| C1 | "Process alive" and "port bound" are **not** liveness. Liveness is a successful end-to-end request that touches the database. | The defining failure of this system is the wedge: everything looks up, nothing works. | A long-duration and later a ~long-duration outage, both invisible to process-level supervision. | `coordinator/api.py`; section 15.4, 15.5 |
| C2 | The liveness observer must run **out of band** -- a separate process, ideally on a separate schedule from the service it watches. | An in-process detector shares the wedged event loop and cannot report. | On-coordinator detectors reported false-healthy for many hours during the a historical point incident. | `scripts/coord-health-watchdog.ps1` |
| C3 | A node's liveness must be reported by a process other than the node's agent. | A wedged agent cannot report that it is wedged. | Silent node death indistinguishable from a quiet node. | breathbus rider design, section 9 |
| C4 | Derived liveness state (`rider_alive`) must be computed at read time, never stored. | A stored boolean can be stale; a derived one cannot. | A node shows alive after it died, or vice versa, with no way to tell which value is correct. | `coordinator/database.py` region |

#### Group D -- authentication and authorisation

| # | Invariant | Why it is load-bearing | What breaks if violated | Evidence |
|---|---|---|---|---|
| D1 | If `AUTH_TOKEN` is unset, `/api/*` must **fail closed** (503), never open. | An unset-config default of "allow" is the single most common catastrophic misconfiguration. | An entire API surface silently unauthenticated after a config mistake. | `coordinator/config.py`, REST auth middleware |
| D2 | The lifecycle token must be a **different** secret from the API token, and presenting the API token to a lifecycle endpoint must be explicitly denied. | Read access and "restart the fleet" access have wildly different blast radii. | A leaked read credential becomes a fleet-wide denial-of-service tool. | `coordinator/config.py` |
| D3 | Bootstrap credentials are a separate, separately-rotatable credential class from steady-state credentials. | They are usable before any identity exists, so they are the highest-value target. Coupling their rotation to the fleet token means you cannot rotate one without the other. | Onboarding compromise cannot be remediated without an outage. | `coordinator/api_auth.py` (a remediation note / RFC599) |
| D4 | Bootstrap tokens are persisted as SHA-256 hashes only; plaintext is returned once and never stored. | Database read access must not yield usable credentials. | A single database leak becomes fleet takeover. | `coordinator/database.py` |
| D5 | Bootstrap tokens are bound to `(node_id, fingerprint)`. | Makes a stolen token non-portable. | A copied token onboards an attacker's machine as a legitimate node. | `create_bootstrap_token` |
| D6 | Onboarding auth failures are timing-padded so "unknown node" and "wrong token" are indistinguishable. | Otherwise the endpoint is a node-enumeration oracle. | An attacker maps the fleet before attacking it. | onboard handler, section 7 |
| D7 | Any URL-prefix-based security exemption must match on **segment boundaries** (`p` or `p + "/"`), never bare `startswith`. | `/api/streamlined` must not inherit `/api/stream`'s exemption. | Silent loss of SecurityHeaders, drain and maintenance enforcement on an unintended path. | `coordinator/api_auth.py` (a remediation note) |
| D8 | Every path exempted from the auth middleware must have handler-level auth with a *different* credential, and that pairing must be recorded at the exemption site. | "Public" here means "gated elsewhere", not "open". Without the note, a later reader deletes the handler check as redundant. | An enumerated public path becomes genuinely public. | `coordinator/api_auth.py` |
| D9 | Read-path lock-bypass allowlists must be **default-deny and verb-proven**, never name-pattern heuristics. | "It's called `get_*` so it must be a read" is false in this codebase: `get_task_board` writes, `check_inbox` writes. | A "read" bypasses the write lock and corrupts concurrent write state. | `coordinator/server.py` `_READ_LOCK_BYPASS_TOOLS` (a remediation note) |

#### Group E -- data integrity and retention

| # | Invariant | Why it is load-bearing | What breaks if violated | Evidence |
|---|---|---|---|---|
| E1 | Every table referenced by a schema registry must also have its DDL in the schema-creation path. A registry entry without DDL is a boot failure waiting to happen. | The two mechanisms are independent and drift silently. | First boot on a fresh database fails, or a migration stamps a version for a table that does not exist. | section 5; `coordinator/_og5_p2_registry.py` |
| E2 | Restore order is: coordinator database first, then the Cairn database. | Cairn rows reference coordinator identities; SWAT records in particular live in the coordinator database, not in Cairn. | Dangling references and a governance trail that cannot be reconstructed. | `coordinator/cairn.py`, ` (a remediation note) |
| E3 | Readers must query the `events_all` view, never the `events` base table directly. | After the partition split, the base table holds only carve-out residue. | Silently incomplete query results, with no error. | `coordinator/pg_boot_wireup.apply_events_all_view` |
| E4 | Event types with retention longer than the longest partition's retention must be carved out of the partitioned path. | Partition drop is unconditional; a 365-day-retention row in a 90-day partition is deleted at 90 days. | Permanent, silent loss of migration forensics. | `coordinator/events_router.py` |
| E5 | Event types carrying a partial-unique index cannot be partitioned. | PostgreSQL requires a partitioned unique index to include the partition key. | Silent loss of a dedupe guarantee -- a governance-trail regression. | `coordinator/events_router.py` |
| E6 | Routing ambiguity must resolve toward **over-retention**, never early deletion. | Over-retention is a disk ticket; early deletion is unrecoverable. | Data loss. | `coordinator/events_router.py` |
| E7 | Outbox rows with an unrecognised `surface` remain pending forever; they are never dropped. | Writer and reader deploy independently; an unknown surface is almost always deploy skew, not corruption. | Permanent loss of a side effect that was durably recorded precisely so it would not be lost. | section 8 |
| E8 | Append-only audit tables must be enforced by the database, not by convention. | Application-level "please don't update this" is not a control. | A silently rewritten audit trail is worse than no audit trail. | `agency_sha_attestations` `RAISE(ABORT)` triggers |
| E9 | The backup manifest (`status.json`) is written **last**, and retention never trims before a verified-good newer copy exists. | Gives an atomic-commit marker on a non-transactional filesystem, and guarantees a non-empty set of valid backups at all times. | A restore reads a half-written snapshot, or a trim leaves zero valid backups. | `scripts/backup-snapshot.ps1`; `scripts/BACKUP-RESTORE-README.md` |
| E10 | Stale `-wal` and `-shm` sidecar files must be deleted before restoring a SQLite database file. | SQLite will replay a WAL belonging to a different database generation. | Silent corruption on restore. | `scripts/BACKUP-RESTORE-README.md` |
| E11 | The hot database must live on local disk, never on a UNC/SMB path. | Remote SMB handles pin SQLite WAL frames and wedge the entire write path. | Fleet-wide write wedge. | `coordinator/db_path_guard.py` (a remediation note) |

#### Group F -- priority isolation

| # | Invariant | Why it is load-bearing | What breaks if violated | Evidence |
|---|---|---|---|---|
| F1 | There must be a reserved execution lane for life-services traffic (heartbeat, inbox check, registration, restart intent) that no other workload can exhaust. | Nodes poll the coordinator to learn what to do. If life-services stall, the entire fleet stalls, and the stall looks like idleness rather than failure. | Total fleet stall from a purely local saturation event, with a healthy database. | `coordinator/pg_pool.py` |
| F2 | Isolation must come from **reservation**, not from pool size. | A large shared pool is still fully consumable by one workload. | A burst of bulk writes queues the heartbeat write behind it regardless of pool size. | `coordinator/pg_pool.py` |
| F3 | Every life-services call shape must map to the reserved lane, including bare/unwrapped and legacy calling shapes. | Two separate multi-hour outages were caused by exactly one calling shape being unmapped. | A single non-compliant caller wedges life-services for every other node. | `coordinator/pg_pool.py` (a remediation note, a remediation note) |
| F4 | A maintenance subsystem must never be able to escalate its own failure into a restart of the service it maintains. | Maintenance failures are often persistent (e.g. a reader-pinned WAL), so escalation becomes a loop. | a historical point fleet-wide wedge. | `coordinator/cairn.py` (a remediation note) |
| F5 | A blocking maintenance operation must run on a thread that the interpreter will not join at exit. | A non-daemon worker thread blocks process exit while mid-operation. | Graceful shutdown hangs forever; the only recovery is force-kill, which then skips lease release (see A3). | `coordinator/cairn.py` |

#### Group G -- protocol conformance

| # | Invariant | Why it is load-bearing | What breaks if violated | Evidence |
|---|---|---|---|---|
| G1 | A JSON-RPC notification (no `id`) must be answered with HTTP 202 and a **zero-byte** body. | The client proxy parses bodies into a strict enum; `id: null` is a parse failure. | The MCP transport breaks for every node at once. | `coordinator/server.py`, `:2886-2893` |
| G2 | No code path may emit an untyped HTTP 500 with an empty body. All errors must be well-formed JSON-RPC error objects. | Same parser fragility as G1, reached via unhandled exceptions. | Same: total transport failure, triggered by a single malformed request. | `coordinator/server.py` |
| G3 | The session token must be transportable **inside** the JSON-RPC payload, not only in an HTTP header. | Intermediary MCP proxies do not forward custom headers. | Every node authenticates as anonymous. | `_session_token` injection, section 7 |
| G4 | Streaming endpoints must not pass through any middleware that reads the response body to completion. | An SSE body iterator never completes. | The stream hangs with zero bytes delivered; clients fall back to polling or simply appear dead. | `coordinator/api_auth.py` |

#### Group H -- configuration discipline

| # | Invariant | Why it is load-bearing | What breaks if violated | Evidence |
|---|---|---|---|---|
| H1 | A guard must be enforced at the real entry point, not only at a convenience wrapper. | Wrappers get bypassed -- by recovery procedures, by operators, by other scripts. | The a historical point incident: production served from a feature branch 8 commits behind master because only the wrapper checked. | `scripts/serve_dualstack.py` `validate_branch` |
| H2 | Feature-flag environment variables must be **inherited** by the served process. | A launcher that re-parents the process (e.g. via WMI) loses them, and flag-gated writes then fail silently. | Silent write failures with no error anywhere. | `scripts/_launch-prod.ps1` "WHY NOT a full re-parent orphan" |
| H3 | Host identity resolution must fail loudly, not fall back to a guess. | A silently wrong FQDN routes traffic to the wrong host. | Misrouted fleet traffic that looks like packet loss. | `get_host_fqdn` (raises `KeyError` on registry drift) |
| H4 | Flag conjunctions that gate a destructive or hard-to-reverse change must each be independently revertible. | A single combined flag cannot be partially rolled back. | An operator must choose between reverting too much and reverting nothing. | `COORD_PG_WRITER_POOL_ENABLED` + `COORD_MCP_DISPATCH_LANE_ROUTING_ENABLED`, `coordinator/pg_pool.py` |

### 14.2 Explicitly negotiable -- incidental implementation choices

Everything below is *how it happened to be built*, not *what must be true*. A reimplementation
should feel free to change any of it, and in several cases should.

| Area | Incidental choice on the retiring system | Free to change to |
|---|---|---|
| Operating system | Windows Server, PowerShell 7 | Linux; most of the supervision complexity disappears |
| Supervision | NSSM held Stopped/Disabled + a 150 KB PowerShell restart script + an out-of-band watchdog scheduled task | `systemd` with `Restart=on-failure`, `RestartSec`, `StartLimitBurst`; or a container orchestrator. Keep only the backoff and start-limit *semantics* |
| Process identification | argv regex matching on `coordinator.server:app` and `--port <PORT>` | A PID file, a unit name, a container ID -- anything with structure |
| Dual-stack socket workaround | `scripts/serve_dualstack.py` pre-creating an `AF_INET6` socket with `IPV6_V6ONLY=0` | On Linux, `--host ::` alone; delete the file |
| Hostnames and ports | the coordinator host; <COORD_PORT> prod / <COORD_DEV_PORT> dev / <COORD_TEST_PORT> test | Anything. Ports are referenced by config, not baked into logic |
| Pool sizes and lane counts | Four named lanes, specific `min_size`/`max_size` per lane | Any number of lanes >= 2. The *reservation* is load-bearing; the *count* is not |
| Log rotation and retention counts | Timestamped files under `logs/`, retention by count | Any log pipeline |
| Directory layout | `<repo>` and siblings | Anything |
| Language for the liveness daemon | Go | Anything that produces a small static binary independent of the agent runtime |
| Web framework | FastAPI + uvicorn + Starlette middleware | Any ASGI stack, or a different language entirely, provided the wire contracts in sections 6-8 hold |
| Migration mechanism | Three overlapping mechanisms (`_init_tables` probes, the OG5 registry, inert Alembic stamps) | **One** mechanism. See section 17.1 |
| SQL dialect translation | SQLite-shaped SQL rewritten at execute time by `db_backend.translate_dialect` | Native SQL for the chosen engine. See section 17.4 |
| Global write serialisation | Process-wide `_write_lock` plus a shared write connection | Ordinary transactions. This is migration scar tissue, not design (13.10) |
| Timestamp storage | ISO-8601 strings in `TEXT` columns, with parallel `*_epoch_ms` `BIGINT` columns | `timestamptz`. The parallel-column pattern exists only because the migration deferred the conversion |
| Full-text search | SQLite FTS5 on the legacy engine; skipped entirely on PostgreSQL | `tsvector` + GIN, or an external index. FTS data is derived and rebuildable |
| Tool surface size | 219 MCP tools in one namespace | Fewer, grouped, versioned. See section 17.6 |
| Config surface | 153 environment variables, unvalidated | A typed, validated settings object with a startup schema check |
| Event partition tiers | Two tiers (`events_short` 3d daily, `events_long` 90d weekly) plus base residue | Any tiering, provided E4/E5/E6 hold |
| Rate-limit values | 30 POSTs per IP per 60s window | Any values |
| Ring buffer size | 4096 events per channel | Any size that satisfies the stated >=60s retention floor at peak event rate |

### 14.3 The retention floor -- an example of a well-specified negotiable value

The SSE replay ring buffer is a good model for how to write down a tunable so that a rebuilder
can re-derive it rather than copy it:

> "RFC497x1 6.1 / a remediation note: bumped from 512 -> 4096 for I2 headroom. At ~10 events/sec
> burst, 4096 events ~= 6.8min retention floor (vs 512's ~51s, which BREACHED the analyst node's I2 >=60s
> seal). Cheap memory cost: 4096 * ~200B * ~15 channels ~= <measured-value> max."

Evidence: `coordinator/notifications.py`.

The **requirement** is "a reconnecting client must be able to replay at least 60 seconds of
missed events". The **value** 4096 is a derivation from that requirement plus a measured peak
event rate. The codebase then instruments the requirement directly -- `_ring_eviction_under_60s_total`
counts evictions of events younger than the floor, and the acceptance criterion is that this
counter reads zero in production.

A rebuilder should copy the *requirement and the counter*, and re-derive the *value*.

### 14.4 Unresolved for this section

- The exact per-lane `min_size`/`max_size` values in production could not be confirmed against a
  running process (no coordinator runs on the machine used for this documentation pass). The
  values in section 4 are the source defaults; production may have overridden them via
  environment.
- Whether `_ring_eviction_under_60s_total` in fact read zero in production over the validation
  window is not recorded anywhere in the repository.

---

## 15. Pitfalls and caveats

These are the lessons that should inform how the next version is built. They are written as design
guidance, not as an incident record: the value is in the rule, not in the occasion that produced it.

**Caveat before removing any guard.** In the original system roughly every third source file carried
a reference to a specific defect it was written to prevent. A working guard produces no symptom, so
guards in a mature system rarely look necessary from the outside. A reimplementation that drops one
because its purpose is not obvious will rediscover the reason. Treat each rule below as the
requirement, and re-derive the mechanism that satisfies it.

### 15.1 The defining failure class: the invisible wedge

Nearly every major incident in this system's history is the same shape.

> The process is alive. The port is bound. TCP connects succeed. And nothing works.

The coordinator is a single asyncio event loop in front of a database. When a database
connection wedges, an awaited coroutine **hangs rather than raises**. Nothing throws, so no
`try/except` fires, no error is logged, and no exception-based alerting triggers. Meanwhile
every process-level health signal -- PID exists, port listening, service state Running -- reports
healthy.

Every countermeasure in this system descends from that observation:

| Countermeasure | Addresses |
|---|---|
| Bound every awaited DB call (B5) | The hang itself |
| Derive nested timeout bounds (B1-B4) | The over-correction that turns graceful degrade into false failure |
| Health check must exercise a real read **and** a real write | "Port bound" is not liveness |
| Out-of-band watchdog on a separate schedule (C2) | An in-process detector shares the wedged loop |
| Reserved life-services lane (F1-F3) | Contention-induced wedges that are not connection failures |
| Instance-singleton lease (A1-A4) | Two coordinators each believing they are the only one |
| Idle-in-transaction hard cap | The long-duration wedge signature |


### 15.2 Transferable pitfalls

**1. Hangs are not exceptions.** In an async service, an awaited call that never returns raises
nothing. No `try/except` fires, nothing is logged, and exception-based alerting stays silent. A
timeout on every external call is not defensive programming; it is the only mechanism by which a
hang can ever be reported.

**2. Nested timeouts are a coupled system.** If an outer bound is tighter than the inner bound it
wraps, the outer one always fires first and converts a designed graceful degradation into a hard
failure. Derive each outer bound from its inner bound in code, and add a test asserting the
ordering. Documentation alone does not prevent this; the arithmetic derivation does.

**3. A silent fallback hides an incomplete migration.** If unmapped cases fall through to the old
path, the gap is invisible until it causes an outage. Make the new path a required parameter so an
unmapped case fails at startup rather than in production.

**4. Fixing the observed instance is not fixing the bug.** Patching exactly the cases seen in one
failure leaves every sibling case live. When a mechanism fails, enumerate the whole class it
belongs to and fix the class.

**5. Documented client discipline is not an isolation mechanism.** Callers will violate the
documented pattern, and legacy or third-party clients never read it at all. A non-compliant caller
must not be able to degrade service for every other caller. Isolate by construction.

**6. Maintenance degrades; it never restarts the thing it maintains.** Three rules follow: a
maintenance fault must not be escalated into an availability outage; a blocking maintenance
operation must not run on a thread the runtime will not abandon at exit; and any threshold that
triggers maintenance must be provably above the level maintenance can actually achieve, or it will
oscillate forever.

**7. A restart policy needs backoff, a start limit, and a terminal failed state.** A short fixed
retry delay with no limit is a denial-of-service weapon aimed at your own host. If the supervisor
cannot express those three properties, do not use its automatic restart at all; mediate restarts
through a scripted procedure instead.

**8. Place guards at the last point before the irreversible action.** Not at the first convenient
point. Every wrapper is eventually bypassed by a recovery procedure written under pressure.

**9. A static check on a path string cannot see through an alias.** If the property you need is
"this file is on local storage", verify it at runtime against the resolved device, not against the
string the caller supplied.

**10. If two datastores share a configuration switch, they share a blast radius.** Give every
datastore its own backend selector, even when you intend to migrate them together.

**11. Retiring a data path by renaming it is not sufficient.** It needs a machine-readable
tombstone, or the next audit will find it and believe it is live.

**12. A permanently-red signal trains people to ignore the channel.** An alert condition that can
never clear, or a test that has been failing so long it is assumed broken, is worse than no signal
at all: it buries the real ones. Any always-on condition is a defect in the detector, not noise to
be tolerated.

**13. An exit-0 backup job is not evidence of a recoverable backup.** A backup is only proven by
restoring it. In the original system the hourly job exited zero and logged success for seventy-two
consecutive days while producing nothing of value, and the offsite copy faithfully replicated the
worthless result. Schedule a restore drill, assert on the restored content rather than on the exit
code, and alert on the *age of the newest row recovered*, not on the age of the backup file.

**14. A backup pointed at a retired datastore reports success forever.** After a storage-engine
migration the old file still exists, is still readable, and still copies cleanly -- it simply stops
changing. Any job that names a data source must resolve that source through the same configuration
the application uses, so that moving the application moves its backup. A backup path that is
independently configured will silently outlive the thing it was meant to protect.

**15. Verify a restore procedure end to end before you need it.** A procedure that has only been
reasoned about is a hypothesis. Restoring into a fresh database commonly requires privileges the
application role does not hold, and extension-owned objects can fail even on a healthy archive, so
a non-zero exit status does not by itself mean the data is unrecoverable. Record which errors are
expected and benign, or an operator under pressure will read a successful restore as a failure.

**16. Never let the only origin for a repository be a host you intend to decommission.** Establish
a durable, location-independent origin on day one. In the original system every remote on the
primary repository resolved to a network path on a machine inside the deployment, so the code's
survival was coupled to the infrastructure's survival. Source history, deployment artifacts, and
the running host should each be able to fail without taking the others with them.

**17. A liveness check must ask whether a live service disagrees with the record, not whether the
recorded process is alive.** The coordinator's runtime sidecar (`coord-runtime.json`, holding the
PID and identity) was written only by the canonical restart lever. Every other launch path left a
permanently dead recorded PID. The watchdog check "is the recorded PID alive?" therefore latched
true and raised CRITICAL on every rate-limit window while the coordinator served normally, which is
pitfall 12 in practice. The correct discriminator is: the recorded PID is dead **and** no healthy,
port-bound coordinator exists. Resolve the serving process from the port binding. If a healthy
service is found, reconcile the record in place rather than alarm. Any doubt about whether the
service is healthy must still fall through to alerting. More generally, runtime state written by
only one of several launch paths is stale on all the others. Either every launch path writes it, or
readers must not trust it alone.

**18. If the service runs from its git working tree, branching in that tree silently disables
recovery.** The coordinator loads code from its checkout, so the restart lever correctly refuses to
restart on a non-`master` HEAD (exit 77/78). That same gate means a feature branch left checked out
in the production tree blocks the watchdog's automatic restart at exactly the moment it is needed.
At minimum, develop only in separate `git worktree` directories. The better fix is to decouple the
deployment artifact from the repository: build or copy a versioned artifact and run that, so
branch state and dirty-tree guards stop mattering.

**19. Engine-specific statements left in maintenance code fail silently after a migration.**
After the cutover, the daily maintenance job sent un-ported SQLite `PRAGMA` statements to
PostgreSQL. Event pruning and the integrity check then failed every day, and because maintenance
logs and continues (fail-open, pitfall 6), nothing surfaced. A storage-engine migration must
include every maintenance, backup and diagnostic path, not only the request path, and a repeated
maintenance failure must raise its own alert.

**20. Per-launch log sets without size caps grow without bound.** Logs rotated only per process
launch, so a long-lived instance grew one error log indefinitely, and old sets were never pruned.
Rotate by size or time as well as by launch, and prune by age.

**21. Diagnosing an async hang needs tools that do not need the process's cooperation.** When
the event loop is starved, every in-process diagnostic endpoint times out. An external stack
sampler (`py-spy dump --pid <pid>`) still works, because it reads process memory directly. It shows
threads, not pending asyncio tasks, though. The signature of coroutines parked on an exhausted
connection lane is all threads idle, HTTP 503, and requests logged as arriving but never answered.
When you see that, check pool saturation (`pg_activity`, `/api/wedge-diagnostics`), not stack
traces. Provision the sampler in the production environment in advance; it is in the verified
`pip freeze`.
### 15.3 Smaller guards, and the failure each prevents

| Guard | Failure it prevents | Evidence |
|---|---|---|
| `SSEAwareMiddleware` pure-ASGI pass-through | Starlette's `BaseHTTPMiddleware` reads the response body to completion; an SSE iterator never completes, so the stream hangs with zero bytes. Broke the dashboard's `EventSource` probe and forced a JSON-poll fallback. | `coordinator/api_auth.py` |
| Segment-boundary prefix matching + `EXACT_NON_STREAMING_OVERRIDES` | `/events/timeline` (a JSON endpoint) silently bypassing SecurityHeaders, drain and maintenance enforcement. | `coordinator/api_auth.py` (a remediation note) |
| Lowercasing the `Origin` header before CORS evaluation | Starlette's `CORSMiddleware` compares exact strings; hostnames are case-insensitive per RFC 4343. Must be added *before* `CORSMiddleware` so it wraps as the outer layer. | `coordinator/api_auth.py` |
| HTTP 202 + empty body for JSON-RPC notifications | `the MCP bridge` <bridge-version>+ proxy fails to parse `id: null`ResponseBody` enum parse failure in `server_transport/http.rs`) -- the MCP transport breaks for every node. | `coordinator/server.py` |
| `-32602` guard on non-dict `arguments` | The same parse failure reached via an `AttributeError` escaping as a bare HTTP 500 with a null body. | `coordinator/server.py` |
| `_READ_LOCK_BYPASS_TOOLS` default-deny, verb-proven | Name-pattern heuristics are wrong here: `get_task_board` writes (auto-archive INSERT/DELETE), `check_inbox`/`heartbeat` write `last_seen`. Assuming `get_*` is read-only would bypass the write lock on writing tools. | `coordinator/server.py` (a remediation note) |
| `-WindowStyle Hidden` rather than `-NoNewWindow` | With `-NoNewWindow`, uvicorn shares the launching shell's console, so a console close -- operator, endpoint-protection kill, RDP disconnect teardown -- propagates `CTRL_CLOSE` and kills the coordinator. | `scripts/_launch-prod.ps1` |
| Rejecting a WMI re-parent orphan | `Win32_Process.Create` does not inherit the environment, so feature-flag variables are lost, "reintroducing the exact silent-write-failure regression". | `scripts/_launch-prod.ps1` |
| `PYTHONUNBUFFERED=1` + OS-level `Start-Process` redirection | A buffered PowerShell pipeline can drop a dying process's final flush, losing the traceback that explains the crash. | `scripts/_launch-prod.ps1` (RFC382) |
| `BIGINT` (not `INTEGER`) for epoch-ms columns | On PostgreSQL a bare `INTEGER` is `int4` (max ~2.1e9); epoch-ms is ~1.78e12 and overflows with `NumericValueOutOfRange`. `BIGINT` is `int8` on PG and integer-affinity on SQLite. | `coordinator/database.py` |
| Graceful stop via `CTRL_BREAK_EVENT` with a 40s drain | A raw force-kill skips uvicorn's lifespan shutdown, which skips `release_instance_singleton`, which leaves a stale holder row and makes the next restart fail closed for up to 90s. | section 3; `coordinator/database.py` |
| Rate-limiting the load-sample drop log | Expected `SQLITE_BUSY` drops on a loss-tolerant sampler produced enough log noise to bury real errors. | `coordinator/database.py`, ` (a remediation note) |
| `_pid_is_alive` returning `True` on any unexpected `OSError` | Fail-safe: an unknown error must not be read as "the holder is dead", because that conclusion permits a second coordinator to start. | `coordinator/database.py` |
| `deploy_gate` keeping a literal `15000` busy-timeout instead of importing config | "deploy_gate is a standalone, recovery-safe CLI ... with ZERO coordinator-internal imports by design -- adopting config.DB_BUSY_TIMEOUT_MS would add a package-relative import that breaks standalone `python deploy_gate.py` invocation." A recovery tool must not depend on the broken system. | `coordinator/deploy_gate.py` (a remediation note) |
| `deploy_gate` backend-mismatch probe, fail-open | Detects the coordinator running on PostgreSQL while the deploying process falls back to SQLite. Bounded 5s probe; "ANY failure returns None (fail-open) so deploy_gate never blocks on a transient network glitch -- the guard only bites on a CONFIRMED mismatch." | `coordinator/deploy_gate.py` (a remediation note) |
| `insert_audit_log` wrapped to swallow kwarg-binding `TypeError` | A signature drift at a call site raises *before* entering the function's own `try`, so audit emission could break a caller's flow. "keep the 'never raises' contract true." | `coordinator/api_auth.py` (a remediation note) |

### 15.4 Fail-open versus fail-closed -- the actual policy

This system does not have a single policy. It chooses per guard, and in every case the choice is
defensible. A rebuilder should re-derive each choice rather than apply one rule globally.

| Guard | Choice | Stated or evident reasoning |
|---|---|---|
| `AUTH_TOKEN` unset | **Closed** (503) | An unauthenticated API surface is worse than an unavailable one. |
| Instance-singleton, holder liveness unknown | **Closed** (assume alive) | Two coordinators is worse than a delayed start. |
| Instance-singleton, holder PID confirmed dead | **Open** (take over) | Otherwise every restart fails for up to the 90s TTL, and operators learn to bypass the gate. |
| Branch gate, `git` unavailable | **Open** (WARN, launch) | Availability wins when the checker itself cannot run. |
| Branch gate, branch is confirmed not `master` | **Closed** (exit 77) | A confirmed violation bites. |
| `deploy_gate` backend-mismatch probe | **Open** on probe failure | "the guard only bites on a CONFIRMED mismatch"; a transient network glitch must not block a deploy. |
| `deploy_gate` bypass-consumption bookkeeping | **Open** | "best-effort bookkeeping ... we swallow the error and still record the deploy attempt rather than block an OPERATOR-authorized bypass on a bookkeeping miss." |
| Read-lock bypass allowlist | **Closed** (default deny) | An unproven tool keeps the lock. |
| Write-lane routing for unmapped labels | **Open** (fall back to shared bridge) | *This was the wrong choice* -- see pitfall 3 in section 15.2. It is included here as a counterexample. |
| Audit-log emission failure | **Open** (swallow) | Audit emission must never break a caller's flow. |
| Cairn WAL checkpoint failure | **Open** (degrade + back off) | Escalating a maintenance fault into a restart was the bug; see pitfall 6. |
| Schema migration, DDL lane | **Closed** (fail fast) | A partially-created schema must not serve traffic. |
| Schema migration, backfill lane | **Open** (90s budget, then continue) | A backfill is catch-up work; blocking boot on it converts a data-quality issue into an outage. |

**The pattern.** Fail closed when the risk is *correctness or security*. Fail open when the risk
is *availability of a checker that is not itself the thing being protected*. The one clear
mistake in the table -- the write-lane fallback -- failed open on something that *was* the thing
being protected.

### 15.5 Unresolved for this section

- Of 593 distinct SWAT identifiers referenced in source, this section documents roughly twenty.
  The remainder were not individually traced; the incident bodies live in the Cairn database and
  were not available for this pass.
- Time-to-detect and time-to-recover figures are quoted from source comments only. There is no
  incident-log artefact in the repository against which to corroborate them.
- Several guards reference review identifiers (`the architect node`, `the reviewer node`, `the analyst node`, `the operations node` and similar). These are message identifiers in the coordinator's own
  message store and are unresolvable once the database is gone.

---

## 16. Evolution and migration history

**Evidence and design intent.** What migrated from what, to what, and why. A rebuilder who sees only the
current shape will not understand which parts are destinations and which are way-stations. The
distinction matters: several of the most awkward structures in this codebase are *mid-migration
states* that were never finished, and a rebuild should implement the destination directly rather
than reproduce the intermediate.

### 16.1 Storage engine: SQLite -> PostgreSQL

| Axis | From | To |
|---|---|---|
| Engine | SQLite (WAL mode, via `aiosqlite`) | PostgreSQL 16-class (via `asyncpg`; `psycopg` also present) |
| Concurrency model | Engine-enforced single writer | Application-enforced single writer, incrementally relaxed to per-lane pools |
| Tracking | RFC603 -> RFC629 OG10 | Cutover completed a historical point in the reference implementation |
| Measured result | MCP p99 ~27s | MCP p99 ~1.7s |

**Why.** The single-writer bottleneck. Under SQLite, all coordinator writes serialise on one
engine-level writer, and MCP tail latency had reached roughly 27 seconds at p99 -- meaning nodes
routinely waited half a minute for a heartbeat to commit.

**How, and why it was done that way.** The migration deliberately preserved the SQLite
concurrency semantics into the PostgreSQL era rather than rewriting call sites.
`coordinator/rfc603/canary_harness.py` names this as the cutover proof obligation: "under SQLite
the implicit single-writer guarantee...". A large body of code depended on that guarantee without
stating it. Auditing every write path was not feasible; preserving the guarantee in the
application layer was.

**What this leaves behind for a rebuilder.** The process-wide `_write_lock`, the "bridge"
shared write connection, the per-label lane opt-in sets, and the `serialized_write` /
`dal.writer(serialized=True, label=...)` duality are **all** artefacts of this migration. None of
them are design. A greenfield PostgreSQL implementation should use ordinary transactions, and
should keep only the *reserved-lane* concept from section 14 Group F.

### 16.2 Schema materialisation: three overlapping mechanisms

This is the clearest example of a way-station being mistaken for a destination.

| Mechanism | Status at the pinned commit | Purpose |
|---|---|---|
| `_init_tables` probes | **Live.** ~120 try-`SELECT`-except-`ALTER` probes executed at every boot | Idempotent additive schema evolution on SQLite |
| OG5 P2 registry (`coordinator/_og5_p2_registry.py`, 474 entries) | **Live.** Probe-then-bulk-stamp on first boot; stamp-gated thereafter | A version ledger over the DDL that `_init_tables` already performs |
| Alembic | **Inert.** Stamp-only; no live migration is driven through it | Vestigial |
| `coordinator/rfc603/sync_sqlite_to_pg.py` | **Live for PostgreSQL.** 95 tables / 647,475 rows replicated | The actual PostgreSQL schema materialiser |

The PostgreSQL schema was not created by any migration tool. It was **replicated from the live
SQLite schema** by `sync_sqlite_to_pg.py`, then adjusted by `jsonb_upgrade.py` (36 `TEXT`
columns converted to `JSONB`).

The OG5 runner has two lanes with deliberately different failure policies: a DDL lane that fails
fast, and a backfill lane that fails open with a 90-second budget. That split is good design and
worth keeping. The three-mechanism overlap is not.

**Scar tissue from the overlap** -- a real incident caused by exactly this ambiguity:

> "a remediation note/0007 recovery: P1-sample stamp purge. Context: the reference change P3 flag-flip
> boot ran `run_migrations(_db)` with NO `migrations` kwarg, so it defaulted to `MIGRATIONS` (the
> 5 P1 scratch samples) and stamped versions 0001-0005 with 'og5-p1 scratch:...' descriptions.
> That LEFT `schema_migrations` non-empty going into the P3 runner ATTEMPT-2, breaking Q2's
> baseline-stamp precondition ... and causing apply-mode with a version-namespace collision on
> 0001-0005 (P1 scratch versions == P2 real-schema versions as STRINGS, semantically distinct
> migrations)."

The remediation is itself instructive -- a self-nullifying recovery step:

> "DELETE the 5 P1-sample stamps just before ATTEMPT-2's `run_migrations(MIGRATIONS_P2)` ...
> Combined `description LIKE` + `version IN` predicate is belt-and-suspenders against a
> partial-P2-apply edge ... Idempotent across boots: post-Path-C, `schema_migrations` contains
> 474 P2 rows all with '[module:...] L#### CREATE_...'-shape descriptions (never 'og5-p1
> scratch:') -> DELETE no-ops -> apply-mode all-skip -> O(1). Self-nullifying by design."

Evidence: `coordinator/migrations.py`, `:463-487`.

**Two transferable lessons.** First, a version namespace shared between test fixtures and real
migrations will eventually collide -- sample migrations must live in a separate namespace or not
be shipped. Second, a one-time recovery step embedded in the boot path should be written to be
idempotent and self-nullifying, so it can be left in place safely rather than requiring a
follow-up removal deploy.

### 16.3 Things deliberately deferred during the cutover

These are open migration fronts at the pinned commit, not finished decisions.

| Item | Current state | Intended destination | Why deferred |
|---|---|---|---|
| Timestamp columns | ISO-8601 strings in `TEXT`, with parallel `*_epoch_ms` `BIGINT` columns | `timestamptz` | Converting types mid-cutover multiplies risk. The parallel epoch columns were the cheap way to get sortable/arithmetic timestamps without a type change. |
| Full-text search | FTS5 virtual and shadow tables **skipped entirely** on PostgreSQL | `tsvector` + GIN | FTS content is derived and rebuildable, so it was correctly treated as lowest-priority. |
| Cairn database backend | `CAIRN_DB_BACKEND` remains `sqlite` | PostgreSQL, per-port schema | Deliberately halted after an outage caused by the two datastores sharing one backend switch. A per-port schema map and a dedicated `cairn_write` lane pool exist and are ready. |
| Events medium tier | Two tiers plus base residue | A third `events_medium` (30d, weekly) tier | "parked, NOT part of the MVP" -- accepted over-retention instead. |
| Write-lane coverage | Opt-in label sets; everything unmapped falls back to the bridge | All writes lane-routed; retire `serialized_write` | Incremental per-label cosign. Directly responsible for 15.5. |

### 16.4 Events table: single table -> partitioned split

| Phase | Shape |
|---|---|
| Before | One `events` table, Python-driven retention |
| After | `events_short` (daily partitions, 3-day retention) and `events_long` (weekly partitions, 90-day retention) via `pg_partman` detach-and-drop, plus carve-out residue remaining in the base `events` table |
| Reader compatibility | `events_all` -- an identity view on SQLite, a three-table `UNION` on PostgreSQL |

The `events_all` view is the migration's tolerant-reader layer: the same name means the same
thing on both engines and across both the pre- and post-split shapes, so no reader had to change.
That is the pattern to copy. The corresponding invariant (E3: readers must use the view) exists
because a reader that went to `events` directly would silently see only residue.

Gating: the split is enabled only when **all** of `COORD_SCHEMA_MIGRATIONS_ENABLED`,
`COORD_PG_PARTMAN_ENABLED`, and `COORD_PG_EVENTS_SPLIT_ENABLED` are truthy -- three independently
revertible switches for one behaviour change, consistent with invariant H4.

### 16.5 Write path: four generations

| Generation | Shape | Why it changed |
|---|---|---|
| 1 | `writer_pool` / `reader_pool` (SQLite era) | Original |
| 2 | A single shared write connection (RFC603 S3-3), with a per-connection `_op_lock` per statement | Preserve SQLite's single-writer guarantee across the PostgreSQL cutover |
| 3 | Per-lane asyncpg pools, flag-gated behind `COORD_PG_WRITER_POOL_ENABLED`, opt-in per label | Relieve the bridge bottleneck without auditing every call site at once |
| 4 | Dispatch-entry lane routing, behind a **second** flag `COORD_MCP_DISPATCH_LANE_ROUTING_ENABLED` | Route at the MCP dispatch boundary rather than per call site |

The reason for the second flag is stated explicitly, and is a good model for staged rollout of a
risky change:

> "a deliberate second, independently rollback-able flag for this specific top-level-dispatch
> behavior change, since it is qualitatively riskier than a background-writer opt-in: it changes
> the primitive wrapping EVERY MCP tool call, not just one caller."

Evidence: `coordinator/pg_pool.py`.

**The failure this pattern still permitted.** The flag was correct; the *label coverage* was
not, and in one case "the MCP-dispatch-entry lane routing flag sat unset in prod" (a remediation note).
Staged flags protect against the change being wrong. They do not protect against the change being
incomplete. Completeness needs an enumeration test, not a flag.

### 16.6 Process launch and supervision: three generations

| Generation | Shape | Why it changed |
|---|---|---|
| 1 | `_start-coordinator*.cmd` invoking bare `uvicorn ... --host all interfaces` | Original. Also embedded literal credentials in the `.cmd` files. |
| 2 | `scripts/_launch-prod.ps1` + `scripts/serve_dualstack.py` | Dual-stack bind (13.2), launch-safety gates, log redirection, console isolation |
| 3 | NSSM held Stopped/Disabled + skill-mediated restart + out-of-band watchdog | A supervisor-induced host crash, and a multi-hour wedge that every liveness check missed |

Generation 1 artefacts are still present in the repository and **still contain live
credentials**. A rebuilder must treat them as compromised.

### 16.7 Backup: engine-coupled -> backend-aware

| From | To |
|---|---|
| SQLite `.backup()` API only | Backend-aware: `pg_dump -Fc` when `COORD_DB_BACKEND=postgres`, SQLite `.backup()` otherwise |

The `status.json`-written-last commit-marker protocol (13.20, E9) survived the change unaltered,
which is a sign it was the right abstraction: the *integrity protocol* is independent of the
*dump mechanism*.

The retired path `db-snapshots__RETIRED-reference change\` was tombstoned historically after an audit
mistook it for active.

### 16.8 Authentication: accreted, then separated

| Phase | Shape |
|---|---|
| Early | A single the shared-scripts repository `AUTH_TOKEN` |
| Then | Per-node session tokens; `node_identities.session_token` later backfilled into a dedicated `node_session_tokens` table |
| Then | `LIFECYCLE_TOKEN` separated from `AUTH_TOKEN`, with presenting `AUTH_TOKEN` explicitly denied |
| Then | Bootstrap tokens as a separate rotating credential class (a remediation note / RFC599) |
| Then | `daemon_post_token`, PID-bound, for the breathbus rider sidecar (a remediation note) |

The direction of travel is consistent and correct: **from one credential to five, each scoped to
a distinct blast radius and lifetime.** A rebuild should start where this ended up rather than
repeating the accretion.

The move of `session_token` from a column on `node_identities` into its own
`node_session_tokens` table is the standard one-to-many correction: it permits multiple live
tokens per node, per-token expiry, and rotation without an update-in-place on the identity row.

### 16.9 Tolerant readers and deprecated shapes

| Location | Old shape | New shape | Tolerance mechanism |
|---|---|---|---|
| `events` reads | Single table | Three tables | `events_all` view presents one name on both engines |
| Boot response payload | Hard-coded boot prompt | `role_boot_sop` sourced from `role_boot_sop_registry` | "legacy clients ignore unknown keys; null-return is self-documenting absence, never an error" (`coordinator/database.py` boot-orientation block) |
| Session token transport | `X-Node-Token` header | `_session_token` in the tool arguments | Both accepted; `X-Session-Token` also accepted as "a common alias" |
| SSE credential | Header only | `?token=` query parameter additionally honoured | Path-scoped to `GET /api/stream*` only |
| `coord_outbox` surfaces | Known set | Extensible | Unknown surfaces remain pending rather than being rejected (E7) |
| Write envelope | `serialized_write(label)` | `dal.writer(serialized=True, label=...)` | Both live; call sites migrated in slices |
| `event_bus.py` | Live | **Dead scaffold** -- marked `# @ux: deprecated`, zero callers | `notifications.py` is the live implementation |
| `molt_requests` table | Typed columns | All-`TEXT` fallback during the PostgreSQL sync | A literal `"$PID"` string had been stored in an `INTEGER` column; the sync could not type it |

The `molt_requests` case deserves a note. A single bad value -- an unexpanded shell variable
written as a literal string into an integer column -- forced an entire table to be replicated as
all-`TEXT`. A rebuilder should read that as an argument for validating at write time rather than
discovering at migration time.

### 16.10 The direction the system was heading

Read as a whole, the trajectory at the pinned commit was:

1. Finish the write-lane migration and retire the shared bridge connection entirely.
2. Finish the Cairn PostgreSQL move, using the already-built per-port schema map and dedicated
   `cairn_write` lane, with an independent backend selector so a shared backend switch cannot couple their blast radius.
3. Convert timestamps to `timestamptz` and retire the parallel `*_epoch_ms` columns.
4. Replace the in-process SSE broker with a shared one, which would lift the single-worker gate
   and permit horizontal scale.
5. Collapse the three schema mechanisms onto one.

Items 1, 2 and 4 are the ones with real leverage. **A rebuild should treat those as the starting
point, not the roadmap.**

### 16.11 Unresolved for this section

- No commit-message archaeology was performed beyond the pinned HEAD; the reconstruction above
  comes from in-source comments, phase markers, and runbook prose.
- The RFC documents that name these phases (RFC347, RFC382, RFC392, RFC408, RFC410, RFC497,
  RFC540, RFC587, RFC599, RFC603, RFC623, RFC626, RFC629) live in the Cairn database and were not
  read. Where a phase's intent is described above it is reconstructed from code comments citing
  the RFC, not from the RFC itself.
- Whether items 1-5 in 16.10 were formally planned or are only the author's reading of the
  trajectory is not established.

---

## 17. Engineering assessment

> **This section is opinion, not evidence.**
>
> Everything above this heading is either verified at source or explicitly marked as inferred.
> Everything below is the author's engineering judgement about what a reimplementation should
> reconsider. It is offered because the people who built this system will not be available to a
> rebuilder, and an honest critique is more useful than a neutral description. It should be
> argued with, and it should not be cited as though it were evidence.
>
> One caveat that should colour all of it: this system worked. It coordinated a live multi-agent
> fleet for months, survived a live database engine migration without data loss, and its
> operators could reconstruct the cause of every major incident afterwards -- which is more than
> most systems of this age can claim. The critique below is about what would make a *second*
> implementation better, not a claim that the first was bad.

### 17.1 The schema mechanism should be one thing, not three

There are three overlapping ways the schema gets created or evolved (16.2): roughly 120
try-`SELECT`-except-`ALTER` probes in `_init_tables`, a 474-entry OG5 registry that stamps
versions for DDL the probes already performed, and an Alembic installation that is stamp-only
and drives nothing. A fourth -- `sync_sqlite_to_pg.py` -- is what actually materialised the
production PostgreSQL schema.

This is not a style complaint. It produced a real incident: the P1/P2 version-namespace
collision (16.2) that required a self-nullifying recovery step to be embedded permanently in the
boot path. And it produces a standing hazard, recorded as invariant E1: adding a registry entry
without the matching DDL, or vice versa, breaks a fresh boot in a way that only shows up on a
database nobody has.

Running ~120 exception-driven probes on every boot is also the wrong shape on its own terms. It
costs boot time proportional to schema size forever, it makes "did this migration apply?"
unanswerable without inspecting the catalogue, and exception-as-control-flow over DDL is exactly
where subtle engine differences hide.

**What I would do instead.** One forward-only migration tool, versioned files in the repository,
applied transactionally where the engine permits it, with a single `schema_migrations` table as
the sole source of truth. Keep the OG5 two-lane failure policy -- DDL fails fast, backfill fails
open on a budget -- because that part is genuinely good and most tools do not offer it. Delete
everything else.

### 17.2 `database.py` at <measured-value> and `mcp_handler.py` at 743 KB are not maintainable

These two files hold most of the system's logic. At that size, nobody can hold the file in their
head, tooling degrades, review becomes sampling rather than reading, and the cost of every change
is dominated by the cost of finding the right place to make it.

The consequences are visible in the code. Guards that must be applied at multiple call sites
list those call sites in a docstring (`db_path_guard.py` enumerates six) because there is no
practical way to verify coverage otherwise. Label-to-lane mappings live in hand-maintained
frozensets scattered across a file, and two multi-hour outages came from one of those sets
being incomplete. That is what "too large to reason about" costs in production.

**What I would do instead.** Split by domain into modules with explicit interfaces -- node
registry, messaging, tasks, SWAT, governance, audit -- each owning its own tables. Make the write
primitive take the lane as a required argument so coverage is enforced by the type system rather
than by a frozenset somebody has to remember to update.

### 17.3 The global write lock is the system's central availability hazard

The process-wide `_write_lock` and the shared "bridge" connection are migration scar tissue
(13.10, 16.1), not design, and they caused two of the worst outages on record, one lasting roughly
sixteen hours. In both cases **PostgreSQL itself was healthy.** The coordinator wedged on its own
serialisation.

The per-lane pool work is the right fix and it was half-finished at the pinned commit, with an
opt-in default that silently routes anything unmapped back to the contended path.

**Connection pool sizing is measurably not the bottleneck**, and this is worth stating because it
is a rebuilder's natural first instinct on hitting contention. Measured on the live deployment:
pool maxima total 18 across all lanes against a server `max_connections` of 100 -- roughly five
times headroom sitting unused -- while p99 acquire wait was 0.08-<measured-value> per lane. The
serialisation happens *above* the pool, at the lock. Enlarging pools would have bought nothing.

**What I would do instead.** Do not port the lock. Use ordinary database transactions and let
PostgreSQL provide isolation. Keep exactly one idea from this subsystem: a reserved connection
lane for life-services traffic that no other workload can exhaust (invariant F1). Make lane
selection a required parameter with no default, so "unmapped" is not a reachable state.

### 17.3a Separate state by write cadence in the schema, not only by lane in the pool

Lane reservation makes contention survivable; it does not make the schema correct. The contention
originates in the table shape.

In the original system a single node table carried 62 columns, mixing in one mutable row per node:
liveness fields updated on every heartbeat, slow-changing lifecycle and identity state, bootstrap
control, attention signalling, a life-services gating block, and activity counters. The hottest
write in the entire system therefore landed on the same row as configuration that changed a few
times a week.

**What I would do instead.** Split by write cadence: a narrow, hot liveness table keyed by node; a
separate slow-changing identity and configuration table; and append-only history for state
transitions rather than mutate-in-place. With that shape, the reserved lane becomes defence in
depth rather than the primary mechanism holding the system up.

### 17.3b Do not carry forward the storage-engine-era column shape

A migration that preserves the old engine's workarounds inherits its costs without its reasons.
The clearest example: every significant timestamp existed **twice** -- an ISO text column plus a
parallel epoch-milliseconds integer column, in roughly a dozen pairs. The shadow column existed
because the original engine had no date type and needed sortability. The destination engine has
proper timestamp types, but the migration carried both columns forward, so every write maintains
two representations of the same fact and every reader must know which one to trust.

**What I would do instead.** Migrate to the destination engine's native types and delete the
shadow columns in the same change. A mid-migration shape that is never finished becomes permanent.

### 17.4 Writing SQLite-shaped SQL and translating it at execute time hides real semantics

`db_backend.translate_dialect` rewrites SQLite-flavoured SQL for PostgreSQL at execution time.
This kept the cutover cheap, and as a migration strategy it was defensible. As a permanent
architecture it is not: the code reads as if it is talking to SQLite while it is actually talking
to PostgreSQL, so the engine's real semantics -- types, isolation levels, index capabilities,
`NULL` ordering, locking behaviour -- are invisible at the call site. The `BIGINT`-versus-`INTEGER`
overflow is a small, caught instance of the class. The partitioned-unique-index
constraint (E5) is a larger one that only surfaced because somebody audited `pg_indexes` by hand.

The parallel `*_epoch_ms BIGINT` columns alongside ISO-string `TEXT` timestamps are the same
compromise in the data model: two representations of one fact, forever, each of which can drift
from the other.

**What I would do instead.** Write native SQL for the chosen engine. Convert timestamps to
`timestamptz` and delete the parallel epoch columns. If dual-engine support is genuinely needed,
put it behind a repository interface with two implementations, not behind a string rewriter.

### 17.5 153 unvalidated environment variables is a configuration surface, not configuration

Section 4 enumerates 153 environment variables. They are read ad hoc via `os.getenv` at module
scope and at call sites, with defaults expressed inline. There is no schema, no startup
validation, no typed accessor, and no way to discover the full set except by grepping -- which is
literally how the table in section 4 was produced.

The failure mode this creates is well attested: a flag that "sat unset in prod" (a remediation note)
is a contributing cause of one of the two bridge outages. A variable that is read but never
supplied fails silently by definition, because its default is indistinguishable from a
deliberate setting.

**What I would do instead.** One typed settings object, validated at startup, that fails loudly
on unknown or malformed keys and logs its entire effective configuration at boot. Group
feature flags into an explicit registry with an owner, an expiry, and a default, so that flags
which were meant to be temporary get removed instead of accumulating.

### 17.6 219 MCP tools in one flat namespace is too many

Section 6 enumerates 219 tools. Every one is a public contract that nodes depend on, and there is
no versioning. There is a `_HIDDEN_TOOLS` set (tools omitted from `tools/list` but still
callable) and a `_HARD_REMOVED_TOOLS` set, which tells you the surface grew faster than it could
be curated.

`_HIDDEN_TOOLS` deserves specific criticism: a tool that is hidden from discovery but remains
callable is security by obscurity. If it should not be called, remove it or gate it; if it may be
called, list it.

**What I would do instead.** Group tools into namespaced domains with an explicit version in the
tool name or the server capability announcement. Deprecate by announcement and removal date, not
by hiding. Aim for an order of magnitude fewer top-level tools, with composite operations built
from them rather than added alongside them.

### 17.7 Credentials in the repository

`_start-coordinator.cmd`, `_start-coordinator-dev.cmd`, `_start-coordinator-test.cmd`, and
`docs/deploy-guide.md` all contain a literal production `AUTH_TOKEN`. These files are generation-1
artefacts (16.6) that were superseded but never deleted.

The rest of the credential design is genuinely good -- hashed bootstrap tokens, fingerprint
binding, PID-bound daemon tokens, separated lifecycle tokens, timing-padded failures (13.15,
Group D). That makes the plaintext tokens in tracked files all the more striking: the careful
work was undone by four files nobody remembered to remove.

**What I would do instead.** Secrets come from a secret manager or from the process environment
supplied by the supervisor, never from a tracked file. Add a pre-commit secret scanner. On
rebuild, treat every credential in these repositories as compromised and rotate it -- and note
that the git *history* still contains them even after the files are deleted.

### 17.8 A 150 KB PowerShell restart script is a single point of failure

`scripts/restart-coordinator.ps1` encodes roughly twenty ordered gates and is the only sanctioned
way to restart the coordinator. It is essential, it is carefully written, and it is untestable in
any practical sense: it manipulates live services, and its failure modes are only observable in
production.

The same is true, at smaller scale, of the supervision design around it -- a service deliberately
held Disabled, an out-of-band scheduled-task watchdog, and a set of argv tokens that exist purely
so a regex can find the right process (13.3). Each piece is a reasonable response to a real
incident. Together they are a bespoke process supervisor written in a shell language.

**What I would do instead.** Adopt a real supervisor and let it own lifecycle: `systemd` with
`Restart=on-failure`, `RestartSec`, `StartLimitIntervalSec`/`StartLimitBurst`, and `ExecStop`
sending the right signal; or a container orchestrator with liveness and readiness probes. Keep
the *semantics* the script enforces -- health-gated startup, drain before stop, SHA verification
before launch, deadman rollback -- and express them as pre-start and post-start units, which are
individually testable.

### 17.9 Some smaller things

| Observation | Why it matters | Suggested change |
|---|---|---|
| `/api/lifecycle/token/status` returns a 12-character token prefix without authentication | A prefix is a meaningful head start for an offline attack and confirms a token exists. | Return only a boolean and, at most, a rotation timestamp. Require auth. |
| The lifecycle token "rotate" endpoint does not actually rotate | An operator may believe a credential was rotated when it was not. That is worse than having no endpoint. | Implement it or remove it. |
| Argv-regex process identification (13.3) | Any process whose command line happens to match is a candidate for being killed by the restart machinery. | PID file written under the instance-singleton lease, or a supervisor-owned unit. |
| `master`-branch gate fails open when `git` is unavailable (13.4) | The one environment where `git` is missing is a minimal recovery host -- precisely where an unnoticed wrong checkout is most likely. | Record the intended SHA in a file written at deploy time and compare against it, so the check does not depend on `git` being installed. |
| Both repositories' only remotes are UNC paths on machines that are also being decommissioned | There is no offsite copy of the history. | Establish a real remote before decommission. This is the single most urgent item in this document. |
| RFC and review identifiers cited throughout source resolve only inside the coordinator's own database | Every "why" pointer in the codebase becomes a dead link when the database dies. | Export the referenced RFC and SWAT bodies to files in the repository before decommission. |

### 17.10 What was genuinely well done, and should be copied

It would be a poor assessment that only criticised. These are the parts I would take to a new
implementation more or less unchanged.

1. **Incident identifiers in code comments.** Nearly every guard cites the incident that produced
   it, in a stable, greppable format. This is the reason this document could be written at all,
   and it is a discipline most codebases never achieve. Three thousand four hundred references
   across 591 identifiers represents an enormous amount of institutional memory captured in the
   one place it cannot be lost -- next to the code it explains.
2. **Deriving coupled bounds instead of documenting them.** `_HEALTH_DB_PROBE_TIMEOUT_S` is
   computed from the inner probe's configured bound, so the two cannot drift. The first attempt
   documented the relationship; it broke within weeks. The arithmetic version cannot.
3. **Writing the negative case down.** Comments routinely state what was *rejected* and why --
   "WHY NOT a full re-parent orphan", "Deliberately EXCLUDED as hidden-writes", "Do not record
   this guard as closing the stale-tip axis". Future maintainers are stopped from re-making a
   decision that was already made and found wrong.
4. **Scoping exemptions to the narrowest possible surface, and saying so.** The SSE query-string
   token is accepted on `GET /api/stream*` and nowhere else, with the blast-radius reasoning
   recorded inline.
5. **Instrumenting the requirement, not just the implementation.** The ring buffer does not merely
   have a size; it counts evictions that breach the stated 60-second retention floor, and the
   acceptance criterion is that the counter reads zero. That converts a tunable into a testable
   property.
6. **Self-nullifying recovery steps.** The P1 stamp purge is written to be idempotent and to
   become a no-op once its job is done, so it can be left in the boot path safely.
7. **Naming the primary defence among layered ones.** The NSSM hardening explicitly says which of
   its four knobs is doing the work and which are fallbacks for a specific reversion scenario.
   Layered defences that do not say this decay into cargo cult.
8. **Recovery tools with zero dependencies on the system they recover.** `deploy_gate` keeps a
   duplicated literal constant rather than importing from the package, specifically so it can run
   standalone. That is the right trade for a recovery-path tool.
9. **Deriving liveness at read time rather than storing it.** `rider_alive` cannot be stale
   because it does not exist until someone asks.

### 17.11 If I had to state the rebuild advice in one paragraph

Build a single-process ASGI service in front of PostgreSQL, on Linux, under `systemd` with
exponential-backoff restart and a start limit. Use ordinary transactions; do not port the global
write lock. Keep one reserved connection lane for life-services traffic and make the lane a
required argument with no default. Use one forward-only migration tool with a two-lane failure
policy. Put every timeout in a derived ladder -- client bound greater than server bound, health
bound derived from probe bound, watchdog bound greater than health bound -- and add a test that
asserts the ordering. Bound every awaited external call. Check liveness out of band, with a real
read and a real write, from a process that does not share the event loop. Keep the five separate
credential classes and the hashed, fingerprint-bound bootstrap token. Answer JSON-RPC
notifications with a bare 202, and never let an exception escape as an untyped 500. Keep an
`events_all`-style compatibility view over any storage split, and bias every retention decision
toward keeping data. And put the incident identifier in the comment above every guard you write,
because that habit is the most valuable thing this system produced.
