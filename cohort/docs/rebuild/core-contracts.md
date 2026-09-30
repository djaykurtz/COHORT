# Core coordinator contracts for rebuild

This document defines the minimum compatible coordinator behavior needed first in a rebuild. Deployments choose their own host names, network addresses, database backend, and process supervisor. Contract names, tool names, parameter names, field names, environment variable names, and state values are normative.

## 1. Scope and compatibility rules

Implement first: node authentication, session locks, `bootstrap_node`, inbox, heartbeat, messaging, task create/update, task evidence, LIFE_SERVICES_GATE, core state machines, restart fencing, restore proof, and manual-mode boot.

MCP is JSON-RPC 2.0 over `POST /mcp`. Calls with `id` return a JSON-RPC result or error. Notifications without `id` return HTTP 202. Tool success is:

```json
{"jsonrpc":"2.0","id":"id","result":{"content":[{"type":"text","text":"<json object as string>"}]}}
```

Errors use JSON-RPC codes `-32700` parse error, `-32600` invalid request, `-32601` unknown method/tool, `-32602` invalid parameters, and `-32000` domain or internal error. The transport must strip spoofable `_caller_node_id`, `_caller_role`, `_identity_proof`, and `_client_ip` before injecting trusted values.

## 2. Authentication and identity

Credential types:

- Legacy session token: opaque token stored in `node_identities.session_token` and `node_session_tokens`.
- Node secret: per-node secret; store only `node_secret_hash = SHA256(node_secret)`.
- JWT bearer token: short-lived HS256 token minted from a valid node secret, with issuer `coordinator` and subject equal to node ID.
- Shared REST token: `AUTH_TOKEN`; only for endpoints that explicitly allow shared fleet auth.
- `_session_token`: MCP argument fallback when headers are stripped.

MCP identity resolution order:

1. Validate `X-Node-Token` against the in-memory token map, then durable token rows.
2. If unresolved, validate `arguments._session_token` the same way.
3. For reference compatibility, `register_node` may create an allowlisted, never-seen node without a node token; `bootstrap_node` then accepts first contact only for an already registered node without an active session token.
4. Otherwise the caller is anonymous and only explicit unauthenticated tools may run.

First-contact registration ceremony:

1. An operator or provisioning system creates an allowlist entry and/or registers the node row before first bootstrap.
2. The node receives a private `node_id` and either an operator-provisioned `node_secret` or an allowlist/provisioning record that permits exactly that `node_id`.
3. First `bootstrap_node` may present `node_secret`; the coordinator stores only `node_secret_hash`.
4. Successful bootstrap returns the legacy `session_token`; later bootstraps must prove the same node through `X-Node-Token` or `_session_token`, except for explicit stale/orphaned recovery policy.

Reference gap: the reference permits first unauthenticated registration of an allowlisted never-seen `node_id`, and `node_secret` registration is optional. v2 MUST require an operator-provisioned node secret or an operator-maintained allowlist/provisioning entry before first bootstrap, and MUST reject first contact for a `node_id` that is neither pre-provisioned nor presenting the correct secret.

REST identity resolution order:

1. `X-Node-Token` or `X-Session-Token`.
2. JWT-shaped token verification.
3. `Authorization: Bearer <jwt>` for JWT-shaped tokens.
4. `Authorization: Bearer <shared-rest-token>` only where shared fleet auth is allowed.

Token rules:

- `node_secret` must be at least 32 characters.
- `/api/auth/refresh` accepts an operator-provisioned node secret in the authorization header, resolves its hash, rate-limits refresh, and mints a short-lived JWT.
- Legacy tokens are minted on successful bootstrap when no valid token exists, persisted before returning, and loaded from durable rows on server start.
- Keep only the newest `MAX_TOKENS_PER_NODE` valid legacy tokens per node; reference value is 3.
- `release_session` is self-only, clears current token state, records a point-of-no-return marker, and prevents silent reuse.
- Privileged session clear must audit actor and reason.

Session lock rule: a node with a current valid session token is locked. Bootstrap without proof is rejected unless the lock is stale, orphaned, explicitly released, or in a recovery state allowed by policy.


### 2.1 `register_node` implementer contract

Purpose: create or refresh the persistent node registration row that `bootstrap_node` requires before it can mint a session.

Parameters:

| Name | Type | Required | Validation |
| --- | --- | --- | --- |
| `node_id` | string | yes | stripped; non-empty; not reserved; accepted by deployment allowlist or provisioning policy |
| `capabilities` | array of strings | yes | stored as capability tags; empty array is valid only if policy allows it |
| `role` | string | no | if omitted, derive from capabilities |
| `working_dir` | string | no | advisory working-directory metadata |

Authority: first registration is pre-auth only for a never-seen `node_id` that was operator-provisioned. Re-registration of an existing row requires a valid session token for the same `node_id`; a caller cannot re-register a different node. v2 MUST require either the correct operator-provisioned node secret or an operator-maintained allowlist/provisioning record before accepting any first-contact registration.

Writes:

| Table/area | Write |
| --- | --- |
| `nodes` | insert or update `node_id`, capabilities, role, working-directory metadata, online/registered status, registration timestamp, last-seen timestamp |
| `node_identities` | update host or client metadata when supplied by trusted transport fields |
| topology metadata | bump topology version after successful registration |
| event/audit log | write node-registered event; write security-block or denial audit for reserved, disallowed, cross-node, or rate-limited attempts |
| messages | for reference compatibility, best-effort unknown-registration alert to existing nodes when a new allowlisted identity appears |

Success response: object with at least `node_id`, effective `role`, `status="registered"`, and `registered_at`. Implementations may include advisory metadata, but clients must not require it.

Errors: empty node ID, reserved identity, disallowed node ID, invalid test/canary policy, rate limit, unauthenticated re-registration, cross-node re-registration, storage failure.

## 3. `bootstrap_node`

Parameters:

- `node_id` string, required.
- `capabilities` array, optional, default `[]`.
- `role` string, optional.
- `working_dir` string, optional advisory metadata.
- `node_secret` string, optional except for node-secret registration or rotation.
- `skill_manifest` object/array, optional advisory validation input.
- `bootstrap_cwd_attestation` object, optional advisory current-directory proof.
- `_session_token` string, optional proof fallback.

Algorithm:

1. Normalize and validate `node_id`; reject empty, reserved, unknown, disabled, or disallowed nodes.
2. Resolve identity proof from the MCP layer.
3. Load existing node identity and session lock.
4. If a valid lock exists and proof is missing, reject unless recovery bypass applies.
5. If `node_secret` is supplied, require length at least 32, hash it, and persist the hash. Reference behavior allows overwrite rotation; v2 MUST reject mismatched rotation without explicit authority.
6. Validate `skill_manifest` and `bootstrap_cwd_attestation` as advisory diagnostics unless local policy makes them hard gates.
7. Reset boot-health counters, life-services confirmation, and life-services gate attempts.
8. Set node lifecycle to `running`; update last-seen, bootstrap timestamps, role, capabilities, and metadata.
9. Reuse a valid existing legacy token or mint and persist a new token.
10. Return startup instructions, topology, handoff, recovery, diary, skill, and life-services setup data.

Minimum success response. Required fields are the fields marked `yes` in section 11.4; soft-add fields may be absent when their builders fail.

```json
{
  "node_id":"node-id",
  "bootstrapped":true,
  "session_token":"opaque-token",
  "predecessor_died_unexpectedly":false,
  "mcp_config_hint":{"header":"X-Node-Token: <opaque-token>","args_addition":["--header","X-Node-Token: <opaque-token>"],"note":"text"},
  "registration":{"node_id":"node-id","role":"builder","capabilities":[],"status":"registered"},
  "topology_slice":{"topology_version":1,"node_host":"host-id","services":[],"service_count":0},
  "session_handoff":null,
  "recovery_substrate":null,
  "diary_recent":[],
  "skill_validation":null,
  "life_services_setup":{"required_action_pending":true,"required_action":"confirm_life_services","required_proof_fields":["bb4_poll_schedule_active"],"optional_proof_fields":[],"startup_instructions":{},"mode_note":"In manual mode, call set_manual_mode instead of submitting false schedule proof."},
  "topology_lens":{}
}
```

Errors include `unknown_node`, `reserved_node_id`, `node_not_allowed`, `session_locked`, `invalid_node_secret`, `node_secret_mismatch`, and storage failure. Same node plus same valid token is idempotent; old revoked tokens are rejected.

## 4. First-node tool contracts

All caller node fields must match `_caller_node_id` unless a tool explicitly grants PM, OPERATOR, or OPA authority.

### 4.1 `check_inbox`

Parameters: `node_id` required; optional `heartbeat_interval`, `node_status`, `compact`, `minimal`, and safe health/topology/process primitives. Self-only.

LIFE_SERVICES_GATE applies. State changes: update last seen, heartbeat interval, caller lifecycle recovery, stale/offline peer marking, dependency unblocks, and idle hooks. Response contains `node_id`, `messages`, `tasks`, `heartbeat`, optional `topology_lens`, and optional `schema_version`.

### 4.2 `heartbeat` batch sub-operation

Reference behavior does not register `heartbeat` as a standalone MCP tool. The heartbeat contract is the `batch` sub-operation with `action="heartbeat"`; it is self-only, exempt from LIFE_SERVICES_GATE, updates last-seen/lifecycle freshness through the minimal check-in writer, and returns:

```json
{"node_id":"node-id","heartbeat":{"status":"ok","last_seen":"timestamp"}}
```

### 4.3 `batch`

Parameters: `ops`, non-empty array, max 10 in reference behavior. Supported first-node actions: `check_inbox`, `heartbeat`, `get_board`, `get_topology`, `get_health`, `get_tasks`, `get_task_board`. Canonical first-node path is one `batch` call whose `ops` include `check_inbox` and `heartbeat`.

Response:

```json
{"results":[{"action":"check_inbox","ok":true,"data":{}},{"action":"heartbeat","ok":true,"data":{}}]}
```

Per-op failures use `{"action":"check_inbox","ok":false,"error":"LIFE_SERVICES_GATE","data":{}}`. Batch is not globally atomic.

### 4.4 LIFE_SERVICES_GATE and `confirm_life_services`

`confirm_life_services` parameters: `node_id` required and self-only; `proof` object required.

Automated-mode required proof: `bb4_poll_schedule_active` truthy. Optional proof: `wake_consumer_alive`, deprecated `bubble_shell_alive`, `bb4_poll_interval`, `daemon_status`, `content_ack`, and `content_ack_batch`.

On success, set `life_services_confirmed=1`, set legacy `confirmed=1` where present, store proof JSON, freshen last-seen, reset gate counters, and audit. `check_inbox` and batch `check_inbox` are gated; the `heartbeat` batch sub-operation is not. Manual mode uses the `set_manual_mode` gate exemption rather than a false `bb4_poll_schedule_active` claim: when stored proof has `manual_mode=true` and `manual_mode_policy.allow_tier2_inbox=true`, LIFE_SERVICES_GATE allows tier-2 inbox access even though life-services confirmation remains unset.

### 4.5 `send_message`

Parameters: `from_node` required self, `to_node` required, optional `msg_type` default `info`, `subject`, `content`, `priority` 1..5 default 3, `ref_task_id`, `requires_ack`, `attention`, `idempotency_key`. Broadcast aliases require policy. Inserts unread messages and wakes recipients if supported. Duplicate `idempotency_key` replays return the existing result.

### 4.6 `get_messages`

Parameters: `node_id` required self, `status` default `unread`, `limit` default 100 capped at 500. Read-only. Response contains `node_id` and `messages`.

### 4.7 `bulk_acknowledge`

Parameters: `node_id` required self, `message_ids` array required. Marks owned messages read. Already-read messages are idempotent no-ops. Response contains acknowledged IDs and missing/not-owned IDs.

### 4.8 `create_task`

Parameters: `task_id` and `title` required; optional `description`, `assigned_to`, `status`, `priority` 1..5 default 3, `project`, `depends_on`, `output_branch`, `notes`, `repo_path`, `linked_swat_id`. Reject task IDs in the reserved SWAT namespace. Insert task, dependencies, topology/context metadata, and event/audit rows. Response includes `task_id`, `created`, `status`, `assigned_to`, and `priority`.

### 4.9 `update_task`

Parameters: `task_id` required; optional `status`, `notes`, `output_branch`, `assigned_to`, `project`, `depends_on`, `review_ack`, `evidence`. Status enum is `backlog`, `ready`, `in_progress`, `review`, `blocked`, `done`, `cancelled`. Validate transition, update rows, audit, cascade dependency unblocks, and release related review claims. Unknown status is invalid params; disallowed transition is a domain error.

### 4.10 `get_my_tasks`

Parameters: `node_id` required self, optional `status`. May auto-promote unblocked tasks. Response contains `node_id` and `tasks`.

### 4.11 Task claim and `record_task_evidence`

Task claim is `update_task` with `assigned_to` equal to caller, normally with `status="in_progress"`. v2 must make this compare-and-swap safe.

`record_task_evidence` parameters: `item_id` required; optional `item_type` enum `task`, `swat`, `rfc_ac` default `task`; `leg` enum `BUILD`, `SHIP`, `ACCEPTANCE`; `result` enum `PASS`, `FAIL`, `UNKNOWN`; optional `ref`, `repo_id`, `method`, `node_id`. It upserts on `(item_id,item_type,leg,caller_node)`.

Reference bug: reference writers use `ACCEPTANCE` while some checks expect `ACCEPT`. Correct v2 behavior uses `ACCEPTANCE` everywhere and only maps old `ACCEPT` during migration.

## 5. State machines

### 5.1 Node lifecycle

Legal states: `running`, `saving`, `ready_for_restart`, `restarting`, `stopped`, `stale`, `offline`, `boot_wedged`, `molting`.

| From | To | Guard | Who |
| --- | --- | --- | --- |
| running | saving | restart requested | PM/OPERATOR/OPA |
| running | stale/offline/stopped/boot_wedged/molting | timeout, stop, retry cap, or self refresh | coordinator or authorized actor |
| saving | ready_for_restart/running/stale | save done, abort, or timeout | self/coordinator |
| ready_for_restart | restarting/running/stale/stopped | restart starts, cancel, timeout, stop | authorized actor |
| restarting | running/stale/offline/stopped | bootstrap success, timeout, stop | self/coordinator |
| stopped | running/offline | start or unreachable | self/coordinator |
| stale | running/offline/saving | recovery, timeout, restart request | self/coordinator |
| offline | running/stale | bootstrap or weak liveness | self/coordinator |
| boot_wedged | running | recovery grant or successful ack refresh | OPERATOR/OPA/self-policy |
| molting | running/offline/stale/stopped | successor boot or timeout/stop | self/coordinator |

### 5.2 Task

Legal states: `backlog`, `ready`, `in_progress`, `review`, `blocked`, `done`, `cancelled`.

Allowed transitions: `backlog -> ready,in_progress,blocked,cancelled`; `ready -> in_progress,backlog,blocked,cancelled`; `in_progress -> review,ready,blocked,cancelled,done`; `review -> done,in_progress,blocked,cancelled`; `blocked -> ready,in_progress,backlog,cancelled`; `done -> in_progress,ready`; `cancelled -> backlog,ready`.

### 5.3 Review

Task review is task status plus review acknowledgements. Minimum states: `no_review`, `review_requested`, `approved`, `changes_requested`, `closed`. A review ack must match the authenticated reviewer. v2 should store acks append-only and derive task status from latest valid ack plus evidence gates.

### 5.4 Boomerang

Legal statuses: `thrown`, `caught`, `in_progress`, `preempted`, `escalated`, `returned_complete`, `returned_blocked`, `superseded`. Return categories: `capacity`, `scope_change`, `blocked_by`, `needs_info`, `wrong_node`, `deadline_unreasonable`. Kinds: `work`, `context_refresh`, `dep_handoff`, `sample`.

Allowed transitions: create to `thrown`; `thrown/preempted/escalated -> caught`; `caught -> in_progress`; active `thrown/caught/in_progress -> preempted` by priority policy; active states may become `escalated` on deadline miss; `caught/in_progress/escalated -> returned_complete` or `returned_blocked`; exact terminal return replay is idempotent; context-refresh collapse may set `superseded`.

### 5.5 OPA grant

Grant fields include `id`, `node_id`, `scope_type`, `granted_by`, `expires_at`, `consumed`, `reason`, `source`, `created_at`, `consumed_at`, `consumed_by_action`, `revoked_at`, `revoked_by`, `delegated_by`, `delegation_chain`, `action_type`. `scope_type` is `action`, `task`, or `time`.

Derived states: `active`, `consumed`, `revoked`, `expired`. Transitions: create active; active action-scope consume to consumed; active revoke to revoked; active time expiry to expired; consumed replay remains consumed.

Reference bug: explicit consume records requested action but does not compare it with stored `action_type`. Correct v2 behavior rejects consume when stored `action_type` is non-null and differs from requested `action_type`.

### 5.6 SWAT

See `labor-division.md` for role division and routing policy. Legal stages: `open`, `in_review`, `fixed`, `closed`. Verdicts: `approve`, `request_changes`, `reject`. Severities: `critical`, `high`, `medium`, `low`. Types: `build`, `audit`, `analysis`, `verify`.

Transitions: none to `open` on create; `open -> in_review` on eligible claim/route; `in_review -> fixed` on approve with type-specific gates; `in_review -> closed` on reject; `in_review -> open` on request changes; `fixed -> fixed` for additional independent approve cosign; `fixed -> closed` by close policy; `open -> closed` by PM disposition. Build-type approval requires `fix_commit`. Authors or code builders cannot provide independent approval of their own work.

## 6. Restart lever

Inputs: coordinator root and launch command, target branch, intended full target SHA, health probe, MCP test token, deploying node ID, optional OPA grant, optional skill invocation token, and switches for start-only, stop-only, skip-broadcast, skip-reserve, assume-wedged, allow-SHA-drift, and breakglass.

Restart-intent schema:

```sql
CREATE TABLE restart_intents (
  intent_id TEXT PRIMARY KEY,
  deploying_node TEXT NOT NULL,
  target_sha TEXT NOT NULL,
  minted_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  released_at_ms INTEGER
);
CREATE UNIQUE INDEX restart_intents_one_active_per_sha
  ON restart_intents(target_sha) WHERE status = 'active';
```

Reserve: `POST /api/restart/reserve`, `X-Node-Token` required, body `target_sha` full 40-character SHA and optional positive `ttl_ms`. 200 returns `status=reserved`, `intent_id`, `expires_at_ms`, `minted_at_ms`; 409 returns `status=conflict` and peer fields; 400 bad body; 403 no node token; 503 module unavailable.

Release: `POST /api/restart/release`, `X-Node-Token` required, body `intent_id`; idempotent response `status=released`, `intent_id`, `was_active`.

State machine: idle -> preflight -> reserved -> announced -> verified_pre_kill -> ponr -> stopped -> lease_cleared -> launched -> healthy -> mcp_verified -> sse_verified -> resumed. Abort before ponr leaves the live coordinator running. Rollback after ponr kills only the newly launched process tree, releases DB locks by terminating child first, releases intent, and stops without infinite retry.

Exit codes: 0 success/no-op stop; 1 generic failure; 2 safety gate failure; 3 concurrent restart conflict; 4 OPA replay guard; 7 event stream degraded advisory; 8 event stream degraded hard rollback; 77 launch gate; 78 source freshness/dirty tree; 79 dependency/import/smoke gate.

## 7. Restore proof acceptance test

Automated restore proof:

1. Create a scratch DB outside production.
2. Restore the newest complete backup snapshot.
3. Verify manifest, data file, SHA-256 sidecar or manifest hash, and complete publish marker.
4. Open scratch DB read-only when possible.
5. Validate table count and core tables: `nodes`, `messages`, `tasks`, `task_evidence`, `node_identities`, `node_session_tokens`, `ops_elevations`, `boomerangs`, `restart_intents` when present.
6. Validate core columns: `nodes.node_id`, `nodes.role`, `nodes.lifecycle_state`, `node_identities.session_token`, `tasks.status`, `messages.status`, `task_evidence.leg`, `restart_intents.status`.
7. Validate newest-key recency from node last-seen, message created, task updated, and audit/event tables. Recency is hard for production snapshots and warning-only for explicit fixtures.
8. Cairn consistency: SWAT stage counts load, SWAT audit rows reference existing SWAT IDs except documented tombstones, and board projection has no duplicate identity keys between task and SWAT namespaces.
9. Pass only if integrity, schema, row-count, projection, and applicable recency checks pass.
10. Cleanup scratch DB and transient restore files.

## 8. Operating-mode boot rule

This section is normative for every rebuild doc.

- Automated mode: create exactly one local bare `bb4-poll` safety-net schedule before `bootstrap_node`, use it for bounded bootstrap retry, call `confirm_life_services` only with truthful schedule proof, then replace the bootstrap cadence with the steady cadence.
- Manual mode: create no recurring schedule before or after `bootstrap_node`. A failed bootstrap is reported in the visible session and retried only by the next explicit operator wake. The node records manual mode with `set_manual_mode(enabled=true, reason=...)`, which stores `manual_mode=true` and `manual_mode_policy.allow_tier2_inbox=true`; that stored proof is the LIFE_SERVICES_GATE exemption. No node may submit `bb4_poll_schedule_active=true` unless such a schedule actually exists.

Manual-mode algorithm:

1. Start only after explicit operator wake or direct command.
2. Read local identity and session token.
3. Call `bootstrap_node` once.
4. Store returned `session_token` and execute startup instructions only where they do not conflict with this section.
5. Call `set_manual_mode` with `enabled=true` and a truthful reason. Do not call `confirm_life_services` with schedule proof in manual mode unless a recurring schedule truly exists.
6. Drain immediate work with one `batch` call whose `ops` include `check_inbox` and `heartbeat`, or with equivalent explicit foreground checks.
7. Do not create, re-arm, or preserve recurring bootstrap retry schedules.
8. On bootstrap failure, report in the visible session and stop; next retry requires another explicit wake.
9. Heartbeat may run while the node is actively running, but manual boot creates no background polling loop.

Reference note: the reference `confirm_life_services` requires `bb4_poll_schedule_active=true`; manual mode is represented by `set_manual_mode`, which writes the gate-exemption proof. Older operator directions that create a short bootstrap schedule and stop it after confirmation are transitional automated-to-manual migration patterns, not the steady manual-mode rule.

## 9. Unknowns

- Exact text of `startup_instructions`; treat as opaque.
- Full topology lens schema; empty objects are acceptable in the first rebuild.
- Optional health/process fields for `check_inbox`; accept safe unknown primitives.
- Dashboard-only REST authorization matrix.
- Full review-ack schema beyond caller match and verdict semantics.
- Backup retention policy; restore proof only requires the newest complete snapshot.

## 10. Expanded implementer contract

This section is the implementer-facing expansion of the compact sections above.
Where this section and an earlier summary differ, use this section.

### 10.1 Transport and handler failure mapping

All MCP tool handlers are async functions that return dictionaries or raise
`ValueError` for invalid input and domain-auth failures. The JSON-RPC layer maps
schema and `ValueError` failures to an error envelope. A compatible rebuild must
preserve the caller-visible payload shape even if it uses a different exception
class internally.

| Failure class | JSON-RPC code | HTTP status | Error message source |
| --- | --- | --- | --- |
| Invalid JSON | `-32700` | 400 | JSON parser |
| Invalid JSON-RPC shape | `-32600` | 400 | transport validator |
| Unknown method/tool | `-32601` | 404 or 200 JSON-RPC | tool registry |
| Missing required tool parameter | `-32602` | 200 JSON-RPC | schema validator |
| Unknown enum value | `-32602` | 200 JSON-RPC | schema or tool validator |
| Handler `ValueError` | `-32602` unless policy marks as domain | 200 JSON-RPC | exception string |
| Authorization/domain rejection | `-32000` or tool dictionary with `error` | 200 JSON-RPC | handler result |
| Unexpected server failure | `-32000` | 500 or 200 JSON-RPC | sanitized message |

Tool-level errors that return dictionaries must not be wrapped as success
semantics by callers. The dictionary field `error` means the tool did not perform
the requested domain action.

### 10.2 Trusted injected fields

The transport injects these fields into `arguments` before dispatch:

| Field | Type | Meaning | Spoofing rule |
| --- | --- | --- | --- |
| `_caller_node_id` | string | authenticated node ID, or empty | strip client value first |
| `_caller_role` | string | role from node row or token claims | strip client value first |
| `_identity_proof` | string | `token`, `header`, `session_arg`, `first_contact`, or `none` | strip client value first |
| `_client_ip` | string | observed client address | strip client value first |
| `_session_token` | string | optional client-supplied proof fallback | may be consumed by auth layer |

Handlers must trust only injected values, not similarly named user parameters.

## 11. Full `bootstrap_node` contract

### 11.1 Input parameter table

| Name | Type | Required | Default | Validation |
| --- | --- | --- | --- | --- |
| `node_id` | string | yes | none | stripped; non-empty; not reserved; allowed by deployment policy |
| `node_secret` | string | no | absent | if present, string length at least 32 |
| `skill_manifest` | array of objects | no | absent | each item may contain `skill_name`, `actual_sha`, `shape_ok`; advisory |
| `bootstrap_cwd_attestation` | object | no | absent | advisory telemetry only; malformed object never blocks |
| `test_node` | boolean | no | false | only for explicit canary/test policies; normal rebuild may omit |
| `auth_token` | string | no | absent | fleet recovery fallback only when policy allows |
| `_session_token` | string | no | absent | auth fallback; removed from business semantics |

### 11.2 Handler algorithm with rejection points

| Step | Action | Rejection code | Exact reference message template |
| --- | --- | --- | --- |
| 1 | Strip whitespace from `node_id` | `-32602` | `node_id cannot be empty` |
| 2 | Reject reserved system identities | `-32602` | `Cannot bootstrap as '<node_id>': this is a reserved system identity. Reserved names: <names>` |
| 3 | If test-node flag is used, validate allowed test naming | `-32602` | `Cannot bootstrap '<node_id>' as test_node: node_id does not match a recognized test-node naming convention (TEST-* / *-TEST / ZBCANARY-*). Test-node bootstrap requires BOTH the explicit test_node=True param AND a test-recognized name.` |
| 4 | Check deployment allowed-node list | `-32602` | `Cannot bootstrap '<node_id>': not in allowed nodes list for <environment> environment. Allowed: <nodes>` |
| 5 | Load existing session token | none | no rejection yet |
| 6 | If fleet auth recovery is supplied, compare with shared token | `-32000` or `-32602` | active healthy sessions still fall through to normal session-lock rejection |
| 7 | If existing token and no token proof, check recovery bypass | none | stale, active reboot, orphaned token, or stale-session bypass may allow |
| 8 | If no bypass, enforce cooldown | `-32602` | `NIS-B4: Bootstrap cooldown active for '<node_id>'. Last bootstrap <elapsed>s ago, cooldown 60s. Retry after <seconds>s.` |
| 9 | If existing token and proof is not token | `-32602` | `Node '<node_id>' already has a session. Re-bootstrap requires authentication with that node's token.` |
| 10 | If token proof belongs to another caller | `-32602` | `Cannot bootstrap '<node_id>' as '<caller>'. Only '<node_id>' can re-bootstrap itself.` |
| 11 | Audit current-directory attestation | none | telemetry failure is logged only |
| 12 | Load registered node row | `-32602` | `Node '<node_id>' has never been registered. Ask PM to register it first with register_node.` |
| 13 | Validate supplied `node_secret` | `-32602` | `node_secret must be a string of at least 32 characters (SDK uses secrets.token_urlsafe(32) => ~43 chars).` |
| 14 | Persist node-secret hash | none | persistence warning does not abort unless storage itself fails |
| 15 | Re-register node with stored defaults | `-32000` | storage failure |
| 16 | Reset node boot/session fields | `-32000` | storage failure |
| 17 | Reuse or mint session token | `-32000` | storage failure |
| 18 | Build optional payload blocks | none | best-effort fields may be null or absent |
| 19 | Inject topology lens | none | soft-add; failure drops the field |

### 11.3 Database writes and state changes

On success, `bootstrap_node` performs these writes:

| Table/area | Write |
| --- | --- |
| `node_identities` | ensure identity row; optionally write `node_secret_hash`; write `session_token` when first minted; update timestamp fields |
| `nodes` | update last-seen through registration path; set `last_bootstrap_at`; reset checkpoint/work counters; clear life-services proof and confirmation; reset gate attempts; clear stale idle and process-start fields |
| `nodes` | set `lifecycle_state='running'`; set `last_transition_at` fields |
| `nodes` | when rebootstrap, update `last_molted` fields |
| `node_session_tokens` | insert current token when minted; durable token lookup must be available after restart |
| MOLT lock table | if caller held a host lock, clear it as successful bootstrap completion |
| `events_all` or event log | write `node_bootstrapped`; write `re_bootstrap` when applicable; write optional diagnostics |
| audit log | write `node_secret_registered` after durable secret persistence; write attestation diagnostics |
| messages | optional post-rebootstrap sitrep delivery; best effort and non-blocking |

### 11.4 Full response field table

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `node_id` | string | yes | bootstrapped node ID |
| `bootstrapped` | boolean | yes | true on success |
| `session_token` | string | yes | legacy opaque token for future MCP calls |
| `predecessor_died_unexpectedly` | boolean | yes | best-effort prior-process death signal |
| `mcp_config_hint` | object | yes | header and argument hint for client configuration |
| `mcp_config_hint.header` | string | yes | `X-Node-Token` header string |
| `mcp_config_hint.args_addition` | array | yes | command argument tokens for adding the header |
| `mcp_config_hint.note` | string | yes | token lifecycle note |
| `registration` | object | yes | result from node registration/upsert |
| `registration.node_id` | string | expected | node ID |
| `registration.role` | string | expected | effective role |
| `registration.capabilities` | array | expected | effective capabilities |
| `registration.status` | string | optional | active/registered status |
| `registration.working_dir` | string | optional | stored working directory metadata |
| `topology_slice` | object | yes | service edges relevant to this node |
| `topology_slice.topology_version` | integer/string | yes | topology version |
| `topology_slice.node_host` | string | yes | host label as known to coordinator |
| `topology_slice.services` | array | yes | service entries |
| `topology_slice.service_count` | integer | yes | number of services |
| `session_handoff` | object or null | yes | latest saved continuity snapshot, or null |
| `recovery_substrate` | object or null | yes | last-plan/recovery hints, or null |
| `recovery_substrate.last_plan_local_path` | string | optional | local path hint; sanitized in examples |
| `recovery_substrate.last_plan_probe_path` | string or null | optional | path actually probed; sanitized in examples |
| `recovery_substrate.last_plan_access_method` | string | optional | `local`, `unc`, `relay`, or `unreachable` |
| `recovery_substrate.last_plan_exists` | boolean | optional | whether recovery plan file exists |
| `recovery_substrate.last_plan_size_bytes` | integer/null | optional | file size |
| `recovery_substrate.last_plan_mtime_epoch_ms` | integer/null | optional | modified time |
| `recovery_substrate.last_plan_content_preview` | string/null | optional | capped preview |
| `recovery_substrate.last_plan_content_truncated` | boolean | optional | preview truncation flag |
| `recovery_substrate.last_plan_content_cap_bytes` | integer | optional | preview cap |
| `recovery_substrate.recovery_scratch_id` | string/null | optional | recovery scratch identifier |
| `diary_recent` | array | yes | last diary entries; empty on failure |
| `skill_validation` | array or null | yes | per-skill advisory blocks, or null |
| `skill_validation[].skill_name` | string | conditional | skill identifier |
| `skill_validation[].expected_sha` | string/null | conditional | expected rollup hash |
| `skill_validation[].actual_sha` | string/null | conditional | reported rollup hash |
| `skill_validation[].status` | string | conditional | `ok`, `drift`, `missing`, or `corrupt` |
| `life_services_setup` | object | yes | required next-step contract |
| `life_services_setup.required_action_pending` | boolean | yes | true when confirmation is required |
| `life_services_setup.message` | string | yes | human instruction |
| `life_services_setup.required_action` | string | yes | Automated mode returns `confirm_life_services`; manual-mode clients must treat the next required action as `set_manual_mode` unless they actually created the schedule proof |
| `life_services_setup.required_proof_fields` | array | yes | automated mode contains `bb4_poll_schedule_active`; manual-mode clients must not fabricate this field |
| `life_services_setup.optional_proof_fields` | array | yes | optional proof fields |
| `life_services_setup.startup_instructions` | object | yes | structured startup instructions |
| `life_services_setup.startup_instructions.step_1_bb4_poll` | string | yes | schedule setup instruction |
| `life_services_setup.startup_instructions.step_2_confirm` | string | yes | confirmation instruction |
| `life_services_setup.startup_instructions.role_boot_sop` | object/null | yes | role-specific boot SOP, or null |
| `topology_lens` | object | soft-add | full topology lens; absent if builder fails |

### 11.5 Sanitized success example

```json
{
  "node_id": "builder-a",
  "bootstrapped": true,
  "session_token": "00000000-0000-0000-0000-000000000000",
  "predecessor_died_unexpectedly": false,
  "mcp_config_hint": {
    "header": "X-Node-Token: 00000000-0000-0000-0000-000000000000",
    "args_addition": ["--header", "X-Node-Token: 00000000-0000-0000-0000-000000000000"],
    "note": "Configure the header once; the launcher supplies the current token."
  },
  "registration": {
    "node_id": "builder-a",
    "role": "builder",
    "capabilities": ["build", "test"],
    "status": "active",
    "working_dir": "<workspace>"
  },
  "topology_slice": {
    "topology_version": 1,
    "node_host": "host-a",
    "service_count": 1,
    "services": [
      {
        "service_id": "workspace",
        "name": "workspace",
        "host": "host-a",
        "role": "primary",
        "canonical_path": "<workspace>",
        "resolved_path": "<workspace>",
        "access_method": "local"
      }
    ]
  },
  "session_handoff": null,
  "recovery_substrate": {
    "last_plan_local_path": "<workspace>/<state>/last-plan.md",
    "last_plan_probe_path": "<workspace>/<state>/last-plan.md",
    "last_plan_access_method": "local",
    "last_plan_exists": false,
    "last_plan_size_bytes": null,
    "last_plan_mtime_epoch_ms": null,
    "last_plan_content_preview": null,
    "last_plan_content_truncated": false,
    "last_plan_content_cap_bytes": 8192,
    "recovery_scratch_id": null
  },
  "diary_recent": [],
  "skill_validation": [
    {"skill_name": "bb4-poll", "expected_sha": null, "actual_sha": "ABC", "status": "ok"}
  ],
  "life_services_setup": {
    "required_action_pending": true,
    "message": "Next step: start life services, then call confirm_life_services. In manual mode, store the manual-mode exemption instead of submitting false schedule proof.",
    "required_action": "confirm_life_services",
    "manual_mode_required_action": "set_manual_mode",
    "required_proof_fields": ["bb4_poll_schedule_active"],
    "optional_proof_fields": [
      "wake_consumer_alive",
      "wake_consumer_pid",
      "bubble_shell_alive",
      "bubble_pid",
      "bb4_poll_interval",
      "daemon_status",
      "bb4_poll_schedule_id",
      "first_heartbeat_at"
    ],
    "startup_instructions": {
      "step_1_bb4_poll": "Automated mode: invoke bb4-poll. Manual mode: do not create a recurring schedule.",
      "step_2_confirm": "Automated mode: call confirm_life_services with truthful schedule proof. Manual mode: call set_manual_mode(enabled=true, reason=...).",
      "role_boot_sop": null
    }
  },
  "topology_lens": {"shape": "full", "topology_version": 1, "nodes": [], "edges": []}
}
```

### 11.6 Error payload examples

The JSON-RPC wrapper is:

```json
{"jsonrpc":"2.0","id":"id","error":{"code":-32602,"message":"<message>","data":{}}}
```

Exact message examples:

```json
{"code":-32602,"message":"node_id cannot be empty"}
```

```json
{"code":-32602,"message":"Node 'builder-a' already has a session. Re-bootstrap requires authentication with that node's token."}
```

```json
{"code":-32602,"message":"Cannot bootstrap 'builder-a' as 'builder-b'. Only 'builder-a' can re-bootstrap itself."}
```

```json
{"code":-32602,"message":"node_secret must be a string of at least 32 characters (SDK uses secrets.token_urlsafe(32) => ~43 chars)."}
```

```json
{"code":-32602,"message":"Node 'builder-a' has never been registered. Ask PM to register it first with register_node."}
```

## 12. Expanded first-node tools

### 12.1 Common message object shape

`check_inbox`, `get_messages`, and other message reads return message rows with
these fields when available:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | integer | message primary key |
| `from_node` | string | sender |
| `to_node` | string | recipient |
| `msg_type` | string | message category |
| `subject` | string | short subject |
| `content` | string | body |
| `ref_task_id` | string/null | task reference |
| `status` | string | `unread` or `read` |
| `created_at` | string | creation time |
| `created_at_epoch_ms` | integer/null | creation time in epoch ms |
| `read_at` | string/null | read timestamp |
| `read_at_epoch_ms` | integer/null | read time in epoch ms |
| `delivered_at` | string/null | first read-delivery timestamp |
| `delivered_at_epoch_ms` | integer/null | delivery time in epoch ms |
| `is_broadcast` | integer boolean | broadcast fanout marker |
| `priority` | integer | 1 highest through 5 lowest |
| `requires_ack` | integer boolean | explicit ack required |
| `attention` | integer boolean | attention flag |
| `expires_at` | string/null | expiry timestamp |
| `expires_at_epoch_ms` | integer/null | expiry epoch ms |
| `idempotency_key` | string/null | sender dedupe key |
| `payload_fingerprint` | string/null | payload hash for dedupe validation |

### 12.2 `check_inbox`

Parameter table:

| Name | Type | Required | Default | Validation |
| --- | --- | --- | --- | --- |
| `node_id` | string | yes | none | self-only when caller identity is present |
| `heartbeat_interval` | number | no | implementation default | positive number recommended |
| `node_status` | string | no | unchanged | free-form status, stored as health signal |
| `compact` | boolean | no | true in handler call | controls response size |
| `minimal` | boolean | no | false | when true strips expensive board/topology fields |
| `process_start_time` | string/number | no | absent | stored as node health primitive |
| `checkpoint_count` | integer | no | absent | stored health counter |
| `active_work_turns` | integer | no | absent | stored health counter |
| `pending_audits` | array/object | no | absent | idempotent audit ingest |
| `sha_observations` | array/object | no | absent | idempotent runtime-hash observation ingest |
| `include_topo` | boolean | no | false | if true returns legacy topology snapshot |
| `topo_version` | integer | no | absent | client cached legacy topology version |
| `topology_version_last_seen` | integer | no | absent | topology lens delta hint |

Role/authority check:

- If `_caller_node_id` is present, it must equal `node_id`.
- Some service callers may be allowed without caller identity; they still can only pass the target `node_id`.

State changes:

- Calls `check_life_services_gate` and may increment `nodes.gate_attempt_count`.
- Updates `nodes.last_seen` and `last_seen_epoch_ms`.
- Updates `heartbeat_interval`, health counters, `node_status`, process-start fields.
- Resets caller lifecycle from `stale` or `offline` to `running` when appropriate.
- Marks peer nodes stale/offline according to heartbeat policy.
- Auto-promotes blocked tasks whose dependencies are satisfied.
- May ingest pending audit and hash-observation rows.
- Runs idle dispatcher best-effort.
- Adds topology lens best-effort.

Response fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `node_id` | string | caller node |
| `inbox` or `messages` | array | unread or relevant messages |
| `count` | integer | message count when inbox-shaped |
| `tasks` | array | assigned or relevant tasks |
| `heartbeat` | object | liveness and health summary |
| `stale_nodes` | array | stale peer summary; absent in minimal mode |
| `board_summary` | object | board counts; absent in minimal mode |
| `server_time_utc` | string | server time; absent in minimal mode |
| `topology_lens` | object | topology push envelope |
| `topo_version` | integer | legacy topology version when requested |
| `topo` | object | legacy topology when requested and changed |
| `web` | object | optional web section from topology snapshot |
| `mcp_schema_version` | string | schema drift signal |
| `merge_pending` | array | optional unresolved merge expectations |

Example:

```json
{
  "node_id": "builder-a",
  "inbox": [
    {
      "id": 10,
      "from_node": "pm",
      "to_node": "builder-a",
      "msg_type": "info",
      "subject": "Next task",
      "content": "Please start task-1.",
      "status": "unread",
      "priority": 2,
      "requires_ack": 0,
      "attention": 1,
      "created_at": "<time>"
    }
  ],
  "count": 1,
  "tasks": [],
  "heartbeat": {"status": "ok", "node_status": "idle"},
  "topology_lens": {"shape": "unchanged"},
  "mcp_schema_version": "schema-version"
}
```

Error cases:

| Case | Payload |
| --- | --- |
| Caller mismatch | JSON-RPC error from identity enforcement |
| Life services not confirmed | tool dictionary with `error="LIFE_SERVICES_GATE"` |
| Storage failure | JSON-RPC `-32000` or tool error |

Idempotency:

- Repeating `check_inbox` is safe.
- Delivery receipts may update `delivered_at` on first read.
- Gate attempts increment while gated, so gated calls are not write-free.

### 12.3 `heartbeat` batch sub-operation

Parameter table:

| Name | Type | Required | Default | Validation |
| --- | --- | --- | --- | --- |
| `node_id` | string | yes | none | self-only |
| `interval` | number | no | 120 in batch path | positive recommended |
| `phase` | string | no | `idle` in batch path | stored as status |
| `checkpoint_count` | integer | no | absent | health counter |
| `active_work_turns` | integer | no | absent | health counter |
| `topology_version_last_seen` | integer | no | absent | only used for topology lens in heartbeat-only batch |

Authority: self-only through the enclosing `batch` call. LIFE_SERVICES_GATE is deliberately not checked. There is no standalone `heartbeat` MCP tool in the reference catalog.

State changes: calls the minimal check-in writer, updating last-seen, lifecycle freshness, heartbeat interval, status, and health counters.

Response fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `node_id` | string | caller |
| `heartbeat` | object | minimal liveness result |
| `topology_lens` | object | only when batch has no `check_inbox` action and lens build succeeds |

Example:

```json
{"node_id":"builder-a","heartbeat":{"status":"ok","node_status":"idle"}}
```

Errors: caller mismatch or storage failure. Replays are safe and just refresh liveness.

### 12.4 `batch`

Parameter table:

| Name | Type | Required | Default | Validation |
| --- | --- | --- | --- | --- |
| `node_id` | string | yes | none | caller identity must match |
| `ops` | array | yes | none | non-empty, max 10 |
| `compact` | boolean | no | true | strips large keys |
| `_session_token` | string | no | absent | auth fallback |

Each op is an object with:

| Name | Type | Required | Default | Validation |
| --- | --- | --- | --- | --- |
| `action` | string | yes | none | must be allowed action |
| `fields` | array | no | absent | projects returned data |
| action-specific keys | any | no | action default | read by `_batch_op_param` |

Allowed sub-ops:

| Action | Gate | Data source |
| --- | --- | --- |
| `check_inbox` | LIFE_SERVICES_GATE applies | `db.check_inbox` |
| `heartbeat` | gate exempt | `db.check_inbox(minimal=true)` |
| `get_board` | none beyond batch identity | board summary |
| `get_topology` | deprecated pull path | topology snapshot |
| `get_health` | none beyond batch identity | DB health check |
| `get_tasks` | none beyond batch identity | tasks for node |
| `get_task_board` | none beyond batch identity | task board |

Response envelope fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `results` | array | one per op |
| `count` | integer | number of op results |
| `mcp_schema_version` | string | schema drift signal |

Per-op success:

```json
{"action":"heartbeat","ok":true,"data":{"node_id":"builder-a","heartbeat":{"status":"ok"}}}
```

Per-op failure:

```json
{"action":"check_inbox","ok":false,"error":"LIFE_SERVICES_GATE","data":{"gate_attempt":1}}
```

Unknown action:

```json
{"action":"bad","ok":false,"error":"Unknown action 'bad'. Available: check_inbox, heartbeat, get_board, get_topology, get_health, get_tasks, get_task_board"}
```

Missing action:

```json
{"action":null,"ok":false,"error":"missing required 'action' key in batch op; got keys []. Available actions: check_inbox, heartbeat, get_board, get_topology, get_health, get_tasks, get_task_board"}
```

State changes: union of the selected sub-ops. Batch is not atomic. Idempotency follows each sub-op.

### 12.5 `confirm_life_services`

Parameter table:

| Name | Type | Required | Default | Validation |
| --- | --- | --- | --- | --- |
| `node_id` | string | yes | none | node must exist; self-only at MCP layer |
| `proof` | object | yes | none | must contain required proof |

Proof schema:

| Field | Type | Required | Check |
| --- | --- | --- | --- |
| `bb4_poll_schedule_active` | boolean | yes in automated mode | must be present and truthy |
| `wake_consumer_alive` | boolean | no | if present, must be boolean |
| `wake_consumer_pid` | integer/string | no | accepted as evidence metadata |
| `bubble_shell_alive` | boolean | no | deprecated alias; if present, must be boolean |
| `bubble_pid` | integer/string | no | deprecated metadata |
| `bb4_poll_interval` | string | no | if string, must be non-empty |
| `daemon_status` | string | no | stored as evidence |
| `bb4_poll_schedule_id` | string | no | stored as evidence |
| `first_heartbeat_at` | string | no | stored as evidence |
| `required_content_acks` | array | no | validates each content ack |
| `manual_mode` | boolean | no | reference stores this only through `set_manual_mode`; do not use it to justify false schedule proof |
| `manual_mode_policy` | object | no | reference stores this only through `set_manual_mode`; `allow_tier2_inbox=true` permits tier-2 bypass |

`required_content_acks[]` item schema:

| Field | Type | Required | Check |
| --- | --- | --- | --- |
| `slug` | string | yes | non-empty content identifier |
| `kb_version` | string | no | version stored with ack |
| `content_checksum` | string | yes | equals SHA-256 of ASCII-sanitized `free_text_ack` |
| `free_text_ack` | string | yes | passes template-reject rules |

Template-reject rules:

| Rule | Rejection |
| --- | --- |
| `template_string_reject` | acknowledgement is a stock token such as ack/ok/yes |
| `node_name_only_reject` | acknowledgement equals node ID after sanitization |
| `whitespace_only_reject` | empty after strip |
| `plagiarism_reject` | exact match of SOP summary or directive |
| `repeated_chars_reject` | one repeated character |
| `min_length_bytes` | shorter than configured byte minimum, default 40 |
| unknown rule | fail-closed with `unknown_rule:<name>` |

Authority: self-only. Reconfirming is allowed and idempotent.

Manual mode: do not call this tool with a false schedule claim. Use the section 8 `set_manual_mode` gate exemption, then perform only foreground work for the explicit wake.

State changes:

| Table/area | Write |
| --- | --- |
| `nodes` | set `life_services_confirmed=1`, `confirmed=1`, confirmation timestamps, proof JSON |
| `nodes` | freshen `last_seen`; reset `gate_attempt_count` and first-attempt fields |
| `content_acks_state` | upsert accepted acks; increment retry counters for rejected acks |
| `content_acks_audit` | append ack lifecycle events |
| `nodes` | may set `lifecycle_state='boot_wedged'` when retry cap is reached |
| `messages` | may send privileged recovery message on boot-wedged trigger |
| event log | `life_services_confirmed` and bootstrap tool-count snapshot |

Response fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `node_id` | string | node |
| `life_services_confirmed` | boolean | true |
| `confirmed_at` | string | confirmation timestamp |
| `proof_accepted` | object | stored proof |
| `memory_blocks` | object | best-effort memory blocks |
| `content_acks` | object | present if acks submitted |
| `content_acks.accepted` | array | accepted slugs |
| `content_acks.rejected` | array | rejection objects |
| `content_acks.gate_status` | string | `content_ack_gate_passed` or `content_ack_gate_failed` |
| `pending_content_acks` | array | present when current session still owes acks |
| `memory_block_integrity_warnings` | array | optional warnings |
| `memory_blocks_render_failed` | boolean | optional failure signal |
| `memory_blocks_render_error` | string | optional failure detail |

Example:

```json
{
  "node_id": "builder-a",
  "life_services_confirmed": true,
  "confirmed_at": "<time>",
  "proof_accepted": {
    "bb4_poll_schedule_active": true,
    "bb4_poll_interval": "4m",
    "daemon_status": "Running"
  },
  "memory_blocks": {},
  "content_acks": {
    "accepted": ["role-orientation"],
    "rejected": [],
    "gate_status": "content_ack_gate_passed"
  }
}
```

Error cases:

| Case | Exact message |
| --- | --- |
| Unknown node | `Node '<node_id>' is not registered.` |
| Missing required proof | `Proof payload missing required fields: ['bb4_poll_schedule_active']` |
| Schedule inactive | `Life services proof validation failed: ['bb4_poll_schedule_active must be true']` |
| Bad wake field | `Life services proof validation failed: ['wake_consumer_alive must be a boolean if provided']` |
| Bad deprecated wake field | `Life services proof validation failed: ['bubble_shell_alive must be a boolean if provided']` |
| Empty interval | `Life services proof validation failed: ['bb4_poll_interval must be non-empty if provided']` |
| Bad content-ack array | `required_content_acks must be a list of {slug, kb_version, content_checksum, free_text_ack} dicts if provided` |

### 12.6 `send_message`

Parameter table:

| Name | Type | Required | Default | Validation |
| --- | --- | --- | --- | --- |
| `from_node` | string | yes | none | must match caller except system identities |
| `to_node` | string | yes | none | registered recipient or broadcast alias |
| `msg_type` | string | yes in schema/defaulted by clients | `info` | maintenance and routing gates may inspect |
| `subject` | string | yes/defaulted | empty | sanitized |
| `content` | string | no | empty | sanitized; token-leak gate applies |
| `ref_task_id` | string | no | null | stored |
| `priority` | integer/string | no | 3 | normalized to 1..5 |
| `requires_ack` | boolean | no | false | stored integer boolean |
| `attention` | boolean | no | false | stored integer boolean |
| `idempotency_key` | string | no | null | dedupe key per sender/recipient |

Authority:

- `_caller_node_id` must equal `from_node`.
- `DASHBOARD` and `SYSTEM` are special senders only for trusted paths.
- Broadcast aliases `all_nodes`, `broadcast`, and `all` fan out.

DB writes/state changes:

- Validate sender and recipient node rows.
- Insert into `messages` with `status='unread'`, normalized priority, expiry, idempotency key, and payload fingerprint.
- Insert audit row `message_sent_with_audit`.
- Optionally insert router-audit row.
- For priority 1 or reboot message types, set recipient interrupt.
- Wake long-polling recipient and queue wake event.

Response fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | integer | inserted message ID |
| `from_node` | string | sender |
| `to_node` | string | recipient |
| `status` | string | usually `sent` or insert status |
| `idempotent_replay` | boolean | optional duplicate signal |
| `warnings` | array | optional parameter alias warnings |

Example:

```json
{"id":101,"from_node":"builder-a","to_node":"pm","status":"sent"}
```

Errors:

| Case | Payload or message |
| --- | --- |
| Rate limit | tool dictionary error |
| Validation/sanitization | tool dictionary error |
| Token leak | `rejection_code="token_leak_blocked"`, `http_status=400` |
| Caller mismatch | identity enforcement error |
| Unknown sender | `Sender node '<from_node>' not registered` |
| Unknown recipient | `Recipient node '<to_node>' not registered` |
| Test isolation violation | `Test node '<from_node>' cannot message non-test node '<to_node>'. Test nodes are isolated to TEST-* recipients only.` |

Idempotency: with `idempotency_key`, duplicate sender/recipient/key insert does not create a second row; the caller gets the prior result or a dedupe-shaped result.

### 12.7 `get_messages`

Parameter table:

| Name | Type | Required | Default | Validation |
| --- | --- | --- | --- | --- |
| `node_id` | string | yes | none | self-only |
| `status` | string/null | no | `unread` | SQL filter; null means any status |
| `include_sent` | boolean | no | false | maps direction to both |
| `limit` | integer | no | 100 | clamped 1..500 |
| `offset` | integer | no | 0 | min 0 |
| `sort_order` | string | no | `asc` | only `asc` or `desc`; invalid becomes `asc` |
| `msg_type` | string | no | null | SQL filter |
| `since` | string | no | null | `created_at >= since` |
| `ref_task_id` | string | no | null | SQL filter |
| `min_priority` | integer | no | null | clamped 1..3 |
| `after_id` | integer | no | null | SQL filter |
| `direction` | string | no | received or both | `received`, `sent`, `both`; invalid becomes received |
| `exclude_types` | string | no | null | comma-separated list |
| `peer_node` | string | no | null | peer filter |
| `verbosity` | string | no | full | `summary` applies summarizer |

Authority: self-only.

State changes: first retrieval of unread received messages writes `delivered_at` and `delivered_at_epoch_ms` for those message IDs. It does not mark read.

Response shapes:

```json
{"inbox":[{"id":1,"from_node":"pm","to_node":"builder-a","status":"unread"}],"count":1}
```

```json
{"messages":[{"id":1}],"count":1,"direction":"both","node_id":"builder-a"}
```

Errors: caller mismatch or storage failure. Repeated reads are safe; only first read changes delivery receipt.

### 12.8 `bulk_acknowledge`

Parameter table:

| Name | Type | Required | Default | Validation |
| --- | --- | --- | --- | --- |
| `node_id` | string | yes | none | self-only |
| `message_ids` | array of integers | yes | none | may be empty |

State changes:

- If list is empty, no write.
- Otherwise update `messages` set `status='read'`, `read_at`, and `read_at_epoch_ms` where `id IN message_ids`, `to_node=node_id`, and `status='unread'`.

Response fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `acknowledged` | integer | number of rows changed |
| `message_ids` | array | requested IDs |
| `read_at` | string | read timestamp when non-empty |

Example:

```json
{"acknowledged":2,"message_ids":[1,2],"read_at":"<time>"}
```

Idempotency: already-read, missing, or not-owned IDs do not change rows and do not fail.

### 12.9 `create_task`

Parameter table:

| Name | Type | Required | Default | Validation |
| --- | --- | --- | --- | --- |
| `task_id` | string | yes | none | unique; must not be reserved SWAT namespace |
| `title` | string | yes | none | non-empty |
| `description` | string | no | empty | stored |
| `assigned_to` | string | no | empty | if present, node must exist unless policy permits placeholder |
| `status` | string | no | `backlog` | task status enum |
| `priority` | integer | no | 3 | 1..5 |
| `project` | string | no | empty | stored |
| `depends_on` | array | no | empty | each dependency must be valid by policy |
| `output_branch` | string | no | null | stored |
| `notes` | string | no | null | stored |
| `repo_path` | string | no | null | only for local ancestry checks; do not depend on portability |
| `linked_swat_id` | string | no | null | optional implementation link |

Authority: authenticated node; cross-node assignment may be limited by policy.

DB writes/state changes:

- Insert into `tasks`.
- Insert `task_deps` rows for dependencies.
- Store topology context and cluster/project metadata where available.
- Write task-created event/audit.

Response fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `task_id` | string | new task |
| `created` | boolean | true |
| `status` | string | current status |
| `assigned_to` | string | assignee |
| `priority` | integer | priority |

Example:

```json
{"task_id":"task-1","created":true,"status":"backlog","assigned_to":"","priority":3}
```

Errors: duplicate task, invalid assignee, invalid priority, reserved task ID namespace, invalid dependency, storage failure. Idempotency is by unique `task_id`; exact duplicate creates an error, not a second task.

### 12.10 `update_task`

Parameter table:

| Name | Type | Required | Default | Validation |
| --- | --- | --- | --- | --- |
| `task_id` | string | yes | none | existing task |
| `status` | enum | no | preserve | must be legal status and transition |
| `notes` | string | no | preserve | stored |
| `output_branch` | string | no | preserve | stored |
| `assigned_to` | string | no | preserve | node existence/policy |
| `project` | string | no | preserve | stored |
| `depends_on` | array | no | preserve | rewrites dependency rows |
| `review_ack` | object | no | absent | caller must be reviewer |
| `evidence` | object | no | absent | citation entries must include `type` |

Authority:

- Authenticated node required.
- Self-claim is allowed by setting `assigned_to` to caller.
- Cross-node reassignment, forced close, and review overrides should require PM, operator, or OPA policy.

DB writes/state changes:

- Validate current task and transition table.
- Update changed task columns and `updated_at` fields.
- Rewrite dependencies if supplied.
- Persist review ack if supplied and valid.
- Persist evidence if supplied and valid.
- On `done`, cascade unblock dependents whose blockers are done.
- Release related review claims/boomerangs where reference behavior wires them.
- Write audit/event rows.

Response example:

```json
{"task_id":"task-1","status":"in_progress","assigned_to":"builder-a","updated":true}
```

Errors:

| Case | Error |
| --- | --- |
| Unknown status | invalid params with valid-status list |
| Disallowed transition | domain error reason `transition_not_allowed` |
| Unknown current status | domain error reason `unknown_status` |
| Missing task | tool error |
| Bad review ack caller | authorization/domain error |
| Bad evidence citation | invalid params |

Idempotency: setting fields to existing values is no-op success. v2 task claim must be compare-and-swap safe.

### 12.11 `get_my_tasks`

Parameter table:

| Name | Type | Required | Default | Validation |
| --- | --- | --- | --- | --- |
| `node_id` | string | yes | none | self-only |
| `status` | string | no | all active for node | must be a task status if supplied |

State changes: may auto-promote blocked tasks when dependencies are satisfied.

Response example:

```json
{"node_id":"builder-a","tasks":[{"task_id":"task-1","title":"Build feature","status":"ready","assigned_to":"builder-a","priority":3}]}
```

Errors: caller mismatch, bad status, storage failure. Repeated reads are safe except for dependency auto-promotion.

### 12.12 `record_task_evidence`

Parameter table:

| Name | Type | Required | Default | Validation |
| --- | --- | --- | --- | --- |
| `item_id` | string | yes | none | task, SWAT, or acceptance item identifier |
| `item_type` | enum | no | `task` | `task`, `swat`, `rfc_ac` |
| `leg` | enum | yes | none | `BUILD`, `SHIP`, `ACCEPTANCE` |
| `result` | enum | yes | none | `PASS`, `FAIL`, `UNKNOWN` |
| `ref` | string | no | empty | evidence citation |
| `repo_id` | string | no | empty | structured repository identity |
| `method` | string | no | empty | capture method |
| `node_id` | string | no | caller | if present, must match caller |

Authority: self-only for `node_id`; administrative evidence requires explicit elevated policy.

DB writes/state changes:

- Upsert into `task_evidence` on item, type, leg, and caller.
- Store `result`, `ref`, `repo_id`, `method`, and timestamps.
- Write audit/event rows.
- Completion gates may read the evidence immediately.

Response example:

```json
{"item_id":"task-1","item_type":"task","leg":"BUILD","result":"PASS","recorded":true,"caller_node":"builder-a"}
```

Errors: bad enum, caller mismatch, missing item, storage failure. Replays overwrite the caller's prior evidence for the same leg.

## 13. Expanded state machines

### 13.1 Node lifecycle transition table

| From | To | Trigger tool/path | Guard | Side effects |
| --- | --- | --- | --- | --- |
| running | saving | restart request | PM/operator/OPA | update lifecycle, message target |
| running | stale | heartbeat sweep | last-seen beyond stale threshold | update lifecycle and transition time |
| running | offline | deregister or offline sweep | stronger timeout or explicit deregister | update lifecycle; may release work attention |
| running | stopped | stop request | privileged planned stop | update lifecycle |
| running | boot_wedged | content ack trigger | retry count >= role retry cap | update lifecycle; send recovery message |
| running | molting | self refresh start | self or coordinator accepted refresh | update lifecycle |
| saving | ready_for_restart | confirm state saved | target reports save complete | update lifecycle |
| saving | stale | save-timeout sweep | saving longer than timeout | update lifecycle |
| saving | running | abort save | self or privileged cancel | clear pending restart intent |
| ready_for_restart | restarting | execute restart | restart actor begins | update lifecycle |
| ready_for_restart | running | cancel restart | self or privileged cancel | clear pending restart |
| ready_for_restart | stale | timeout sweep | missed heartbeat | update lifecycle |
| ready_for_restart | stopped | stop request | privileged planned stop | update lifecycle |
| restarting | running | `bootstrap_node` | successful bootstrap | reset boot/session fields |
| restarting | stale | timeout sweep | no successor heartbeat | update lifecycle |
| restarting | offline | timeout/deregister | no successor; offline policy | update lifecycle |
| restarting | stopped | stop request | privileged planned stop | update lifecycle |
| stopped | running | `bootstrap_node` or start | node returns | update lifecycle |
| stopped | offline | offline sweep | stopped node unreachable | update lifecycle |
| stale | running | `heartbeat`, `check_inbox`, or `bootstrap_node` | node proves liveness | update lifecycle |
| stale | offline | offline sweep | stale beyond threshold | update lifecycle |
| stale | saving | restart request | privileged restart of stale node | update lifecycle |
| offline | running | `bootstrap_node` | node returns | update lifecycle |
| offline | stale | weak liveness | partial heartbeat/liveness | update lifecycle |
| boot_wedged | running | recovery grant or successful ack refresh | policy allows | clear wedge by lifecycle update |
| molting | running | successor bootstrap | successful bootstrap | update lifecycle |
| molting | offline | timeout sweep | dark successor | update lifecycle |
| molting | stale | heartbeat timeout | stale successor | update lifecycle |
| molting | stopped | stop request | privileged stop | update lifecycle |

### 13.2 Task transition table

| From | To | Trigger tool/path | Guard | Side effects |
| --- | --- | --- | --- | --- |
| backlog | ready | `update_task` | work is ready | update task timestamp |
| backlog | in_progress | `update_task` claim/start | assignee/self-claim policy | set assignee if supplied |
| backlog | blocked | `update_task` | blocker declared | store notes/deps |
| backlog | cancelled | `update_task` | cancel authority | terminal-ish state |
| ready | in_progress | `update_task` | claim/start | set assignee if supplied |
| ready | backlog | `update_task` | de-prioritize | update status |
| ready | blocked | `update_task` | blocker declared | store blocker |
| ready | cancelled | `update_task` | cancel authority | update status |
| in_progress | review | `update_task` | ready for review | may create review work |
| in_progress | ready | `update_task` | unclaim/back out | update status |
| in_progress | blocked | `update_task` | blocker declared | store blocker |
| in_progress | cancelled | `update_task` | cancel authority | update status |
| in_progress | done | `update_task` | evidence/policy allows | cascade unblock |
| review | done | `update_task` | approval/evidence gate | cascade unblock; release claims |
| review | in_progress | `update_task` | changes requested | reopen for assignee |
| review | blocked | `update_task` | blocker declared | update status |
| review | cancelled | `update_task` | cancel authority | update status |
| blocked | ready | dependency auto-promote or `update_task` | blockers cleared | update status |
| blocked | in_progress | `update_task` | resume | update status |
| blocked | backlog | `update_task` | de-prioritize | update status |
| blocked | cancelled | `update_task` | cancel authority | update status |
| done | in_progress | `update_task` | reopen | update status |
| done | ready | `update_task` | reopen to queue | update status |
| cancelled | backlog | `update_task` | revive | update status |
| cancelled | ready | `update_task` | revive ready | update status |

### 13.3 Review transition table

| From | To | Trigger tool/path | Guard | Side effects |
| --- | --- | --- | --- | --- |
| no_review | review_requested | `update_task(status=review)` | assignee says ready | task enters review |
| review_requested | approved | `update_task(review_ack=approve)` | caller is reviewer | append/store ack |
| review_requested | changes_requested | `update_task(review_ack=request_changes)` | caller is reviewer | append/store ack |
| approved | closed | `update_task(status=done)` | evidence gate passes | task done; release claims |
| changes_requested | in_progress | `update_task(status=in_progress)` | assignee resumes | task reopened |

Legal review values are implementation-specific in the task review table, but v2 must support at least approve and request-changes semantics.

### 13.4 Boomerang transition table

| From | To | Trigger tool/path | Guard | Side effects |
| --- | --- | --- | --- | --- |
| none | thrown | throw helper/tool | WIP cap allows or priority preempts | insert boomerang |
| thrown | caught | `catch_boomerang` | caller is assignee | clear pause/escalation fields |
| preempted | caught | `catch_boomerang` | caller is assignee | resume item |
| escalated | caught | `catch_boomerang` | caller is assignee | clear escalation fields |
| caught | in_progress | start-work path | caller is assignee | update status/timestamp |
| thrown | preempted | throw helper | priority item needs capacity | pause victim clock |
| caught | preempted | throw helper | priority item needs capacity | pause victim clock |
| in_progress | preempted | throw helper | priority item needs capacity | pause victim clock |
| thrown | escalated | escalation sweep | deadline missed | set escalated timestamp |
| caught | escalated | escalation sweep | deadline missed | set escalated timestamp |
| in_progress | escalated | escalation sweep | deadline missed | set escalated timestamp |
| caught | returned_complete | `return_boomerang` | caller is assignee | set return fields |
| in_progress | returned_complete | `return_boomerang` | caller is assignee | set return fields |
| escalated | returned_complete | `return_boomerang` | caller is assignee | set return fields |
| caught | returned_blocked | `return_boomerang` | return_category valid | increment bounce count |
| in_progress | returned_blocked | `return_boomerang` | return_category valid | increment bounce count |
| escalated | returned_blocked | `return_boomerang` | return_category valid | increment bounce count |
| returned_complete | returned_complete | `return_boomerang` replay | same terminal target | idempotent no-op |
| returned_blocked | returned_blocked | `return_boomerang` replay | same terminal target | idempotent no-op |
| thrown | superseded | context-refresh throw | existing active from old session | old row uncatchable |

### 13.5 OPA transition table

| From | To | Trigger tool/path | Guard | Side effects |
| --- | --- | --- | --- | --- |
| none | active | grant tool | operator/delegated authority | insert `ops_elevations` |
| active | consumed | privileged action or explicit consume | scope is `action`; node matches; not revoked/expired | set `consumed=1`, `consumed_at`, `consumed_by_action`; log usage |
| active | revoked | revoke tool | operator or self-revoke owner | set `revoked_at`, `revoked_by` |
| active | expired | read/check path | `expires_at` not in future | derived state, no write required |
| consumed | consumed | consume replay | already consumed | return `already_consumed` |

v2 additional guard: if stored `action_type` is non-null, requested action must equal it before consume.

### 13.6 SWAT transition table

| From | To | Trigger tool/path | Guard | Side effects |
| --- | --- | --- | --- | --- |
| none | open | create SWAT | required body and type valid | insert row and audit |
| open | in_review | claim or auto-route | reviewer eligible and not recused | set current reviewer; may throw review boomerang |
| in_review | fixed | submit verdict approve | assigned reviewer; build type has fix commit | append reviewer; audit verdict |
| in_review | closed | submit verdict reject | assigned reviewer | set closed reason; audit |
| in_review | open | submit verdict request_changes | assigned reviewer | clear/route reviewer; audit |
| fixed | fixed | submit additional approve | independent eligible reviewer | append cosign audit |
| fixed | closed | close tool/policy | ship/acceptance or disposition policy | close row; audit |
| open | closed | administrative disposition | PM/operator policy | close row; audit |

Legal values: stages `open`, `in_review`, `fixed`, `closed`; verdicts `approve`, `request_changes`, `reject`; severities `critical`, `high`, `medium`, `low`; types `build`, `audit`, `analysis`, `verify`.

## 14. Restart lever ordered steps

### 14.1 Ordered step table

| Step | Action | Check | Failure exit | Rollback |
| --- | --- | --- | --- | --- |
| 1 | Load parameters and environment | required paths, target SHA, launch command | 1 or 78 | no state change |
| 2 | Verify skill invocation token | token present, valid, unused unless breakglass | 1 | no state change |
| 3 | Verify source checkout | required branch, intended SHA, clean tree unless breakglass | 78 | no state change |
| 4 | Import/smoke preflight | coordinator imports and launch prerequisites pass | 79 or 1 | no state change |
| 5 | Discover live coordinator process | exact launch signature | 1 for ambiguous unsafe state | no state change |
| 6 | Reserve restart intent | `POST /api/restart/reserve` succeeds or explicit skip policy | 3 on conflict; 503 path per policy | release nothing if not reserved |
| 7 | Pre-broadcast | send restart notice if live and not skipped | warning only | continue |
| 8 | Drain wait | bounded wait | none | continue |
| 9 | Re-verify intended SHA | same target still checked out unless drift allowed | 78 | release intent; live coordinator remains up |
| 10 | MOLT lease verify | release/check all executor leases empty | 2 | release intent; live coordinator remains up |
| 11 | OPA consume at point of no return | consume cited single-use grant; replay guard | 4 for different-intent replay | release intent; live coordinator remains up |
| 12 | Stop coordinator | stop/kill exact process IDs | 1 | release intent if stop failed before launch |
| 13 | Clear singleton lease | best-effort DB cleanup | warning only | continue |
| 14 | Clean orphan launchers | exact coordinator launcher signature only | warning only | continue |
| 15 | Launch coordinator | detached supervisor launch | 1 | kill partial launch; release intent |
| 16 | Health loop | health says ok and DB read ok | 1 | kill launched child; release intent |
| 17 | Capture runtime witness | record PID/launch identity | warning only | continue |
| 18 | MCP round trip | optional test call succeeds | 1 by strict policy | release intent; coordinator may stay up if healthy |
| 19 | Event stream probe | event stream responds or policy permits degraded | 7 advisory or 8 hard rollback | release intent; hard policy may stop launched process |
| 20 | Post-broadcast | send resume notice | warning only | continue |
| 21 | Release restart intent | `POST /api/restart/release` | warning on failure | success still reported if coordinator healthy |
| 22 | Consume skill token | mark token spent | warning or 1 by policy | none |

### 14.2 Restart fence record shapes

Table row:

```json
{
  "intent_id": "ri-uuid",
  "deploying_node": "builder-a",
  "target_sha": "full-target-sha",
  "minted_at_ms": 1,
  "expires_at_ms": 2,
  "status": "active",
  "released_at_ms": null
}
```

Reserve request:

```json
{"target_sha":"full-target-sha","ttl_ms":600000}
```

Reserve success:

```json
{"status":"reserved","intent_id":"ri-uuid","expires_at_ms":2,"minted_at_ms":1}
```

Reserve conflict:

```json
{
  "status": "conflict",
  "peer_intent_id": "ri-peer",
  "peer_node": "builder-b",
  "peer_sha": "full-target-sha",
  "peer_minted_at_ms": 1,
  "peer_expires_at_ms": 2
}
```

Release request:

```json
{"intent_id":"ri-uuid"}
```

Release response:

```json
{"status":"released","intent_id":"ri-uuid","was_active":true}
```

## 15. Restore proof SQL

The coordinator restore proof is PostgreSQL-first. Run these read-only checks against the restored scratch database after integrity verification and before promotion. Placeholder syntax may be adapted by the harness, but the catalog queries are the executable specification.

### 15.1 Table count and required tables

```sql
SELECT COUNT(*) AS user_table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';
```

```sql
WITH required(table_name) AS (
  VALUES
    ('nodes'),
    ('messages'),
    ('tasks'),
    ('task_evidence'),
    ('node_identities'),
    ('node_session_tokens'),
    ('ops_elevations'),
    ('boomerangs'),
    ('restart_intents')
)
SELECT r.table_name, (t.table_name IS NOT NULL) AS present
FROM required r
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public'
 AND t.table_type = 'BASE TABLE'
 AND t.table_name = r.table_name
ORDER BY r.table_name;
```

Pass rule: every required table that exists in the source schema must be present in the restored schema. A first rebuild fixture may omit advanced tables only if the fixture manifest declares them out of scope.

### 15.2 Core row counts

```sql
SELECT 'nodes' AS table_name, COUNT(*) AS row_count FROM public.nodes
UNION ALL SELECT 'messages', COUNT(*) FROM public.messages
UNION ALL SELECT 'tasks', COUNT(*) FROM public.tasks
UNION ALL SELECT 'task_evidence', COUNT(*) FROM public.task_evidence
UNION ALL SELECT 'node_identities', COUNT(*) FROM public.node_identities
UNION ALL SELECT 'node_session_tokens', COUNT(*) FROM public.node_session_tokens
UNION ALL SELECT 'ops_elevations', COUNT(*) FROM public.ops_elevations
UNION ALL SELECT 'boomerangs', COUNT(*) FROM public.boomerangs
UNION ALL SELECT 'restart_intents', COUNT(*) FROM public.restart_intents;
```

Pass rule: counts must query successfully and be greater than or equal to zero. Production snapshots should have at least one `nodes` row.

### 15.3 Newest-key recency

For the v2 PostgreSQL schema in `schema-reference.md`, validate recency against timestamp columns that actually exist:

```sql
SELECT 'nodes.last_seen_at' AS key_name, MAX(last_seen_at) AS newest_at
FROM public.nodes
UNION ALL
SELECT 'messages.created_at', MAX(created_at) FROM public.messages
UNION ALL
SELECT 'tasks.updated_at', MAX(updated_at) FROM public.tasks
UNION ALL
SELECT 'events.created_at', MAX(created_at) FROM public.events;
```

If a fixture exposes only `events_all`, replace the final select with `SELECT 'events_all.created_at', MAX(created_at) FROM public.events_all`.

Reference or legacy schema variant:

```sql
SELECT 'nodes.last_seen' AS key_name, MAX(last_seen_epoch_ms) AS newest_epoch_ms
FROM nodes
UNION ALL
SELECT 'messages.created_at', MAX(created_at_epoch_ms) FROM messages
UNION ALL
SELECT 'tasks.updated_at', MAX(updated_at_epoch_ms) FROM tasks
UNION ALL
SELECT 'events.timestamp', MAX(timestamp_epoch_ms) FROM events_all;
```

Pass rule: for production snapshots, at least one operational newest key must be within the freshness window declared by the backup policy. For fixtures, null recency is warning-only when the fixture manifest declares an empty restore.

### 15.4 Required column checks

```sql
WITH required(table_name, column_name) AS (
  VALUES
    ('nodes','node_id'),
    ('nodes','role'),
    ('nodes','lifecycle_state'),
    ('node_identities','session_token'),
    ('tasks','status'),
    ('messages','status'),
    ('task_evidence','leg'),
    ('restart_intents','status')
)
SELECT r.table_name || '.' || r.column_name AS required_column,
       (c.column_name IS NOT NULL) AS present
FROM required r
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = r.table_name
 AND c.column_name = r.column_name
ORDER BY required_column;
```

Pass rule: every row must have `present=true`.

### 15.5 Enum value checks

```sql
SELECT lifecycle_state, COUNT(*) AS count
FROM public.nodes
WHERE lifecycle_state NOT IN (
  'running',
  'saving',
  'ready_for_restart',
  'restarting',
  'stopped',
  'stale',
  'offline',
  'boot_wedged',
  'molting'
)
GROUP BY lifecycle_state;
```

```sql
SELECT status, COUNT(*) AS count
FROM public.tasks
WHERE status NOT IN (
  'backlog',
  'ready',
  'in_progress',
  'review',
  'blocked',
  'done',
  'cancelled'
)
GROUP BY status;
```

```sql
SELECT leg, COUNT(*) AS count
FROM public.task_evidence
WHERE leg NOT IN ('BUILD', 'SHIP', 'ACCEPTANCE')
GROUP BY leg;
```

Pass rule: each query returns zero rows. If legacy `ACCEPT` rows exist, the restore test must fail unless a migration step maps them to `ACCEPTANCE` before validation.

### 15.6 Restart fence integrity

```sql
SELECT target_sha, COUNT(*) AS active_count
FROM public.restart_intents
WHERE status = 'active'
GROUP BY target_sha
HAVING COUNT(*) > 1;
```

Pass rule: zero rows.

### 15.7 Token integrity

```sql
SELECT n.node_id
FROM public.nodes n
LEFT JOIN public.node_identities i ON i.node_id = n.node_id
WHERE i.node_id IS NULL;
```

```sql
SELECT node_id, COUNT(*) AS token_count
FROM public.node_session_tokens
GROUP BY node_id
HAVING COUNT(*) > 3;
```

Pass rule: first query returns zero rows for production snapshots. Second query returns zero rows unless the deployment intentionally changed `MAX_TOKENS_PER_NODE`.

### 15.8 Message ownership and task dependency checks

```sql
SELECT m.id
FROM public.messages m
LEFT JOIN public.nodes r ON r.node_id = m.to_node
WHERE r.node_id IS NULL
  AND m.to_node NOT IN ('OPERATOR','SYSTEM','COORDINATOR');
```

```sql
SELECT d.task_id, d.depends_on
FROM public.task_deps d
LEFT JOIN public.tasks t1 ON t1.task_id = d.task_id
LEFT JOIN public.tasks t2 ON t2.task_id = d.depends_on
WHERE t1.task_id IS NULL OR t2.task_id IS NULL;
```

Pass rule: zero rows, except documented external/system recipients.

### 15.9 Cairn consistency checks

If Cairn lives in PostgreSQL, run:

```sql
SELECT stage, COUNT(*) AS count
FROM public.cairn_swats
GROUP BY stage
ORDER BY stage;
```

```sql
SELECT a.swat_id
FROM public.cairn_swat_audit a
LEFT JOIN public.cairn_swats s ON s.swat_id = a.swat_id
WHERE s.swat_id IS NULL;
```

```sql
SELECT item_id, COUNT(*) AS duplicate_count
FROM (
  SELECT task_id AS item_id FROM public.tasks
  UNION ALL
  SELECT swat_id AS item_id FROM public.cairn_swats
) x
GROUP BY item_id
HAVING COUNT(*) > 1;
```

If Cairn remains in a separate SQLite store, run only this short SQLite store check against the restored Cairn file, not against the PostgreSQL coordinator database:

```sql
PRAGMA integrity_check;
SELECT stage, COUNT(*) AS count FROM cairn_swats GROUP BY stage ORDER BY stage;
```

Pass rule: stage query succeeds; missing audit references are zero except documented tombstones; duplicate identity query returns zero rows. The SQLite `PRAGMA integrity_check` must return `ok`.

### 15.10 Cleanup

Close scratch database connections, drop the scratch database or discard the scratch instance, and remove transient restore files. Do not run cleanup against production.

## 16. Manual-mode worked example

Keep section 8 normative algorithm unchanged. This example shows the call
sequence for one explicit manual wake.

### 16.1 Transcript

Operator starts the node process manually:

```text
operator> start node builder-a in manual mode
```

Node reads its local identity:

```json
{"node_id":"builder-a","session_token":"00000000-0000-0000-0000-000000000000"}
```

Node calls bootstrap with token proof:

```json
{
  "jsonrpc": "2.0",
  "id": "boot-1",
  "method": "tools/call",
  "params": {
    "name": "bootstrap_node",
    "arguments": {
      "node_id": "builder-a",
      "_session_token": "00000000-0000-0000-0000-000000000000",
      "bootstrap_cwd_attestation": {
        "workspace_root": "<workspace>",
        "identity_agnostic": true,
        "scanned_files": ["<instructions>"]
      }
    }
  }
}
```

Coordinator responds:

```json
{
  "node_id": "builder-a",
  "bootstrapped": true,
  "session_token": "00000000-0000-0000-0000-000000000000",
  "life_services_setup": {
    "required_action_pending": true,
    "required_action": "confirm_life_services",
    "required_proof_fields": ["bb4_poll_schedule_active"]
  }
}
```

Because this is manual mode, the node does not create a recurring poll schedule.
It records manual mode through the gate-exemption tool; it does not claim a schedule:

```json
{
  "jsonrpc": "2.0",
  "id": "manual-1",
  "method": "tools/call",
  "params": {
    "name": "set_manual_mode",
    "arguments": {
      "node_id": "builder-a",
      "_session_token": "00000000-0000-0000-0000-000000000000",
      "enabled": true,
      "reason": "explicit manual wake"
    }
  }
}
```

Coordinator records the gate exemption:

```json
{
  "node_id": "builder-a",
  "manual_mode": true,
  "reason": "explicit manual wake",
  "set_at": "<time>"
}
```

Node drains immediate work once:

```json
{
  "jsonrpc": "2.0",
  "id": "batch-1",
  "method": "tools/call",
  "params": {
    "name": "batch",
    "arguments": {
      "node_id": "builder-a",
      "_session_token": "00000000-0000-0000-0000-000000000000",
      "ops": [
        {"action": "check_inbox", "minimal": false},
        {"action": "heartbeat", "phase": "manual-active"}
      ]
    }
  }
}
```

Coordinator returns per-op results:

```json
{
  "results": [
    {"action": "check_inbox", "ok": true, "data": {"inbox": [], "tasks": []}},
    {"action": "heartbeat", "ok": true, "data": {"node_id": "builder-a", "heartbeat": {"status": "ok"}}}
  ],
  "count": 2,
  "mcp_schema_version": "schema-version"
}
```

Node works only in the foreground manual session. On exit, it does not schedule a
future wake:

```text
node> manual session complete; no recurring polling created
```
