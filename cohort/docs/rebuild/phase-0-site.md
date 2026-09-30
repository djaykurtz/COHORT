# Phase 0 site build package

## 1. Purpose and exit criteria

Phase 0 creates the site substrate that must exist before any coordinator, node,
dashboard, daemon, or backup code is deployed. It is not a preference checklist.
It is the build package for source hosting, secrets, accounts, network policy,
time, backup storage, and initial identities.

Exit criteria:

- A source origin exists outside the hosts that will run the services.
- A secret-store interface exists and exposes the required names without placing
  secrets in git, documentation, command history, or database connection strings.
- Least-privilege service accounts exist for each runtime responsibility.
- Every host is synchronized to a common time source within the bound in section 6.
- Required network paths pass and denied paths fail.
- Backup storage is independent, writable by the backup job, and not deletable by it.
- The first operator and node identities can be issued without bypassing the
  registration rule.
- The phase 0 acceptance tests in section 10 pass.

## 2. Host and OS baseline

Minimum single-host start:

| Resource | Minimum for phase 1 start | Notes |
| --- | --- | --- |
| Host count | One host | Multi-host is allowed later, but start with one fault domain understood. |
| CPU | Enough for one API service, one database server, one dashboard, and one agent CLI session | Add capacity before adding more nodes. |
| Memory | Enough for the database working set, the Python API process, and at least one CLI session | Leave headroom for restore tests. |
| Storage | Durable local storage for database data, logs, artifacts, and a local backup staging area | Backup destination must still be separate. |
| Network | Stable outbound access to source hosting and the model provider used by the CLI | Inbound exposure is limited by section 7. |

Required runtimes:

- A PostgreSQL-class database server for coordinator persistence.
- A Python runtime for the coordinator and validation utilities.
- An agent CLI that can call the coordinator through MCP directly or through a bridge.
- A shell for supervised launch and acceptance tests: PowerShell on Windows, bash or
  a compatible shell on Linux.
- Optional later: a Go toolchain or equivalent only if rebuilding the liveness daemon.

Windows notes:

- Use PowerShell 7 or newer for scripts and tests.
- Service supervision can use the native service manager, a service wrapper, or a
  scheduler, but credentials and environment injection must follow this guide.
- Named-pipe IPC is Windows-specific; keep it loopback or host-local.

Linux notes:

- Use systemd or an equivalent supervisor for service start, restart, and secret
  environment injection.
- Use Unix sockets, local TCP, or another host-local IPC mechanism instead of
  Windows named pipes.
- Preserve the same invariants: no secrets in git, database on loopback unless an
  explicit multi-host database design is accepted, and deployed artifacts separate
  from source checkouts.

## 3. Service accounts and least privilege

Create one account per responsibility. Human administrator accounts are not service
accounts.

| Account | May access | Must not access |
| --- | --- | --- |
| Coordinator service account | Coordinator deployed artifact, runtime logs, coordinator DB application password, fleet bearer token, JWT secret, optional lifecycle token if lifecycle routes are enabled | Backup destination delete permission, DB admin password, source-host admin settings, node private homes |
| Database service account | Database data directory and database service logs | Fleet bearer token, node secrets, source-host credentials, backup destination credentials |
| Backup job account | Database dump command, read access to database backup credential, write/create access to backup destination, local staging directory | Delete or overwrite immutable backups, coordinator lifecycle token, node private homes, source-host admin settings |
| Dashboard account | Dashboard deployed artifact and dashboard credential or proxy credential | Database passwords, fleet bearer token unless the dashboard is explicitly a trusted server-side proxy, node secrets, backup credentials |
| Liveness daemon account | Daemon deployed artifact, daemon credential, host-local IPC for local nodes, coordinator reachability | Database credentials, backup destination, source-host admin settings, node secrets other than daemon-specific tokens |
| Node session account | Node home, CLI runtime cache, per-node identity file, source read credential if needed | Other node homes, database credentials, backup destination, coordinator lifecycle token |

Database roles:

- Application role: used by the coordinator during normal operation. It may connect,
  read, write, run required application functions, and hold only the grants needed by
  health checks and migrations approved for normal boot. It must not be superuser and
  must not create databases.
- Admin/restore role: used only for database initialization, extension setup, and
  restore into scratch or replacement databases. It is not used by the running
  coordinator and is not readable by the coordinator service account.

## 4. Secret-store interface

The site may use any secret manager, provided it implements this abstract interface:

```text
get(name) -> secret bytes or not-found
put(name, secret bytes, metadata) -> version id
rotate(name, new secret bytes, metadata) -> version id
list(prefix) -> secret names and current version metadata, not secret values
```

Required secret names:

| Name | Purpose |
| --- | --- |
| `cohort/fleet/bearer-token` | Shared REST bearer token for endpoints that explicitly allow fleet auth. |
| `cohort/nodes/<NODE_ID>/node-secret` | Per-node secret used to prove node identity and mint short-lived JWTs. |
| `cohort/nodes/<NODE_ID>/session-token` | Optional persisted session token if the site distributes one outside bootstrap. |
| `cohort/db/app-password` | Password for the database application role. |
| `cohort/db/admin-password` | Password for the database admin/restore role. |
| `cohort/lifecycle/token` | Optional privileged lifecycle token. Must differ from the fleet bearer token. |
| `cohort/jwt/signing-secret` | HS256 signing secret, at least 32 bytes. |

How services receive secrets:

- Preferred: the supervisor injects secrets as environment variables at process start
  from the secret store.
- Acceptable: the supervisor writes a secret file with restricted ACLs or mode bits,
  owned by the specific service account, then passes only the file path to the service.
- Prohibited: secrets in git, documentation, source-host variables readable by broad
  users, command lines, logs, shell history, database connection strings, or public
  dashboards.
- Database connection strings contain host, port placeholder, database name, and role
  only. The password is supplied separately by file or environment variable.

Rotation procedure:

1. Generate the replacement secret in the secret store under the same name, creating a
   new version.
2. Deploy configuration that allows both old and new values if the credential type
   supports overlap. For node secrets, register the new hash before first use.
3. Restart or reload the consumers whose configuration is read only at process start.
4. Verify the consumer authenticates with the new value.
5. Revoke the old version and verify old credentials fail.
6. Record the rotation receipt without recording the secret value.

## 5. Source hosting

Create these repositories or equivalent separated source areas:

- Coordinator service and database migrations.
- Dashboard server and static UI.
- Liveness daemon, if used.
- Shared scripts, node templates, skills, and launchers.
- Deployment manifests or infrastructure-as-code, if used.

Branch protection:

- Require review before merging to the deployment branch.
- Require status checks for build, tests, and secret scanning.
- Prevent force-push on protected branches.
- Require signed or otherwise attributable changes if the hosting platform supports it.
- Restrict who can change repository settings and branch protection.

Independent-origin rule:

- The source origin must not reside only on a host that it is used to build, deploy, or
  recover. Loss of any runtime host must not destroy the source history.
- Runtime hosts may hold working clones or deployed artifacts, but those are caches,
  not the origin.

Deployed-artifact separation principle:

- Services run from a versioned artifact or release directory, not directly from an
  editable source checkout.
- Deployment produces an artifact from a specific commit, records the commit hash and
  build inputs, then promotes that artifact.
- Restart and recovery use the deployed artifact. Developer branches and dirty source
  trees cannot disable recovery.

## 6. Time

All hosts must synchronize to a common trusted time source.

Maximum tolerated skew: 30 seconds between any two hosts.

Derivation: node JWT validation allows 60 seconds of clock skew. A 30-second site
bound keeps a two-times safety margin inside that allowance. The backend health probe
uses a 12-second server-side bound and the watchdog uses a longer 15-second timeout;
those are duration measurements and do not set a cross-host clock bound, but they show
that stale or future timestamps on the order of a minute are operationally significant.
Heartbeat freshness, leases, message expiry, cooldowns, rate-limit windows, and JWT
claims all depend on timestamp order, so the site bound is intentionally stricter than
the token allowance.

Check commands:

Windows PowerShell:

```powershell
w32tm /query /status
w32tm /stripchart /computer:<TIME_SOURCE_HOST> /samples:5 /dataonly
```

Linux bash:

```bash
timedatectl status
chronyc tracking || ntpq -pn
```

## 7. Network

Reachability matrix:

| From | To | Port placeholder | Required? | Notes |
| --- | --- | --- | --- | --- |
| Operator browser | Dashboard server | `<DASHBOARD_PORT>` | Yes | Browser UI only. |
| Dashboard server | Coordinator service | `<COORD_PORT>` | Yes | Server-side proxy and event reads. |
| Agent node host | Coordinator service | `<COORD_PORT>` | Yes | MCP, REST where allowed, and events. |
| Liveness daemon host | Coordinator service | `<COORD_PORT>` | If daemon enabled | Heartbeat, wake, and event stream. |
| Watchdog host | Coordinator service | `<COORD_PORT>` | Yes | Health probe. |
| Coordinator service | Database server | `<DB_PORT>` | Yes, loopback for single-host | Keep loopback-only unless database is explicitly separate. |
| Backup job host | Backup destination | `<BACKUP_DEST_PORT>` | Yes | Write/create only with job credentials. |
| Runtime hosts | Source origin | `<SOURCE_PORT>` | Yes | Clone and fetch from independent origin. |
| Runtime hosts | Model provider | `<MODEL_PROVIDER_PORT>` | Yes | Required by agent CLI sessions. |
| Any external host | Database server | `<DB_PORT>` | No by default | Deny except an approved separate DB topology. |
| Any external host | Daemon IPC or local health port | `<DAEMON_LOCAL_PORT>` | No | Host-local only. |

Firewall guidance:

- Default deny inbound. Open only rows marked required.
- Bind database, daemon IPC, and local health endpoints to loopback or host-local
  transports unless a documented multi-host topology requires otherwise.
- Do not expose source-host admin endpoints to runtime service accounts.
- Log denies during phase 0 testing, then keep the deny rules after acceptance.

## 8. Backup destination contract

The backup destination is a recovery dependency, not convenience storage.

Required contract:

- It does not share fate with the coordinator, database, dashboard, node, or daemon
  hosts. Host loss must not delete the backup copy.
- The backup job credential can create new snapshot objects and write sidecars, but
  cannot delete prior snapshots or weaken retention.
- Retention keeps enough restore points to survive detection delay and operator error.
  Define the count and age policy before phase 1.
- If the platform supports immutability, enable it for committed snapshots and status
  records.
- Publish snapshots atomically: write temporary objects first, verify hashes, then
  publish the status marker last.
- A phase 1 acceptance test must restore the newest backup into a scratch database or
  scratch store and validate content there. A successful backup job alone is not proof.

## 9. Operator and node seeding

First operator:

1. Select one human operator through the site's normal administrative process.
2. Create an operator credential or dashboard identity in the chosen identity system.
3. Grant only the minimum ability to provision node identities, approve lifecycle
   actions, and read operational status.
4. Record the operator bootstrap receipt without recording secrets.

Node registration rule:

- Each node must have either an operator-provisioned secret or an allowlist entry
  before first bootstrap.
- First contact using only a node ID is allowed only when the registration policy says
  the node is pre-approved and no valid session lock already exists.
- Node secrets are stored plaintext only in the node's private identity file or secret
  store entry. The coordinator stores only a hash.

Initial identity issuance:

1. Choose stable node IDs and roles.
2. Add each node ID to the coordinator allowlist or create a one-time bootstrap token.
3. Generate `cohort/nodes/<NODE_ID>/node-secret` and, if needed, an initial session
   token entry.
4. Render the node identity file from the public schema with placeholders resolved for
   endpoint, role, node ID, and secret references.
5. Restrict the identity file to the node session account.
6. On first launch, verify bootstrap returns or reuses a session token and that the
   token is persisted only in the node private state.

## 10. Phase 0 acceptance tests

Use the site's real commands where the placeholder command names appear. The tests are
pass/fail and should be automated before phase 1 begins.

### 10.1 Secret access

Windows PowerShell:

```powershell
& <as-coordinator> { <secretctl> get cohort/fleet/bearer-token | Out-Null }
& <as-dashboard> { <secretctl> get cohort/db/admin-password }; if ($LASTEXITCODE -eq 0) { throw 'dashboard read admin secret' }
& <as-backup-job> { <secretctl> get cohort/db/app-password | Out-Null }
& <as-node> { <secretctl> get cohort/db/app-password }; if ($LASTEXITCODE -eq 0) { throw 'node read db secret' }
```

Linux bash:

```bash
<as-coordinator> <secretctl> get cohort/fleet/bearer-token >/dev/null
! <as-dashboard> <secretctl> get cohort/db/admin-password
<as-backup-job> <secretctl> get cohort/db/app-password >/dev/null
! <as-node> <secretctl> get cohort/db/app-password
```

### 10.2 Clock skew

Windows PowerShell:

```powershell
$maxSkewSeconds = 30
$offset = & <time-offset-command> <TIME_SOURCE_HOST>
if ([math]::Abs([double]$offset) -gt $maxSkewSeconds) { throw 'clock skew too high' }
```

Linux bash:

```bash
max_skew_seconds=30
offset_seconds=$(<time-offset-command> <TIME_SOURCE_HOST>)
awk -v value="$offset_seconds" -v max="$max_skew_seconds" 'BEGIN { if (value < 0) value = -value; exit(value <= max ? 0 : 1) }'
```

### 10.3 Reachability matrix

Windows PowerShell:

```powershell
Test-NetConnection <COORDINATOR_HOST> -Port <COORD_PORT> | Where-Object TcpTestSucceeded
Test-NetConnection <DASHBOARD_HOST> -Port <DASHBOARD_PORT> | Where-Object TcpTestSucceeded
if ((Test-NetConnection <DB_HOST> -Port <DB_PORT>).TcpTestSucceeded) { throw 'database exposed' }
if ((Test-NetConnection <DAEMON_HOST> -Port <DAEMON_LOCAL_PORT>).TcpTestSucceeded) { throw 'daemon exposed' }
```

Linux bash:

```bash
nc -z <COORDINATOR_HOST> <COORD_PORT>
nc -z <DASHBOARD_HOST> <DASHBOARD_PORT>
! nc -z <DB_HOST> <DB_PORT>
! nc -z <DAEMON_HOST> <DAEMON_LOCAL_PORT>
```

### 10.4 Backup destination rights

Windows PowerShell:

```powershell
& <as-backup-job> { <backupctl> put <BACKUP_DEST> phase0-write-test <TEST_BYTES> }
& <as-backup-job> { <backupctl> get <BACKUP_DEST> phase0-write-test | Out-Null }
& <as-backup-job> { <backupctl> delete <BACKUP_DEST> phase0-write-test }; if ($LASTEXITCODE -eq 0) { throw 'backup job can delete' }
```

Linux bash:

```bash
<as-backup-job> <backupctl> put <BACKUP_DEST> phase0-write-test <TEST_BYTES>
<as-backup-job> <backupctl> get <BACKUP_DEST> phase0-write-test >/dev/null
! <as-backup-job> <backupctl> delete <BACKUP_DEST> phase0-write-test
```

### 10.5 Source origin

Windows PowerShell:

```powershell
git ls-remote <SOURCE_ORIGIN_URL> HEAD | Out-Null
$originHost = '<SOURCE_ORIGIN_HOST>'
$runtimeHosts = @('<COORDINATOR_HOST>','<NODE_HOST>','<DASHBOARD_HOST>')
if ($runtimeHosts -contains $originHost) { throw 'source origin shares runtime host' }
```

Linux bash:

```bash
git ls-remote <SOURCE_ORIGIN_URL> HEAD >/dev/null
origin_host='<SOURCE_ORIGIN_HOST>'
for runtime_host in '<COORDINATOR_HOST>' '<NODE_HOST>' '<DASHBOARD_HOST>'; do
  test "$origin_host" != "$runtime_host"
done
```

## 11. Handoff to phase 1

Phase 1 may start only after the phase 0 acceptance tests pass and the results are
recorded. Hand off these artifacts:

- Source origin URLs and protected branch names.
- Service account names and privilege matrix.
- Secret names, current version metadata, and consumer mapping, excluding values.
- Network matrix results and firewall rule identifiers.
- Time-sync source and skew test results.
- Backup destination contract, retention policy, and write/delete test results.
- Initial operator bootstrap receipt.
- Node allowlist or bootstrap-token plan.

Phase 1 then builds the coordinator database, coordinator service, restart lever,
health probe, and first restore-into-scratch acceptance test using these contracts.