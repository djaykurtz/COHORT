# Node Runtime (Rebuild Reference)

> Scope: how one ZeroBrain fleet node is hosted, launched, configured,
> connected, kept alive, and recycled. A node is a long-lived agent CLI session
> with a durable local identity and an MCP connection to the coordinator. This is
> a design document for rebuilding the mechanism on new hardware, not a manifest
> of the previous deployment.

## 0. How to read this page

### 0.1 Evidence classes

| Class | Meaning in this page |
| --- | --- |
| Reference implementation | Mechanisms read from the node launcher, node recycle scripts, host launcher, skill files, shared boot scripts, and existing COHORT docs. Source anchors use logical names or file names only. |
| Design intent | The reusable principle behind the implementation. Intent is inferred from comments, specs, and repeated guards. |
| Assessment | Engineering opinion about what to keep, simplify, or drop in a rebuild. Assessment is isolated in section 15. |
| Unresolved | Design questions or implementation details not verified without live services. The complete list is in section 16. |

### 0.2 Source anchors

Use file names and logical artifacts as source anchors. Do not treat the previous
machines, paths, hostnames, node codenames, ports, user accounts, or binary
versions as part of the design.

| Anchor kind | Generic anchor |
| --- | --- |
| Rebuild docs | `cohort/docs/rebuild/README.md`, `backend-hosting.md`, `labor-division.md`, `rnd-processes.md` |
| Orientation docs | `cohort/docs/systems/fleet-boot.md`, `identity-and-memory.md`, `lifecycle-and-molt.md` |
| Policy | `cohort/docs/source-reference-policy.md` |
| Node boot launcher | `join-cohort.ps1`, `fleet-boot.ps1`, and the bridge launch retry helper |
| Node recycle engine | `QC-REFRESH.ps1` and the tree-independent spawn helper |
| Shared boot doctrine | `rfc-fleet-boot-v2.md` and the bootstrap retry helper |
| Host launcher | the host launcher source tree |
| Template reference | the node template repository |
| Skill reference | `.copilot/skills/<skill>/SKILL.md` in a node home |

### 0.3 Relationship to other COHORT docs

| Existing page | What it covers | What this page adds |
| --- | --- | --- |
| [`backend-hosting.md`](backend-hosting.md) | Coordinator service, database, API, MCP handler, auth, breathbus, and life-services gates | Node-side wiring only: how a node launches, connects, proves life, and stays schedulable. |
| [`labor-division.md`](labor-division.md) | Roles, authority, routing, and why nodes behave like employees | Local runtime machinery that lets one employee-session exist. |
| [`rnd-processes.md`](rnd-processes.md) | RFC, Cairn, SWAT, knowledge, and review processes | How local skills and launch scripts participate in those processes. |
| [`docs/systems/fleet-boot.md`](../systems/fleet-boot.md) | Concise boot overview | Rebuild-depth launcher, identity, config, retry, and acceptance details. |
| [`docs/systems/identity-and-memory.md`](../systems/identity-and-memory.md) | Identity, memory, and continuity concepts | Local identity file schema and which fields are secrets. |
| [`docs/systems/lifecycle-and-molt.md`](../systems/lifecycle-and-molt.md) | Molt overview | Local recycle engine, tree-independent successor spawn, and local gates. |

Coordinator-side `bootstrap_node`, `confirm_life_services`, session-token
storage, MCP auth precedence, and breathbus daemon endpoints belong in
`backend-hosting.md`. This page only documents the node-side contract.

### 0.4 Security and genericity

No credential value appears in this page. Header values, tokens, personal access
tokens, machine names, hostnames, IP addresses, ports, drive-letter paths, UNC
paths, user names, email addresses, hashes, and exact binary versions are replaced
with placeholders or design principles.

### 0.5 Editorial rule

Mechanism and principle survive. Dated incident narrative, deployment-specific
names, IP and permission sets, and location names do not. Scar tissue is written
as a design constraint: automated mode schedules before bootstrap, manual mode waits for explicit wakes, fail open for optional hygiene,
fail loud for mandatory launch substrate, keep secrets out of model-visible tool
arguments, and spawn successors outside the process tree that is being killed.

---

## 1. Node anatomy

### 1.1 What a node is

A node is one long-lived agent CLI session rooted in a node home. The session is
disposable; the identity file, coordinator identity, local instructions, skills,
logs, launch state, and continuity surfaces make the node durable across restart,
context loss, and recycle.

Reference implementation evidence:

- `fleet-boot.md` defines boot as turning node-specific identity and shared boot
  templates into a coordinator-connected CLI session.
- `identity-and-memory.md` defines the continuity chain: local identity, node
  configuration, bootstrap authentication, session-token synchronization,
  per-node MCP config, startup templates, and saved work state.
- `join-cohort.ps1` reads `fleet-identity.json`, resolves `node_id`, publishes a
  process-scoped node-id environment variable, creates node-local runtime
  directories, writes MCP config, and builds the boot prompt.
- The node template marks `fleet-identity.json` as protected and MCP config as a
  generated-at-boot artifact.

### 1.2 Generic node home layout

Use logical locations such as `<node-home>`, `<shared-root>`, `<log-dir>`, and
`<secrets-dir>`. A rebuild can choose different physical paths.

| Artifact under `<node-home>` | Class | Purpose |
| --- | --- | --- |
| `fleet-identity.json` | Per-node private state | Durable node id, coordinator URL shape, recovery credential, session token, model/context pins, launch mode, known-good hash ledgers, and startup prose. Contains secrets. |
| `.copilot/mcp-config.json` | Generated every boot | MCP server definition for the coordinator. Contains secret header values at runtime. |
| `.copilot/copilot-instructions.md` | Templated if missing | Base in-session instructions: read identity, bootstrap, follow startup instructions, use absolute logical paths. |
| `.copilot/config.json` | CLI local state | Agent CLI app state. It is isolated per node but not part of the portable identity contract. |
| `.copilot/settings.json` | CLI local settings | Optional local model and context-tier settings. Prefer deriving these from the node spec in a rebuild. |
| `.copilot/skills/<skill>/SKILL.md` | Vended procedures | Operational runbooks invoked by schedule, operator direction, or task context. |
| `.copilot/session-state/` | Generated runtime state | Agent CLI session state and in-use lock files. Must be node-local. |
| `.copilot/state/bootstrap-retry.json` | Generated runtime state | Bootstrap retry state used by the retry hygiene helper. |
| `.copilot/fleet-session.pid` | Generated runtime state | PID handoff from launcher to liveness and recovery layers. |
| `.appdata/<mcp-bridge>/<version>/bridge-binary` | Runtime binary cache | Local MCP bridge binary in bridged mode. The exact product name and version are not part of the design. |
| `.copilot-cli/<version>/cli-binary` | Runtime binary cache | Candidate agent CLI binaries for the resolver. |
| `fleet-boot.ps1` | Thin wrapper | Sets safe-mode environment when requested and invokes the node boot launcher. |
| `join-cohort.ps1` | Main node launcher | Reads identity, isolates runtime, writes MCP config, syncs skills, builds boot prompt, and starts the CLI through the selected launch path. |
| bridge launch retry helper | Mandatory launch library | Starts the MCP bridge or CLI path, handles bounded retry, and preserves TUI behavior. |
| CLI binary resolver | Mandatory launch library | Selects a runnable CLI binary by local discovery and smoke test. |
| stale-lock cleanup helper | Optional hygiene | Removes dead-PID session locks. Missing or malformed cleanup must not brick boot. |
| `QC-REFRESH.ps1` | Local recycle engine | Replaces a node session in place while preserving continuity and co-tenant safety. |
| tree-independent spawn helper | Local recycle helper | Spawns a successor outside the old process tree using a tiered terminal-broker fallback. |
| `node-manifest.current.json` | Generated manifest | Captures runtime pins, resolved paths, life-service declarations, scheduled jobs, and MCP summary. |
| host launch state file | Generated host-launch state | Records last launch mode, safe-mode, binary category, bridge path, policy source, and successor mode. |
| continuity files | Local continuity aids | Workplan or handoff-format files. They orient the successor but do not replace coordinator authority. |
| `logs/` | Generated diagnostics | Launch, recycle, receipt, and transcript logs. |
| `temp/` | Generated scratch | Node-local scratch only. |

### 1.3 Per-node, templated, generated

| Class | Examples | Rebuild rule |
| --- | --- | --- |
| Per-node private | `fleet-identity.json`, secret values, role prose, local continuity state | Provision explicitly from a secure source. Never commit live values. |
| Shared or templated | boot launcher, recycle engine, binary resolver, skills, instruction template | Vend from a shared release or repository. Detect drift in generated copies. |
| Generated at boot | MCP config, PID file, retry state, manifests, launch receipts | Regenerate. Do not edit as canonical identity. |
| Runtime caches | CLI binary cache, MCP bridge cache, session-state | Restore or redownload as needed, but keep isolated per node. |

Design intent: the node is portable. A mobility bundle should contain only the
private identity, the node spec, access to shared boot assets, and coordinator
reachability. Everything else is coordinator-backed or generated.

---

## 2. Runtime stack

### 2.1 Runtime chain

Bridged mode process shape:

```text
operator or supervisor
  -> host launcher
    -> node boot launcher
      -> local MCP bridge process
        -> MCP bridge helper processes
        -> agent CLI worker
```

Direct mode process shape:

```text
operator or supervisor
  -> host launcher
    -> agent CLI worker with native HTTP MCP config
```

The rebuild should preserve the logical roles, not exact process names.

### 2.2 Agent CLI binary resolution

The resolver should:

1. enumerate candidate install or cache directories under the node-local CLI root
   and optional fallback roots;
2. filter to candidates containing a CLI executable;
3. rank by binary metadata, not directory name;
4. smoke-test each candidate with a bounded `--version`-style command;
5. return the first runnable candidate allowed by policy;
6. fail closed with a clear diagnostic if no runnable candidate exists.

Design intent: prove runnability locally. Do not rely on directory names, stale
pin metadata, or an in-progress updater state.

### 2.3 MCP bridge and MCP config

In bridged mode, the generated MCP config defines a `coordinator` server whose
command is the local MCP bridge binary. The args have this shape:

```json
{
  "mcpServers": {
    "coordinator": {
      "command": "<node-home>/<bridge-cache>/<bridge-binary>",
      "args": [
        "mcp", "remote",
        "--url", "http://<coordinator-host>:<COORD_PORT>/mcp",
        "--header", "Authorization: ******",
        "--header", "X-Node-Token: <coordinator-issued-node-session-token>"
      ]
    }
  }
}
```

In direct mode, the generated MCP config defines a native HTTP MCP server:

```json
{
  "mcpServers": {
    "coordinator": {
      "type": "http",
      "url": "http://<coordinator-host>:<COORD_PORT>/mcp",
      "headers": {
        "Authorization": "******",
        "X-Node-Token": "<coordinator-issued-node-session-token>"
      }
    }
  }
}
```

Header names are part of the design contract. Header values are secrets.

### 2.4 Header auth and token synchronization

Node-side behavior to preserve:

- The launcher reads the private identity file and writes MCP config under the
  node-local CLI home.
- If a node session token is known, the launcher includes it as `X-Node-Token`.
- `Authorization` carries the fleet recovery or bearer credential needed before a
  node token is established.
- A short, bounded preflight may ask the coordinator for the current persistent
  node token before the first CLI spawn. If that preflight fails, boot should
  degrade to the token already in the identity file and continue.
- If a session token exists but the generated MCP config lacks `X-Node-Token`,
  the launcher warns loudly but does not brick the node, because the coordinator
  may still have a fallback path.

Coordinator-side auth precedence and token storage are in `backend-hosting.md`.

### 2.5 Model and context pins

Observed identities had separate fields for model preference, model pin, and
context-tier pin. The launcher passed a model argument only when the pin was
non-empty; an empty pin launched unpinned rather than bricking the node.

Rebuild rule: model and context are important operating policy, but they should
not be launch blockers unless explicitly marked mandatory. Prefer a single node
spec that generates both CLI settings and launch arguments.

### 2.6 Known-good hash ledgers

The reference implementation carried known-good hash ledgers for the CLI, the MCP
bridge, and the recycle engine. A rebuild should preserve the concept, not the
old hashes or versions:

| Binary category | Ledger purpose | Failure contract |
| --- | --- | --- |
| Agent CLI | Allow known-good, fallback, and safe-mode candidates while still proving runnability. | If no allowed runnable candidate exists, fail closed with a clear diagnostic. |
| MCP bridge | Ensure the bridge binary is a known-good local artifact before bridged launch. | Refuse or loud-degrade according to policy; never silently run an untrusted bridge. |
| Recycle engine | Ensure the in-place recycle script is the expected artifact before it kills or spawns sessions. | Fail loud before point of no return. |

Safe-mode is a one-launch fallback lane: choose a preapproved conservative binary
or bridge artifact for recovery, then return to normal policy on the next launch.

---

## 3. Identity file schema

### 3.1 Field model

| Field | Shape | Secret? | Purpose |
| --- | --- | --- | --- |
| `node_id` | stable string | No | Coordinator identity for the node. Use `<NODE_ID>` in examples. |
| `role` | string | No | Human-readable role such as architect, builder, PM, reviewer, analyst, or operations. Coordinator role records remain authoritative. |
| `capabilities` | array or object | Usually no | Optional capability claims or routing hints. Avoid private prose in public examples. |
| `working_dir` | logical path | No if placeholder | Node home location. Use `<node-home>` in docs. |
| `coordinator_url` | URL shape | Endpoint-sensitive | MCP endpoint shape, for example `http://<coordinator-host>:<COORD_PORT>/mcp`. |
| `rest_base` | URL shape | Endpoint-sensitive | Optional REST base. Prefer deriving it from `coordinator_url`. |
| `dashboard_url` | URL shape | Endpoint-sensitive | Optional operator dashboard link. |
| `auth_token` | opaque secret | Yes | Recovery or fleet bearer credential used before node token is established. |
| `session_token` | opaque secret | Yes | Coordinator-issued persistent node token written after bootstrap. |
| `source_hosting_token` | opaque secret | Yes | Optional personal access token for a source-hosting service. |
| `model` | string | No | Preferred model label. |
| `model_pin` | string | No | Model argument passed by launcher when non-empty. |
| `context_tier_pin` | string | No | Context-tier policy. |
| `mcp_mode` | enum | No | `bridged` or `direct`. Replaces deployment-specific mode names. |
| `startup_instructions` | prose | Potentially sensitive | Node-specific mandate and prohibitions. Prefer coordinator authority. |
| `cli_binary_policy` | object | No secret, but can leak paths/hashes | Known-good ledger, floor, exact pin, and safe-mode fallback for the agent CLI. |
| `bridge_binary_policy` | object | No secret, but can leak paths/hashes | Known-good ledger and verification rules for the MCP bridge. |
| `recycle_engine_policy` | object | No secret, but can leak paths/hashes | Known-good ledger and verification rules for the recycle engine. |

### 3.2 Sanitized example

```json
{
  "node_id": "<NODE_ID>",
  "role": "<architect|builder|pm|reviewer|analyst|operations>",
  "working_dir": "<node-home>",
  "coordinator_url": "http://<coordinator-host>:<COORD_PORT>/mcp",
  "rest_base": "http://<coordinator-host>:<COORD_PORT>",
  "auth_token": "<fleet recovery credential>",
  "session_token": "<coordinator-issued node session token>",
  "source_hosting_token": "<optional personal access token>",
  "model_pin": "<model id or empty>",
  "context_tier_pin": "<context tier or empty>",
  "mcp_mode": "<bridged|direct>",
  "startup_instructions": "<private startup prose or coordinator reference>",
  "cli_binary_policy": {
    "known_good_ledger": [
      { "sha256": "<sha256>", "role": "<primary|fallback|safe-mode>" }
    ],
    "safe_mode": { "sha256": "<sha256>", "source": "<trusted artifact source>" }
  },
  "bridge_binary_policy": {
    "known_good_ledger": [
      { "sha256": "<sha256>", "role": "primary" }
    ]
  },
  "recycle_engine_policy": {
    "known_good_ledger": [
      { "sha256": "<sha256>", "role": "primary" }
    ]
  }
}
```

### 3.3 Required minimum and practical minimum

Minimum viable node identity:

1. `node_id`.
2. `working_dir` as `<node-home>`.
3. `coordinator_url` as a placeholder-resolved endpoint.
4. `auth_token` from a secret store.
5. `mcp_mode`.
6. Optional `session_token`, empty on first boot if bootstrap can mint it.
7. Model/context policy or an explicit decision to run unpinned.
8. Binary policies if the rebuild keeps hash gates.

### 3.4 Read/write responsibilities

| Actor | Reads | Writes |
| --- | --- | --- |
| Provisioner | Node spec, secret store, binary policy | Initial private identity file. |
| Node launcher | Identity, token fields, binary policy, launch mode | Generated MCP config, launch state, logs. |
| Agent CLI boot prompt | Identity path and node id | Persists `session_token` returned by bootstrap. |
| Coordinator bootstrap tool | Node id and token proof | Returns or mints the persistent node token. |
| Recycle engine | Node id, node home, launch mode, binary policy | Recycle sentinels, failure flags, successor launch state. |
| Pin tooling | Binary policy and local artifacts | Updated private ledgers and redacted manifests. |

Security invariant: the identity file is private operational state. A public repo
may contain schema and placeholders only.

---
## 4. Instructions layering

### 4.1 Layers

| Layer | Where it comes from | Role |
| --- | --- | --- |
| Runtime and repository policy | Agent CLI runtime plus repo instructions | Highest priority; outside COHORT runtime design. |
| `.copilot/copilot-instructions.md` | Generated or templated in the node home | Base instruction to read identity, bootstrap, follow startup instructions, check inbox, and use logical absolute paths. |
| Boot prompt in `join-cohort.ps1` | Passed to the agent CLI at launch | Primary implementation source for boot ordering. |
| Coordinator-served startup instructions | Returned or referenced after bootstrap | Node-specific mandate, role constraints, and current operating instructions. |
| Skills | `.copilot/skills/<skill>/SKILL.md` | Procedure-level runbooks invoked by schedule, operator direction, or task context. |
| Continuity files | Workplan, handoff, or memory records | Context for current work; not completion authority. |

### 4.2 Base instruction contract

The base node instruction file should say, in generic form:

- read `<node-home>/fleet-identity.json`;
- call `bootstrap_node()` with `node_id`;
- follow coordinator startup instructions;
- share durable learnings through the agreed knowledge mechanism;
- coordinate decisions through the cohort;
- check inbox on boot;
- use logical absolute paths such as `<node-home>` and `<shared-root>`;
- follow the heartbeat or poll protocol from its canonical source, not ad-hoc
  sleep loops.

### 4.3 Boot prompt as implementation

The boot prompt embedded in the node launcher is a load-bearing implementation
source. It orders the model's first in-session actions:

1. choose operating mode according to `core-contracts.md` section 8;
2. in automated mode, register the local safety-net poll schedule before any coordinator call; in manual mode, create no recurring schedule;
3. call `bootstrap_node(<NODE_ID>)`;
4. branch if the bootstrap response says the node is halted;
5. before automated-mode bootstrap retries, invoke the bootstrap retry hygiene helper;
6. on successful bootstrap, clear retry state;
7. save the returned `session_token` into the private identity file;
8. in automated mode, call `confirm_life_services` with truthful schedule proof; in manual mode, record manual mode per `core-contracts.md` section 8;
9. check inbox and answer substantive unread messages;
10. read continuity state before resuming work.

Design intent: a local safety net must exist even if the coordinator is
unreachable. A coordinator-gated safety net is a single point of silent session
loss.

### 4.4 Precedence and conflict handling

Practical rebuild rule:

1. Security and runtime policy always wins.
2. Boot ordering comes from the launcher boot prompt.
3. Coordinator startup instructions provide the current mandate after bootstrap.
4. Skills are scoped runbooks, not global overrides.
5. Continuity files orient the node but do not grant authority or mark work done.

Unverified: the exact agent CLI precedence rules among base instructions, boot
prompt, skills, and MCP-provided instructions. The design should avoid relying on
ambiguous precedence.

---

## 5. Launch chain end to end

### 5.1 Host launcher

The host launcher is the operator or supervisor entry point. Its responsibilities
are generic:

1. read launch state;
2. classify failures as retryable or stop-and-repair;
3. resolve the node-local CLI binary;
4. optionally repair or stage the MCP bridge binary;
5. invoke the node boot launcher in bridged mode or direct mode;
6. write redacted launch state and receipts;
7. expose a plan or resolve-only mode for diagnostics.

State file purpose: record the last launch mode, safe-mode flag, binary category,
selected paths as logical locations, policy source, and the successor mode for the
next launch. Safe-mode should be one-shot unless a human or policy explicitly
keeps it armed.

### 5.2 Launch modes

| Mode | MCP shape | Main use |
| --- | --- | --- |
| Bridged mode | `command` plus `mcp remote` args | Use when a local MCP bridge is required between the CLI and the remote MCP endpoint. |
| Direct mode | native HTTP MCP config | Use when the CLI can reach the coordinator MCP endpoint directly. |

Launch mode must be explicit in node config. Do not infer it from the incidental
presence of generated scripts or stale files.

### 5.3 Node wrapper

`fleet-boot.ps1` is a thin wrapper around the node boot launcher. It may translate
safe-mode into a process-scoped environment variable, then invoke the main
launcher with the node id and return the child exit code.

### 5.4 Main node launcher

The main node launcher should:

1. resolve shared assets without depending on deployment-specific paths;
2. read identity and set process-scoped node-id environment;
3. resolve explicit launch mode;
4. set process-scoped source-control identity if the node performs commits;
5. initialize optional recycle hooks in fail-open mode;
6. surface prior failure flags;
7. create node-local runtime directories;
8. apply best-effort session-state hygiene;
9. write MCP config from identity and launch mode;
10. generate base instructions if missing;
11. build the boot prompt;
12. load mandatory launch libraries and verify their functions exist;
13. load optional cleanup helpers only behind fail-open guards;
14. launch the CLI or bridge without capturing TUI output.

### 5.5 Binary resolution and gates

| Surface | Policy |
| --- | --- |
| Agent CLI | Select a runnable local binary through bounded smoke tests and policy checks. Fail closed if none exists. |
| MCP bridge | Verify against a private known-good ledger before bridged launch. Refuse or loud-degrade according to policy. |
| Recycle engine | Verify before any point-of-no-return action. Fail loud if the local recycle engine is not known-good. |

Compatibility note: if an older identity still contains deployment-era pin field
names, a rebuild can read them through a migration adapter, but public docs should
show generic policy names only.

### 5.6 Gate refusal behavior

| Surface | Missing or bad condition | Behavior | Rationale |
| --- | --- | --- | --- |
| CLI binary | No smoke-test-passing candidate | Fail closed with explicit diagnostic | A node cannot run without the CLI. |
| Mandatory launch library | File absent, parse-broken, or function missing | Abort before partial launch | A partial launch is harder to recover than a loud failure. |
| Optional stale-lock cleanup | File absent or helper errors | Skip and continue boot | Hygiene must not become a boot dependency. |
| MCP header write | Session token exists but `X-Node-Token` is absent | Warn loudly, continue | Header auth is preferred, but fallback auth may keep the node reachable. |
| Bootstrap retry helper | Helper missing or emits unknown verdict | Default to retry | A missing hygiene helper must not block bootstrap. |
| Host launcher failure | Deterministic failure classification | Stop and repair | Avoid retry storms and repeated destructive attempts. |
| Host launcher handoff | Transient handoff failure | Bounded retry | Preserve resilience without unbounded loops. |

### 5.7 Terminal ancestry and process-tree independence

A recycle successor must not be a child of the old session process tree. The
recycle spawn helper should use a tiered cascade:

1. preferred terminal broker path, which parents the successor outside the old
   process tree;
2. portable terminal broker fallback, preserving the same independence invariant;
3. operating-system process creation fallback, marked degraded because it may lose
   normal terminal affordances;
4. fail closed if all tiers fail.

Non-node utility spawns should bypass the terminal cascade. Classify by payload:
a node successor needs tree independence; a diagnostic helper usually does not.

### 5.8 Session locks and retry/backoff

| Mechanism | Scope | Contract |
| --- | --- | --- |
| Session-state locks | `<node-home>/.copilot/session-state/**/inuse.<pid>.lock` | Remove only locks whose owner PID is no longer alive. Preserve live locks. |
| Launch exit retry | Bridge or CLI exits with the known session-corruption code | Stash session-state and retry within a bounded attempt budget. |
| Bootstrap retry hygiene | `bootstrap_node` fails or coordinator is unreachable | Emit `GO`, `SKIP`, `GIVEUP-PROBE`, `GIVEUP-DONE`, or `CLEARED`; persist state; write visible give-up flags. |

PowerShell invariant: do not capture the launch function's pipeline output into a
variable. That can redirect the TUI stream and cause a silent quick exit or wedged
terminal. Call the launch function bare and read `$LASTEXITCODE` afterward.

---

## 6. Boot sequence inside the session

### 6.1 In-session order

The launched session must execute this order:

1. apply `core-contracts.md` section 8 for the selected operating mode;
2. in automated mode, create the local safety-net schedule; in manual mode, create no recurring schedule;
3. call `bootstrap_node(<NODE_ID>)`;
4. if halted, follow the halt-and-wake procedure instead of normal boot;
5. if automated bootstrap fails, stay alive and let the safety net re-fire; if manual bootstrap fails, report and stop until the next explicit wake;
6. before each automated retry, consult bootstrap retry hygiene;
7. clear retry state after success;
8. persist returned `session_token`;
9. in automated mode, call `confirm_life_services` with truthful proof; in manual mode, record manual mode per `core-contracts.md` section 8;
10. check inbox and answer unread messages;
11. read continuity state before accepting or resuming work.

### 6.2 Safety-net schedule first

The poll schedule is local to the CLI session. In automated mode, it must be registered before any coordinator call so an unavailable coordinator cannot prevent the node from scheduling its own recovery attempts. In manual mode, section 8 of `core-contracts.md` overrides schedule-first: no recurring schedule is created, and a failed bootstrap waits for the next explicit operator wake.

Automated mode uses a short bootstrap cadence, then the normal steady cadence after life services are confirmed. The exact cadence is deployment policy; the mode split is the invariant.

### 6.3 Bootstrap retry hygiene state machine

The retry helper separates trigger from decision. The scheduled poll or boot
prompt triggers the helper; the helper decides whether a bootstrap retry should
occur.

| Verdict | Meaning | Node action |
| --- | --- | --- |
| `GO` | Retry now | Call `bootstrap_node`. |
| `SKIP <secs>` | Backoff has not elapsed | Do not retry this tick; surface status. |
| `GIVEUP-PROBE` | Main retry budget is exhausted, but slow probe is allowed | Retry once as a recovery probe. |
| `GIVEUP-DONE` | Probe budget is exhausted | Stop retrying; surface an operator-visible give-up flag. |
| `CLEARED` | Success cleanup completed | Continue normal boot. |

Fail-open rule: if the helper cannot be executed or emits an invalid verdict, the
node defaults to `GO`. Missing retry hygiene must not block bootstrap.

### 6.4 Token persistence

Token flow:

1. The launcher may do a short bounded preflight with the recovery credential to
   obtain the current node token before writing MCP config.
2. The in-session bootstrap call returns the authoritative session token.
3. The session writes that token back to the private identity file.
4. Future MCP config generation sends it in `X-Node-Token`.

The token value is never public, never logged, and never placed in documentation.

### 6.5 Life-services confirmation

After bootstrap and token persistence, an automated node calls `confirm_life_services` with truthful proof. Proof should cover at least the local poll schedule, MCP connectivity, and the configured liveness relationship. A manual-mode node instead records manual mode according to `core-contracts.md` section 8 and must not claim a schedule. The coordinator-side gate is documented in `backend-hosting.md` and `core-contracts.md`.

### 6.6 Inbox and continuity

After automated life-services confirmation, or after manual-mode recording for a foreground wake, the node checks its inbox and then reads the
current continuity source. Local workplans and handoff files are orientation aids;
coordinator task, lifecycle, and review state remain authoritative.

---

## 7. Life services and operating modes

### 7.1 Poll skill

The poll skill is the node's clock. It processes unread messages, responds, and
acknowledges. Without a scheduled prompt or explicit manual wake, a CLI node is
inert between turns.

Design contract:

- automated bootstrap creates a short-cadence safety net;
- automated steady state uses the fleet cadence configured by policy;
- manual mode creates no recurring schedule and relies on explicit wakes;
- the poll skill should surface give-up flags and other local failure flags;
- inbox processing must acknowledge only after substantive handling.

### 7.2 Breathbus relation, node side only

Node-side relation:

- the node is a liveness consumer;
- the breathbus daemon or equivalent sidecar is required only if the rebuild keeps
  that life-service architecture;
- local health checks and rider liveness proof are node-side evidence;
- daemon tokens, rider endpoints, and coordinator gates are server-side and belong
  in `backend-hosting.md`.

### 7.3 Manual mode

Manual mode changes the operating loop, not identity or authentication:

- bootstrap still establishes the session;
- manual mode is explicitly recorded;
- schedule-driven polling is not armed;
- an explicit wake may process inbox and TotemTask work once;
- the session then remains idle until another command.

---
## 8. Skills catalogue

A rebuild should treat skills as versioned procedure files. The exact skill set is
role-dependent, but these are the core design roles observed in the reference
implementation.

| Skill role | Purpose | Trigger | Core? |
| --- | --- | --- | --- |
| Poll safety net | Inbox poll, response, acknowledgement, failure-flag surfacing, and steady heartbeat-like attention. | Scheduled prompt after launch; explicit wake in manual mode. | Core |
| Coordinator protocol | Quick reference for messaging, task lifecycle, consensus, and lifecycle transitions. | Any coordinator action beyond routine poll. | Core |
| Idle-routing gate | Prevents an idle poll from being misread as productive work; enforces claim, proof, and routing checks. | Idle node, open-pool work, PM routing, or self-route fail-safe. | Core for autonomous mode |
| TotemTask/manual workflow | Manual-mode work execution and proof-line discipline. | Manual mode or operator-relayed daily plan. | Core for manual mode |
| TrueMolt/recycle | Controlled in-place recycle procedure: announce, check conflict, save state, invoke recycle engine. | Clean recycle boundary after gates pass or explicit operator direction. | Core if nodes self-recycle |
| Boomerang usage | Reference for throwing, catching, returning, and querying delegated work packets. | On demand before using that workflow. | Optional but recommended |
| Coordinator maintenance | Database and coordinator health triage and sanctioned maintenance. | Operator reports sluggishness, post-restart checks, or ops duty. | Optional; ops-role core |
| Coordinator restart | Sanctioned restart procedure with authorization and receipts. | Explicit restart work. | Optional; ops-role core |
| Council host | Vessel-host runbook for multi-lens deliberation. | Council summon. | Optional; role-specific |
| PM sweep | PM-side routing of staged work to idle nodes. | PM cadence when enabled. | Optional; PM-role core |
| Review and analysis helpers | Diff analysis, review scaffolds, knowledge review, or incident response. | Role-specific tasks. | Optional |

Rebuild rule: install the minimal core set for every autonomous node, then add
role-specific skills from a shared release. Do not hand-edit per-node skill
copies; update the shared source and revendor.

---

## 9. Molt, QC-REFRESH, and in-place recycle

### 9.1 Concept

Molt is controlled replacement of a node session while preserving continuity and
safety. It is not an ad-hoc process kill. The current self-recycle path is a
skill-driven procedure that invokes `QC-REFRESH.ps1` or its generic successor.

### 9.2 Recycle gates

Preserve these gates:

- Do not self-recycle before the minimum-age gate unless explicitly directed.
- Treat session age, tool volume, context size, and task boundary as context, not
  automatic triggers.
- Save continuity before point of no return.
- Announce intent when the coordination protocol requires it.
- Check for same-host or co-tenant recycle conflicts.
- Apply a courtesy delay when policy requires it.
- Verify the recycle engine against its known-good ledger before it can kill or
  spawn sessions.

### 9.3 Recycle engine behavior

The recycle engine should:

1. resolve identity from `<node-home>/fleet-identity.json`;
2. read `node_id`, `<node-home>`, coordinator URL shape, and launch mode;
3. choose direct or bridged successor launch according to explicit mode;
4. publish node-id environment to child processes;
5. create an atomic recursion guard for the node;
6. reclaim stale guards but abort on live competing guards;
7. re-launch the reaper body into a process tree independent from the old session;
8. start durable logging before destructive actions;
9. record recycle start time and session PID surfaces;
10. write a fresh recycle sentinel before killing old processes;
11. kill old first so session locks are released;
12. spawn the successor;
13. verify observed runtime;
14. retry within a bounded policy if verification fails;
15. fail loudly and leave evidence if successor verification cannot be proven.

### 9.4 Successor boot

The successor re-enters normal node boot:

1. launch wrapper;
2. node launcher;
3. MCP config generation;
4. CLI or bridge start;
5. operating-mode boot rule from `core-contracts.md` section 8;
6. bootstrap;
7. token persistence;
8. automated life-services confirmation or manual-mode recording;
9. inbox and continuity read.

Load-bearing continuity surfaces:

- private identity and session token;
- coordinator handoff or memory state;
- local workplan or handoff files;
- recycle sentinel to distinguish reaper kills from session corruption;
- boot-time surfacing of prior failure flags;
- coordinator lifecycle state.

### 9.5 What not to do

- Do not start a second full launcher on a live node for a narrow maintenance
  task. Provide maintenance-only entry points.
- Do not spawn a successor as a descendant of the old session's process tree.
- Do not bypass continuity save before point of no return.
- Do not let optional recycle modules block core boot.
- Do not silently fall back to the wrong MCP config shape.
- Do not target host-wide terminal brokers or co-tenant windows when only one node
  should recycle.

---

## 10. Co-tenancy

### 10.1 Co-tenancy surfaces

Multiple nodes can share one host if every mutable surface is node-scoped.

| Surface | Isolation rule |
| --- | --- |
| Node home | Each node has a distinct `<node-home>`. |
| CLI home | Each node has its own `.copilot` or equivalent CLI home. |
| MCP config | Generated under the node-local CLI home; never shared through a user-global config file. |
| Session state | Locks and state live under the node-local CLI home. |
| Runtime app data | Bridge and CLI caches are node-scoped or read-only shared with explicit policy. |
| Logs | Logs and receipts include node identity and do not share mutable files. |
| Scheduled jobs | Job names and payloads are node-scoped unless deliberately host-wide. |
| Window or terminal targeting | Recycle uses node-specific handles or strict scoping. |
| Shared repositories | Shared worktrees are contention surfaces; use per-node clones or advisory dirty-tree checks. |
| Launch mode | Direct vs bridged mode is explicit per node. |

### 10.2 Rebuild isolation rules

1. Every node gets its own home, CLI home, app-data cache, logs, temp, and
   session-state directories.
2. No two nodes share writable MCP config.
3. No node removes another node's session lock.
4. Per-node identity and source-control identity are process-scoped, not
   host-global.
5. Shared worktrees require dirty-tree checks, locking, or replacement with
   per-node clones.
6. Schedules, services, logs, and terminal windows include node-specific labels.
7. A recycle targets only its own old session and its own successor.

---

## 11. Rebuild procedure for one node

This procedure is generic. It is intentionally free of old host names, paths,
ports, hashes, and binary versions.

### 11.1 Prerequisites

1. A Windows host or equivalent environment capable of running PowerShell, the
   agent CLI, and the chosen terminal or supervisor.
2. Network reachability from the node to `http://<coordinator-host>:<COORD_PORT>`.
3. A running coordinator; see `backend-hosting.md`.
4. A secure source for recovery credentials and optional source-hosting tokens.
5. A shared release or repository containing node boot scripts, recycle scripts,
   skills, and templates.
6. A CLI binary source and, if using bridged mode, an MCP bridge binary source.
7. Optional breathbus or equivalent liveness sidecar if the rebuild keeps that
   life-service design.

### 11.2 Provision files

1. Create `<node-home>`.
2. Create node-local runtime directories for CLI home, skills, app data, CLI
   binary cache, logs, and temp.
3. Copy or render shared scripts into the node home: boot wrapper, node launcher,
   bridge launch retry helper, CLI resolver, optional stale-lock cleanup,
   recycle engine, and tree-independent spawn helper.
4. Vend core skills into the node-local skills directory.
5. Create base instructions from the template or let the launcher generate them.
6. Do not hand-create MCP config except for diagnostics; the launcher writes it
   every boot.

### 11.3 Create identity

1. Create `fleet-identity.json` from the sanitized schema in section 3.
2. Fill `node_id`, `<node-home>`, `coordinator_url`, `auth_token`, `mcp_mode`, and
   model/context policy.
3. Leave `session_token` empty on first boot if the coordinator can mint it.
4. Add known-good hash ledgers only from trusted local artifact verification.
5. Store secrets from a secret manager or secure local provisioning channel.
6. Validate JSON and keep public examples placeholder-only.

### 11.4 Install runtime binaries

1. Install or stage the agent CLI under a node-local or policy-approved root.
2. Verify at least one CLI candidate passes a bounded version smoke test.
3. If using bridged mode, stage the MCP bridge binary under the node-local bridge
   cache.
4. If enforcing binary ledgers, hash the local artifact and update the private
   known-good ledger.
5. If using safe-mode, stage a conservative fallback artifact and verify the
   launcher can select it for one launch.

### 11.5 First launch

Run the host launcher or the node wrapper against `<node-home>` and `<NODE_ID>`.
Expected observations:

1. node launcher reads identity;
2. runtime directories exist;
3. MCP config is generated with the correct direct or bridged shape;
4. CLI session starts;
5. operating mode follows `core-contracts.md` section 8;
6. automated mode creates the safety-net schedule before bootstrap, while manual mode creates none;
7. `bootstrap_node` succeeds or the mode-appropriate retry rule applies;
8. `session_token` is persisted;
9. automated mode calls `confirm_life_services` with truthful proof, while manual mode records manual state;
10. inbox is checked;
11. continuity is read.

### 11.6 Post-launch configuration

1. Confirm steady-state poll cadence and operating mode.
2. Confirm manual mode, if enabled, suppresses scheduled polling.
3. Confirm node manifest or equivalent redacted runtime report.
4. Confirm liveness state from node and coordinator views.
5. Run a controlled recycle only after the node is otherwise healthy.

---

## 12. Acceptance tests for a node

### 12.1 Static file tests

| Test | Expected result |
| --- | --- |
| Identity parse | Valid JSON; required fields present; secrets not printed. |
| Instructions file | Exists or is generated; points to `<node-home>/fleet-identity.json`. |
| Skills directory | Core skills exist with `SKILL.md`. |
| Launcher parse | PowerShell parser accepts changed scripts. |
| MCP config | Generated only under node-local CLI home. |
| Public docs | Placeholders only; no live endpoints, paths, hashes, tokens, users, or host names. |

### 12.2 Binary tests

| Test | Expected result |
| --- | --- |
| CLI resolver | Returns a runnable CLI binary after bounded smoke test. |
| Bridge path | If bridged mode, the bridge binary exists at the logical node-local bridge cache. |
| Bridge pin | If enforced, bridge hash is in the private known-good ledger. |
| Recycle pin | If enforced, recycle engine matches the private known-good ledger. |
| Safe-mode | Safe-mode selects the intended fallback artifact for one launch. |

### 12.3 Launch tests

| Test | Expected result |
| --- | --- |
| Plan mode | Reports launch mode, binary category, MCP shape, and policy source without secrets. |
| Real launch | CLI session starts and renders; TUI output is not captured into a variable. |
| MCP config | One `coordinator` server with correct mode and header names. |
| Header warning | Missing `X-Node-Token` with a known token warns loudly but does not brick. |
| Operating-mode boot | Automated mode schedules before coordinator bootstrap; manual mode creates no recurring schedule. |
| Bootstrap | Succeeds or retry helper emits bounded verdicts. |
| Token persistence | Returned token is written to private identity. |
| Life services | Automated `confirm_life_services` succeeds with truthful proof; manual mode records manual state without schedule proof. |
| Inbox | Unread messages are processed according to protocol. |

### 12.4 Failure-path tests

| Test | Expected result |
| --- | --- |
| Missing optional cleanup | Boot skips cleanup and still launches. |
| Missing mandatory launch helper | Boot fails loudly before partial launch. |
| Broken newest CLI | Resolver skips it and tries next allowed runnable candidate. |
| No runnable CLI | Resolver fails closed. |
| Coordinator unreachable | Automated safety-net schedule exists and retry helper controls demand; manual mode reports and waits for the next explicit wake. |
| Retry ceiling | Give-up flag is written and surfaced; no unbounded loop. |
| Stale lock | Dead-PID lock removed; live-PID lock preserved. |
| Wrong MCP mode | Validation fails loudly. |
| Co-tenant recycle | Reaper targets only this node. |
| Tree independence | Successor is not descendant of the old session process tree. |

---
## 13. Load-bearing invariants

I-1. A node is durable identity plus disposable session, not the current model
context.

I-2. The private identity file is never committed with live values.

I-3. Automated mode registers the local safety-net schedule before the first coordinator call; manual mode creates no recurring schedule and retries only on explicit wake.

I-4. MCP config is node-local and generated at boot.

I-5. Coordinator secrets move in transport headers, not model-visible tool args,
where the transport supports it.

I-6. The session token returned by bootstrap is persisted back to private identity.

I-7. Optional hygiene fails open; mandatory launch substrate fails loud.

I-8. CLI selection proves runnability with bounded smoke tests.

I-9. Bridge and recycle-engine integrity gates compare local bytes to private
known-good ledgers before privileged action.

I-10. TUI launch output is not captured through a PowerShell variable.

I-11. Session-state locks are node-local and PID-scoped.

I-12. Bootstrap retries are bounded, stateful, and visible.

I-13. Life-services proof is truthful and occurs after bootstrap; manual mode records a gate exemption without claiming a schedule.

I-14. Manual mode changes scheduling, not identity or authentication.

I-15. Recycle saves continuity before point of no return.

I-16. Recycle successor spawn is process-tree independent from the old session.

I-17. Co-tenants do not share writable MCP config, session state, logs, scheduled
job names, or window-targeting surfaces.

I-18. Generated files are mirrors or runtime state, not canonical identity.

I-19. Shared worktrees are contention-prone and need locks, per-node clones, or
visible dirty-tree checks.

I-20. Receipts and manifests redact token-like, authorization-like, path-like, and
opaque values before persistence.

---

## 14. Pitfalls and caveats

These are design lessons, not incident narrative.

| Pitfall | Rebuild constraint |
| --- | --- |
| Coordinator-gated schedule | Register the local safety net before bootstrap. |
| User-global CLI config | Use node-local CLI home and node-local MCP config. |
| Stale MCP config shape | Generate config every boot from identity and explicit mode. |
| Token in tool args | Prefer `X-Node-Token` header and treat fallback args as temporary. |
| Optional helper as boot dependency | Separate optional hygiene from mandatory launch functions. |
| Function silently undefined | After loading mandatory helper code, verify the expected function exists. |
| Directory name as version proof | Rank by binary metadata and smoke test. |
| Hash-only CLI gate during updates | Combine policy with runnability proof. |
| TUI output capture | Call launch functions bare and read the exit code afterward. |
| Unbounded bootstrap retry | Use backoff, probe state, and visible give-up flags. |
| Wrong launch mode | Store direct vs bridged mode explicitly and validate generated config. |
| Descendant successor | Use terminal broker or equivalent process-tree independence. |
| Broad window matching | Target node-specific handles; fail safe by leaving an orphan rather than closing a co-tenant. |
| Shared checkout edits | Warn, lock, or use per-node clones. |
| Manual mode misread as broken node | Manual mode intentionally disables schedule-driven loops. |
| Public docs leaking deployment facts | Use placeholders for all endpoints, paths, users, hosts, hashes, tokens, and ports. |

---

## 15. Assessment: keep, simplify, drop

This section is opinion.

### 15.1 Keep

- Node-local home per agent node.
- Private identity file plus public schema.
- Schedule-first boot ordering.
- Header-based node token path.
- Bounded bootstrap retry helper.
- Runnable-binary resolver.
- Explicit direct vs bridged MCP mode.
- Tree-independent recycle successor spawn.
- Co-tenant isolation rules.
- Skills as versioned procedure files.

### 15.2 Simplify

- Collapse launch-mode maps into one `mcp_mode` field and one validator.
- Derive REST base from coordinator MCP URL unless explicitly overridden.
- Replace per-node hand-copied scripts with a signed release bundle and manifest,
  while keeping node-local cached copies for degraded boot.
- Generate instructions, MCP config, and runtime manifest from a single node spec.
- Store binary policy as a compact known-good ledger plus safe-mode fallback, not
  as a long history.
- Use one redacted receipt schema across host launch, node boot, and recycle.

### 15.3 Drop or retire

- Any fallback that embeds previous host names, network paths, drive letters, or
  topology-specific maps.
- Deployment-specific mode names.
- User-global config assumptions.
- Long incident prose once the invariant is documented and tested.
- Any runtime path that requires a live secret in a model-visible tool argument
  after header auth is available.

---

## 16. Unresolved and unverified

Design-level gaps left open:

1. The exact coordinator-side implementation of `bootstrap_node`,
   `confirm_life_services`, session-token persistence, and fallback token
   injection is delegated to `backend-hosting.md`.
2. The full recycle-engine hash-gate refusal matrix was not traced here; the
   design requirement is clear, but a rebuild should specify exact refusal and
   recovery behavior.
3. Coordinator-served startup instructions were not read in this task. The design
   assumes they remain authoritative after bootstrap.
4. Direct-mode launchers were not traced exhaustively. The generic MCP config
   shape is documented; each implementation still needs conformance tests.
5. Breathbus node-side installation is intentionally summarized here; server and
   daemon details belong in `backend-hosting.md`.
6. The exact instruction precedence inside the agent CLI should be tested by the
   rebuild rather than inferred.
7. The v2 host launcher may differ from the reference host launcher. Preserve the
   functional contracts, not the old implementation layout.
8. Workplan file contents were not copied. Only their continuity role is captured.
9. Live host facts, live coordinator database facts, and MCP calls were not used
   because this task was document-only and offline.

---

## Appendix A. Evidence quick map

| Topic | Primary evidence anchor |
| --- | --- |
| Rebuild conventions | `cohort/docs/rebuild/README.md`, `labor-division.md` |
| Genericity policy | `cohort/docs/source-reference-policy.md` |
| Boot overview | `cohort/docs/systems/fleet-boot.md` |
| Identity and continuity overview | `cohort/docs/systems/identity-and-memory.md` |
| Molt overview | `cohort/docs/systems/lifecycle-and-molt.md` |
| Backend/server side | `cohort/docs/rebuild/backend-hosting.md` |
| Node launcher | `join-cohort.ps1` |
| Thin boot wrapper | `fleet-boot.ps1` |
| Bootstrap retry helper | bootstrap retry helper script |
| CLI resolver | CLI binary resolver script |
| MCP bridge launch | bridge launch retry helper |
| Stale lock cleanup | stale-lock cleanup helper |
| Recycle | `QC-REFRESH.ps1`, tree-independent spawn helper |
| Host launch chain | host launcher architecture notes |
| Template split | node template manifest |
| Identity schema | node identity schema |
| Skills | `.copilot/skills/<skill>/SKILL.md` |
