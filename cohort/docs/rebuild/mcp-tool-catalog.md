# MCP tool catalog

The coordinator's MCP tool surface, as served by the reference implementation. Tool names and
parameter names are part of the design contract. Descriptions are summarized and made generic,
so treat them as orientation: the reference source is authoritative for full behavior and validation. The heartbeat operation is not a standalone MCP tool; it is a `batch` sub-operation that calls the same coordinator check-in writer and returns only the heartbeat confirmation.

Conventions that apply to every tool:

- Every tool also accepts an injected `_session_token` string. It is omitted from the tables below.
- Calls are MCP `tools/call` over JSON-RPC 2.0; see [`backend-hosting.md`](backend-hosting.md) section 6.3.
- A few hundred tools in one flat namespace is too many; see the assessment in `backend-hosting.md`
  section 17 before copying this surface as-is. It is shown here so a rebuild can see the full shape.

| Group | Tools |
| --- | --- |
| [Boomerang delegation](#boomerang-delegation) | 4 |
| [Boot and life services](#boot-and-life-services) | 5 |
| [Cairn RFCs, seeds, waves, gates and council](#cairn-rfcs-seeds-waves-gates-and-council) | 49 |
| [Cairn knowledge base](#cairn-knowledge-base) | 9 |
| [Cairn scratch](#cairn-scratch) | 4 |
| [Cohort release](#cohort-release) | 5 |
| [Database operations](#database-operations) | 4 |
| [Fleet state and health](#fleet-state-and-health) | 12 |
| [Identity, memory and handoff](#identity-memory-and-handoff) | 9 |
| [Lessons](#lessons) | 3 |
| [Messaging](#messaging) | 7 |
| [Molt and lifecycle](#molt-and-lifecycle) | 8 |
| [Operator authorization (OPA)](#operator-authorization-opa) | 8 |
| [Other](#other) | 47 |
| [Review](#review) | 7 |
| [SWAT](#swat) | 13 |
| [Spyglass search](#spyglass-search) | 4 |
| [Tasks and board](#tasks-and-board) | 9 |

## Boomerang delegation

### `catch_boomerang`

Catch (acknowledge receipt of) a boomerang thrown to you. Transitions from 'thrown' or 'preempted' to 'caught'.

Parameters (`*` = required): `node_id`*: string; `item_id`*: string; `topology_version_last_seen`: integer

### `get_boomerangs`

Query boomerang work items. Filter by assignee, originator, or status.

Parameters (`*` = required): `node_id`*: string; `assignee`: string; `originator`: string; `status`: string

### `return_boomerang`

Return a boomerang to its originator -- either completed or blocked (bounce). Only the assignee can return.

Parameters (`*` = required): `node_id`*: string; `item_id`*: string; `status`*: string (returned_complete, returned_blocked); `return_category`: string (capacity, scope_change, blocked_by, needs_info, wrong_node, deadline_unreasonable); `return_reason`: string

### `throw_boomerang`

Throw a boomerang work item to a node. Enforces WIP cap (5 active/node) and deadline bounds per complexity tier. P1 items can preempt. Set micro_mode=true for micro-boomerangs .

Parameters (`*` = required): `node_id`*: string; `assignee`*: string; `ref_task_id`: string; `deadline_minutes`: integer; `priority`: integer; `complexity_tier`: string (quick, medium, deep); `scope_description`*: string; `escalation_target`: string; `micro_mode`: boolean; `micro_tier`: string (3m, 5m, 10m); `kind`: string (work, context_refresh); `deliver_after_minutes`: integer; `deliver_at`: string; `hosts_affected`: string (same_host, cross_host, fleet); `topology_version`: integer


## Boot and life services

### `bootstrap_node`

Single-call node bootstrap. Takes only node_id, re-registers with stored defaults (capabilities, role), and returns full identity + startup narrative + inbox in one response. Intended flow: read node_id from ~/.copilot/fleet-identity.json, then call bootstrap_node(node_id).

Parameters (`*` = required): `node_id`*: string; `node_secret`: string; `skill_manifest`: array; `bootstrap_cwd_attestation`: object

### `clear_session_lock`

Clear another node's stale session lock so it can re-bootstrap. Requires fleet auth token. Only works on stale (>5min), recovery-state, or reboot-authorized sessions -- cannot replace a healthy active session.

Parameters (`*` = required): `target_node_id`*: string; `auth_token`*: string; `kb_reference`: string

### `confirm_life_services`

Post-bootstrap life services validation. Call this after starting life services (bb4-poll schedule, wake consumer, daemon) to prove they are running. Coordinator marks the session as confirmed. Until confirmed, the node is tracked as 'unconfirmed' in fleet status. Idempotent -- calling again updates the timestamp.

Parameters (`*` = required): `node_id`*: string; `proof`*: object

### `get_bootstrap_metrics`

Read structured bootstrap_tool_call_count snapshots . Returns helper-shape rows with schema_version + bootstrap_tool_call_count surfaced via json_extract. Read-only; any authenticated node may call.

Parameters (`*` = required): `node_id`: string; `limit`: integer; `since_epoch_ms`: integer

### `register_node`

Register or re-register a worker node row. First registration is accepted only for an operator-provisioned node secret or allowlisted/provisioned node ID; re-registration of an existing row requires the same node's valid session token.

Parameters (`*` = required): `node_id`*: string; `capabilities`*: array; `role`: string; `working_dir`: string

### `release_session`

Release your own session token so a new session can bootstrap without reboot protocol. Self-service only -- you can only release your own session.

Parameters (`*` = required): `node_id`*: string; `reason`: string


## Cairn RFCs, seeds, waves, gates and council

### `cairn_activation_auth_create`

Privileged OPERATOR/OPA-only mint of a byte-bound single-use Cairn backend activation authorization. Computes binding_digest from subsystem_id, DSN fingerprint, manifest version/checksum, marker identity/watermark, parity digest, and requested transition.

Parameters (`*` = required): `subsystem_id`*: string; `creator_provenance`*: string; `dsn_fingerprint`*: string; `manifest_version`*: string; `manifest_checksum`*: string; `marker_identity`*: string; `marker_watermark`*: string; `parity_digest`*: string; `requested_transition`*: string; `grant_id`: string

### `cairn_approval_event`

Item-(3): PM-or-OPERATOR tool to record a non-ratify approval throughline event into cairn_approval_events. Allowed event_types: qualifier_add, approve_conditional, revoke, defer. 'ratify' is rejected -- that path is auto-recorded by cairn_ratify (item-(2) ingestion wire-site).

Parameters (`*` = required): `rfc_id`*: string; `event_type`*: string (qualifier_add, approve_conditional, revoke, defer); `qualifier_text`: string; `scope_delta_json`: string; `source_msg_id`: integer

### `cairn_archive`

Archive a seed or RFC. Sets status to 'archived'. PM/architect role, OR any caller with a valid OPERATOR-issued OPA grant for action_type='cairn_archive'.

Parameters (`*` = required): `rfc_id`*: string; `reason`: string; `grant_id`: string

### `cairn_close_gate`

Transition a gate from open to closed (terminal). Validates close_disposition against DISPOSITIONS. close_disposition='deferred' REQUIRES non-empty deferral_evidence_ref. close_disposition='force_closed' REQUIRES OPERATOR-grant (handler verifies via check_privileged before passing operator_grant=True).

Parameters (`*` = required): `rfc_id`*: string; `gate_id`*: string; `close_disposition`*: string; `close_reason`: string; `deferral_evidence_ref`: string; `architect_cosign_ref`: string; `builder_evidence_ref`: string; `grant_id`: string

### `cairn_close_wave`

Close an open discussion wave on an RFC with synthesis. The synthesis is recorded on the wave row and surfaced via cairn_get(section='waves'). PM/OPERATOR/OPA-gated.

Parameters (`*` = required): `rfc_id`*: string; `synthesis`*: string; `round_number`: integer

### `cairn_council_set_enabled`

LSG council v1 item-5: PM/architect runtime toggle of COUNCIL_V1_ENABLED kill-switch. Writes to coordinator_config; env-var remains hard safety floor (env=False blocks DB-True activation). Returns {ok, enabled, effective, env_floor, set_by, reason, warning}. SSE-broadcast on success. OPA-eligible.

Parameters (`*` = required): `enabled`*: boolean; `reason`: string; `grant_id`: string

### `cairn_declare_gate`

Author-facing gate declaration on an RFC. Creates a new (rfc_id, gate_id) row in state='open'. Rejects reserved-prefix gate_ids (discussion-wave-*, ship-gate, review-pass-*) -- those are auto-allocated by coordinator state transitions. Use custom-* or solidplan-section-* ids for author-declared gates.

Parameters (`*` = required): `rfc_id`*: string; `gate_id`*: string; `gate_kind`*: string; `phase_label`: string; `cosign_coverage`: object; `metadata`: object

### `cairn_edit_response`

Edit your own response to a wave. Author-only, wave must be open.

Parameters (`*` = required): `response_id`*: integer; `body`*: string; `stance`: string (support, object, nuance, defer); `edit_reason`: string

### `cairn_edit_rfc`

[DEPRECATED -- use cairn_revise instead] Edit an RFC's body text after creation. Creates a new revision. PM/architect/OPERATOR/OPA-gated. Both tools call the same revise_rfc handler; cairn_revise has the cleaner audit event type (cairn_revise vs cairn_ideation).

Parameters (`*` = required): `rfc_id`*: string; `body`*: string; `revision_note`: string

### `cairn_frame`

Add OPERATOR framing comment to a response. PM/OPERATOR/OPA-gated.

Parameters (`*` = required): `response_id`*: integer; `body`*: string

### `cairn_get`

Get a seed, RFC, scratch, or KB article by ID/slug. Default returns SUMMARY only (title, status, author, tags, stats). Use section= for specific parts or full=true for everything. KB slugs (e.g. 'rfc-lifecycle') are fetched transparently as a fallback -- no need to switch to cairn_kb for a straight by-id read.

Parameters (`*` = required): `id`: string; `rfc_id`: string; `section`: string (body, solidplan, waves, votes, audit, summary, tags, operator_notes); `max_kb`: integer; `offset`: integer; `full`: boolean

### `cairn_get_firing`

Fetch a single council firing row by firing_id. Read-only. Used by the council vessel skill to confirm vessel assignment after a session restart, and by the SLA monitor.

Parameters (`*` = required): `firing_id`*: integer

### `cairn_get_for_routing`

I6.2 v3 : PM routing-read policy exception surface. Distinct MCP tool whose tool-name identity is trusted at MCP dispatch (caller cannot spoof tool name; coord enforces via tool registry). Requires a structured routing_context payload: {purpose, target_node, task_ref} (all required strings).

Parameters (`*` = required): `node_id`*: string; `id`: string; `rfc_id`: string; `section`: string; `routing_context`*: object

### `cairn_interactions`

Get all interactions (signals, stars, frames) for an RFC or specific response.

Parameters (`*` = required): `rfc_id`*: string; `response_id`: integer

### `cairn_lesson_auto_archive_set_threshold_days`

PM/architect set the daily lesson-sentinel age threshold. ACTIVE lessons older than this are auto-ARCHIVED on the next sentinel run (graduation gate remains canonical quality filter; sentinel only handles staleness). Default 90 days; bounds [7, 3650]. Persists to coordinator_config. OPA-eligible.

Parameters (`*` = required): `days`*: integer; `reason`: string; `grant_id`: string

### `cairn_lesson_sentinel_run`

Trigger one sentinel sweep now. Returns counts (scanned/archived/failed). Idempotent. No privilege check -- safe read+archive operation, but only PM-driven schedulers should normally invoke (cohort-level cron handles default cadence).

Parameters (`*` = required): none

### `cairn_list`

Browse/list CAIRN items by type without requiring a search query. Supports pagination. Use this to discover what exists without guessing keywords.

Parameters (`*` = required): `type`*: string (seed, rfc, kb, scratch); `status`: string; `sort`: string (created_at, updated_at, title); `limit`: integer; `offset`: integer; `domain`: string; `author`: string; `category`: string (A, B, C)

### `cairn_list_active`

List active RFCs/seeds filtered by status. Returns items sorted by last activity with wave count, response count, vote tally, responders, and tags. Default limit 5.

Parameters (`*` = required): `status`: string; `limit`: integer; `sort`: string (updated_at, created_at); `category`: string (A, B, C)

### `cairn_list_gates`

List all gates for an RFC, optionally filtered by gate_kind and/or state. Empty list (no gates declared) is the grandfather case -- cairn_ship treats empty as no-assert per wave-0 Q3 resolution.

Parameters (`*` = required): `rfc_id`*: string; `gate_kind`: string; `state`: string

### `cairn_open_gate`

System/auto-allocator-facing idempotent gate-open. Accepts reserved-prefix gate_ids (used by cairn_wave -> discussion-wave-N and cairn_rfc_promote -> ship-gate paths). Idempotent: if gate already in state='open' returns success with idempotent=true.

Parameters (`*` = required): `rfc_id`*: string; `gate_id`*: string; `gate_kind`*: string; `phase_label`: string; `cosign_coverage`: object; `metadata`: object

### `cairn_promote_seed`

[DEPRECATED -- use cairn_rfc_promote instead] Promote a seed one step. Wraps cairn_rfc_promote.

Parameters (`*` = required): `seed_id`*: string; `template`: string

### `cairn_ratify`

Ratify an RFC from `in_round`. Reference behavior requires a non-empty body and SOLIDPLAN unless OPERATOR override is used, then requires one legal basis: synthesized latest wave, blanket citation, OPA provenance citation, family-child citation, or OPERATOR-authored override. Approve votes are counted for audit but are not the gate. Optional `execution_authority` declares cleared-to-drive scope at ratify-time; enforcement is audit-only in v1.

Parameters (`*` = required): `rfc_id`*: string; `execution_authority`: string

### `cairn_respond`

Submit a response to the current open wave on an RFC. One response per node per wave.

Parameters (`*` = required): `rfc_id`*: string; `body`*: string; `stance`*: string (support, object, nuance, defer)

### `cairn_revise`

Update the body of an existing RFC/seed. Creates a new revision. Author, PM, or architect only.

Parameters (`*` = required): `rfc_id`*: string; `body`*: string; `revision_note`: string

### `cairn_rfc`

Create an RFC or promote a seed to ideation status in Cairn. CREATE ONLY -- to update an existing RFC use cairn_revise, to change status use cairn_set_status, to archive use cairn_archive.

Parameters (`*` = required): `title`*: string; `body`*: string; `template`: string; `domain`: string; `seed_id`: string; `tags`: array; `parent_rfc`: string; `rfc_type`: string (base, change, expansion); `category`: string (A, B, C); `related_rfcs`: array

### `cairn_rfc_demote`

Demote an RFC one step down the lifecycle. shipped is terminal (no demote). Returns previous_status + new_status.

Parameters (`*` = required): `rfc_id`*: string

### `cairn_rfc_promote`

Promote an RFC one step up the lifecycle (seed->ideation->in_round->ratified->shipped). Adjacency-enforced, no skipping. The seed->ideation step is privilege-gated: PM/architect/OPERATOR or an OPA grant for 'cairn_promote_to_ideation' is required, and a guestbook entry is recorded. Returns previous_status + new_status.

Parameters (`*` = required): `rfc_id`*: string

### `cairn_rfc_recycle`

Filing-cabinet slot recycle: hard-purge an archived RFC's contents and return the slot ID to a FIFO free-list for re-allocation. **DATA-DESTRUCTIVE, ONE-WAY** -- purge is irreversible by `git revert` (cascade-deletes body/responses/waves/votes/tags/audit/fts; only the cairn_id_recycle_audit row survives for forensics).

Parameters (`*` = required): `rfc_id`*: string; `reason`: string

### `cairn_rfc_rename`

Rename an RFC/seed ID. Updates all references across tables atomically. PM/architect/OPERATOR-gated.

Parameters (`*` = required): `old_id`*: string; `new_id`*: string

### `cairn_rfc_reparent`

Atomically set an RFC's rfc_type + parent_rfc_id in one transaction (the authoritative reparent primitive). Author/PM/architect-gated (OPA grant honored).

Parameters (`*` = required): `rfc_id`*: string; `rfc_type`*: string; `parent_rfc_id`: string; `justification`: string

### `cairn_search`

FTS5 full-text search across all Cairn content . Also indexes via Project Spyglass for tag-based filtering.

Parameters (`*` = required): `query`*: string; `scope`: array; `tags`: array; `limit`: integer

### `cairn_search_set_default_weights`

PM/architect set per-tier search weights overlay for cross-corpus ranking. Weight 1.0 = neutral. FTS5 BM25 ranks are negative, so weight >1.0 boosts (more-negative adjusted rank), <1.0 demotes. Persists to coordinator_config; survives restart; SSE-broadcast. OPA-eligible.

Parameters (`*` = required): `weights`*: object; `reason`: string; `grant_id`: string

### `cairn_seed`

Create a new idea seed in Cairn. Lowest friction entry point for capturing ideas -- no role gate. Good seeds have a problem statement (what observation/gap prompted this), a proposed direction (1-3 sentences pointing at where the fix lives -- not a full solution), and at least one `domain/*` tag.

Parameters (`*` = required): `title`*: string; `body`*: string; `tags`*: array; `source`: string; `parent_rfc`: string; `rfc_type`: string (base, change, expansion); `category`: string (A, B, C); `force`: boolean

### `cairn_set_category`

[DEPRECATED -- use cairn_set_meta(field='category', value=...) instead] Set or update the type category (A/B/C) on an RFC. Editable until ratification. A=feature, B=fix, C=process.

Parameters (`*` = required): `rfc_id`*: string; `category`*: string (A, B, C)

### `cairn_set_gate_state`

Architect/PM-only escape-hatch override of gate state. Audit-tagged is_override=true in metadata_json. Per wave-1 4: '3am-typo-recovery path. Doesn't weaken normal-close cosigner-or-author discipline.' override_reason is mandatory. Use cairn_close_gate for normal-discipline close.

Parameters (`*` = required): `rfc_id`*: string; `gate_id`*: string; `new_state`*: string; `override_reason`*: string

### `cairn_set_meta`

Unified setter for RFC/seed metadata fields. Replaces deprecated cairn_set_title/category/related_rfcs with a single (field, value) entry point. Allowlist enforced.

Parameters (`*` = required): `rfc_id`*: string; `field`*: string (title, category, related_rfcs); `value`*: any

### `cairn_set_related_rfcs`

[DEPRECATED -- use cairn_set_meta(field='related_rfcs', value=[...]) instead] Set the related_rfcs list on an RFC for cross-referencing with other RFCs.

Parameters (`*` = required): `rfc_id`*: string; `related_rfcs`*: array

### `cairn_set_short_description`

Set or update the short_description (12-15 word human-readable card summary) for an RFC or seed. Used by the short_description backfill workflow per OPERATOR . Max 160 chars (DB-enforced). Audit-logged.

Parameters (`*` = required): `rfc_id`*: string; `short_description`*: string

### `cairn_set_status`

Annotate or correct an RFC/seed lifecycle status. Use sparingly -- normal lifecycle moves go through the named tools (cairn_rfc_promote, cairn_rfc_demote, cairn_ship, cairn_ratify, cairn_archive). This is the escape hatch for benign corrections (typo recovery, manual override after audit).

Parameters (`*` = required): `rfc_id`*: string; `status`*: string (seed, ideation, in_round, ratified, shipped, deferred, superseded, archived); `reason`: string. Reference note: the MCP schema in one source file still lists `rfc`; the Cairn schema and migrations enforce `ideation`, so a rebuild should use `ideation` and fix the schema bug.

### `cairn_set_tags`

Replace all tags on an RFC or seed. Accepts a list of tag strings or a comma-separated string. Audit-logged.

Parameters (`*` = required): `rfc_id`*: string; `tags`*: array

### `cairn_set_title`

[DEPRECATED -- use cairn_set_meta(field='title', value=...) instead] Set or update the title of an RFC or seed. Audit-logged. Title must be at least 10 characters.

Parameters (`*` = required): `rfc_id`*: string; `title`*: string

### `cairn_ship`

Transition a ratified RFC to shipped. PM-role only. Records the ship event in lifecycle audit. : ship is gated -- the RFC must be ratified, 100%-built (all linked tasks done/cancelled), carry a valid non-PM architect+builder attestation, and its done-tasks' commits must be reachable from the integration tip.

Parameters (`*` = required): `rfc_id`*: string; `reason`: string; `architect_cosign_ref`: string; `builder_evidence_ref`: string

### `cairn_signal`

[DEPRECATED -- fold into cairn_respond(stance=...); will be removed] Signal support/object/nuance/defer on a response. Idempotent per node per response.

Parameters (`*` = required): `response_id`*: integer; `signal`*: string (support, object, nuance, defer); `comment`: string

### `cairn_solidplan`

Attach a solidplan (consensus seal) to an RFC after all waves are closed. Caller must be PM role, OPERATOR, or hold a valid OPERATOR-issued OPA grant for action_type='cairn_solidplan' . The solidplan is the final document OPERATOR ratifies against.

Parameters (`*` = required): `rfc_id`*: string; `content`*: string; `override_ratified`: boolean; `revision_reason`: string; `grant_id`: string

### `cairn_star`

Star a response or seed. OPERATOR-only in the reference. Starring a seed auto-promotes it to an ideation RFC; starring a response marks that response as starred.

Parameters (`*` = required): `target_type`*: string (seed, response); `target_id`*: string

### `cairn_summon_council`

Summon an LLM council on an RFC. Selects a vessel-host node (random-at-trigger, excludes author + recent vessels) that spawns 5 lens sub-agents and appends a Council Considerations table to the RFC.

Parameters (`*` = required): `rfc_id`*: string; `reason`*: string; `vessel_override`: string; `grant_id`: string

### `cairn_synthesize`

[DEPRECATED -- use cairn_close_wave(synthesis=) instead] Write synthesis for a closed wave. PM-role only.

Parameters (`*` = required): `rfc_id`*: string; `synthesis`*: string; `round_number`: integer

### `cairn_vote`

Cast a ratification vote on an RFC.

Parameters (`*` = required): `rfc_id`*: string; `verdict`*: string (approve, reject, abstain); `justification`: string

### `cairn_wave`

Open a new discussion wave on an RFC. PM-role only.

Parameters (`*` = required): `rfc_id`*: string; `prompt`*: string; `mode`: string


## Cairn knowledge base

### `cairn_kb`

Unified KB access -- read by slug or search by query. If input looks like a slug (no spaces), attempts exact slug read first, falls back to search. If input has spaces, searches. Returns summary by default; pass full=true for full article body.

Parameters (`*` = required): `input`*: string; `mode`: string (auto, read, search); `full`: boolean; `limit`: integer

### `cairn_kb_archive`

Archive a KB article. No deletion -- only archival. Irreversible.

Parameters (`*` = required): `slug`*: string

### `cairn_kb_create`

Create a new KB article. Requires slug, title, content, tags. Reference MCP handler authorizes PM or architect role, explicit node allowlist, or OPA grant; the broader knowledge-worker wording in the schema description is stale.

Parameters (`*` = required): `slug`*: string; `title`*: string; `content`*: string; `tags`*: string; `status`: string; `hosts_relevant`: string (same_host, cross_host, fleet); `topology_version`: integer

### `cairn_kb_edit`

Edit a KB article. Records full change history. Pass optional `title` to rename the article (omit to keep the current title). Cannot edit archived articles.

Parameters (`*` = required): `slug`*: string; `content`*: string; `edit_summary`: string; `title`: string; `hosts_relevant`: string (same_host, cross_host, fleet); `topology_version`: integer

### `cairn_kb_flag`

Flag a KB article for review. Signals that content may be outdated or inaccurate.

Parameters (`*` = required): `slug`*: string

### `cairn_kb_publish`

Publish a KB article (draft/flagged -> published). Knowledge worker roles only.

Parameters (`*` = required): `slug`*: string

### `cairn_kb_quarantine`

Soft-suppress a KB article from read/search/list (e.g. a published injection payload) until manual cleanup. Suppresses content from non-privileged readers; body is PRESERVED (not deleted) for forensics, and `status` is untouched so unquarantine is a clean restore.

Parameters (`*` = required): `slug`*: string; `reason`: string; `grant_id`: string

### `cairn_kb_set_status`

Generic KB lifecycle state-mover. Set a KB article's status to any of draft/published/flagged/archived. Permissive (any transition, including archived->draft to re-open for editing). Idempotent no-op when already at the target status.

Parameters (`*` = required): `slug`*: string; `status`*: string (draft, published, flagged, archived); `reason`: string

### `cairn_kb_unquarantine`

Lift a quarantine, restoring read/search/list visibility. The article returns to its prior draft/published/flagged state (status was never changed). Requires the analyst node, the reviewer node, PM role, or an OPA grant.

Parameters (`*` = required): `slug`*: string; `grant_id`: string


## Cairn scratch

### `cairn_scratch`

Create an immutable scratch entry. Zero friction, 5-day auto-expiry. Use for quick observations, debug notes, ephemeral ideas.

Parameters (`*` = required): `content`*: string; `subject`: string; `tags`: string; `ref_task_id`: string; `ref_rfc_id`: string

### `cairn_scratch_list`

List recent scratch entries, optionally filtered by author.

Parameters (`*` = required): `author`: string; `ref_task_id`: string; `limit`: integer

### `cairn_scratch_pin`

Pin/unpin a scratch entry. Pinned entries are exempt from 5-day TTL. Max 30 days, re-pin to extend. Auto-unpins when linked task reaches done.

Parameters (`*` = required): `scratch_id`*: string; `action`: string (pin, unpin); `duration_days`: integer

### `cairn_scratch_read`

Read/search scratch entries. Search by ID, full-text query, or author. Non-expired only.

Parameters (`*` = required): `scratch_id`: string; `query`: string; `author`: string; `ref_task_id`: string; `limit`: integer


## Cohort release

### `get_cohort_release_state`

L3: read publication state + attestation counts + predicate_satisfied. Read-only.

Parameters (`*` = required): `publication_id`*: string

### `lift_cohort_hold`

L3: OPA-500 role-gated (PM/OPERATOR) lift of landed_but_held -> fleet_released. Re-verifies sealed attestation predicate; refuses on partial attestation (412).

Parameters (`*` = required): `publication_id`*: string; `reason`*: string

### `publish_cohort_snapshot`

L3 Layer-1 handoff: publish a canonical the shared-scripts repository snapshot + create first governance publication. Role-gated ops/OPERATOR. publisher_node derived from caller session.

Parameters (`*` = required): `snapshot_sha`*: string; `canonical_source`*: string; `allowlist_hash`*: string; `manifest_bytes_hash`*: string; `required_nodes`*: array; `topology_version`*: integer; `topology_hash`*: string; `exemption_allowlist`*: array; `notes`: string

### `republish_cohort_snapshot`

L3: create successor publication for membership drift. Role-gated ops/OPERATOR. Prior published/landed_but_held -> superseded; fleet_released predecessor preserved (T#8).

Parameters (`*` = required): `prior_publication_id`*: string; `required_nodes`*: array; `topology_version`*: integer; `topology_hash`*: string; `exemption_allowlist`*: array; `reason`*: string; `notes`: string

### `walker_tick_cohort_release`

L3: internal walker sweep. Role-gated ops/OPERATOR. Advances published->fleet_released on full attestation predicate; holds on budget breach.

Parameters (`*` = required): none


## Database operations

### `maintenance_acquire`

Acquire a durable per-family maintenance lock so two disruptive maintenance procedures in the same family never run concurrently. Returns a token (the capability used to release).

Parameters (`*` = required): `family`*: string; `ttl_seconds`: integer; `reason`: string; `metadata_json`: string; `token`: string

### `maintenance_release`

Release a durable per-family maintenance lock. Authorization is token-only -- present the token returned by maintenance_acquire. Unlike acquire, release is NOT blocked during maintenance MODE, so a held lock can always be cleanly released during a coordinator restart window.

Parameters (`*` = required): `family`*: string; `token`*: string

### `pg_activity`

Read-only PG activity/health snapshot for 'coord sluggish' triage -- active queries, long-running queries / idle-in-transaction sessions, blocking chains (pg_blocking_pids), in-process asyncpg pool-lane saturation, WAL backpressure bytes, autovacuum recency + cumulative deadlock count.

Parameters (`*` = required): `node_id`*: string; `long_running_threshold_seconds`: number

### `pg_maintenance`

Guarded PG maintenance -- action='analyze' / 'vacuum_analyze' / 'autovacuum_kick'. DAL-mediated (credential isolation) with a durable 'pg_maintenance_executed' events audit row per run. Role-gated: PM or ops role, or OPERATOR/DASHBOARD identity, or an OPA elevation (legacy sudo grant_id also honored).

Parameters (`*` = required): `node_id`*: string; `action`*: string (analyze, vacuum_analyze, autovacuum_kick); `table`: string; `dead_tuple_threshold`: integer; `grant_id`: string


## Fleet state and health

### `fleet_check`

Canonical fleet-wide introspection aggregate: per-node summary rows (overlap-zone fields), fleet aggregates (counts by health_status, avg score, stale/excluded counts), and structured alerts. Open to all roles (read-only telemetry). Stale/offline nodes excluded unless include_offline=true.

Parameters (`*` = required): `include_offline`: boolean

### `fleet_health_query`

Returns aggregated health signals for all active nodes: health_score, checkpoint_count, active_work_turns, last_molted, time_since_molt. Use to identify nodes needing MOLT or attention. (Deprecated: use fleet_check instead.)

Parameters (`*` = required): `min_health_score`: integer; `health_status`: string (green, yellow, red); `min_active_work_turns`: integer; `include_offline`: boolean; `sort_by`: string (health_score, last_seen_age, time_since_molt)

### `get_current_fleet_released`

L3: read singleton pointer to the current fleet_released tuple. Read-only.

Parameters (`*` = required): none

### `get_fleet_shared_canonical_manifest`

V0.4c: return the authoritative content manifest of the shared-scripts repository, read directly from the bare backup remote (<share> @ refs/heads/master), NOT from any coord-host-local checkout. Serves the molt-preflight gate's substrate-freshness check.

Parameters (`*` = required): `node_id`*: string; `force_refresh`: boolean

### `get_fleet_state`

Per-node liveness/state snapshot derived from heartbeat freshness and raw lifecycle_state. Returns each node's lifecycle_state (raw enum), last_seen_epoch_ms, last_seen_age_seconds, heartbeat_fresh (bool), role, and active (bool), plus a top-level fresh_threshold_seconds echo.

Parameters (`*` = required): none

### `get_fleet_status`

Get overview of all nodes, active tasks, and recent events.

Parameters (`*` = required): `include_completed`: boolean; `compact`: boolean

### `get_node_lifecycle`

Get lifecycle state for one node or all nodes. Shows lifecycle_state, last_seen, bootstrap time.

Parameters (`*` = required): `node_id`: string

### `node_check`

Canonical deep introspection on ONE node: identity / timing (last_molted, time_since_molt, session_age_hours) / health (with per-field provenance) / pressure / breath / task_summary / _meta. Open to all roles (read-only telemetry). Defaults to the calling node when node_id is omitted.

Parameters (`*` = required): `node_id`: string

### `request_node_restart`

Request a node to save state and prepare for restart. When kb_reference is provided, routes through ESG-A1 safety gates (KB validation, active work check, NIS cooldown, circuit breaker, lifecycle). Without kb_reference, uses legacy path (deprecated -- will require kb_reference in future).

Parameters (`*` = required): `target_node_id`*: string; `reason`: string; `kb_reference`: string; `force`: boolean; `grant_id`: string

### `set_fleet_attention`

Set fleet attention mode (HOT/WARM/COLD). HOT: 20 pulses at 60s. WARM: 5 pulses at 180s. COLD: standard heartbeat. Only analyst/PM roles can trigger HOT. Broadcasts attention message to target nodes.

Parameters (`*` = required): `mode`*: string (hot, warm, cold); `target`: string; `triggered_by`: string; `kb_reference`: string; `grant_id`: string

### `set_node_active_status`

Set a node's registration status to active (online) or inactive. Optionally set confirmed status (controls superdash visibility). Inactive nodes are excluded from broadcasts but preserved in the DB for future reactivation. PM role or sudo grant required.

Parameters (`*` = required): `node_id`*: string; `active`*: boolean; `confirmed`: boolean; `kb_reference`: string; `grant_id`: string

### `set_node_lifecycle`

Manually set a node's lifecycle state. PM role or sudo grant required for cross-node or non-benign transitions, EXCEPT: nodes may self-set benign states (saving, molting) AND self-abort MOLT (saving->running) when no point-of-no-return has fired .

Parameters (`*` = required): `node_id`*: string; `state`*: string; `grant_id`: string


## Identity, memory and handoff

### `generate_pm_handoff`

Generate a rich PM handoff document with board snapshot, node status, and next actions. Auto-generated on MOLT save, also available on-demand.

Parameters (`*` = required): `node_id`: string

### `get_identity`

Get a node's persistent identity profile including personality, accomplishments, corrections, and a narrative startup prompt. Call this on every session startup to remember who you are.

Parameters (`*` = required): `node_id`*: string

### `get_memory_tier_integrity`

Compute memory-tier integrity . For each diary correction/mistake entry with ref_artifact='memory_block_audits:<audit_id>', verify the audit row exists AND is within retention_days.

Parameters (`*` = required): `node_id`: string; `since_epoch_ms`: integer; `window_days`: integer; `retention_days`: integer

### `handoff_save`

Save a session-handoff continuity record for a node. Captures top-3 head_pointers (exactly one is_primary=true) + in_flight_commitments (boomerangs_owed, boomerangs_owed_to_me, wave_participations_open, review_commitments) so the next session can resume cleanly after MOLT/restart. Author-only (caller must be node_id).

Parameters (`*` = required): `node_id`*: string; `head_pointers`: array; `in_flight_commitments`: object; `author_session_id`: string; `expected_continuation_window`: string; `as_of`: string; `expires_at`: string; `commit`: boolean; `snapshot_id`: string; `intentionally_empty`: boolean

### `memory_block_audit`

List audit history for a per-node memory block (newest-first). Any node can audit any block.

Parameters (`*` = required): `node_id`: string; `block_type`*: string (current_context, fleet_model, learned_patterns); `since_revision_id`: integer; `limit`: integer

### `memory_block_read`

Read a per-node memory block. Any node can read any block (sharing is the point). Returns null content + exists=false if block has never been written.

Parameters (`*` = required): `node_id`: string; `block_type`*: string (current_context, fleet_model, learned_patterns)

### `memory_block_rollback`

Restore a memory block to the content of an earlier revision. Self-only (same as write). Writes a NEW revision with write_kind='rollback'; intermediate history preserved. Rate-cap applies.

Parameters (`*` = required): `block_type`*: string (current_context, fleet_model, learned_patterns); `target_revision_id`*: integer

### `memory_block_write`

Write a per-node memory block (current_context 1500ch / fleet_model 1000ch / learned_patterns 3000ch). Self-write only (caller node_id must equal target). Hard-fails on overflow (no truncate). Rate-cap: 1/block/CE OR 10/hr per node.

Parameters (`*` = required): `block_type`*: string (current_context, fleet_model, learned_patterns); `content`*: string

### `update_identity`

Update a field in a node's identity profile. Self-edits always allowed (node manages its own identity). Cross-node edits require PM role or sudo grant. Fields: personality, strengths, last_session_summary, corrections_log, operator_notes, startup_instructions, default_capabilities, default_role.

Parameters (`*` = required): `node_id`*: string; `field`*: string; `value`*: string; `grant_id`: string


## Lessons

### `graduate_lesson`

Step 1: transition a lesson's status (e.g. ACTIVE -> LEARNED, LEARNED -> ARCHIVED).

Parameters (`*` = required): `lesson_id`*: integer; `to_status`*: string (ACTIVE, LEARNED, ARCHIVED); `evidence_text`*: string; `grant_id`: string

### `store_lesson`

Step 1: store a Behavioral Lesson (shape-v2 record: subject + fact + citations + reason + scope). Scope is one of node/domain/fleet (case-sensitive). node-scope is open; domain/fleet require PM/architect role or OPA grant (allow_opa=True).

Parameters (`*` = required): `subject`*: string; `fact`*: string; `citations`*: string; `reason`*: string; `scope`*: string (node, domain, fleet); `target_domain`: string; `grant_id`: string

### `update_lesson`

Step 1: edit a lesson row in place (creates a new revision; clears the prior is_current=1 flag). Privilege re-evaluates on scope change (e.g. node->fleet requires PM/architect or OPA). Lesson status is NOT mutable through this tool -- use graduate_lesson for status transitions.

Parameters (`*` = required): `lesson_id`*: integer; `subject`: string; `fact`: string; `citations`: string; `reason`: string; `scope`: string (node, domain, fleet); `target_domain`: string; `edit_reason`: string; `grant_id`: string


## Messaging

### `broadcast_message`

Send a message to ALL registered nodes (except self). Fan-out broadcast for fleet-wide announcements, RFCs, reboots, or status updates.

Parameters (`*` = required): `from_node`*: string; `msg_type`*: string; `subject`*: string; `content`: string; `ref_task_id`: string; `priority`: any; `requires_ack`: boolean; `attention`: boolean; `hosts_affected`: string (same_host, cross_host, fleet); `topology_version`: integer

### `bulk_acknowledge`

Mark multiple messages as read in a single call. More efficient than individual acknowledge_message calls.

Parameters (`*` = required): `message_ids`*: array; `node_id`*: string

### `check_inbox`

One-call startup check: returns all unread messages and active (ready/in_progress) tasks for a node. Also registers a heartbeat -- server tracks when to expect the next check-in.

Parameters (`*` = required): `node_id`*: string; `heartbeat_interval`: integer; `node_status`: string (building, reviewing, waiting_operator, waiting_peer, idle); `compact`: boolean; `minimal`: boolean; `include_topo`: boolean; `topo_version`: integer; `process_start_time`: string; `checkpoint_count`: integer; `active_work_turns`: integer; `pending_audits`: array; `sha_observations`: array; `topology_version_last_seen`: integer

### `get_messages`

Get messages from a node's inbox. Defaults to unread only.

Parameters (`*` = required): `node_id`*: string; `status`: string; `include_sent`: boolean; `limit`: integer; `offset`: integer; `verbosity`: string (full, summary); `sort_order`: string (asc, desc); `msg_type`: string; `since`: string; `ref_task_id`: string; `min_priority`: integer; `after_id`: integer; `direction`: string (received, sent, both); `exclude_types`: string; `peer_node`: string

### `poll_and_ack`

DEPRECATED / FORBIDDEN for the bb4-poll path . Auto-acknowledges unread messages BEFORE substantive processing = message-loss class. The authoritative inbox path is batch[check_inbox+heartbeat] then bulk_acknowledge AFTER a substantive reply (bb4-poll SKILL.md v2.0.1 / KB breathbus-p4-definitive-spec Section 8).

Parameters (`*` = required): `node_id`*: string; `heartbeat_interval`: integer; `node_status`: string (building, reviewing, waiting_operator, waiting_peer, idle, active); `checkpoint_count`: integer; `active_work_turns`: integer; `topology_version_last_seen`: integer

### `send`

Minimal messaging -- send a message with sane defaults. from_node auto-derived from caller identity. Default msg_type='info', priority=3.

Parameters (`*` = required): `to`*: string; `subject`*: string; `body`*: string; `msg_type`: string; `priority`: any; `requires_ack`: boolean

### `send_message`

Send a message to another node. Use for requests, status updates, help requests, delegation, or general info. Set to_node to 'all_nodes' or 'broadcast' for fleet-wide fan-out.

Parameters (`*` = required): `from_node`*: string; `to_node`*: string; `msg_type`*: string; `subject`*: string; `content`: string; `ref_task_id`: string; `priority`: any; `requires_ack`: boolean; `attention`: boolean; `idempotency_key`: string


## Molt and lifecycle

### `check_same_host_molt_conflict`

Co-tenant peer-molt gate. Returns whether any same-host co-tenant of the querying node is currently mid-molt (explicit lifecycle_state='molting' OR last_molted within window AND heartbeat_stale = successor not up). Consumed by TrueMolt SKILL Step-0.55 to prevent overlapping co-tenant molts.

Parameters (`*` = required): `node_id`: string; `molt_window_seconds`: integer

### `confirm_self_molt`

Confirm a self-MOLT execution for unreachable hosts (e.g., the architect node on a worker host). Validates the self-MOLT token and marks the request as completed. Called by the target node after local execution.

Parameters (`*` = required): `molt_id`*: string; `token`*: string; `node_id`*: string; `old_pid`: integer; `new_pid`: integer

### `execute_molt`

Execute an approved MOLT request. Only proceeds if status is 'approved' Acquires lock, runs kill+reboot asynchronously. PM role or sudo grant required.

Parameters (`*` = required): `molt_id`*: string; `target_node_id`*: string; `grant_id`: string

### `get_molt_status`

Get status of a MOLT request, or current moratorium status if no molt_id provided.

Parameters (`*` = required): `molt_id`: string

### `get_post_molt_respawn_latency`

Compute post-MOLT respawn-to-rebootstrap latency . LOWER-BOUND proxy for context-reconstruction time: captures respawn + bootstrap-invoked latency only; true context reconstruction completes after bootstrap returns (state-rehydration, last-plan read, recovery substrate scan -- NOT measured).

Parameters (`*` = required): `node_id`: string; `since_epoch_ms`: integer; `window_days`: integer; `match_window_minutes`: integer

### `mark_molt_ponr`

Mark a point-of-no-return step on the caller's node row. Self-only, idempotent first-wins. Disables self-abort (saving->running). Convention steps: 'release_session' (implicit on release), 'qc_renew_launch', 'molt_cert_write' (smooth-molt skill calls these explicitly).

Parameters (`*` = required): `node_id`*: string; `step`*: string

### `request_molt`

Request a MOLT (restart) for a target node. Creates an OPA-authorized guestbook audit record. Validates B3 KB gate, moratorium, target existence, co-tenant safety. Returns a molt_id and guestbook_id.

Parameters (`*` = required): `target_node_id`*: string; `requester_node_id`*: string; `reason`*: string; `kb_reference`: string

### `set_molt_moratorium`

Set or clear the fleet-wide MOLT moratorium. When active, all MOLT requests are rejected. PM role or sudo grant required.

Parameters (`*` = required): `active`*: boolean; `reason`: string; `grant_id`: string


## Operator authorization (OPA)

### `consume_opa`

Consume a single-use ('action' scope) OPA grant. For out-of-band privileged paths that CITE an OPA but never flow through check_privileged (e.g. the coordinator-restart PS lever at its Point-Of-No-Return). verify_opa stays read-only; THIS verb marks the grant consumed.

Parameters (`*` = required): `grant_id`*: string; `action_type`*: string; `node_id`: string

### `get_standing_authorizations`

Read-only (any node). List active standing pin-authorizations, optionally filtered by project and/or node_id. Each entry carries its structured scope, the verbatim OPERATOR directive, and a last_reaffirmed_age_seconds staleness signal.

Parameters (`*` = required): `project`: string; `node_id`: string; `include_revoked`: boolean

### `grant_opa`

Grant an OPA elevation to a node. OPERATOR, DASHBOARD, PM role, or architect role may grant generic OPA; `restart_bypass_skill` remains OPERATOR-only. PM/architect callers may also courier OPERATOR authority by forwarding `delegated_by='OPERATOR'` with a non-empty verbatim operator directive.

Parameters (`*` = required): `node_id`*: string; `scope`: string; `operator_directive`: string; `reason`: string; `delegated_by`: string; `action_type`: string

### `pin_authorization`

OPERATOR-only. Record a standing project authorization so the OPERATOR does not have to re-approve the same intent every session (it survives MOLT). Structured scope = one of {scope_project / scope_task_glob} + a node-set (+ optional tool-class).

Parameters (`*` = required): `scope_project`: string; `scope_task_glob`: string; `scope_node_set`*: array; `scope_tool_class`: string; `operator_directive_verbatim`*: string

### `reaffirm_authorization`

OPERATOR-only. Reset the last_reaffirmed staleness clock on an active pin-authorization (proves the standing intent is still current). Does not extend or expire anything -- it only refreshes the surfaced staleness signal. A revoked grant cannot be reaffirmed.

Parameters (`*` = required): `auth_id`*: string

### `revoke_authorization`

OPERATOR-only. Revoke a standing pin-authorization by auth_id (the only expiry path -- there is no TTL). Idempotent: revoking an unknown or already-revoked auth returns an error, not a crash.

Parameters (`*` = required): `auth_id`*: string

### `revoke_opa`

Revoke an active OPA elevation. OPERATOR can revoke any elevation (emergency override). Nodes can self-revoke their own elevation (return keys early).

Parameters (`*` = required): `opa_id`*: string

### `verify_opa`

Verify a specific OPA grant is valid and active. Read-only -- does not consume the grant. Use before complying with OPERATOR-authority directives. Self-checks return full details; cross-node checks return coarse valid/invalid only. Validates the coordinator record; grant_opa enforces delegated_by==caller in the reference implementation.

Parameters (`*` = required): `grant_id`*: string; `node_id`: string


## Other

### `ask_operator`

Route a question to OPERATOR via coordinator instead of blocking the terminal. Use this instead of the built-in ask_user to avoid blocking the terminal and halting scheduled prompts (bb4-poll, etc.).

Parameters (`*` = required): `question`*: string; `choices`: array; `allow_freeform`: boolean

### `ask_user`

Route a question to OPERATOR via coordinator instead of blocking the terminal. Shadow of the built-in ask_user -- prevents session-killing terminal blocks.

Parameters (`*` = required): `question`*: string; `choices`: array; `allow_freeform`: boolean

### `attest_agency_sha`

Append an authenticated node's locally computed live MCP bridge SHA-256 and Authenticode status for an agency_version. The witness node_id is derived server-side from the authenticated X-Node-Token/_session_token identity; caller-supplied node_id is ignored/overridden by the identity gate.

Parameters (`*` = required): `agency_version`*: string; `sha256`*: string; `authenticode_status`*: string; `signer_subject`: string

### `attest_snapshot_staged`

L3 Layer-2 handoff: durable per-node attestation. node_id DERIVED from caller session (payload node_id, if any, must match). Idempotent per (publication_id, caller_node_id); conflicting replay -> 409.

Parameters (`*` = required): `publication_id`*: string; `manifest_verify_receipt`*: any; `self_heal_run_id`: string; `node_id`: string

### `batch`

Execute multiple operations in a single call. Reduces context consumption by combining check_inbox + heartbeat + board queries into one response with field projection. Supported actions: check_inbox, heartbeat, get_board, get_topology, get_health, get_tasks, get_task_board. The `heartbeat` action is the canonical heartbeat surface: it is a batch sub-operation, not a separate MCP tool, and internally writes via check_inbox(minimal=true).

Parameters (`*` = required): `ops`*: array; `compact`: boolean; `node_id`*: string

### `canonical_master_ref`

Slice-9 Part-B: return coord-authoritative view of a repo's ref (default 'refs/heads/master').

Parameters (`*` = required): `repo`*: string; `ref`: string

### `claim_relaunch_intent`

M4 auto-relaunch CAS: atomically claim the relaunch slot for a node (single-winner, lease-bounded). Identity-exempt (pre-bootstrap, fleet-Bearer-gated). Returns {claimed: bool} -- relaunch IFF claimed==true; a loser (a live claim is held) must back off (the double-boot guard).

Parameters (`*` = required): `node_id`*: string; `host`: string; `incident_id`: string; `trigger`: string; `event_trace_id`: string; `topology_version_last_seen`: integer

### `clear_motd`

Delete a MOTD schedule by id, or all schedules if id is omitted. OPERATOR-only.

Parameters (`*` = required): `id`: integer

### `complete_relaunch_intent`

M4 auto-relaunch CAS: release a relaunch claim after a successful bootstrap (ownership + state checked, idempotent). Identity-enforced (post-bootstrap session authenticates as node_id).

Parameters (`*` = required): `node_id`*: string; `host`: string; `method`: string; `incident_id`: string; `event_trace_id`: string

### `confirm_state_saved`

Node confirms its state has been saved after a restart request. Transitions lifecycle from 'saving' to 'ready_for_restart'.

Parameters (`*` = required): `node_id`*: string

### `create_peer_challenge`

Create a peer health challenge for a target node. PM role or sudo grant required. Coordinator generates nonce, delivers challenge to target via message. Returns challenge_id for status polling. Rate limited: 1 per node pair per 5 minutes.

Parameters (`*` = required): `target_node_id`*: string; `grant_id`: string

### `create_report`

Generate a summary report of fleet activity.

Parameters (`*` = required): `format`: string; `scope`: string

### `finding_to_seed`

Convert an incident finding into an RFC seed (Type D -- Post-Incident). Optional tool -- PM/OPERATOR decides when a finding warrants seeding an RFC. Lean output with provenance tracking back to source incident.

Parameters (`*` = required): `title`*: string; `root_cause`*: string; `corrective_action`*: string; `severity`*: string (critical, high, medium, low); `source_incident`*: string; `related_rfcs`: array; `parent_rfc`: string; `rfc_type`: string (base, change, expansion)

### `get_agency_sha_consensus`

Read cross-node MCP bridge SHA witness consensus for an agency_version. Reports converged=true only when at least two DISTINCT authenticated node_ids attest the same sha256; any different sha256 for the version is surfaced as dissent=true with alarm=AGENCY_SHA_DISSENT.

Parameters (`*` = required): `agency_version`*: string

### `get_boot_manifest`

Get complete boot manifest for a node. Returns all config files ready to write: fleet-identity.json, mcp-config.json, node topology config, and validation info. Coordinator generates truth; node just writes files.

Parameters (`*` = required): `node_id`*: string; `grant_id`: string

### `get_breathbus_sync_status`

Slice-1d: read-only view over breathbus_sync_status (per-host daemon telemetry captured via slice-1b POST /api/breathbus_sync_status). Without node_id: latest snapshot per node (fleet-uniformity aggregate). With node_id: last N snapshots for that node (per-node stall/regression time-series tail).

Parameters (`*` = required): `node_id`: string; `limit`: integer

### `get_correction_history`

Get full correction history for a node with structured metadata (status, severity, track, relapse count, graduation). Returns all corrections including ACTIVE, LEARNED, and ARCHIVED.

Parameters (`*` = required): `node_id`*: string

### `get_delivery_state`

ADD-2: query the delivery/ack state of a single message you sent or received. Returns {exists, status, durable, delivered_at, read_at...}. Authorized: only the sender or recipient may resolve a message; unrelated callers get exists=false (no id enumeration).

Parameters (`*` = required): `message_id`*: integer; `node_id`*: string

### `get_diary_recall_hit_rate`

Compute diary recall hit-rate . A bootstrap-surfaced diary entry is a 'hit' when a subsequent diary entry with ref_artifact='diary:<entry_id>' is written within window_days. CAVEAT 1: schema=1 snapshots excluded from population (denominator-unavailable, tracked via snapshots_v1_excluded).

Parameters (`*` = required): `node_id`: string; `since_epoch_ms`: integer; `window_days`: integer; `top_k`: integer

### `get_leadership_drift_summary`

I6.2 v2 (the architect node B4): return rolling-window drift-rate summary for a leadership node -- for dashboard, session-panel, and retrospective consumption (I6.3).

Parameters (`*` = required): `node_id`*: string; `actor_node`*: string; `window_seconds`: integer; `recent_limit`: integer

### `get_motd`

List all MOTD recurring broadcast schedules with their status and last-fired time.

Parameters (`*` = required): `enabled_only`: boolean

### `get_peer_challenge_status`

Get the current status of a peer health challenge. Challenger or target can query. Returns status (pending/passed/failed/expired) and timing info.

Parameters (`*` = required): `challenge_id`*: string

### `get_resilience_incidents`

Read-only query for fleet resilience-incidents dashboard (the analyst node dashboard render). Returns {incidents:[{incident_id,node_id,phase,started_at,ended_at?,severity,root_cause_class?}], nodes:{<node_id>:{current_phase,phases_observed}}}.

Parameters (`*` = required): `node_id`: string; `phase`: string; `limit`: integer; `window_hours`: integer; `since_epoch_ms`: integer

### `get_rider_liveness`

(rider-liveness lane): read-only view over the coord rider_liveness bond ledger for ONE node.

Parameters (`*` = required): `node_id`*: string

### `get_script`

Get a script by ID, including full content.

Parameters (`*` = required): `script_id`*: integer

### `get_sleep_trigger_false_positive_rate`

Compute sleep-trigger false-positive rate . A FP fire is one followed by >= msg_threshold actionable msgs to owner_node within window_minutes post-fire. MOLT-carve-out excludes intentional teardowns. Returns {window_minutes, msg_threshold, per_node, fleet}. Read-only; any authenticated node may call.

Parameters (`*` = required): `node_id`: string; `since_epoch_ms`: integer; `window_minutes`: integer; `msg_threshold`: integer

### `get_workload`

Get workload scores for one or all nodes. Shows current load level, active tasks, queue depth, messaging activity, and review work. Without node_id returns all nodes' current scores. With node_id returns that node's score plus last 10 snapshots for trend analysis.

Parameters (`*` = required): `node_id`: string

### `list_roles`

List all available roles with their personality descriptions and sub-skills.

Parameters (`*` = required): none

### `list_scripts`

List scripts in the shared script portal. Returns metadata (no content) for browsing.

Parameters (`*` = required): `node_id`: string; `limit`: integer

### `publish_script`

Publish a script to the shared script portal. Scripts are viewable on the dashboard.

Parameters (`*` = required): `title`*: string; `filename`*: string; `content`*: string; `description`: string; `language`: string; `target_host`: string

### `reactivate_correction`

Reactivate a LEARNED or ARCHIVED correction back to ACTIVE status. Increments relapse count. Use when a previously graduated lesson needs reinforcement.

Parameters (`*` = required): `node_id`*: string; `correction_id`*: integer; `reason`: string

### `refresh_content_acks`

Batch B SS5: lean tool for re-acking content without a full confirm_life_services re-run.

Parameters (`*` = required): `node_id`*: string; `acks`*: array

### `release_lease`

M1: release a cairn_node_leases row iff caller's PID matches the current holder_pid (no-op-on-lease contract). Returns {released: bool, reason: 'ok'/'not_holder'/'no_lease'/'flag_off'}. Advisory-mode only in M1; enforce-mode deferred to M2 + /Gary canary.

Parameters (`*` = required): `node_id`*: string; `holder_pid`*: integer

### `replace_accomplishments`

Replace ALL accomplishments for a node with a new set. Self-edit only. Old accomplishments are deleted -- full history lives in living docs.

Parameters (`*` = required): `node_id`*: string; `accomplishments`*: array

### `report_pin_ledger_drift`

Emit a ledger-drift event to coord when a node's Step-0.6 at-source probe detects an attested-vs-persisted mismatch.

Parameters (`*` = required): `node_id`*: string; `pin_ledger_type`*: string; `expected_sha256`*: string; `observed_sha256`*: string; `at_source_probe_source`*: string; `witness_notes_ref`: string; `proceeded_to_cure`: integer; `probe_re_fire_agreed`: integer; `metadata_json`: string

### `resolve_service_uri`

Resolve a service: URI to a concrete path/URL. Accepts 'service:superdash/js/app.js' and returns the fully resolved path (local, UNC, or HTTP) with subpath appended. Non-service: inputs pass through unchanged.

Parameters (`*` = required): `uri`*: string

### `respond_peer_challenge`

Respond to a peer health challenge with HMAC-SHA256 proof. Only the challenge target can respond. Signs nonce//timestamp with derived key from session token. Auto-verifies atomically.

Parameters (`*` = required): `challenge_id`*: string; `hmac_response`*: string; `response_timestamp`*: string

### `set_manual_mode`

OPERATOR ask : a toggle for 'manual mode' that silences bb4-drift no_heartbeat noise when a node's bb4-poll schedule is DELIBERATELY stopped (e.g. for coordinator/DB/MCP hardening work) rather than silently dead.

Parameters (`*` = required): `node_id`*: string; `enabled`*: boolean; `reason`: string

### `set_motd`

Create a recurring MOTD broadcast schedule. Only OPERATOR may use this. Messages are broadcast to all nodes at the specified interval with from_node=OPERATOR and msg_type=motd.

Parameters (`*` = required): `subject`*: string; `message`*: string; `interval_minutes`: integer; `priority`: integer

### `set_role`

Change a node's active role. Returns the role's personality and approach guidelines.

Parameters (`*` = required): `node_id`*: string; `role`*: string; `grant_id`: string

### `silence_mode_get`

Get current silence_mode state (enabled, who toggled, when). Read-only. When enabled, the coordinator suppresses stale-node and empty-chair alerts (detection still runs; only emission is silenced).

Parameters (`*` = required): none

### `silence_mode_log`

List alerts that were suppressed while silence_mode was enabled. Returns newest-first. Read-only.

Parameters (`*` = required): `limit`: integer; `since_epoch_ms`: integer; `node_id`: string

### `silence_mode_set`

Toggle silence_mode on/off. Requires OPERATOR caller or an OPA grant for action_type='silence_mode' (pass grant_id). Persists across coordinator restarts. Suppressed alerts are still logged to the silenced_alerts audit table.

Parameters (`*` = required): `enabled`*: boolean; `grant_id`: string

### `start_gary_test`

Gary: start a disposable singleton test/canary session. Atomically acquires the gary_canary lease (one Gary fleet-wide; 409-refuse-no-steal) and opens a gary_test_results record. Returns {ok, gary_session_id:'GARY-<nonce>', lease_id, expires_epoch_ms} / {ok:false, reason:'gary_busy', current_kind}. Any node may spawn.

Parameters (`*` = required): `spawner_node`*: string; `holder_pid`*: integer; `test_spec`*: object; `ttl_minutes`: integer

### `stop_gary_test`

Gary: stop/teardown a Gary test session -- releases the singleton gary_canary lease and finalizes the gary_test_results record. Returns {final_verdict, teardown_status}. verdict defaults to 'teardown' if not given.

Parameters (`*` = required): `gary_session_id`*: string; `reason`: string; `verdict`: string

### `subscribe_events`

Get the SSE (Server-Sent Events) URL for real-time push notifications. Connect to this URL to receive instant alerts for new messages, task assignments, and status changes.

Parameters (`*` = required): `node_id`*: string

### `topology_resolve`

Resolve a fleet service's location for the calling node. Returns host, canonical path, resolved path (local/UNC/HTTP based on caller), access method, and edges. Use operation='read' or 'write' to filter edges by role.

Parameters (`*` = required): `service`*: string; `operation`: string (read, write)


## Review

### `claim_review`

Codecrete: auto-route a code-review for a task in 'review' status to the least-loaded eligible reviewer (or claim it yourself by passing reviewer=your node_id). Throws a deadline-bound review boomerang.

Parameters (`*` = required): `task_id`*: string; `node_id`*: string; `reviewer`: string; `reassign`: boolean; `topology_version_last_seen`: integer

### `close_design_review`

PR1: close design review via author/PM synthesis. Transitions design_input_status 'open' -> 'closed' and persists synthesis. Requires at least one invitee response (use skip_design_review for zero-response abandonment). Emits design_input_closed_synthesized audit event.

Parameters (`*` = required): `swat_id`*: string; `node_id`*: string; `synthesis`*: string

### `design_input_invite`

PR1: invite a node to weigh in on a swat's design review. UPSERTs a per-invitee row (UNIQUE(swat_id, node_id)) and appends invitee to cairn_swats.previous_design_input_invitees . Requires design_input_status='open'. Refuses self-invite by author. Emits design_input_invited audit event.

Parameters (`*` = required): `swat_id`*: string; `node_id`*: string; `invitee`*: string

### `design_input_respond`

PR1: invitee responds to a design-input invite. UPSERTs response_body/stance/responded_at on the invitee's row (revising replaces prior body/stance; audit trail captures each revision). Requires design_input_status='open' and the caller to have been invited. Stance enum: support/object/nuance/defer.

Parameters (`*` = required): `swat_id`*: string; `node_id`*: string; `body`*: string; `stance`*: string (support, object, nuance, defer)

### `open_design_review`

PR1: open design review on a swat (stage must be 'open'). Transitions design_input_status NULL -> 'open' and blocks claim_swat until design input is closed (synthesize or skip). Idempotent: re-opening an already-open design review returns a warning. Cannot reopen after closed (use reopen_with_fresh_design_round in PR2).

Parameters (`*` = required): `swat_id`*: string; `node_id`*: string

### `skip_design_review`

PR1: skip design review with categorical rationale. Transitions design_input_status (NULL or 'open') -> 'closed' and persists JSON rationale.

Parameters (`*` = required): `swat_id`*: string; `node_id`*: string; `rationale_category`*: string (trivial_obvious_fix, regression_fix_only, operator_directive, time_critical_incident, single_owner_domain); `rationale_text`*: string; `grant_id`: string

### `submit_review_ack`

Submit a review ACK for a task in review status. Records verdict (approve/request_changes/reject) with notes. Required before a task can move from review to done.

Parameters (`*` = required): `task_id`*: string; `node_id`*: string; `verdict`*: string (approve, request_changes, reject); `notes`: string; `checkout_sha`: string; `base_sha`: string; `review_method`: string (full_checkout, delta_checkout, diff_only); `fix_commit`: string; `binding`: boolean


## SWAT

### `claim_swat`

SWATTER : self-claim a pool-exhausted swat at stage='open'. Atomic open->in_review transition + current_reviewer set + boomerang throw.

Parameters (`*` = required): `swat_id`*: string; `node_id`*: string; `topology_version_last_seen`: integer

### `close_swat`

SWATTER: close a swat. Allowed from any non-closed stage. From stage='fixed' requires fix_commit (the commit SHA that resolves it) OR disposition (verified_no_fix / audit_complete / pre_gate_archive / resolved_elsewhere) for legitimately uncloseable swats . fix_commit and disposition are mutually exclusive.

Parameters (`*` = required): `swat_id`*: string; `node_id`*: string; `reason`: string; `closed_reason`: string; `fix_commit`: string; `disposition`: string (verified_no_fix, audit_complete, pre_gate_archive, resolved_elsewhere); `repo_path`: string; `master_sha`: string; `strict`: boolean; `bypass_master_ancestry_check`: boolean; `refile_target_swat_id`: string; `refile_kind`: string (superseded, refiled)

### `correct_swat_fix_commit`

Part B: correct the fix_commit on a CLOSED swat. The only permitted mutation of a closed swat's fix_commit -- fixes a phantom/wrong SHA recorded at close-time (e.g. a branch sha that never FF-merged) that close_swat otherwise leaves immutable.

Parameters (`*` = required): `swat_id`*: string; `node_id`*: string; `new_fix_commit`*: string; `repo_path`: string; `master_sha`: string; `reason`: string

### `create_swat`

SWATTER: create a swat (small-bug review tracker) and auto-route to the least-loaded eligible reviewer via self-throw boomerang.

Parameters (`*` = required): `title`*: string; `body`*: string; `severity`*: string (low, medium, high); `node_id`*: string; `ref_kbs`: array; `ref_rfcs`: array; `fix_commit`: string; `request_triage`: boolean; `cluster_id`: string; `swat_type`: string (build, audit, analysis, verify); `host_scope`: string (same_host, cross_host, fleet); `topology_version`: integer

### `edit_swat`

+ : edit a swat's title, body, and/or swat_type post-create. Author-only OR PM-elevated. Title/body are allowed at any stage; swat_type can change only while stage='open' and current_reviewer is null, preventing review eligibility from changing after claim. Only provided fields mutate.

Parameters (`*` = required): `swat_id`*: string; `node_id`*: string; `title`: string; `body`: string; `swat_type`: string

### `get_swat`

SWATTER: read a single swat by ID. Returns full row plus audit chain and ref-list splits (ref_kbs / ref_rfcs / previous_reviewers). Returns null if not found. Pass verbosity='summary' to omit the heavy body + audit blocks (replaced by body_preview/body_chars + audit_count) for a compact, non-spilling read.

Parameters (`*` = required): `swat_id`*: string; `verbosity`: string (full, summary)

### `list_swats`

SWATTER: list swats newest-first with optional filters. Limit defaults to 50, capped at 500. Invalid stage/severity raises ValueError (fail-fast typo protection).

Parameters (`*` = required): `stage`: string (open, in_review, fixed, closed); `severity`: string (low, medium, high); `reviewer`: string; `limit`: integer

### `reassign_swat_reviewer`

Move an in_review swat's reviewer pointer to a different node. Fills the gap between claim_swat (open-stage-only) and submit_swat_verdict (current-reviewer-only): no mechanism today to MOVE an in_review swat's reviewer-pointer.

Parameters (`*` = required): `swat_id`*: string; `new_reviewer`*: string; `node_id`*: string

### `reopen_swat`

SWATTER + : reopen a CLOSED or FALSE-FIXED swat back to needs-work. Accepts stage='closed' OR 'fixed' (a 'fixed' swat whose deliverable was never built / whose fix was rejected is no longer trapped, previously escapable only via a close->reopen 2-step). Clears fix_commit/closed_at/closed_reason/current_verdict.

Parameters (`*` = required): `swat_id`*: string; `node_id`*: string; `reason`*: string; `needs_build`: boolean

### `set_swat_cluster`

PM-authority cluster-reclassification for a swat.

Parameters (`*` = required): `swat_id`*: string; `new_cluster_id`: string/null; `reason`*: string; `node_id`*: string

### `set_swat_fix_commit`

Register a builder-fenced fix_commit on an open/in_review/fixed swat WITHOUT moving its stage. Open/in_review preregistration requires a live caller build lease; an assigned reviewer cannot register their own fix. This lets submit_swat_verdict(approve) consume an already-bound SHA instead of creating fixed+NULL rows.

Parameters (`*` = required): `swat_id`*: string; `node_id`*: string; `fix_commit`*: string; `reason`: string

### `submit_swat_verdict`

SWATTER: reviewer submits a verdict on a swat. Parallel-tool shape (mirrors submit_review_ack). approve -> stage='fixed'; reject -> stage='closed'; request_changes -> stage='open' then re-routes to a fresh reviewer (excludes author + ALL previous_reviewers + stale to prevent ping-pong).

Parameters (`*` = required): `swat_id`*: string; `node_id`*: string; `verdict`*: string (approve, request_changes, reject); `notes`: string

### `update_swat_refs`

Retro-bind ref_rfcs / ref_kbs on an existing (incl. closed) swat without a direct DB write or a fresh swat. Author-only OR PM-elevated. mode=replace (default) sets the provided field(s) exactly; mode=append unions with existing values (de-duped, existing-then-new order).

Parameters (`*` = required): `swat_id`*: string; `node_id`*: string; `ref_rfcs`: array; `ref_kbs`: array; `mode`: string (replace, append)


## Spyglass search

### `spyglass_get`

Full-text search across the Spyglass index . Returns matching documents with snippets and relevance ranking.

Parameters (`*` = required): `query`*: string; `scope`: array; `tags`: array; `limit`: integer

### `spyglass_ingest`

Index or re-index a document in the Spyglass search database . Supports RFC, seed, KB, and scratch content.

Parameters (`*` = required): `doc_id`*: string; `doc_type`*: string (rfc, seed, kb, scratch, swat); `title`*: string; `body`*: string; `tags`*: array; `author`: string; `domain`: string; `status`: string

### `spyglass_stats`

Get Project Spyglass search index statistics: document counts, tag counts, size monitoring .

Parameters (`*` = required): none

### `spyglass_tag`

List tags in the Spyglass index . With doc_id: returns list of tags for that document. Without doc_id: returns all unique tags with document counts.

Parameters (`*` = required): `doc_id`: string


## Tasks and board

### `claim_build`

Atomically CLAIM build-ownership of a swat (lease-bounded compare-and-set). Build-ownership is a DISTINCT axis from review-ownership (current_reviewer) -- a swat can be in_review by X while BUILT by Y.

Parameters (`*` = required): `swat_id`*: string; `node_id`*: string; `topology_version_last_seen`: integer

### `create_task`

Create a new task and optionally assign it to a node.

Parameters (`*` = required): `task_id`*: string; `assigned_to`: string; `title`*: string; `description`: string; `depends_on`: array; `priority`: integer; `project`: string; `cluster_id`: string; `ref_rfc_id`: string; `head_sha`: string; `pr_base_sha`: string; `strict_review`: integer; `repo_path`: string; `linked_swat_id`: string

### `get_my_tasks`

Get tasks assigned to a specific node, auto-promoting blocked tasks when deps are met.

Parameters (`*` = required): `node_id`*: string; `status`: string

### `get_ratified_ready_tasks`

Live read-only projection of ready tasks linked through tasks.ref_rfc_id to Cairn RFCs whose authoritative status is ratified. Optionally returns in_round preparation candidates in a physically separate top-level array. Includes structured gate classes/rollups and zero-workload node matches for anti-idle routing.

Parameters (`*` = required): `include_in_round`: boolean; `role`: string; `node_id`: string

### `get_task_board`

Get the fleet-wide kanban board: tasks AND SWATs grouped by status column (backlog, ready, in_progress, review, done, blocked, cancelled) with summary stats and stale warnings. SWATs are merged by default (item_type='swat' vs 'task'; stage mapped open->ready, in_review->review, fixed->in_progress, closed->done).

Parameters (`*` = required): `project`: string; `include_completed`: boolean; `include_swats`: boolean

### `record_task_evidence`

Record evidence for a task/SWAT evidence leg (BUILD/SHIP/ACCEPTANCE). UPSERT on (item_id, leg, caller_node). Use for T5 backfill or any evidence-gated done transition.

Parameters (`*` = required): `item_id`*: string; `item_type`: string (task, swat, rfc_ac); `leg`*: string (BUILD, SHIP, ACCEPTANCE); `result`*: string (PASS, FAIL, UNKNOWN); `ref`: string; `repo_id`: string; `method`: string; `node_id`: string

### `release_build`

RELEASE build-ownership of a swat (owner-only). Clears build_owner so another node may claim_build. Only the current build_owner may release -- a non-owner release is rejected so it cannot clear another node's live lease. Call on graceful hand-off or after the fix lands.

Parameters (`*` = required): `swat_id`*: string; `node_id`*: string

### `update_task`

Update a task's status, notes, assignment, project, output branch, or dependencies. All fields optional - omit to preserve existing (e.g. reassign-only: pass only assigned_to). Response.status reflects the CURRENT status (which equals the passed-in status if provided, or the preserved pre-call value if omitted).

Parameters (`*` = required): `task_id`*: string; `status`: string (backlog, ready, in_progress, review, blocked, done, cancelled); `notes`: string; `output_branch`: string; `assigned_to`: string; `project`: string; `priority`: integer; `depends_on`: array; `review_ack`: string; `head_sha`: string; `pr_base_sha`: string; `strict_review`: integer; `repo_path`: string; `build_citation`: string; `ship_citation`: string; `acceptance_citation`: string

### `update_task_refs`

Retro-bind ref_rfc_id on an existing (incl. archived/done) task -- the task-side mirror of update_swat_refs. Corrects a task's RFC linkage in place without a direct DB write or a create-new+cancel-old churn (which fragments tracking). Use when a task carries the wrong ref_rfc_id -- e.g.

Parameters (`*` = required): `task_id`*: string; `node_id`*: string; `ref_rfc_id`: string
