# Coordinator database schema reference

## 1. Purpose and use

This is a generic schema reference for rebuilding the coordinator database. It is written from the reference implementation, but it is not a command transcript and is not a migration file. A future model or engineer can use it to write new PostgreSQL DDL, tests, and import tools.

The reference schema has SQLite heritage carried into PostgreSQL: timestamp values are stored as text and often shadowed by `*_epoch_ms` columns, empty strings are used where real NULLs would be clearer, and the node row is very wide. A rebuild should not copy those storage scars. Use `timestamptz`, real NULL values, ordinary PostgreSQL constraints, and split state by write cadence: hot liveness rows, slow identity/configuration rows, and append-only transition history.

How to use this document:

- Treat table and column names in the reference catalog as the legacy design contract.
- Treat the recommended v2 DDL as a clean target, not as a dump of the legacy schema.
- Preserve legal state values listed under checks/enums, unless the rebuild has an explicit compatibility adapter.
- Use one forward-only migration mechanism. Do not recreate boot-time ALTER probes, a separate stamp registry, and stamp-only Alembic at the same time.
- Derived FTS shadow tables are listed for completeness; rebuild them from source data rather than importing them as authoritative state.

## 2. Entity overview by domain

### fleet/nodes/topology

`coordinator_config`, `fleet_state`, `node_accomplishments`, `node_identities`, `node_knowledge`, `node_roles`, `node_session_tokens`, `node_sessions`, `nodes`, `role_registry`, `role_threshold_bands`, `topo_meta`, `topo_s_history`, `topo_static`, `topology_audit_log`, `topology_edges`, `topology_hosts`, `topology_services`

### messaging

`coord_outbox`, `messages`, `messages_archive`

### tasks/board

`artifacts`, `expected_merge`, `merge_pending_ack`, `task_deps`, `task_evidence`, `task_hygiene_audit`, `tasks`, `tasks_archive`

### review

`cairn_swats`, `cairn_swat_design_input`, `cairn_swat_audit`, `peer_challenges`

### boomerangs

`boomerang_micro_cooldowns`, `boomerangs`

### authorization/OPA

`authority_tokens`, `opa_usage_log`, `ops_elevations`, `sudo_grants`

### identity/memory/handoff

`knowledge_votes`, `memory_block_audits`, `memory_blocks`, `session_entities`, `session_handoff`, `session_search_fts`, `session_search_fts_config`, `session_search_fts_content`, `session_search_fts_data`, `session_search_fts_docsize`, `session_search_fts_idx`

### lifecycle/molt

`auto_renew_attempts`, `molt_locks_by_host`, `molt_requests`, `reboot_requests`, `relaunch_intent`, `restart_attempts`

### events/audit

`audit_idle_handler_fire`, `audit_lifecycle_event`, `audit_log`, `events`, `merit_audit_log`, `redaction_events`, `tool_catalog`, `tool_telemetry`

### Cairn

`archive_pin`, `cairn_active_projects_trigger_fires`, `cairn_ancestry_edges`, `cairn_approval_events`, `cairn_council_annotation_access_audit`, `cairn_council_annotations`, `cairn_council_annotations_archive`, `cairn_council_firings`, `cairn_diary`, `cairn_diary_fts`, `cairn_diary_fts_config`, `cairn_diary_fts_content`, `cairn_diary_fts_data`, `cairn_diary_fts_docsize`, `cairn_diary_fts_idx`, `cairn_id_aliases`, `cairn_id_counter`, `cairn_id_free_list`, `cairn_id_recycle_audit`, `cairn_fts`, `cairn_kb`, `cairn_kb_fts`, `cairn_kb_history`, `cairn_lease_intent_policy`, `cairn_lesson_revisions`, `cairn_lesson_scopes`, `cairn_lessons`, `cairn_node_leases`, `cairn_operator_comments`, `cairn_outbox`, `cairn_rfc_gates`, `cairn_scratch`, `cairn_scratch_audit`, `cairn_scratch_fts`, `cairn_swat_audit`, `cairn_swat_design_input`, `cairn_swat_id_counter`, `cairn_swats`, `cairn_wave_audit`, `cairn_wave_directives_sent`, `cairn_wave_nodes`, `cairn_waves`, `domain_migration_audit`, `git_sync_outbox`, `lifecycle_audit`, `lifecycle_transitions`, `rfc353_council_autofire_attempts`, `rfc353_council_autofire_fires`, `rfc353_verdict_history`, `rfc_comments`, `rfc_deployments`, `rfc_operator_notes`, `rfc_response_versions`, `rfc_responses`, `rfc_revisions`, `rfc_signals`, `rfc_standing_opa`, `rfc_tags`, `rfc_votes`, `rfc_waves`, `rfcs`, `solidplan_revisions`, `tag_synonyms`

### Spyglass/search

`detector_registry`, `drops`, `wake_queue`, `wake_state`

### lessons/merit

`merit_badges`, `merit_nominations`

### other/support

`consensus_config`, `corrections`, `decisions`, `gary_test_results`, `idle_burn_observations`, `maintenance_locks`, `motd_schedules`, `nudge_alt_mapping`, `nudge_effectiveness_ledger`, `nudge_outcome`, `schema_migrations`, `scripts`, `silenced_alerts`, `strike_counter`, `workload_snapshots`

### Text ER sketch

```text
nodes 1--n node_identities
nodes 1--n node_session_tokens
nodes 1--n messages.from_node and messages.to_node
nodes 1--n tasks.assigned_to
tasks n--n tasks through task_deps
tasks 1--n artifacts and task_evidence
tasks 0--n boomerangs through ref_task_id
cairn_swats 1--n cairn_swat_audit and cairn_swat_design_input
memory_blocks 1--n memory_block_audits
rfcs 1--n rfc_revisions, rfc_waves, rfc_votes, rfc_tags, rfc_comments
rfc_waves 1--n rfc_responses
rfc_responses 1--n rfc_signals and rfc_response_versions
rfcs 1--n cairn_rfc_gates, solidplan_revisions, cairn_approval_events
cairn_kb 1--n cairn_kb_history
topology_hosts 1--n topology_services 1--n topology_edges
events are append-only facts linked logically to nodes and tasks
```

## 3. Reference catalog: core tables in full

### `cairn_ancestry_edges`

- Domain: Cairn
- Purpose: Directed relationship between RFCs.
- Primary key: id
- Unique constraints: UNIQUE(from_rfc_id, to_rfc_id, edge_type)
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_ancestry_from on (from_rfc_id); idx_ancestry_to on (to_rfc_id); idx_ancestry_type on (edge_type)
- Checks/enums: edge_type: edge_type IN ( 'supersedes', 'inspired_by', 'related', 'patches', 'expands', 'absorbs', 'operator_directive', 'external_source' ; body_section: body_section IS NULL OR body_section IN ( 'origin', 'problem', 'system', 'improvement' 

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `from_rfc_id` | `TEXT` | NOT NULL | from rfc identifier |
| `to_rfc_id` | `TEXT` | NOT NULL | to rfc identifier |
| `edge_type` | `TEXT` | NOT NULL | edge type |
| `body_section` | `TEXT` | NULL | body section |
| `created_at_epoch_ms` | `BIGINT` | NOT NULL | creation epoch milliseconds |
| `created_by` | `TEXT` | NOT NULL | created actor identifier |

Table constraints:
- `UNIQUE(from_rfc_id, to_rfc_id, edge_type)`

### `cairn_approval_events`

- Domain: Cairn
- Purpose: Approval, revocation, qualifier, and deferral events for RFCs.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: rfc_id -> rfcs(rfc_id)
- Key indexes: idx_approval_events_event_type on (event_type); idx_approval_events_rfc_ts on (rfc_id, ts)
- Checks/enums: event_type: event_type IN ('ratify','approve_conditional','qualifier_add','revoke','defer'; source_kind: source_kind IN ('ratify','message','audit_chain','operator_direct','inferred'; is_revocation: is_revocation IN (0,1

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `rfc_id` | `TEXT` | NOT NULL | RFC identifier |
| `ts` | `TEXT` | NOT NULL; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | ts |
| `event_type` | `TEXT` | NOT NULL | event type |
| `source_msg_id` | `INTEGER` | nullable unless constrained by PK | source msg identifier |
| `source_kind` | `TEXT` | NOT NULL | source kind |
| `qualifier_text` | `TEXT` | nullable unless constrained by PK | qualifier text |
| `scope_delta_json` | `TEXT` | nullable unless constrained by PK | scope delta JSON |
| `author` | `TEXT` | NOT NULL; DEFAULT 'OPERATOR' | author |
| `is_revocation` | `INTEGER` | NOT NULL; DEFAULT 0 | is revocation |
| `qualifier_idx` | `INTEGER` | nullable unless constrained by PK | qualifier idx |

### `cairn_council_annotations`

- Domain: Cairn
- Purpose: Lens-specific council annotation attached to a response.
- Primary key: annotation_id
- Unique constraints: UNIQUE(response_id, lens)
- Foreign keys/logical references: response_id -> rfc_responses(response_id); rfc_id -> rfcs(rfc_id)
- Key indexes: idx_council_annotations_responder on (responder_node, fired_at_epoch_ms); idx_council_annotations_response on (response_id); idx_council_annotations_rfc_wave on (rfc_id, wave_round)
- Checks/enums: lens: lens IN ('devils_advocate','invariant_checker','provenance_honesty'; severity: severity IN ('info','nuance','concern','blocker_candidate'; sla_status: sla_status IN ('landed','missed','retried'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `annotation_id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | annotation identifier |
| `response_id` | `INTEGER` | NOT NULL | response identifier |
| `rfc_id` | `TEXT` | NOT NULL | RFC identifier |
| `wave_round` | `INTEGER` | NOT NULL | wave round |
| `responder_node` | `TEXT` | NOT NULL | responder node |
| `lens` | `TEXT` | NOT NULL | lens |
| `severity` | `TEXT` | NOT NULL | severity |
| `finding` | `TEXT` | NOT NULL | finding |
| `citations_json` | `TEXT` | NOT NULL | citations JSON |
| `model` | `TEXT` | NOT NULL | model |
| `sla_status` | `TEXT` | NOT NULL | sla status |
| `fired_at_epoch_ms` | `BIGINT` | NOT NULL | fired at epoch milliseconds |
| `landed_at_epoch_ms` | `BIGINT` | nullable unless constrained by PK | landed at epoch milliseconds |
| `latency_ms` | `INTEGER` | nullable unless constrained by PK | latency ms |

Table constraints:
- `UNIQUE(response_id, lens)`

### `cairn_council_firings`

- Domain: Cairn
- Purpose: Council-firing request and SLA row for RFC review.
- Primary key: firing_id
- Unique constraints: UNIQUE(rfc_id, firing_number)
- Foreign keys/logical references: rfc_id -> rfcs(rfc_id)
- Key indexes: idx_council_firings_rfc on (rfc_id); idx_council_firings_vessel on (vessel_node, triggered_at)
- Checks/enums: firing_number: firing_number IN (1,2; triggered_by: triggered_by IN ('author','auto','operator'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `firing_id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | firing identifier |
| `rfc_id` | `TEXT` | NOT NULL | RFC identifier |
| `firing_number` | `INTEGER` | NOT NULL | firing number |
| `vessel_node` | `TEXT` | NOT NULL | vessel node |
| `triggered_by` | `TEXT` | NOT NULL | triggered actor identifier |
| `triggered_at` | `TEXT` | NOT NULL | triggered timestamp text |
| `sla_deadline` | `TEXT` | NOT NULL | sla deadline |
| `output_artifact_id` | `TEXT` | nullable unless constrained by PK | output artifact identifier |
| `sla_met` | `INTEGER` | NULL; DEFAULT NULL | sla met |
| `lens_models` | `TEXT` | nullable unless constrained by PK | lens models |

Table constraints:
- `UNIQUE(rfc_id, firing_number)`

### `cairn_id_aliases`

- Domain: Cairn
- Purpose: Old-to-new Cairn identifier redirects.
- Primary key: old_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `old_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | old identifier |
| `new_id` | `TEXT` | NOT NULL | new identifier |
| `created_at` | `TEXT` | nullable unless constrained by PK; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | creation timestamp text |
| `sunset_at` | `TEXT` | nullable unless constrained by PK | sunset timestamp text |

### `cairn_id_counter`

- Domain: Cairn
- Purpose: Reference table for cairn id counter.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: id: id = 1

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `next_id` | `INTEGER` | NOT NULL; DEFAULT 1 | next identifier |

### `cairn_id_free_list`

- Domain: Cairn
- Purpose: Reference table for cairn id free list.
- Primary key: numeric_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_free_list_recycled_at on (recycled_at)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `numeric_id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | numeric identifier |
| `recycled_at` | `TEXT` | NOT NULL | recycled timestamp text |

### `cairn_kb`

- Domain: Cairn
- Purpose: Cairn knowledge-base article.
- Primary key: slug
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_kb_lifecycle_state on (lifecycle_state, updated_at DESC); idx_kb_quarantined on (quarantined); idx_kb_rank on (display_rank); idx_kb_status on (status); idx_kb_tags on (tags); idx_kb_temporal_class on (temporal_class)
- Checks/enums: status: status IN ('draft','published','flagged','archived'; temporal_class: temporal_class IN ('doctrine','reference','pattern','observation'; lifecycle_state: lifecycle_state IN ('hot','cold','tombstone','purged'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `slug` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | slug |
| `title` | `TEXT` | NOT NULL | human title |
| `content` | `TEXT` | NOT NULL | body/content text |
| `tags` | `TEXT` | NOT NULL | tags |
| `author_id` | `TEXT` | NOT NULL | author identifier |
| `published_by` | `TEXT` | nullable unless constrained by PK | published actor identifier |
| `last_editor_id` | `TEXT` | nullable unless constrained by PK | last editor identifier |
| `status` | `TEXT` | nullable unless constrained by PK; DEFAULT 'draft' | state/status value |
| `display_rank` | `INTEGER` | nullable unless constrained by PK | display rank |
| `temporal_class` | `TEXT` | nullable unless constrained by PK; DEFAULT 'pattern' | temporal class |
| `hit_count` | `INTEGER` | nullable unless constrained by PK; DEFAULT 0 | hit count |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `updated_at` | `TEXT` | NOT NULL | last update timestamp text |
| `content_origin` | `TEXT` | nullable unless constrained by PK | content origin |
| `content_problem` | `TEXT` | nullable unless constrained by PK | content problem |
| `content_system` | `TEXT` | nullable unless constrained by PK | content system |
| `content_improvement` | `TEXT` | nullable unless constrained by PK | content improvement |
| `quarantined` | `INTEGER` | NOT NULL; DEFAULT 0 | quarantined |
| `quarantined_by` | `TEXT` | nullable unless constrained by PK | quarantined actor identifier |
| `quarantined_at` | `TEXT` | nullable unless constrained by PK | quarantined timestamp text |
| `quarantine_reason` | `TEXT` | nullable unless constrained by PK | quarantine reason |
| `lifecycle_state` | `TEXT` | NOT NULL; DEFAULT 'hot' | lifecycle state |
| `purged_at` | `TEXT` | nullable unless constrained by PK | purged timestamp text |
| `purged_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | purged at epoch milliseconds |
| `purged_by` | `TEXT` | nullable unless constrained by PK | purged actor identifier |
| `body_md5_at_purge` | `TEXT` | nullable unless constrained by PK | body md5 at purge |

### `cairn_kb_history`

- Domain: Cairn
- Purpose: Knowledge-base edit history.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: kb_slug -> cairn_kb(slug)
- Key indexes: idx_kb_history_slug on (kb_slug)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `kb_slug` | `TEXT` | NOT NULL | kb slug |
| `editor_id` | `TEXT` | NOT NULL | editor identifier |
| `content_before` | `TEXT` | NOT NULL | content before |
| `content_after` | `TEXT` | NOT NULL | content after |
| `edit_summary` | `TEXT` | nullable unless constrained by PK | edit summary |
| `edited_at` | `TEXT` | NOT NULL | edited timestamp text |

### `cairn_lease_intent_policy`

- Domain: Cairn
- Purpose: Reference table for cairn lease intent policy.
- Primary key: intent_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `intent_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | intent identifier |
| `default_ttl_seconds` | `INTEGER` | NOT NULL | default ttl seconds |
| `conflict_policy` | `TEXT` | NOT NULL | conflict policy |
| `force_clear_policy` | `TEXT` | NOT NULL | force clear policy |
| `owner_rfc` | `TEXT` | NOT NULL | owner rfc |

### `cairn_lesson_revisions`

- Domain: Cairn
- Purpose: Reference table for cairn lesson revisions.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: lesson_id -> cairn_lessons(id)
- Key indexes: idx_lesson_revisions_lesson_id on (lesson_id); UNIQUE idx_revisions_current_per_lesson on (lesson_id) WHERE is_current=1
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `lesson_id` | `INTEGER` | NOT NULL | lesson identifier |
| `subject` | `TEXT` | NOT NULL | subject |
| `fact` | `TEXT` | NOT NULL | fact |
| `citations` | `TEXT` | NOT NULL | citations |
| `reason` | `TEXT` | NOT NULL | reason |
| `scope` | `TEXT` | NOT NULL | scope |
| `shape_version` | `INTEGER` | NOT NULL | shape version |
| `status` | `TEXT` | NOT NULL | state/status value |
| `edited_by` | `TEXT` | NOT NULL | edited actor identifier |
| `edited_at` | `TIMESTAMP` | nullable unless constrained by PK; DEFAULT CURRENT_TIMESTAMP | edited timestamp text |
| `edit_reason` | `TEXT` | nullable unless constrained by PK | edit reason |
| `is_current` | `INTEGER` | NOT NULL; DEFAULT 0 | is current |

### `cairn_lesson_scopes`

- Domain: Cairn
- Purpose: Reference table for cairn lesson scopes.
- Primary key: scope_name
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `scope_name` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | scope name |
| `added_at` | `TIMESTAMP` | nullable unless constrained by PK; DEFAULT CURRENT_TIMESTAMP | added timestamp text |
| `added_by` | `TEXT` | NOT NULL | added actor identifier |

### `cairn_lessons`

- Domain: Cairn
- Purpose: Reference table for cairn lessons.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: scope -> cairn_lesson_scopes(scope_name)
- Key indexes: UNIQUE idx_lessons_active_position_unique on (boot_cap_position) WHERE status='ACTIVE' AND boot_cap_position IS NOT NULL; idx_lessons_hygiene_seed_check_failed on (hygiene_seed_check_failed) WHERE hygiene_seed_check_failed = 1; idx_lessons_scope on (scope); idx_lessons_shape_version on (shape_version); idx_lessons_spyglass_indexed on (spyglass_indexed_at); idx_lessons_status on (status)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `subject` | `TEXT` | NOT NULL | subject |
| `fact` | `TEXT` | NOT NULL | fact |
| `citations` | `TEXT` | NOT NULL | citations |
| `reason` | `TEXT` | NOT NULL | reason |
| `scope` | `TEXT` | NOT NULL | scope |
| `shape_version` | `INTEGER` | NOT NULL; DEFAULT 2 | shape version |
| `status` | `TEXT` | NOT NULL; DEFAULT 'ACTIVE' | state/status value |
| `boot_cap_position` | `INTEGER` | nullable unless constrained by PK | boot cap position |
| `lossy_backfill_tag` | `TEXT` | nullable unless constrained by PK | lossy backfill tag |
| `hygiene_seed_check_failed` | `INTEGER` | NOT NULL; DEFAULT 0 | hygiene seed check failed |
| `spyglass_indexed_at` | `TIMESTAMP` | nullable unless constrained by PK | spyglass indexed timestamp text |
| `target_domain` | `TEXT` | nullable unless constrained by PK | target domain |
| `author_node` | `TEXT` | nullable unless constrained by PK | author node |
| `created_at` | `TIMESTAMP` | nullable unless constrained by PK; DEFAULT CURRENT_TIMESTAMP | creation timestamp text |
| `updated_at` | `TIMESTAMP` | nullable unless constrained by PK; DEFAULT CURRENT_TIMESTAMP | last update timestamp text |

### `cairn_node_leases`

- Domain: Cairn
- Purpose: Reference table for cairn node leases.
- Primary key: PRIMARY KEY (node_id)
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_leases_holder on (holder_pid); idx_leases_host on (host_id); idx_leases_intent on (intent)
- Checks/enums: intent: intent IN ('active','molt','gary_canary'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `node_id` | `TEXT` | NOT NULL | node identifier |
| `holder_pid` | `INTEGER` | NOT NULL | holder pid |
| `intent` | `TEXT` | NOT NULL | intent |
| `acquired_at_utc` | `TEXT` | NOT NULL | acquired at utc |
| `acquired_epoch_ms` | `INTEGER` | NOT NULL | acquired epoch milliseconds |
| `transferred_from_pid` | `INTEGER` | nullable unless constrained by PK | transferred from pid |
| `host_id` | `TEXT` | NOT NULL | host identifier |
| `advisory_only` | `INTEGER` | NOT NULL; DEFAULT 1 | advisory only |
| `auto_clear_on_coord_restart` | `INTEGER` | NOT NULL; DEFAULT 0 | auto clear on coord restart |
| `force_clear_operator_only` | `INTEGER` | NOT NULL; DEFAULT 0 | force clear operator only |

Table constraints:
- `PRIMARY KEY (node_id)`

### `cairn_operator_comments`

- Domain: Cairn
- Purpose: Reference table for cairn operator comments.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: rfc_id -> rfcs(rfc_id); wave_id -> rfc_waves(wave_id)
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `rfc_id` | `TEXT` | NOT NULL | RFC identifier |
| `wave_id` | `INTEGER` | nullable unless constrained by PK | wave identifier |
| `body` | `TEXT` | NOT NULL | body |
| `created_at` | `TEXT` | nullable unless constrained by PK; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | creation timestamp text |
| `author_id` | `TEXT` | nullable unless constrained by PK | author identifier |

### `cairn_rfc_gates`

- Domain: Cairn
- Purpose: Structured gate records for an RFC.
- Primary key: PRIMARY KEY (rfc_id, gate_id)
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_gates_state on (state)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `rfc_id` | `TEXT` | NOT NULL | RFC identifier |
| `gate_id` | `TEXT` | NOT NULL | gate identifier |
| `gate_kind` | `TEXT` | NOT NULL | gate kind |
| `state` | `TEXT` | NOT NULL; DEFAULT 'open' | state |
| `close_disposition` | `TEXT` | nullable unless constrained by PK | close disposition |
| `deferral_evidence_ref` | `TEXT` | nullable unless constrained by PK | deferral evidence ref |
| `close_reason` | `TEXT` | nullable unless constrained by PK | close reason |
| `opened_at` | `TEXT` | nullable unless constrained by PK | opened timestamp text |
| `opened_at_epoch_ms` | `BIGINT` | nullable unless constrained by PK | opened at epoch milliseconds |
| `closed_at` | `TEXT` | nullable unless constrained by PK | closed timestamp text |
| `closed_at_epoch_ms` | `BIGINT` | nullable unless constrained by PK | closed at epoch milliseconds |
| `opened_by` | `TEXT` | nullable unless constrained by PK | opened actor identifier |
| `closed_by` | `TEXT` | nullable unless constrained by PK | closed actor identifier |
| `phase_label` | `TEXT` | nullable unless constrained by PK | phase label |
| `cosign_coverage_json` | `TEXT` | nullable unless constrained by PK | cosign coverage JSON |
| `metadata_json` | `TEXT` | nullable unless constrained by PK | JSON metadata |

Table constraints:
- `PRIMARY KEY (rfc_id, gate_id)`

### `cairn_scratch`

- Domain: Cairn
- Purpose: Temporary Cairn note or seed.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_scratch_author on (author_id); idx_scratch_expires on (expires_at); idx_scratch_lifecycle_state on (lifecycle_state, created_at DESC); idx_scratch_previous on (previous_id) WHERE previous_id IS NOT NULL; idx_scratch_ref_rfc on (ref_rfc_id); idx_scratch_ref_task on (ref_task_id)
- Checks/enums: lifecycle_state: lifecycle_state IN ('hot','cold','tombstone','purged'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `author_id` | `TEXT` | NOT NULL | author identifier |
| `content` | `TEXT` | NOT NULL | body/content text |
| `tags` | `TEXT` | nullable unless constrained by PK; DEFAULT '' | tags |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `expires_at` | `TEXT` | NOT NULL | expires timestamp text |
| `previous_id` | `TEXT` | nullable unless constrained by PK | previous identifier |
| `ref_task_id` | `TEXT` | nullable unless constrained by PK; DEFAULT '' | ref task identifier |
| `ref_rfc_id` | `TEXT` | nullable unless constrained by PK; DEFAULT '' | ref rfc identifier |
| `pinned` | `INTEGER` | nullable unless constrained by PK; DEFAULT 0 | pinned |
| `pin_until` | `TEXT` | nullable unless constrained by PK; DEFAULT '' | pin until |
| `lifecycle_state` | `TEXT` | NOT NULL; DEFAULT 'hot' | lifecycle state |
| `purged_at` | `TEXT` | nullable unless constrained by PK | purged timestamp text |
| `purged_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | purged at epoch milliseconds |
| `purged_by` | `TEXT` | nullable unless constrained by PK | purged actor identifier |
| `body_md5_at_purge` | `TEXT` | nullable unless constrained by PK | body md5 at purge |

### `cairn_swat_design_input`

- Domain: Cairn
- Purpose: Invited design-review input attached to review issues.
- Primary key: design_input_id
- Unique constraints: UNIQUE(swat_id, node_id)
- Foreign keys/logical references: swat_id -> cairn_swats(swat_id)
- Key indexes: idx_cairn_swat_design_input_node on (node_id); idx_cairn_swat_design_input_swat on (swat_id)
- Checks/enums: response_stance: response_stance IN ('support','object','nuance','defer'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `design_input_id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | design input identifier |
| `swat_id` | `TEXT` | NOT NULL | review issue identifier |
| `node_id` | `TEXT` | NOT NULL | node identifier |
| `invited_at` | `TEXT` | NOT NULL | invited timestamp text |
| `invited_at_epoch_ms` | `INTEGER` | NOT NULL | invited at epoch milliseconds |
| `invited_by` | `TEXT` | NOT NULL | invited actor identifier |
| `response_body` | `TEXT` | nullable unless constrained by PK | response body |
| `response_stance` | `TEXT` | NULL | response stance |
| `responded_at` | `TEXT` | nullable unless constrained by PK | responded timestamp text |
| `responded_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | responded at epoch milliseconds |

Table constraints:
- `UNIQUE(swat_id, node_id)`

### `cairn_swat_id_counter`

- Domain: Cairn
- Purpose: Reference table for cairn swat id counter.
- Primary key: date_key
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `date_key` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | date key |
| `last_seq` | `INTEGER` | NOT NULL; DEFAULT 0 | last seq |

### `cairn_swats`

- Domain: Cairn
- Purpose: Review issue record: stage, severity, reviewer verdict, fix metadata, and disposition.
- Primary key: swat_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_cairn_swats_reviewer on (current_reviewer) WHERE current_reviewer IS NOT NULL; idx_cairn_swats_severity on (severity); idx_cairn_swats_stage on (stage)
- Checks/enums: `CHECK (stage IN ('open','in_review','fixed','closed'))`; `CHECK (severity IN ('critical','high','medium','low'))`; `CHECK (current_verdict IN ('approve','request_changes','reject') OR current_verdict IS NULL)`

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `swat_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | review issue identifier |
| `title` | `TEXT` | NOT NULL | human title |
| `body` | `TEXT` | NOT NULL | body |
| `stage` | `TEXT` | NOT NULL | stage |
| `severity` | `TEXT` | NOT NULL | severity |
| `created_by` | `TEXT` | NOT NULL | created actor identifier |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | NOT NULL | creation epoch milliseconds |
| `updated_at` | `TEXT` | NOT NULL | last update timestamp text |
| `updated_at_epoch_ms` | `INTEGER` | NOT NULL | last update epoch milliseconds |
| `current_reviewer` | `TEXT` | nullable unless constrained by PK | current reviewer |
| `current_verdict` | `TEXT` | NULL | current verdict |
| `ref_kbs` | `TEXT` | NOT NULL; DEFAULT '' | ref kbs |
| `ref_rfcs` | `TEXT` | NOT NULL; DEFAULT '' | ref rfcs |
| `previous_reviewers` | `TEXT` | NOT NULL; DEFAULT '' | previous reviewers |
| `fix_commit` | `TEXT` | nullable unless constrained by PK | fix commit |
| `closed_at` | `TEXT` | nullable unless constrained by PK | closed timestamp text |
| `closed_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | closed at epoch milliseconds |
| `closed_reason` | `TEXT` | nullable unless constrained by PK | closed reason |
| `code_author` | `TEXT` | nullable unless constrained by PK | code author |
| `cluster_id` | `TEXT` | nullable unless constrained by PK | cluster identifier |
| `build_owner` | `TEXT` | nullable unless constrained by PK | build owner |
| `build_owner_claimed_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | build owner claimed at epoch milliseconds |
| `design_input_status` | `TEXT` | nullable unless constrained by PK | design input status |
| `design_review_opened_at` | `TEXT` | nullable unless constrained by PK | design review opened timestamp text |
| `design_review_opened_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | design review opened at epoch milliseconds |
| `design_input_synthesis` | `TEXT` | nullable unless constrained by PK | design input synthesis |
| `design_input_skip_rationale` | `TEXT` | nullable unless constrained by PK | design input skip rationale |
| `previous_design_input_invitees` | `TEXT` | NOT NULL; DEFAULT '' | previous design input invitees |
| `pool_exhausted` | `INTEGER` | NOT NULL; DEFAULT 0 | pool exhausted |
| `pool_exhausted_first_detected_at` | `TEXT` | nullable unless constrained by PK | pool exhausted first detected timestamp text |
| `pool_exhausted_resolved_at` | `TEXT` | nullable unless constrained by PK | pool exhausted resolved timestamp text |
| `threshold_override_active` | `INTEGER` | NOT NULL; DEFAULT 0 | threshold override active |
| `design_input_stale_emitted_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | design input stale emitted at epoch milliseconds |
| `disposition` | `TEXT` | nullable unless constrained by PK | disposition |
| `refile_target_swat_id` | `TEXT` | nullable unless constrained by PK | refile target swat identifier |
| `refile_kind` | `TEXT` | nullable unless constrained by PK | refile kind |
| `fix_commit_merged_verified` | `INTEGER` | nullable unless constrained by PK | fix commit merged verified |
| `land_reminder_last_emitted_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | land reminder last emitted at epoch milliseconds |
| `cluster_id_source` | `TEXT` | nullable unless constrained by PK | cluster id source |
| `repo` | `TEXT` | nullable unless constrained by PK | repo |

### `cairn_wave_nodes`

- Domain: Cairn
- Purpose: Reference table for cairn wave nodes.
- Primary key: PRIMARY KEY (wave_id, item_id)
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_wave_nodes_assignee on (assignee); idx_wave_nodes_cluster on (cluster_id); idx_wave_nodes_item on (item_id); idx_wave_nodes_status on (status)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `wave_id` | `TEXT` | NOT NULL | wave identifier |
| `item_id` | `TEXT` | NOT NULL | item identifier |
| `depends_on_json` | `TEXT` | NOT NULL; DEFAULT '[]' | depends on JSON |
| `assignee` | `TEXT` | nullable unless constrained by PK | assignee |
| `cluster_id` | `TEXT` | nullable unless constrained by PK | cluster identifier |
| `status` | `TEXT` | NOT NULL; DEFAULT 'blocked' | state/status value |
| `write_set_json` | `TEXT` | nullable unless constrained by PK | write set JSON |
| `scope_description` | `TEXT` | nullable unless constrained by PK | scope description |
| `created_at` | `TEXT` | NOT NULL; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | NOT NULL | creation epoch milliseconds |
| `ready_at` | `TEXT` | nullable unless constrained by PK | ready timestamp text |
| `ready_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | ready at epoch milliseconds |
| `dispatched_at` | `TEXT` | nullable unless constrained by PK | dispatched timestamp text |
| `dispatched_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | dispatched at epoch milliseconds |
| `completed_at` | `TEXT` | nullable unless constrained by PK | completed timestamp text |
| `completed_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | completed at epoch milliseconds |
| `terminal_status` | `TEXT` | nullable unless constrained by PK | terminal status |
| `metadata_json` | `TEXT` | nullable unless constrained by PK | JSON metadata |

Table constraints:
- `PRIMARY KEY (wave_id, item_id)`

### `cairn_waves`

- Domain: Cairn
- Purpose: Reference table for cairn waves.
- Primary key: wave_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_waves_cluster on (cluster_id); idx_waves_status on (status)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `wave_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | wave identifier |
| `originator_node` | `TEXT` | NOT NULL | originator node |
| `cluster_id` | `TEXT` | nullable unless constrained by PK | cluster identifier |
| `declared_dag_json` | `TEXT` | NOT NULL | declared dag JSON |
| `status` | `TEXT` | NOT NULL; DEFAULT 'open' | state/status value |
| `declared_at` | `TEXT` | NOT NULL; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | declared timestamp text |
| `declared_at_epoch_ms` | `INTEGER` | NOT NULL | declared at epoch milliseconds |
| `closed_at` | `TEXT` | nullable unless constrained by PK | closed timestamp text |
| `closed_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | closed at epoch milliseconds |
| `closed_by` | `TEXT` | nullable unless constrained by PK | closed actor identifier |
| `close_disposition` | `TEXT` | nullable unless constrained by PK | close disposition |
| `metadata_json` | `TEXT` | nullable unless constrained by PK | JSON metadata |

### `rfc_comments`

- Domain: Cairn
- Purpose: Reference table for rfc comments.
- Primary key: comment_id
- Unique constraints: none declared
- Foreign keys/logical references: response_id -> rfc_responses(response_id)
- Key indexes: idx_comments_response on (response_id)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `comment_id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | comment identifier |
| `response_id` | `INTEGER` | NOT NULL | response identifier |
| `author_id` | `TEXT` | NOT NULL | author identifier |
| `body` | `TEXT` | NOT NULL | body |
| `is_operator_frame` | `INTEGER` | nullable unless constrained by PK; DEFAULT 0 | is operator frame |
| `resolved` | `INTEGER` | nullable unless constrained by PK; DEFAULT 0 | resolved |
| `created_at` | `TEXT` | nullable unless constrained by PK; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | creation timestamp text |

### `rfc_deployments`

- Domain: Cairn
- Purpose: Reference table for rfc deployments.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_deploy_rfc on (rfc_id)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `rfc_id` | `TEXT` | NOT NULL | RFC identifier |
| `commit_sha` | `TEXT` | nullable unless constrained by PK | commit sha |
| `host` | `TEXT` | NOT NULL | host |
| `files_json` | `TEXT` | nullable unless constrained by PK | files JSON |
| `deployed_at` | `TEXT` | nullable unless constrained by PK; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | deployed timestamp text |
| `deployed_by` | `TEXT` | NOT NULL | deployed actor identifier |
| `is_rollback` | `INTEGER` | nullable unless constrained by PK; DEFAULT 0 | is rollback |
| `rollback_of` | `TEXT` | nullable unless constrained by PK | rollback of |

### `rfc_operator_notes`

- Domain: Cairn
- Purpose: Reference table for rfc operator notes.
- Primary key: note_id
- Unique constraints: none declared
- Foreign keys/logical references: rfc_id -> rfcs(rfc_id)
- Key indexes: idx_operator_notes_rfc on (rfc_id)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `note_id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | note identifier |
| `rfc_id` | `TEXT` | NOT NULL | RFC identifier |
| `author_id` | `TEXT` | NOT NULL; DEFAULT 'OPERATOR' | author identifier |
| `body` | `TEXT` | NOT NULL | body |
| `created_at` | `TEXT` | nullable unless constrained by PK; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | creation timestamp text |

### `rfc_response_versions`

- Domain: Cairn
- Purpose: Reference table for rfc response versions.
- Primary key: version_id
- Unique constraints: UNIQUE(response_id, version_num)
- Foreign keys/logical references: response_id -> rfc_responses(response_id)
- Key indexes: idx_response_versions on (response_id)
- Checks/enums: stance: stance IN ('support','object','nuance','defer'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `version_id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | version identifier |
| `response_id` | `INTEGER` | NOT NULL | response identifier |
| `version_num` | `INTEGER` | NOT NULL | version num |
| `body` | `TEXT` | NOT NULL | body |
| `stance` | `TEXT` | nullable unless constrained by PK | stance |
| `edited_at` | `TEXT` | nullable unless constrained by PK; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | edited timestamp text |
| `edit_reason` | `TEXT` | nullable unless constrained by PK | edit reason |

Table constraints:
- `UNIQUE(response_id, version_num)`

### `rfc_responses`

- Domain: Cairn
- Purpose: Per-node response in an RFC wave.
- Primary key: response_id
- Unique constraints: UNIQUE(wave_id, author_id)
- Foreign keys/logical references: wave_id -> rfc_waves(wave_id)
- Key indexes: idx_responses_wave on (wave_id)
- Checks/enums: stance: stance IN ('support','object','nuance','defer'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `response_id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | response identifier |
| `wave_id` | `INTEGER` | NOT NULL | wave identifier |
| `author_id` | `TEXT` | NOT NULL | author identifier |
| `stance` | `TEXT` | nullable unless constrained by PK | stance |
| `body` | `TEXT` | NOT NULL | body |
| `is_starred` | `INTEGER` | nullable unless constrained by PK; DEFAULT 0 | is starred |
| `is_late` | `INTEGER` | nullable unless constrained by PK; DEFAULT 0 | is late |
| `created_at` | `TEXT` | nullable unless constrained by PK; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | creation timestamp text |

Table constraints:
- `UNIQUE(wave_id, author_id)`

### `rfc_revisions`

- Domain: Cairn
- Purpose: Versioned RFC body history.
- Primary key: rev_id
- Unique constraints: UNIQUE(rfc_id, rev_number)
- Foreign keys/logical references: rfc_id -> rfcs(rfc_id)
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `rev_id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | rev identifier |
| `rfc_id` | `TEXT` | NOT NULL | RFC identifier |
| `rev_number` | `INTEGER` | NOT NULL | rev number |
| `body` | `TEXT` | NOT NULL | body |
| `body_sha256` | `TEXT` | NOT NULL | body sha256 |
| `edit_summary` | `TEXT` | nullable unless constrained by PK | edit summary |
| `author_id` | `TEXT` | NOT NULL | author identifier |
| `authored_at` | `TEXT` | nullable unless constrained by PK; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | authored timestamp text |
| `body_origin` | `TEXT` | nullable unless constrained by PK | body origin |
| `body_problem` | `TEXT` | nullable unless constrained by PK | body problem |
| `body_system` | `TEXT` | nullable unless constrained by PK | body system |
| `body_improvement` | `TEXT` | nullable unless constrained by PK | body improvement |

Table constraints:
- `UNIQUE(rfc_id, rev_number)`

### `rfc_signals`

- Domain: Cairn
- Purpose: Lightweight signal on a response.
- Primary key: PRIMARY KEY (node_id, response_id, signal)
- Unique constraints: none declared
- Foreign keys/logical references: response_id -> rfc_responses(response_id)
- Key indexes: idx_signals_response on (response_id)
- Checks/enums: signal: signal IN ('support','object','nuance','defer','star'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `node_id` | `TEXT` | NOT NULL | node identifier |
| `response_id` | `INTEGER` | NOT NULL | response identifier |
| `signal` | `TEXT` | NOT NULL | signal |
| `comment` | `TEXT` | nullable unless constrained by PK | comment |
| `cast_at` | `TEXT` | nullable unless constrained by PK; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | cast timestamp text |

Table constraints:
- `PRIMARY KEY (node_id, response_id, signal)`

### `rfc_standing_opa`

- Domain: Cairn
- Purpose: Standing operator pre-authorization attached to an RFC.
- Primary key: rfc_id
- Unique constraints: none declared
- Foreign keys/logical references: rfc_id -> rfcs(rfc_id)
- Key indexes: none captured
- Checks/enums: status: status IN ('active','revoked'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `rfc_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | RFC identifier |
| `granted_by` | `TEXT` | NOT NULL | granted actor identifier |
| `granted_at` | `TEXT` | nullable unless constrained by PK; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | granted timestamp text |
| `gate_scope` | `TEXT` | nullable unless constrained by PK | gate scope |
| `reask_breakage` | `INTEGER` | NOT NULL; DEFAULT 1 | reask breakage |
| `reask_health` | `INTEGER` | NOT NULL; DEFAULT 1 | reask health |
| `status` | `TEXT` | NOT NULL; DEFAULT 'active' | state/status value |
| `revoked_by` | `TEXT` | nullable unless constrained by PK | revoked actor identifier |
| `revoked_at` | `TEXT` | nullable unless constrained by PK | revoked timestamp text |
| `note` | `TEXT` | nullable unless constrained by PK | note |

### `rfc_tags`

- Domain: Cairn
- Purpose: Reference table for rfc tags.
- Primary key: PRIMARY KEY (rfc_id, tag)
- Unique constraints: none declared
- Foreign keys/logical references: rfc_id -> rfcs(rfc_id)
- Key indexes: idx_tags_tag on (tag)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `rfc_id` | `TEXT` | NOT NULL | RFC identifier |
| `tag` | `TEXT` | NOT NULL | tag |

Table constraints:
- `PRIMARY KEY (rfc_id, tag)`

### `rfc_votes`

- Domain: Cairn
- Purpose: Per-node final vote on an RFC.
- Primary key: vote_id
- Unique constraints: UNIQUE(rfc_id, voter_id)
- Foreign keys/logical references: rfc_id -> rfcs(rfc_id)
- Key indexes: idx_votes_rfc on (rfc_id)
- Checks/enums: verdict: verdict IN ('approve','reject','abstain'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `vote_id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | vote identifier |
| `rfc_id` | `TEXT` | NOT NULL | RFC identifier |
| `voter_id` | `TEXT` | NOT NULL | voter identifier |
| `verdict` | `TEXT` | NOT NULL | verdict |
| `justification` | `TEXT` | nullable unless constrained by PK | justification |
| `cast_at` | `TEXT` | nullable unless constrained by PK; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | cast timestamp text |

Table constraints:
- `UNIQUE(rfc_id, voter_id)`

### `rfc_waves`

- Domain: Cairn
- Purpose: Discussion/review waves for an RFC.
- Primary key: wave_id
- Unique constraints: UNIQUE(rfc_id, round_num)
- Foreign keys/logical references: rfc_id -> rfcs(rfc_id)
- Key indexes: idx_waves_rfc on (rfc_id)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `wave_id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | wave identifier |
| `rfc_id` | `TEXT` | NOT NULL | RFC identifier |
| `round_num` | `INTEGER` | NOT NULL | round num |
| `prompt` | `TEXT` | NOT NULL | prompt |
| `mode` | `TEXT` | nullable unless constrained by PK; DEFAULT 'exploratory' | mode |
| `opened_at` | `TEXT` | nullable unless constrained by PK; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | opened timestamp text |
| `closed_at` | `TEXT` | nullable unless constrained by PK | closed timestamp text |
| `synthesis` | `TEXT` | nullable unless constrained by PK | synthesis |
| `opened_by` | `TEXT` | nullable unless constrained by PK | opened actor identifier |
| `closed_by` | `TEXT` | nullable unless constrained by PK | closed actor identifier |

Table constraints:
- `UNIQUE(rfc_id, round_num)`

### `rfcs`

- Domain: Cairn
- Purpose: Cairn proposal/RFC root row.
- Primary key: rfc_id
- Unique constraints: source_seed_id
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_rfcs_author on (author_id); idx_rfcs_category on (category); idx_rfcs_domain on (domain); idx_rfcs_lifecycle_state on (lifecycle_state, updated_at DESC); idx_rfcs_parent on (parent_rfc_id); idx_rfcs_parent_type on (parent_rfc_id, rfc_type); idx_rfcs_status on (status)
- Checks/enums: status: status IN ('seed','ideation','in_round','ratified','shipped','deferred','superseded','archived'; lifecycle_state: lifecycle_state IN ('hot','cold','tombstone','purged'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `rfc_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | RFC identifier |
| `title` | `TEXT` | NOT NULL | human title |
| `status` | `TEXT` | NOT NULL; DEFAULT 'seed' | state/status value |
| `template` | `TEXT` | nullable unless constrained by PK; DEFAULT 'standard' | template |
| `domain` | `TEXT` | NOT NULL | domain |
| `author_id` | `TEXT` | NOT NULL | author identifier |
| `current_rev_id` | `INTEGER` | nullable unless constrained by PK | current rev identifier |
| `body_sha256` | `TEXT` | nullable unless constrained by PK | body sha256 |
| `superseded_by` | `TEXT` | nullable unless constrained by PK | superseded actor identifier |
| `source_seed_id` | `TEXT` | nullable unless constrained by PK; UNIQUE | source seed identifier |
| `solidplan` | `TEXT` | nullable unless constrained by PK | solidplan |
| `solidplan_author` | `TEXT` | nullable unless constrained by PK | solidplan author |
| `solidplan_at` | `TEXT` | nullable unless constrained by PK | solidplan timestamp text |
| `created_at` | `TEXT` | nullable unless constrained by PK; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | creation timestamp text |
| `updated_at` | `TEXT` | nullable unless constrained by PK; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | last update timestamp text |
| `legacy_id` | `TEXT` | nullable unless constrained by PK | legacy identifier |
| `parent_rfc_id` | `TEXT` | nullable unless constrained by PK | parent rfc identifier |
| `rfc_type` | `TEXT` | nullable unless constrained by PK; DEFAULT 'base' | rfc type |
| `category` | `TEXT` | nullable unless constrained by PK | category |
| `related_rfcs` | `TEXT` | nullable unless constrained by PK | related rfcs |
| `short_description` | `TEXT` | nullable unless constrained by PK | short description |
| `lifecycle_state` | `TEXT` | NOT NULL; DEFAULT 'hot' | lifecycle state |
| `purged_at` | `TEXT` | nullable unless constrained by PK | purged timestamp text |
| `purged_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | purged at epoch milliseconds |
| `purged_by` | `TEXT` | nullable unless constrained by PK | purged actor identifier |
| `body_md5_at_purge` | `TEXT` | nullable unless constrained by PK | body md5 at purge |

### `solidplan_revisions`

- Domain: Cairn
- Purpose: Versioned implementation-plan body for an RFC.
- Primary key: rev_id
- Unique constraints: UNIQUE(rfc_id, rev_number)
- Foreign keys/logical references: rfc_id -> rfcs(rfc_id)
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `rev_id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | rev identifier |
| `rfc_id` | `TEXT` | NOT NULL | RFC identifier |
| `rev_number` | `INTEGER` | NOT NULL | rev number |
| `content` | `TEXT` | NOT NULL | body/content text |
| `content_sha256` | `TEXT` | NOT NULL | content sha256 |
| `author_id` | `TEXT` | NOT NULL | author identifier |
| `revision_note` | `TEXT` | nullable unless constrained by PK | revision note |
| `authored_at` | `TEXT` | nullable unless constrained by PK; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | authored timestamp text |

Table constraints:
- `UNIQUE(rfc_id, rev_number)`

### `tag_synonyms`

- Domain: Cairn
- Purpose: Reference table for tag synonyms.
- Primary key: alias
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `alias` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | alias |
| `canonical` | `TEXT` | NOT NULL | canonical |

### `authority_tokens`

- Domain: authorization/OPA
- Purpose: Delegated authority tokens for sensitive lifecycle operations.
- Primary key: id
- Unique constraints: token_hash
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_authority_tokens_delegate on (delegate, scope, status); idx_authority_tokens_guestbook on (guestbook_id) WHERE guestbook_id IS NOT NULL
- Checks/enums: scope: scope IN ( 'molt_fleet', 'molt_individual', 'node_restart', 'session_clear', 'identity_update', 'consensus_override' ; status: status IN ( 'active', 'consumed', 'expired', 'revoked' 

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `token_hash` | `TEXT` | NOT NULL; UNIQUE | token hash |
| `issuer` | `TEXT` | NOT NULL | issuer |
| `delegate` | `TEXT` | NOT NULL | delegate |
| `scope` | `TEXT` | NOT NULL | scope |
| `target_node_id` | `TEXT` | NULL; DEFAULT NULL | target node identifier |
| `guestbook_id` | `INTEGER` | NULL; DEFAULT NULL | guestbook identifier |
| `nonce` | `TEXT` | NOT NULL | nonce |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `expires_at` | `TEXT` | NOT NULL | expires timestamp text |
| `expires_at_epoch_ms` | `INTEGER` | NOT NULL | expires at epoch milliseconds |
| `consumed_at` | `TEXT` | NULL; DEFAULT NULL | consumed timestamp text |
| `consumed_by` | `TEXT` | NULL; DEFAULT NULL | consumed actor identifier |
| `revoked_at` | `TEXT` | NULL; DEFAULT NULL | revoked timestamp text |
| `revoked_by` | `TEXT` | NULL; DEFAULT NULL | revoked actor identifier |
| `status` | `TEXT` | NOT NULL; DEFAULT 'active' | state/status value |

### `ops_elevations`

- Domain: authorization/OPA
- Purpose: One-time or scoped operational authorization grants.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_opa_node on (node_id, consumed, revoked_at)
- Checks/enums: scope_type: scope_type IN ('action', 'task', 'time'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `node_id` | `TEXT` | NOT NULL | node identifier |
| `scope_type` | `TEXT` | NOT NULL | scope type |
| `granted_by` | `TEXT` | NOT NULL; DEFAULT 'OPERATOR' | granted actor identifier |
| `expires_at` | `TEXT` | nullable unless constrained by PK | expires timestamp text |
| `consumed` | `INTEGER` | NOT NULL; DEFAULT 0 | consumed |
| `reason` | `TEXT` | nullable unless constrained by PK | reason |
| `source` | `TEXT` | nullable unless constrained by PK; DEFAULT 'console' | source |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `consumed_at` | `TEXT` | nullable unless constrained by PK | consumed timestamp text |
| `consumed_by_action` | `TEXT` | nullable unless constrained by PK | consumed by action |
| `revoked_at` | `TEXT` | nullable unless constrained by PK | revoked timestamp text |
| `revoked_by` | `TEXT` | nullable unless constrained by PK | revoked actor identifier |
| `delegated_by` | `TEXT` | nullable unless constrained by PK | delegated actor identifier |
| `delegation_chain` | `TEXT` | nullable unless constrained by PK | delegation chain |
| `operator_directive` | `TEXT` | nullable unless constrained by PK | operator directive |
| `action_type` | `TEXT` | nullable unless constrained by PK | action type |

### `sudo_grants`

- Domain: authorization/OPA
- Purpose: Reference table for sudo grants.
- Primary key: id
- Unique constraints: grant_id
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_sudo_grants_requester on (requester_node_id, status); idx_sudo_grants_status on (status, expires_at_epoch_ms)
- Checks/enums: status: status IN ( 'pending', 'granted', 'expired', 'revoked', 'denied' 

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `grant_id` | `TEXT` | NOT NULL; UNIQUE | grant identifier |
| `requester_node_id` | `TEXT` | NOT NULL | requester node identifier |
| `action_type` | `TEXT` | NOT NULL | action type |
| `reason` | `TEXT` | NOT NULL; DEFAULT '' | reason |
| `scope_detail` | `TEXT` | NULL; DEFAULT NULL | scope detail |
| `status` | `TEXT` | NOT NULL; DEFAULT 'pending' | state/status value |
| `guestbook_id` | `INTEGER` | NULL; DEFAULT NULL | guestbook identifier |
| `granted_by` | `TEXT` | NULL; DEFAULT NULL | granted actor identifier |
| `granted_at` | `TEXT` | NULL; DEFAULT NULL | granted timestamp text |
| `granted_at_epoch_ms` | `INTEGER` | NULL; DEFAULT NULL | granted at epoch milliseconds |
| `expires_at` | `TEXT` | NULL; DEFAULT NULL | expires timestamp text |
| `expires_at_epoch_ms` | `INTEGER` | NULL; DEFAULT NULL | expires at epoch milliseconds |
| `revoked_at` | `TEXT` | NULL; DEFAULT NULL | revoked timestamp text |
| `revoked_by` | `TEXT` | NULL; DEFAULT NULL | revoked actor identifier |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | NOT NULL | creation epoch milliseconds |

### `boomerangs`

- Domain: boomerangs
- Purpose: Delegated-return work loop with deadline, assignee, return, escalation, and micro-work fields.
- Primary key: item_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_boomerangs_assignee_status on (assignee, status); idx_boomerangs_originator_kind_status on (originator, kind, status); idx_boomerangs_status_deadline on (status, deadline_epoch_ms)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `item_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | item identifier |
| `ref_task_id` | `TEXT` | nullable unless constrained by PK | ref task identifier |
| `originator` | `TEXT` | NOT NULL | originator |
| `assignee` | `TEXT` | NOT NULL | assignee |
| `thrown_at` | `TEXT` | NOT NULL | thrown timestamp text |
| `thrown_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | thrown at epoch milliseconds |
| `deadline` | `TEXT` | NOT NULL | deadline |
| `deadline_epoch_ms` | `INTEGER` | nullable unless constrained by PK | deadline epoch milliseconds |
| `returned_at` | `TEXT` | nullable unless constrained by PK | returned timestamp text |
| `returned_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | returned at epoch milliseconds |
| `status` | `TEXT` | NOT NULL; DEFAULT 'thrown' | state/status value |
| `return_reason` | `TEXT` | nullable unless constrained by PK | return reason |
| `return_category` | `TEXT` | nullable unless constrained by PK | return category |
| `escalation_target` | `TEXT` | NOT NULL; DEFAULT '<legacy-role>' | escalation target |
| `bounce_count` | `INTEGER` | NOT NULL; DEFAULT 0 | bounce count |
| `priority` | `INTEGER` | NOT NULL; DEFAULT 3 | priority |
| `complexity_tier` | `TEXT` | NOT NULL; DEFAULT 'medium' | complexity tier |
| `scope_description` | `TEXT` | NOT NULL; DEFAULT '' | scope description |
| `preempted_by` | `TEXT` | nullable unless constrained by PK | preempted actor identifier |
| `clock_paused_at` | `TEXT` | nullable unless constrained by PK | clock paused timestamp text |
| `clock_paused_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | clock paused at epoch milliseconds |
| `escalated_at` | `TEXT` | nullable unless constrained by PK | escalated timestamp text |
| `escalated_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | escalated at epoch milliseconds |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |
| `updated_at` | `TEXT` | NOT NULL | last update timestamp text |
| `updated_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | last update epoch milliseconds |
| `is_micro` | `INTEGER` | NOT NULL; DEFAULT 0 | is micro |
| `micro_tier` | `TEXT` | nullable unless constrained by PK | micro tier |
| `micro_miss_count` | `INTEGER` | NOT NULL; DEFAULT 0 | micro miss count |
| `kind` | `TEXT` | NOT NULL; DEFAULT 'work' | kind |
| `originator_session_id` | `TEXT` | nullable unless constrained by PK | originator session identifier |

### `events`

- Domain: events/audit
- Purpose: Append-only event log base table; PostgreSQL deployment may expose readers through events_all.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: UNIQUE idx_events_flag_drift_dedupe on (json_extract(payload_json, '$.restart_token_id') , json_extract(payload_json, '$.snapshot_hash')) WHERE event_type = 'flag_drift_detected'; idx_events_node_ts on (node_id, timestamp_epoch_ms)
- Checks/enums: payload_json: payload_json IS NULL OR json_valid(payload_json

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `node_id` | `TEXT` | nullable unless constrained by PK | node identifier |
| `task_id` | `TEXT` | nullable unless constrained by PK | task identifier |
| `event_type` | `TEXT` | NOT NULL | event type |
| `message` | `TEXT` | NOT NULL; DEFAULT '' | message |
| `timestamp` | `TEXT` | NOT NULL | timestamp |
| `timestamp_epoch_ms` | `INTEGER` | nullable unless constrained by PK | timestamp epoch milliseconds |
| `payload_json` | `TEXT` | NULL | JSON payload |

### `tool_catalog`

- Domain: events/audit
- Purpose: Reference table for tool catalog.
- Primary key: tool_name
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: schema_tokens: schema_tokens >= 0; description_tokens: description_tokens >= 0; total_static: total_static >= 0

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `tool_name` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | tool name |
| `schema_tokens` | `INTEGER` | NOT NULL; DEFAULT 0 | schema tokens |
| `description_tokens` | `INTEGER` | NOT NULL; DEFAULT 0 | description tokens |
| `total_static` | `INTEGER` | NOT NULL; DEFAULT 0 | total static |
| `last_ingested_at` | `INTEGER` | NOT NULL; DEFAULT 0 | last ingested timestamp text |

### `coordinator_config`

- Domain: fleet/nodes/topology
- Purpose: Reference table for coordinator config.
- Primary key: key
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `key` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | key |
| `value` | `TEXT` | NOT NULL; DEFAULT '' | value |

### `fleet_state`

- Domain: fleet/nodes/topology
- Purpose: Reference table for fleet state.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: id: id = 1

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `molt_lock_node_id` | `TEXT` | NOT NULL; DEFAULT '' | molt lock node identifier |
| `molt_lock_at` | `TEXT` | NOT NULL; DEFAULT '' | molt lock timestamp text |
| `molt_lock_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK; DEFAULT 0 | molt lock at epoch milliseconds |
| `molt_lock_reason` | `TEXT` | NOT NULL; DEFAULT '' | molt lock reason |
| `molt_moratorium` | `INTEGER` | NOT NULL; DEFAULT 0 | molt moratorium |
| `molt_moratorium_reason` | `TEXT` | NOT NULL; DEFAULT '' | molt moratorium reason |
| `molt_moratorium_at` | `TEXT` | NOT NULL; DEFAULT '' | molt moratorium timestamp text |
| `molt_moratorium_by` | `TEXT` | NOT NULL; DEFAULT '' | molt moratorium actor identifier |

### `node_identities`

- Domain: fleet/nodes/topology
- Purpose: Slow-changing node identity, bootstrap prompt, default role/capabilities, and secret/session remnants.
- Primary key: node_id
- Unique constraints: none declared
- Foreign keys/logical references: node_id -> nodes(node_id)
- Key indexes: idx_node_identities_secret_hash on (node_secret_hash) WHERE node_secret_hash != ''
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `node_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | node identifier |
| `personality` | `TEXT` | NOT NULL; DEFAULT '' | personality |
| `strengths` | `TEXT` | NOT NULL; DEFAULT '[]' | strengths |
| `operator_notes` | `TEXT` | NOT NULL; DEFAULT '' | operator notes |
| `corrections_log` | `TEXT` | NOT NULL; DEFAULT '[]' | corrections log |
| `startup_instructions` | `TEXT` | NOT NULL; DEFAULT '' | startup instructions |
| `last_session_summary` | `TEXT` | NOT NULL; DEFAULT '' | last session summary |
| `default_capabilities` | `TEXT` | NOT NULL; DEFAULT '[]' | default capabilities |
| `default_role` | `TEXT` | NOT NULL; DEFAULT '' | default role |
| `host_address` | `TEXT` | NOT NULL; DEFAULT '' | host address |
| `letter_to_self` | `TEXT` | NOT NULL; DEFAULT '' | letter to self |
| `letter_history` | `TEXT` | NOT NULL; DEFAULT '[]' | letter history |
| `layer4_token_cap` | `INTEGER` | NOT NULL; DEFAULT 2048 | layer4 token cap |
| `hot_paths` | `TEXT` | NOT NULL; DEFAULT '[]' | hot paths |
| `fleet_behavioral_notes` | `TEXT` | NOT NULL; DEFAULT '[]' | fleet behavioral notes |
| `decision_tree` | `TEXT` | NOT NULL; DEFAULT '[]' | decision tree |
| `call_optimizations` | `TEXT` | NOT NULL; DEFAULT '{}' | call optimizations |
| `created_at` | `TEXT` | NOT NULL; DEFAULT '' | creation timestamp text |
| `updated_at` | `TEXT` | NOT NULL; DEFAULT '' | last update timestamp text |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |
| `updated_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | last update epoch milliseconds |
| `session_token` | `TEXT` | NOT NULL; DEFAULT '' | session token |
| `node_secret_hash` | `TEXT` | NOT NULL; DEFAULT '' | node secret hash |
| `session_token_refreshed_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | session token refreshed at epoch milliseconds |
| `cli_pressure_v1` | `TEXT` | NOT NULL; DEFAULT '{}' | cli pressure v1 |

### `node_knowledge`

- Domain: fleet/nodes/topology
- Purpose: Reference table for node knowledge.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_knowledge_node_ts on (node_id, created_at_epoch_ms)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `node_id` | `TEXT` | NOT NULL | node identifier |
| `topic` | `TEXT` | NOT NULL | topic |
| `content` | `TEXT` | NOT NULL | body/content text |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |
| `status` | `TEXT` | NOT NULL; DEFAULT 'canonical' | state/status value |
| `superseded_by` | `INTEGER` | nullable unless constrained by PK | superseded actor identifier |
| `supersedes` | `INTEGER` | nullable unless constrained by PK | supersedes |
| `promotion_type` | `TEXT` | NOT NULL; DEFAULT '' | promotion type |
| `promoted_at` | `TEXT` | NOT NULL; DEFAULT '' | promoted timestamp text |
| `reviewed_at` | `TEXT` | NOT NULL; DEFAULT '' | reviewed timestamp text |
| `retire_reason` | `TEXT` | NOT NULL; DEFAULT '' | retire reason |
| `promoted_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | promoted at epoch milliseconds |
| `reviewed_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | reviewed at epoch milliseconds |

### `node_roles`

- Domain: fleet/nodes/topology
- Purpose: Reference table for node roles.
- Primary key: PRIMARY KEY (node_id, role_id)
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: tier: tier IN ('primary', 'secondary', 'tertiary', 'aspiration'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `node_id` | `TEXT` | NOT NULL | node identifier |
| `role_id` | `TEXT` | NOT NULL | role identifier |
| `tier` | `TEXT` | NOT NULL; DEFAULT 'primary' | tier |
| `invented_name` | `TEXT` | nullable unless constrained by PK | invented name |
| `invented_description` | `TEXT` | nullable unless constrained by PK | invented description |
| `self_declared_at` | `TEXT` | NOT NULL | self declared timestamp text |
| `ratified_at` | `TEXT` | nullable unless constrained by PK | ratified timestamp text |
| `ratified_by` | `TEXT` | nullable unless constrained by PK | ratified actor identifier |

Table constraints:
- `PRIMARY KEY (node_id, role_id)`

### `node_session_tokens`

- Domain: fleet/nodes/topology
- Purpose: Per-node presented session tokens; normalizes token rotation away from node identity.
- Primary key: PRIMARY KEY (token)
- Unique constraints: token
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `node_id` | `TEXT` | NOT NULL | node identifier |
| `token` | `TEXT` | NOT NULL; UNIQUE | token |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |

Table constraints:
- `PRIMARY KEY (token)`

### `node_sessions`

- Domain: fleet/nodes/topology
- Purpose: Reference table for node sessions.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: node_id -> nodes(node_id)
- Key indexes: idx_node_sessions_node_ts on (node_id, started_at_epoch_ms); idx_node_sessions_token on (session_token)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `node_id` | `TEXT` | NOT NULL | node identifier |
| `session_token` | `TEXT` | NOT NULL | session token |
| `started_at` | `TEXT` | NOT NULL | started timestamp text |
| `started_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | started at epoch milliseconds |
| `ended_at` | `TEXT` | NOT NULL; DEFAULT '' | ended timestamp text |
| `ended_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | ended at epoch milliseconds |
| `end_reason` | `TEXT` | NOT NULL; DEFAULT '' | end reason |
| `summary` | `TEXT` | NOT NULL; DEFAULT '' | summary |
| `tier` | `TEXT` | NOT NULL; DEFAULT 'hot' | tier |
| `pinned` | `INTEGER` | NOT NULL; DEFAULT 0 | pinned |

### `nodes`

- Domain: fleet/nodes/topology
- Purpose: Wide reference node registration row; mixes liveness, lifecycle, bootstrap, gates, and counters in the legacy schema.
- Primary key: node_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `node_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | node identifier |
| `capabilities` | `TEXT` | NOT NULL; DEFAULT '[]' | capabilities |
| `role` | `TEXT` | NOT NULL; DEFAULT 'builder' | role |
| `working_dir` | `TEXT` | nullable unless constrained by PK | working dir |
| `status` | `TEXT` | NOT NULL; DEFAULT 'online' | state/status value |
| `registered_at` | `TEXT` | NOT NULL | registered timestamp text |
| `last_seen` | `TEXT` | NOT NULL | last seen |
| `registered_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | registered at epoch milliseconds |
| `last_seen_epoch_ms` | `INTEGER` | nullable unless constrained by PK | last seen epoch milliseconds |
| `heartbeat_interval` | `INTEGER` | NOT NULL; DEFAULT 90 | heartbeat interval |
| `expected_next` | `TEXT` | NOT NULL; DEFAULT '' | expected next |
| `heartbeat_phase` | `TEXT` | NOT NULL; DEFAULT 'active' | heartbeat phase |
| `consecutive_empty` | `INTEGER` | NOT NULL; DEFAULT 0 | consecutive empty |
| `node_status` | `TEXT` | NOT NULL; DEFAULT '' | node status |
| `interrupt_pending` | `INTEGER` | NOT NULL; DEFAULT 0 | interrupt pending |
| `interrupt_reason` | `TEXT` | NOT NULL; DEFAULT '' | interrupt reason |
| `interrupt_at` | `TEXT` | NOT NULL; DEFAULT '' | interrupt timestamp text |
| `idle_generation` | `INTEGER` | NOT NULL; DEFAULT 0 | idle generation |
| `fleet_attention_mode` | `TEXT` | NOT NULL; DEFAULT 'cold' | fleet attention mode |
| `fleet_attention_pulses_remaining` | `INTEGER` | NOT NULL; DEFAULT 0 | fleet attention pulses remaining |
| `fleet_attention_triggered_by` | `TEXT` | NOT NULL; DEFAULT '' | fleet attention triggered actor identifier |
| `fleet_attention_set_at` | `TEXT` | NOT NULL; DEFAULT '' | fleet attention set timestamp text |
| `last_bootstrap_at` | `TEXT` | NOT NULL; DEFAULT '' | last bootstrap timestamp text |
| `bootstrap_locked` | `INTEGER` | NOT NULL; DEFAULT 0 | bootstrap locked |
| `bootstrap_locked_at` | `TEXT` | NOT NULL; DEFAULT '' | bootstrap locked timestamp text |
| `bootstrap_attempt_count` | `INTEGER` | NOT NULL; DEFAULT 0 | bootstrap attempt count |
| `bootstrap_window_start` | `TEXT` | NOT NULL; DEFAULT '' | bootstrap window start |
| `staleness_alert_level` | `INTEGER` | NOT NULL; DEFAULT 0 | staleness alert level |
| `staleness_alert_at` | `TEXT` | NOT NULL; DEFAULT '' | staleness alert timestamp text |
| `freshness_score` | `INTEGER` | NOT NULL; DEFAULT 100 | freshness score |
| `freshness_status` | `TEXT` | NOT NULL; DEFAULT 'FRESH' | freshness status |
| `lifecycle_state` | `TEXT` | NOT NULL; DEFAULT 'running' | lifecycle state |
| `last_transition_at` | `TEXT` | NOT NULL; DEFAULT '' | last transition timestamp text |
| `last_transition_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | last transition at epoch milliseconds |
| `molt_ponr` | `TEXT` | nullable unless constrained by PK | molt ponr |
| `last_molted` | `TEXT` | NOT NULL; DEFAULT '' | last molted |
| `last_molted_epoch_ms` | `INTEGER` | nullable unless constrained by PK; DEFAULT 0 | last molted epoch milliseconds |
| `idle_since` | `TEXT` | NOT NULL; DEFAULT '' | idle since |
| `idle_since_epoch_ms` | `INTEGER` | nullable unless constrained by PK | idle since epoch milliseconds |
| `confirmed` | `INTEGER` | NOT NULL; DEFAULT 0 | confirmed |
| `expected_next_epoch_ms` | `INTEGER` | nullable unless constrained by PK | expected next epoch milliseconds |
| `interrupt_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | interrupt at epoch milliseconds |
| `fleet_attention_set_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | fleet attention set at epoch milliseconds |
| `last_bootstrap_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | last bootstrap at epoch milliseconds |
| `process_start_time` | `TEXT` | NOT NULL; DEFAULT '' | process start time |
| `process_start_time_epoch_ms` | `INTEGER` | nullable unless constrained by PK | process start time epoch milliseconds |
| `checkpoint_count` | `INTEGER` | NOT NULL; DEFAULT 0 | checkpoint count |
| `active_work_turns` | `INTEGER` | NOT NULL; DEFAULT 0 | active work turns |
| `health_signals_updated_at` | `TEXT` | NOT NULL; DEFAULT '' | health signals updated timestamp text |
| `life_services_confirmed` | `INTEGER` | NOT NULL; DEFAULT 0 | life services confirmed |
| `life_services_confirmed_at` | `TEXT` | NOT NULL; DEFAULT '' | life services confirmed timestamp text |
| `life_services_confirmed_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | life services confirmed at epoch milliseconds |
| `life_services_proof` | `TEXT` | NOT NULL; DEFAULT '' | life services proof |
| `gate_attempt_count` | `INTEGER` | NOT NULL; DEFAULT 0 | gate attempt count |
| `gate_attempt_first_at` | `TEXT` | NOT NULL; DEFAULT '' | gate attempt first timestamp text |
| `gate_attempt_first_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | gate attempt first at epoch milliseconds |
| `life_services_gating_enabled` | `INTEGER` | NOT NULL; DEFAULT 1 | life services gating enabled |

### `role_registry`

- Domain: fleet/nodes/topology
- Purpose: Reference table for role registry.
- Primary key: role_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `role_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | role identifier |
| `title` | `TEXT` | NOT NULL | human title |
| `description` | `TEXT` | NOT NULL; DEFAULT '' | human description |
| `is_formal` | `INTEGER` | NOT NULL; DEFAULT 1 | is formal |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |

### `role_threshold_bands`

- Domain: fleet/nodes/topology
- Purpose: Reference table for role threshold bands.
- Primary key: role
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: role: role IN ('builder','reviewer','analyst','pm','architect'; ce_soft: ce_soft > 0; ce_hard: ce_hard > ce_soft; ce_operator: ce_operator > ce_hard; emission_active: emission_active IN (0,1

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `role` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | role |
| `ce_soft` | `INTEGER` | NOT NULL | ce soft |
| `ce_hard` | `INTEGER` | NOT NULL | ce hard |
| `ce_operator` | `INTEGER` | NOT NULL | ce operator |
| `emission_active` | `INTEGER` | NOT NULL; DEFAULT 1 | emission active |
| `updated_at` | `TEXT` | NOT NULL; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | last update timestamp text |
| `updated_at_epoch_ms` | `INTEGER` | NOT NULL | last update epoch milliseconds |

### `topo_meta`

- Domain: fleet/nodes/topology
- Purpose: Reference table for topo meta.
- Primary key: key
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `key` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | key |
| `value` | `TEXT` | NOT NULL | value |

### `topo_s_history`

- Domain: fleet/nodes/topology
- Purpose: Reference table for topo s history.
- Primary key: version
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `version` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | version |
| `data` | `TEXT` | NOT NULL | data |
| `editor` | `TEXT` | NOT NULL | editor |
| `timestamp` | `TEXT` | NOT NULL | timestamp |
| `timestamp_epoch_ms` | `INTEGER` | nullable unless constrained by PK | timestamp epoch milliseconds |

### `topo_static`

- Domain: fleet/nodes/topology
- Purpose: Reference table for topo static.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: id: id = 1

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `version` | `INTEGER` | NOT NULL; DEFAULT 0 | version |
| `data` | `TEXT` | NOT NULL; DEFAULT '{}' | data |
| `updated_by` | `TEXT` | NOT NULL; DEFAULT 'SYSTEM' | updated actor identifier |
| `updated_at` | `TEXT` | NOT NULL; DEFAULT '' | last update timestamp text |
| `updated_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | last update epoch milliseconds |

### `topology_edges`

- Domain: fleet/nodes/topology
- Purpose: Reference table for topology edges.
- Primary key: edge_id
- Unique constraints: none declared
- Foreign keys/logical references: service_id -> topology_services(service_id)
- Key indexes: idx_topo_edges_node on (node_id); UNIQUE idx_topo_edges_node_service_role on (node_id, service_id, role); idx_topo_edges_service on (service_id)
- Checks/enums: access_method: access_method IN ('local', 'unc', 'http'; role: role IN ('producer', 'consumer', 'both'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `edge_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | edge identifier |
| `node_id` | `TEXT` | NOT NULL | node identifier |
| `service_id` | `TEXT` | NOT NULL | service identifier |
| `access_method` | `TEXT` | NOT NULL; DEFAULT 'local' | access method |
| `local_path` | `TEXT` | NOT NULL; DEFAULT '' | local path |
| `unc_path` | `TEXT` | NOT NULL; DEFAULT '' | unc path |
| `role` | `TEXT` | NOT NULL; DEFAULT 'consumer' | role |
| `created_at` | `TEXT` | NOT NULL; DEFAULT '' | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |

### `topology_hosts`

- Domain: fleet/nodes/topology
- Purpose: Reference table for topology hosts.
- Primary key: host
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `host` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | host |
| `fqdn` | `TEXT` | NOT NULL | fqdn |
| `unc_prefix` | `TEXT` | NOT NULL; DEFAULT '' | unc prefix |
| `local_tools_prefix` | `TEXT` | NOT NULL; DEFAULT '' | local tools prefix |
| `created_at` | `TEXT` | NOT NULL; DEFAULT '' | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |

### `topology_services`

- Domain: fleet/nodes/topology
- Purpose: Reference table for topology services.
- Primary key: service_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_topo_services_host on (host)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `service_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | service identifier |
| `name` | `TEXT` | NOT NULL | name |
| `host` | `TEXT` | NOT NULL | host |
| `port` | `INTEGER` | nullable unless constrained by PK | port |
| `protocol` | `TEXT` | NOT NULL; DEFAULT 'file' | protocol |
| `path` | `TEXT` | NOT NULL; DEFAULT '' | path |
| `description` | `TEXT` | NOT NULL; DEFAULT '' | human description |
| `health_endpoint` | `TEXT` | NOT NULL; DEFAULT '' | health endpoint |
| `version` | `TEXT` | NOT NULL; DEFAULT '' | version |
| `created_at` | `TEXT` | NOT NULL; DEFAULT '' | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |
| `updated_at` | `TEXT` | NOT NULL; DEFAULT '' | last update timestamp text |
| `updated_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | last update epoch milliseconds |
| `relay_node` | `TEXT` | NULL; DEFAULT NULL | relay node |

### `knowledge_votes`

- Domain: identity/memory/handoff
- Purpose: Reference table for knowledge votes.
- Primary key: id
- Unique constraints: UNIQUE(knowledge_id, node_id)
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `knowledge_id` | `INTEGER` | NOT NULL | knowledge identifier |
| `node_id` | `TEXT` | NOT NULL | node identifier |
| `vote` | `TEXT` | NOT NULL | vote |
| `comment` | `TEXT` | NOT NULL; DEFAULT '' | comment |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |

Table constraints:
- `UNIQUE(knowledge_id, node_id)`

### `memory_block_audits`

- Domain: identity/memory/handoff
- Purpose: Audit history for memory block writes, rollbacks, and resets.
- Primary key: audit_id
- Unique constraints: none declared
- Foreign keys/logical references: FOREIGN KEY (node_id, block_type) REFERENCES memory_blocks(node_id, block_type)
- Key indexes: idx_memblock_audits_age on (created_at_epoch_ms); idx_memblock_audits_lookup on (node_id, block_type, revision_id)
- Checks/enums: write_kind: write_kind IN ('write','rollback','reset'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `audit_id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | audit identifier |
| `node_id` | `TEXT` | NOT NULL | node identifier |
| `block_type` | `TEXT` | NOT NULL | block type |
| `revision_id` | `INTEGER` | NOT NULL | revision identifier |
| `prev_content` | `TEXT` | NOT NULL; DEFAULT '' | prev content |
| `new_content` | `TEXT` | NOT NULL | new content |
| `diff_summary` | `TEXT` | nullable unless constrained by PK | diff summary |
| `actor` | `TEXT` | NOT NULL | actor |
| `created_at` | `TEXT` | NOT NULL; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | NOT NULL | creation epoch milliseconds |
| `write_kind` | `TEXT` | NOT NULL | write kind |
| `rollback_target_revision` | `INTEGER` | nullable unless constrained by PK | rollback target revision |

Table constraints:
- `FOREIGN KEY (node_id, block_type) REFERENCES memory_blocks(node_id, block_type)`

### `memory_blocks`

- Domain: identity/memory/handoff
- Purpose: Per-node durable memory blocks.
- Primary key: PRIMARY KEY (node_id, block_type)
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_memblocks_updated on (updated_at_epoch_ms)
- Checks/enums: block_type: block_type IN ('current_context','fleet_model','learned_patterns'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `node_id` | `TEXT` | NOT NULL | node identifier |
| `block_type` | `TEXT` | NOT NULL | block type |
| `content` | `TEXT` | NOT NULL; DEFAULT '' | body/content text |
| `content_length` | `INTEGER` | NOT NULL; DEFAULT 0 | content length |
| `revision_id` | `INTEGER` | NOT NULL; DEFAULT 1 | revision identifier |
| `updated_at` | `TEXT` | NOT NULL; DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now') | last update timestamp text |
| `updated_at_epoch_ms` | `INTEGER` | NOT NULL | last update epoch milliseconds |
| `last_actor` | `TEXT` | NOT NULL | last actor |

Table constraints:
- `PRIMARY KEY (node_id, block_type)`

### `session_entities`

- Domain: identity/memory/handoff
- Purpose: Reference table for session entities.
- Primary key: PRIMARY KEY (entity_name, ref_id, source)
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_session_entities_name_ts on (entity_name, timestamp DESC); idx_session_entities_session on (session_id, timestamp DESC)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `entity_name` | `TEXT` | NOT NULL | entity name |
| `entity_type` | `TEXT` | NOT NULL | entity type |
| `source` | `TEXT` | NOT NULL | source |
| `ref_id` | `TEXT` | NOT NULL | ref identifier |
| `session_id` | `TEXT` | nullable unless constrained by PK | session identifier |
| `node_id` | `TEXT` | nullable unless constrained by PK | node identifier |
| `timestamp` | `INTEGER` | NOT NULL | timestamp |

Table constraints:
- `PRIMARY KEY (entity_name, ref_id, source)`

### `session_handoff`

- Domain: identity/memory/handoff
- Purpose: Serialized end-of-session handoff snapshot for continuation.
- Primary key: handoff_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_session_handoff_author_recent on (author_node, authored_at_epoch_ms DESC)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `handoff_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | handoff identifier |
| `author_node` | `TEXT` | NOT NULL | author node |
| `author_session_id` | `TEXT` | NOT NULL; DEFAULT '' | author session identifier |
| `authored_at` | `TEXT` | NOT NULL | authored timestamp text |
| `authored_at_epoch_ms` | `INTEGER` | NOT NULL | authored at epoch milliseconds |
| `as_of` | `TEXT` | NOT NULL | as of |
| `as_of_epoch_ms` | `INTEGER` | NOT NULL | as of epoch milliseconds |
| `expires_at` | `TEXT` | nullable unless constrained by PK | expires timestamp text |
| `expires_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | expires at epoch milliseconds |
| `expected_continuation_window` | `TEXT` | nullable unless constrained by PK | expected continuation window |
| `head_pointers_json` | `TEXT` | NOT NULL; DEFAULT '[]' | head pointers JSON |
| `in_flight_commitments_json` | `TEXT` | NOT NULL; DEFAULT '{}' | in flight commitments JSON |

### `merit_badges`

- Domain: lessons/merit
- Purpose: Reference table for merit badges.
- Primary key: PRIMARY KEY (node_id, role)
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: level: level >= 1 AND level <= 5

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `node_id` | `TEXT` | NOT NULL | node identifier |
| `role` | `TEXT` | NOT NULL | role |
| `level` | `INTEGER` | NOT NULL; DEFAULT 1 | level |
| `label` | `TEXT` | NOT NULL; DEFAULT 'Novice' | label |
| `awarded_by` | `TEXT` | NOT NULL | awarded actor identifier |
| `awarded_at` | `TEXT` | NOT NULL | awarded timestamp text |
| `evidence_refs` | `TEXT` | NOT NULL; DEFAULT '[]' | evidence refs |

Table constraints:
- `PRIMARY KEY (node_id, role)`

### `merit_nominations`

- Domain: lessons/merit
- Purpose: Reference table for merit nominations.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: proposed_level: proposed_level >= 1 AND proposed_level <= 5; status: status IN ('pending', 'approved', 'rejected'; CHECK (nominee_node_id != nominator_node_id)

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `nominee_node_id` | `TEXT` | NOT NULL | nominee node identifier |
| `nominator_node_id` | `TEXT` | NOT NULL | nominator node identifier |
| `role` | `TEXT` | NOT NULL | role |
| `proposed_level` | `INTEGER` | NOT NULL | proposed level |
| `evidence` | `TEXT` | NOT NULL; DEFAULT '' | evidence |
| `status` | `TEXT` | NOT NULL; DEFAULT 'pending' | state/status value |
| `reviewed_by` | `TEXT` | nullable unless constrained by PK | reviewed actor identifier |
| `review_notes` | `TEXT` | nullable unless constrained by PK | review notes |
| `reviewed_at` | `TEXT` | nullable unless constrained by PK | reviewed timestamp text |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |

Table constraints:
- `CHECK (nominee_node_id != nominator_node_id)`

### `molt_locks_by_host`

- Domain: lifecycle/molt
- Purpose: Reference table for molt locks by host.
- Primary key: host_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `host_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | host identifier |
| `molt_lock_node_id` | `TEXT` | NOT NULL; DEFAULT '' | molt lock node identifier |
| `molt_lock_at` | `TEXT` | NOT NULL; DEFAULT '' | molt lock timestamp text |
| `molt_lock_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK; DEFAULT 0 | molt lock at epoch milliseconds |
| `molt_lock_reason` | `TEXT` | NOT NULL; DEFAULT '' | molt lock reason |

### `molt_requests`

- Domain: lifecycle/molt
- Purpose: Reference table for molt requests.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_molt_requests_target on (target_node_id, status)
- Checks/enums: lease_retention_policy: lease_retention_policy IS NULL OR lease_retention_policy IN ('release_on_terminal','retain_owner_alive','retain_for_reclaim'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `target_node_id` | `TEXT` | NOT NULL | target node identifier |
| `requester_node_id` | `TEXT` | NOT NULL | requester node identifier |
| `reason` | `TEXT` | NOT NULL; DEFAULT '' | reason |
| `status` | `TEXT` | NOT NULL; DEFAULT 'pending_approval' | state/status value |
| `guestbook_id` | `INTEGER` | nullable unless constrained by PK | guestbook identifier |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |
| `approved_at` | `TEXT` | nullable unless constrained by PK | approved timestamp text |
| `approved_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | approved at epoch milliseconds |
| `executed_at` | `TEXT` | nullable unless constrained by PK | executed timestamp text |
| `executed_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | executed at epoch milliseconds |
| `completed_at` | `TEXT` | nullable unless constrained by PK | completed timestamp text |
| `completed_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | completed at epoch milliseconds |
| `old_pid` | `INTEGER` | nullable unless constrained by PK | old pid |
| `new_pid` | `INTEGER` | nullable unless constrained by PK | new pid |
| `error` | `TEXT` | nullable unless constrained by PK | error |
| `execution_host` | `TEXT` | nullable unless constrained by PK | execution host |
| `molt_token` | `TEXT` | nullable unless constrained by PK | molt token |
| `token_expires_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | token expires at epoch milliseconds |
| `expires_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | expires at epoch milliseconds |
| `executor_lease_id` | `TEXT` | nullable unless constrained by PK | executor lease identifier |
| `executor_lease_acquired_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | executor lease acquired at epoch milliseconds |
| `executor_lease_expires_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | executor lease expires at epoch milliseconds |
| `lease_retention_policy` | `TEXT` | NULL | lease retention policy |

### `reboot_requests`

- Domain: lifecycle/molt
- Purpose: Reference table for reboot requests.
- Primary key: reboot_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `reboot_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | reboot identifier |
| `initiated_by` | `TEXT` | NOT NULL | initiated actor identifier |
| `reason` | `TEXT` | NOT NULL; DEFAULT '' | reason |
| `status` | `TEXT` | NOT NULL; DEFAULT 'pending' | state/status value |
| `target_nodes` | `TEXT` | NOT NULL; DEFAULT '[]' | target nodes |
| `acked_nodes` | `TEXT` | NOT NULL; DEFAULT '[]' | acked nodes |
| `ack_deadline` | `TEXT` | nullable unless constrained by PK | ack deadline |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `completed_at` | `TEXT` | nullable unless constrained by PK | completed timestamp text |
| `min_ack_threshold` | `INTEGER` | NOT NULL; DEFAULT 0 | min ack threshold |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |
| `completed_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | completed at epoch milliseconds |
| `ack_deadline_epoch_ms` | `INTEGER` | nullable unless constrained by PK | ack deadline epoch milliseconds |

### `relaunch_intent`

- Domain: lifecycle/molt
- Purpose: Reference table for relaunch intent.
- Primary key: node_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `node_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | node identifier |
| `owner` | `TEXT` | nullable unless constrained by PK | owner |
| `state` | `TEXT` | NOT NULL; DEFAULT 'pending' | state |
| `claimed_at` | `INTEGER` | nullable unless constrained by PK | claimed timestamp text |
| `incident_id` | `TEXT` | nullable unless constrained by PK | incident identifier |
| `updated_at` | `INTEGER` | NOT NULL | last update timestamp text |

### `messages`

- Domain: messaging
- Purpose: Fleet inbox and direct/broadcast message delivery contract.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_messages_from_node_created on (from_node, created_at DESC); idx_messages_from_node_ts on (from_node, created_at_epoch_ms); UNIQUE idx_messages_idempotency_key on (from_node, to_node, idempotency_key) WHERE idempotency_key IS NOT NULL; idx_messages_to_node_created on (to_node, created_at DESC); idx_messages_to_node_ts on (to_node, created_at_epoch_ms); idx_messages_unread on (to_node, created_at_epoch_ms) WHERE status='unread'
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `from_node` | `TEXT` | NOT NULL | from node |
| `to_node` | `TEXT` | NOT NULL | to node |
| `msg_type` | `TEXT` | NOT NULL; DEFAULT 'info' | msg type |
| `subject` | `TEXT` | NOT NULL; DEFAULT '' | subject |
| `content` | `TEXT` | NOT NULL; DEFAULT '' | body/content text |
| `ref_task_id` | `TEXT` | nullable unless constrained by PK | ref task identifier |
| `status` | `TEXT` | NOT NULL; DEFAULT 'unread' | state/status value |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `read_at` | `TEXT` | nullable unless constrained by PK | read timestamp text |
| `is_broadcast` | `INTEGER` | NOT NULL; DEFAULT 0 | is broadcast |
| `priority` | `INTEGER` | NOT NULL; DEFAULT 3 | priority |
| `requires_ack` | `INTEGER` | NOT NULL; DEFAULT 0 | requires ack |
| `attention` | `INTEGER` | NOT NULL; DEFAULT 0 | attention |
| `expires_at` | `TEXT` | nullable unless constrained by PK | expires timestamp text |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |
| `read_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | read at epoch milliseconds |
| `expires_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | expires at epoch milliseconds |
| `delivered_at` | `TEXT` | nullable unless constrained by PK | delivered timestamp text |
| `delivered_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | delivered at epoch milliseconds |
| `archived_at` | `TEXT` | nullable unless constrained by PK | archived timestamp text |
| `archived_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | archived at epoch milliseconds |
| `idempotency_key` | `TEXT` | nullable unless constrained by PK | idempotency key |
| `payload_fingerprint` | `TEXT` | nullable unless constrained by PK | payload fingerprint |

### `consensus_config`

- Domain: other/support
- Purpose: Reference table for consensus config.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: UNIQUE idx_consensus_active on (config_key) WHERE is_active = 1
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `config_key` | `TEXT` | NOT NULL | config key |
| `config_value` | `TEXT` | NOT NULL | config value |
| `version` | `INTEGER` | NOT NULL; DEFAULT 1 | version |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | NOT NULL | creation epoch milliseconds |
| `created_by` | `TEXT` | NOT NULL | created actor identifier |
| `is_active` | `INTEGER` | NOT NULL; DEFAULT 1 | is active |
| `previous_version_id` | `INTEGER` | nullable unless constrained by PK | previous version identifier |
| `rollback_reason` | `TEXT` | nullable unless constrained by PK; DEFAULT '' | rollback reason |

### `scripts`

- Domain: other/support
- Purpose: Reference table for scripts.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_scripts_node on (node_id)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `node_id` | `TEXT` | NOT NULL | node identifier |
| `title` | `TEXT` | NOT NULL | human title |
| `description` | `TEXT` | NOT NULL; DEFAULT '' | human description |
| `filename` | `TEXT` | NOT NULL | filename |
| `content` | `TEXT` | NOT NULL | body/content text |
| `language` | `TEXT` | NOT NULL; DEFAULT '' | language |
| `target_host` | `TEXT` | NOT NULL; DEFAULT '' | target host |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `updated_at` | `TEXT` | NOT NULL | last update timestamp text |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |
| `updated_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | last update epoch milliseconds |

### `strike_counter`

- Domain: other/support
- Purpose: Reference table for strike counter.
- Primary key: id
- Unique constraints: UNIQUE(node_id, tool_name, response_class, caller_role, args_sig, window_start_epoch_ms)
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_strike_node_recent on (node_id, last_call_at_epoch_ms DESC); idx_strike_tool_class on (tool_name, response_class, last_call_at_epoch_ms DESC); idx_strike_window on (window_start_epoch_ms)
- Checks/enums: call_count: call_count >= 1; last_tier_emitted: last_tier_emitted IS NULL OR last_tier_emitted IN ('T1','T3','T5'

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `node_id` | `TEXT` | NOT NULL | node identifier |
| `tool_name` | `TEXT` | NOT NULL | tool name |
| `response_class` | `TEXT` | NOT NULL | response class |
| `caller_role` | `TEXT` | NOT NULL | caller role |
| `args_sig` | `TEXT` | NOT NULL; DEFAULT '' | args sig |
| `call_count` | `INTEGER` | NOT NULL; DEFAULT 1 | call count |
| `first_call_at_epoch_ms` | `INTEGER` | NOT NULL | first call at epoch milliseconds |
| `last_call_at_epoch_ms` | `INTEGER` | NOT NULL | last call at epoch milliseconds |
| `window_start_epoch_ms` | `INTEGER` | NOT NULL | window start epoch milliseconds |
| `last_tier_emitted` | `TEXT` | NULL | last tier emitted |
| `last_tier_emitted_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | last tier emitted at epoch milliseconds |

Table constraints:
- `UNIQUE(node_id, tool_name, response_class, caller_role, args_sig, window_start_epoch_ms)`

### `peer_challenges`

- Domain: review
- Purpose: Reference table for peer challenges.
- Primary key: challenge_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_peer_challenges_pair on (challenger_id, target_id, created_at)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `challenge_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | challenge identifier |
| `challenger_id` | `TEXT` | NOT NULL | challenger identifier |
| `target_id` | `TEXT` | NOT NULL | target identifier |
| `nonce` | `TEXT` | NOT NULL | nonce |
| `status` | `TEXT` | NOT NULL; DEFAULT 'pending' | state/status value |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | NOT NULL | creation epoch milliseconds |
| `expires_at` | `TEXT` | NOT NULL | expires timestamp text |
| `response_hmac` | `TEXT` | nullable unless constrained by PK | response hmac |
| `response_ts` | `TEXT` | nullable unless constrained by PK | response ts |
| `responded_at` | `TEXT` | nullable unless constrained by PK | responded timestamp text |
| `responded_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | responded at epoch milliseconds |

### `artifacts`

- Domain: tasks/board
- Purpose: Artifacts attached to tasks.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: task_id -> tasks(task_id)
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `task_id` | `TEXT` | NOT NULL | task identifier |
| `artifact_type` | `TEXT` | NOT NULL | artifact type |
| `content` | `TEXT` | NOT NULL | body/content text |
| `summary` | `TEXT` | nullable unless constrained by PK | summary |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |

### `expected_merge`

- Domain: tasks/board
- Purpose: Reference table for expected merge.
- Primary key: task_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_expected_merge_assignee on (assignee, resolved)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `task_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | task identifier |
| `output_branch` | `TEXT` | NOT NULL; DEFAULT '' | output branch |
| `approved_at_epoch_ms` | `INTEGER` | NOT NULL | approved at epoch milliseconds |
| `approved_sha` | `TEXT` | NOT NULL; DEFAULT '' | approved sha |
| `resolved` | `INTEGER` | NOT NULL; DEFAULT 0 | resolved |
| `resolved_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | resolved at epoch milliseconds |
| `resolution` | `TEXT` | NOT NULL; DEFAULT '' | resolution |
| `assignee` | `TEXT` | NOT NULL; DEFAULT '' | assignee |

### `merge_pending_ack`

- Domain: tasks/board
- Purpose: Reference table for merge pending ack.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_merge_pending_ack_task_id on (task_id)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `task_id` | `TEXT` | NOT NULL | task identifier |
| `actor_node` | `TEXT` | NOT NULL | actor node |
| `reason` | `TEXT` | NOT NULL; DEFAULT '' | reason |
| `ack_at_epoch_ms` | `INTEGER` | NOT NULL | ack at epoch milliseconds |

### `task_deps`

- Domain: tasks/board
- Purpose: Task dependency edges.
- Primary key: PRIMARY KEY (task_id, depends_on)
- Unique constraints: none declared
- Foreign keys/logical references: task_id -> tasks(task_id); depends_on -> tasks(task_id)
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `task_id` | `TEXT` | NOT NULL | task identifier |
| `depends_on` | `TEXT` | NOT NULL | depends on |

Table constraints:
- `PRIMARY KEY (task_id, depends_on)`

### `task_evidence`

- Domain: tasks/board
- Purpose: Proof ledger for task or review legs.
- Primary key: id
- Unique constraints: UNIQUE(item_id, leg, node)
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_task_evidence_item on (item_id, leg)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `item_id` | `TEXT` | NOT NULL | item identifier |
| `item_type` | `TEXT` | NOT NULL; DEFAULT 'task' | item type |
| `leg` | `TEXT` | NOT NULL | leg |
| `node` | `TEXT` | NOT NULL; DEFAULT '' | node |
| `result` | `TEXT` | NOT NULL; DEFAULT 'UNKNOWN' | result |
| `ref` | `TEXT` | NOT NULL; DEFAULT '' | ref |
| `method` | `TEXT` | NOT NULL; DEFAULT '' | method |
| `repo_id` | `TEXT` | NOT NULL; DEFAULT '' | repo identifier |
| `verifier` | `TEXT` | NOT NULL; DEFAULT '' | verifier |
| `verified_at` | `TEXT` | NOT NULL; DEFAULT '' | verified timestamp text |
| `verified_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | verified at epoch milliseconds |

Table constraints:
- `UNIQUE(item_id, leg, node)`

### `tasks`

- Domain: tasks/board
- Purpose: Unit-of-work board item with ownership, status, priority, review, merge, and shipping metadata.
- Primary key: task_id
- Unique constraints: none declared
- Foreign keys/logical references: assigned_to -> nodes(node_id)
- Key indexes: idx_tasks_assigned_ts on (assigned_to, updated_at_epoch_ms); idx_tasks_head_sha on (head_sha); idx_tasks_linked_swat on (linked_swat_id); idx_tasks_ref_rfc on (ref_rfc_id)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `task_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | task identifier |
| `assigned_to` | `TEXT` | NOT NULL; DEFAULT '' | assigned to |
| `title` | `TEXT` | NOT NULL | human title |
| `description` | `TEXT` | NOT NULL; DEFAULT '' | human description |
| `status` | `TEXT` | NOT NULL; DEFAULT 'ready' | state/status value |
| `priority` | `INTEGER` | NOT NULL; DEFAULT 3 | priority |
| `output_branch` | `TEXT` | nullable unless constrained by PK | output branch |
| `notes` | `TEXT` | nullable unless constrained by PK | notes |
| `project` | `TEXT` | NOT NULL; DEFAULT '' | project |
| `review_acks` | `TEXT` | NOT NULL; DEFAULT '[]' | review acks |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `updated_at` | `TEXT` | NOT NULL | last update timestamp text |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |
| `updated_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | last update epoch milliseconds |
| `cluster_id` | `TEXT` | nullable unless constrained by PK | cluster identifier |
| `nudge_24h_emitted_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | nudge 24h emitted at epoch milliseconds |
| `escalate_48h_emitted_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | escalate 48h emitted at epoch milliseconds |
| `reassign_72h_executed_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | reassign 72h executed at epoch milliseconds |
| `reassign_72h_alive_skip_emitted_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | reassign 72h alive skip emitted at epoch milliseconds |
| `merge_evidence_json` | `TEXT` | NOT NULL; DEFAULT '{}' | merge evidence JSON |
| `expected_merge_window` | `TEXT` | NOT NULL; DEFAULT 'standard' | expected merge window |
| `topology_context` | `TEXT` | NOT NULL; DEFAULT '{}' | topology context |
| `ref_rfc_id` | `TEXT` | nullable unless constrained by PK | ref rfc identifier |
| `head_sha` | `TEXT` | nullable unless constrained by PK | head sha |
| `pr_base_sha` | `TEXT` | nullable unless constrained by PK | pr base sha |
| `strict_review` | `INTEGER` | NOT NULL; DEFAULT 0 | strict review |
| `repo_path` | `TEXT` | nullable unless constrained by PK | repo path |
| `linked_swat_id` | `TEXT` | nullable unless constrained by PK | linked swat identifier |
| `repo_id` | `TEXT` | nullable unless constrained by PK | repo identifier |
| `artifact_class` | `TEXT` | nullable unless constrained by PK | artifact class |
| `verified_done` | `INTEGER` | nullable unless constrained by PK | verified done |
| `verified_compute_at` | `TEXT` | nullable unless constrained by PK | verified compute timestamp text |
| `deploy_required` | `INTEGER` | nullable unless constrained by PK | deploy required |
| `build_citation` | `TEXT` | nullable unless constrained by PK | build citation |
| `ship_citation` | `TEXT` | nullable unless constrained by PK | ship citation |
| `acceptance_citation` | `TEXT` | nullable unless constrained by PK | acceptance citation |

### `tasks_archive`

- Domain: tasks/board
- Purpose: Reference table for tasks archive.
- Primary key: task_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `task_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | task identifier |
| `assigned_to` | `TEXT` | NOT NULL; DEFAULT '' | assigned to |
| `title` | `TEXT` | NOT NULL | human title |
| `description` | `TEXT` | NOT NULL; DEFAULT '' | human description |
| `status` | `TEXT` | NOT NULL; DEFAULT 'done' | state/status value |
| `priority` | `INTEGER` | NOT NULL; DEFAULT 3 | priority |
| `output_branch` | `TEXT` | nullable unless constrained by PK | output branch |
| `notes` | `TEXT` | nullable unless constrained by PK | notes |
| `project` | `TEXT` | NOT NULL; DEFAULT '' | project |
| `review_acks` | `TEXT` | NOT NULL; DEFAULT '[]' | review acks |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `updated_at` | `TEXT` | NOT NULL | last update timestamp text |
| `archived_at` | `TEXT` | NOT NULL | archived timestamp text |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |
| `updated_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | last update epoch milliseconds |
| `cluster_id` | `TEXT` | nullable unless constrained by PK | cluster identifier |
| `topology_context` | `TEXT` | NOT NULL; DEFAULT '{}' | topology context |
| `ref_rfc_id` | `TEXT` | nullable unless constrained by PK | ref rfc identifier |
| `head_sha` | `TEXT` | nullable unless constrained by PK | head sha |
| `pr_base_sha` | `TEXT` | nullable unless constrained by PK | pr base sha |
| `strict_review` | `INTEGER` | NOT NULL; DEFAULT 0 | strict review |
| `repo_path` | `TEXT` | nullable unless constrained by PK | repo path |
| `linked_swat_id` | `TEXT` | nullable unless constrained by PK | linked swat identifier |
| `repo_id` | `TEXT` | nullable unless constrained by PK | repo identifier |
| `artifact_class` | `TEXT` | nullable unless constrained by PK | artifact class |
| `verified_done` | `INTEGER` | nullable unless constrained by PK | verified done |
| `verified_compute_at` | `TEXT` | nullable unless constrained by PK | verified compute timestamp text |
| `deploy_required` | `INTEGER` | nullable unless constrained by PK | deploy required |
| `build_citation` | `TEXT` | nullable unless constrained by PK | build citation |
| `ship_citation` | `TEXT` | nullable unless constrained by PK | ship citation |
| `acceptance_citation` | `TEXT` | nullable unless constrained by PK | acceptance citation |


### `coord_outbox`

- Domain: messaging
- Purpose: Durable cross-surface notification outbox for asynchronous delivery.
- Primary key: outbox_id
- Unique constraints: none declared
- Foreign keys/logical references: logical references by *_id columns only
- Key indexes: idx_coord_outbox_delivered_recent on (delivered_at_epoch_ms) WHERE delivered_at_epoch_ms IS NOT NULL; idx_coord_outbox_pending on (surface, outbox_id) WHERE delivered_at IS NULL
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `outbox_id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `surface` | `TEXT` | NOT NULL | delivery surface |
| `kind` | `TEXT` | NOT NULL | outbox event kind |
| `payload_json` | `TEXT` | NOT NULL | JSON payload |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |
| `delivered_at` | `TEXT` | nullable unless constrained by PK | delivered timestamp text |
| `delivered_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | delivered at epoch milliseconds |
| `attempts` | `INTEGER` | NOT NULL; DEFAULT 0 | delivery attempt count |
| `last_error` | `TEXT` | nullable unless constrained by PK | last delivery error |

### `wake_queue`

- Domain: Spyglass/search
- Purpose: Pending wake notifications for nodes that should be nudged after message or routing events.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: node_id -> nodes(node_id); source_node -> nodes(node_id)
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `node_id` | `TEXT` | NOT NULL | target node identifier |
| `reason` | `TEXT` | NOT NULL | wake reason |
| `source_node` | `TEXT` | nullable unless constrained by PK | source node identifier |
| `ref_id` | `TEXT` | nullable unless constrained by PK | referenced work or message identifier |
| `created_at` | `TEXT` | NOT NULL | creation timestamp text |
| `delivered` | `INTEGER` | NOT NULL; DEFAULT 0 | delivered flag |
| `created_at_epoch_ms` | `INTEGER` | nullable unless constrained by PK | creation epoch milliseconds |

### `wake_state`

- Domain: Spyglass/search
- Purpose: Last-wake ledger per node, used to suppress duplicate wake signals.
- Primary key: node_id
- Unique constraints: none declared
- Foreign keys/logical references: node_id -> nodes(node_id)
- Key indexes: none captured
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `node_id` | `TEXT` | nullable unless constrained by PK; PRIMARY KEY | node identifier |
| `last_wake_ts` | `TEXT` | NOT NULL | last wake timestamp text |
| `last_wake_ts_epoch_ms` | `INTEGER` | nullable unless constrained by PK | last wake epoch milliseconds |

### `auto_renew_attempts`

- Domain: lifecycle/molt
- Purpose: Attempt ledger for automatic stale-layer or stale-node renewal decisions.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: target_node_id -> nodes(node_id)
- Key indexes: idx_auto_renew_target_ts on (target_node_id, timestamp_epoch_ms)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `target_node_id` | `TEXT` | NOT NULL | target node identifier |
| `reason` | `TEXT` | NOT NULL | renewal reason |
| `stale_layers` | `TEXT` | NOT NULL; DEFAULT '[]' | stale layer list JSON |
| `outcome` | `TEXT` | NOT NULL | attempt outcome |
| `timestamp` | `TEXT` | NOT NULL | timestamp text |
| `timestamp_epoch_ms` | `INTEGER` | nullable unless constrained by PK | timestamp epoch milliseconds |

### `restart_attempts`

- Domain: lifecycle/molt
- Purpose: Attempt ledger for node restart requests and safety-gate outcomes.
- Primary key: id
- Unique constraints: none declared
- Foreign keys/logical references: target_node_id -> nodes(node_id); requested_by -> nodes(node_id)
- Key indexes: idx_restart_attempts_target_ts on (target_node_id, timestamp_epoch_ms)
- Checks/enums: none declared

| Column | Type | Null/default | Meaning |
|---|---|---|---|
| `id` | `INTEGER` | nullable unless constrained by PK; PRIMARY KEY | surrogate numeric identifier |
| `target_node_id` | `TEXT` | NOT NULL | target node identifier |
| `requested_by` | `TEXT` | NOT NULL | requester node identifier |
| `reason` | `TEXT` | NOT NULL | restart reason |
| `kb_reference` | `TEXT` | nullable unless constrained by PK | knowledge-base reference |
| `kb_id` | `TEXT` | nullable unless constrained by PK | knowledge-base identifier |
| `outcome` | `TEXT` | NOT NULL | attempt outcome |
| `gate_failed` | `TEXT` | nullable unless constrained by PK | failed safety gate |
| `timestamp` | `TEXT` | NOT NULL | timestamp text |
| `timestamp_epoch_ms` | `INTEGER` | nullable unless constrained by PK | timestamp epoch milliseconds |

## 4. Reference catalog: compact, derived, audit, telemetry, and deprecated tables

| Table | Domain | Status | Purpose and key shape | Key indexes |
|---|---|---|---|---|
| `cairn_diary_fts` | Cairn | derived virtual/shadow | SQLite FTS virtual table for Cairn diary search. Columns are generated by the FTS module. PK: module-defined. Checks: none declared | none captured |
| `session_search_fts` | identity/memory/handoff | derived virtual/shadow | SQLite FTS virtual table for session-search over events and handoffs. Columns are generated by the FTS module. PK: module-defined. Checks: none declared | none captured |
| `cairn_fts` | Cairn | derived virtual/shadow | SQLite FTS virtual table for RFC search. Columns are generated by the FTS module. PK: module-defined. Checks: none declared | none captured |
| `cairn_kb_fts` | Cairn | derived virtual/shadow | SQLite FTS virtual table for knowledge-base search. Columns are generated by the FTS module. PK: module-defined. Checks: none declared | none captured |
| `cairn_scratch_fts` | Cairn | derived virtual/shadow | SQLite FTS virtual table for scratch-note search. Columns are generated by the FTS module. PK: module-defined. Checks: none declared | none captured |
| `archive_pin` | Cairn | support/legacy | archive pin support table. Columns: `doc_id`, `doc_type`, `pin_type`, `actor_id`, `reason`, `set_at`, `set_at_epoch_ms`. PK: PRIMARY KEY (doc_id, doc_type). Checks: doc_type: doc_type IN ('rfc','kb','scratch' | none captured |
| `cairn_active_projects_trigger_fires` | Cairn | support/legacy | cairn active projects trigger fires support table. Columns: `scratch_id`, `project_id`, `trigger_token`, `audit_id`, `fired_at`. PK: PRIMARY KEY(scratch_id, project_id, trigger_token). Checks: none declared | idx_trigger_fires_scratch on (scratch_id) |
| `cairn_council_annotation_access_audit` | Cairn | audit/log/telemetry | cairn council annotation access audit support table. Columns: `audit_id`, `annotation_id`, `response_id`, `requesting_node`, `responder_node_hash`, `redacted_for_inv1`, `accessed_at_epoch_ms`. PK: audit_id. Checks: redacted_for_inv1: redacted_for_inv1 IN (0,1 | idx_council_access_audit_hash_time on (responder_node_hash, accessed_at_epoch_ms) |
| `cairn_council_annotations_archive` | Cairn | support/legacy | cairn council annotations archive support table. Columns: `archive_id`, `annotation_id`, `response_id`, `rfc_id`, `wave_round`, `responder_node`, `lens`, `severity`, `finding`, `citations_json`, `model`, `sla_status` .... PK: archive_id. Checks: archive_reason: archive_reason IN ('retry','concurrent_emit','manual_override','sla_recovery' | idx_council_archive_responder on (responder_node, archived_at_epoch_ms); idx_council_archive_response on (response_id) |
| `cairn_diary` | Cairn | support/legacy | cairn diary support table. Columns: `id`, `node_id`, `ce`, `entry_type`, `body`, `ref_artifact`, `source_tool`, `auto_emitted`, `written_at`, `written_at_epoch_ms`. PK: id. Checks: none declared | idx_cairn_diary_auto_emitted on (auto_emitted) WHERE auto_emitted = 1; idx_cairn_diary_node_ts on (node_id, written_at_epoch_ms DESC); idx_cairn_diary_node_type_ts on (node_id, entry_type, written_at_epoch_ms DESC) |
| `cairn_diary_fts_config` | Cairn | derived virtual/shadow | cairn diary fts config support table. Columns: `k`. PK: k. Checks: none declared | none captured |
| `cairn_diary_fts_content` | Cairn | derived virtual/shadow | cairn diary fts content support table. Columns: `id`. PK: id. Checks: none declared | none captured |
| `cairn_diary_fts_data` | Cairn | derived virtual/shadow | cairn diary fts data support table. Columns: `id`, `block`. PK: id. Checks: none declared | none captured |
| `cairn_diary_fts_docsize` | Cairn | derived virtual/shadow | cairn diary fts docsize support table. Columns: `id`, `sz`. PK: id. Checks: none declared | none captured |
| `cairn_diary_fts_idx` | Cairn | derived virtual/shadow | cairn diary fts idx support table. Columns: . PK: PRIMARY KEY(segid, term). Checks: none declared | none captured |
| `cairn_id_recycle_audit` | Cairn | audit/log/telemetry | cairn id recycle audit support table. Columns: `audit_id`, `rfc_id`, `recycled_at`, `recycled_by`, `prior_title`, `prior_status`, `prior_author`, `prior_domain`, `reason`, `alias_in`. PK: audit_id. Checks: none declared | idx_recycle_audit_at on (recycled_at); idx_recycle_audit_rfc on (rfc_id) |
| `cairn_outbox` | Cairn | support/legacy | cairn outbox support table. Columns: `outbox_id`, `surface`, `kind`, `payload_json`, `created_at`, `created_at_epoch_ms`, `delivered_at`, `delivered_at_epoch_ms`, `attempts`, `last_error`. PK: outbox_id. Checks: none declared | idx_cairn_outbox_delivered_recent on (delivered_at_epoch_ms) WHERE delivered_at_epoch_ms IS NOT NULL; idx_cairn_outbox_pending on (surface, outbox_id) WHERE delivered_at IS NULL |
| `cairn_scratch_audit` | Cairn | audit/log/telemetry | cairn scratch audit support table. Columns: `audit_id`, `event_type`, `scratch_id`, `dedup_key`, `payload_json`, `emitted_at`. PK: audit_id. Checks: none declared | idx_scratch_audit_event on (event_type, emitted_at); idx_scratch_audit_scratch on (scratch_id) |
| `cairn_swat_audit` | Cairn | audit/log/telemetry | cairn swat audit support table. Columns: `audit_id`, `swat_id`, `event_type`, `from_value`, `to_value`, `actor_node`, `occurred_at`, `occurred_at_epoch_ms`, `notes`. PK: audit_id. Checks: none declared | idx_cairn_swat_audit_swat on (swat_id) |
| `cairn_wave_audit` | Cairn | audit/log/telemetry | cairn wave audit support table. Columns: `audit_id`, `wave_id`, `item_id`, `delta_type`, `delta_payload_json`, `actor`, `occurred_at`, `occurred_at_epoch_ms`. PK: audit_id. Checks: none declared | idx_wave_audit_delta_type on (delta_type); idx_wave_audit_item on (item_id); idx_wave_audit_wave on (wave_id) |
| `cairn_wave_directives_sent` | Cairn | support/legacy | cairn wave directives sent support table. Columns: `rfc_id`, `round_number`, `recipient`, `event_type`, `sent_at`. PK: PRIMARY KEY (rfc_id, round_number, recipient, event_type). Checks: none declared | none captured |
| `domain_migration_audit` | Cairn | audit/log/telemetry | domain migration audit support table. Columns: `rfc_id`, `old_domain`, `new_domain`, `migrated_at`, `direction`. PK: PRIMARY KEY (rfc_id, migrated_at). Checks: none declared | none captured |
| `git_sync_outbox` | Cairn | support/legacy | git sync outbox support table. Columns: `id`, `rfc_id`, `event`, `status`, `attempt_count`, `last_error`, `commit_sha`, `created_at`, `completed_at`. PK: id. Checks: status: status IN ('pending','in_progress','done','failed' | idx_git_sync_pending on (status) WHERE status IN ('pending', 'failed') |
| `lifecycle_audit` | Cairn | audit/log/telemetry | lifecycle audit support table. Columns: `audit_id`, `rfc_id`, `from_state`, `to_state`, `actor_id`, `reason`, `execution_authority`, `audited_at`. PK: audit_id. Checks: none declared | idx_audit_rfc on (rfc_id) |
| `lifecycle_transitions` | Cairn | support/legacy | lifecycle transitions support table. Columns: `from_state`, `to_state`, `requires_role`. PK: PRIMARY KEY(from_state, to_state). Checks: none declared | none captured |
| `rfc353_council_autofire_attempts` | Cairn | support/legacy | rfc353 council autofire attempts support table. Columns: `attempt_id`, `scope_type`, `scope_id`, `signal`, `rfc_id`, `reversal_count`, `would_fire`, `fired`, `suppression_reason`, `attempted_at`, `attempted_at_epoch_ms`. PK: attempt_id. Checks: would_fire: would_fire IN (0, 1; fired: fired IN (0, 1 | idx_rfc353_attempts_rfc_time on (rfc_id, attempted_at_epoch_ms DESC); idx_rfc353_attempts_time on (attempted_at_epoch_ms DESC) |
| `rfc353_council_autofire_fires` | Cairn | support/legacy | rfc353 council autofire fires support table. Columns: `fire_id`, `scope_type`, `scope_id`, `signal`, `rfc_id`, `swat_id`, `reversal_count`, `evidence_json`, `fired_at`. PK: fire_id. Checks: scope_type: scope_type IN ('wave', 'swat'; signal: signal IN ('pingpong' | idx_rfc353_autofire_rfc on (rfc_id); idx_rfc353_autofire_swat on (swat_id) |
| `rfc353_verdict_history` | Cairn | support/legacy | rfc353 verdict history support table. Columns: `entry_id`, `swat_id`, `reviewer`, `verdict`, `recorded_at`. PK: entry_id. Checks: verdict: verdict IN ('approve', 'request_changes', 'reject' | idx_rfc353_verdict_history_swat_reviewer on (swat_id, reviewer, entry_id) |
| `detector_registry` | Spyglass/search | support/legacy | detector registry support table. Columns: `detector_id`, `beat_event_type`, `expected_cadence`, `cadence_interval_s`, `silence_threshold_cycles`, `criticality`, `enabled`. PK: detector_id. Checks: none declared | none captured |
| `drops` | Spyglass/search | support/legacy | drops support table. Columns: `drop_id`, `filename`, `content`, `content_type`, `uploaded_by`, `size_bytes`, `ttl_minutes`, `created_at`, `expires_at`, `last_accessed_at`. PK: drop_id. Checks: none declared | idx_drops_expires on (expires_at) |
| `opa_usage_log` | authorization/OPA | audit/log/telemetry | opa usage log support table. Columns: `id`, `opa_id`, `node_id`, `action`, `timestamp`, `timestamp_epoch_ms`, `result`, `rejection_reason`, `target_node_id`. PK: id. Checks: none declared | idx_opa_usage_opa_id on (opa_id) |
| `boomerang_micro_cooldowns` | boomerangs | support/legacy | boomerang micro cooldowns support table. Columns: `originator`, `assignee`, `cooldown_until_utc`, `cooldown_until_epoch_ms`. PK: PRIMARY KEY (originator, assignee). Checks: none declared | none captured |
| `audit_idle_handler_fire` | events/audit | audit/log/telemetry | audit idle handler fire support table. Columns: `event_id`, `event_type`, `handler_class`, `handler_id`, `owner_node`, `idle_generation`, `fire_ts`, `fire_ts_epoch_ms`, `dry_run`, `candidates_emitted_count`, `audit_payload_json`. PK: event_id. Checks: event_type: event_type = 'audit_idle_handler_fire'; handler_class: handler_class IN ('consolidation','scanner','maintenance' | idx_idle_handler_fire_class on (handler_class, fire_ts_epoch_ms DESC); idx_idle_handler_fire_key on (handler_id, owner_node, idle_generation) |
| `audit_lifecycle_event` | events/audit | audit/log/telemetry | audit lifecycle event support table. Columns: `id`, `doc_id`, `doc_type`, `event_type`, `actor_id`, `reason`, `payload_json`, `created_at`, `created_at_epoch_ms`. PK: id. Checks: doc_type: doc_type IN ('rfc','kb','scratch' | idx_audit_lifecycle_doc on (doc_id, doc_type, created_at_epoch_ms DESC) |
| `audit_log` | events/audit | audit/log/telemetry | audit log support table. Columns: `id`, `timestamp`, `event_type`, `severity`, `actor_node`, `claimed_node`, `target_node`, `tool_name`, `identity_proof`, `client_ip`, `detail`, `outcome` .... PK: id. Checks: none declared | idx_audit_log_actor on (actor_node); idx_audit_log_event on (event_type); idx_audit_log_ts on (timestamp) |
| `merit_audit_log` | events/audit | audit/log/telemetry | merit audit log support table. Columns: `id`, `node_id`, `role`, `old_level`, `new_level`, `changed_by`, `reason`, `evidence_refs`, `success`, `rejection_reason`, `created_at`, `created_at_epoch_ms`. PK: id. Checks: none declared | none captured |
| `redaction_events` | events/audit | audit/log/telemetry | redaction events support table. Columns: `id`, `fts_rowid`, `source`, `ref_id`, `session_id`, `pattern_class`, `redaction_count`, `redaction_source`, `occurred_at`, `occurred_at_epoch_ms`. PK: id. Checks: none declared | idx_redaction_events_occurred on (occurred_at_epoch_ms); idx_redaction_events_pattern on (pattern_class, occurred_at_epoch_ms); idx_redaction_events_source on (redaction_source, occurred_at_epoch_ms) |
| `tool_telemetry` | events/audit | audit/log/telemetry | tool telemetry support table. Columns: `id`, `node_id`, `tool_name`, `caller_role`, `result_token_count`, `response_class`, `ts_epoch_ms`. PK: id. Checks: result_token_count: result_token_count >= 0 | idx_tool_telem_name_ts on (tool_name, ts_epoch_ms) |
| `node_accomplishments` | fleet/nodes/topology | support/legacy | node accomplishments support table. Columns: `id`, `node_id`, `task_id`, `title`, `description`, `accomplished_at`, `accomplished_at_epoch_ms`. PK: id. Checks: none declared | idx_accomplishments_node_ts on (node_id, accomplished_at_epoch_ms) |
| `topology_audit_log` | fleet/nodes/topology | audit/log/telemetry | topology audit log support table. Columns: `id`, `audit_id`, `timestamp`, `timestamp_epoch_ms`, `entity_type`, `entity_id`, `check_type`, `status`, `detail`, `consecutive_failures`. PK: id. Checks: entity_type: entity_type IN ('service', 'edge'; status: status IN ('ok', 'degraded', 'drift' | idx_topo_audit_audit_id on (audit_id); idx_topo_audit_status on (status) |
| `session_search_fts_config` | identity/memory/handoff | derived virtual/shadow | session search fts config support table. Columns: `k`. PK: k. Checks: none declared | none captured |
| `session_search_fts_content` | identity/memory/handoff | derived virtual/shadow | session search fts content support table. Columns: `id`. PK: id. Checks: none declared | none captured |
| `session_search_fts_data` | identity/memory/handoff | derived virtual/shadow | session search fts data support table. Columns: `id`, `block`. PK: id. Checks: none declared | none captured |
| `session_search_fts_docsize` | identity/memory/handoff | derived virtual/shadow | session search fts docsize support table. Columns: `id`, `sz`. PK: id. Checks: none declared | none captured |
| `session_search_fts_idx` | identity/memory/handoff | derived virtual/shadow | session search fts idx support table. Columns: . PK: PRIMARY KEY(segid, term). Checks: none declared | none captured |
| `messages_archive` | messaging | support/legacy | messages archive support table. Columns: `id`, `from_node`, `to_node`, `msg_type`, `subject`, `content`, `ref_task_id`, `status`, `created_at`, `read_at`, `is_broadcast`, `priority` .... PK: id. Checks: none declared | none captured |
| `corrections` | other/support | support/legacy | corrections support table. Columns: `id`, `node_id`, `text`, `status`, `severity`, `track`, `scope`, `distilled_principle`, `relapse_count`, `last_relapse_at`, `last_relapse_at_epoch_ms`, `graduated_at` .... PK: id. Checks: status: status IN ('ACTIVE', 'LEARNED', 'ARCHIVED'; severity: severity IN ('CRITICAL', 'ADVISORY'; track: track IN ('learnable', 'permanent'; scope: scope IN ('personal', 'fleet' | idx_corrections_node on (node_id); idx_corrections_node_status on (node_id, status) |
| `decisions` | other/support | support/legacy | decisions support table. Columns: `id`, `node_id`, `decision_type`, `title`, `context`, `options`, `ref_task_id`, `priority`, `status`, `response`, `created_at`, `resolved_at` .... PK: id. Checks: none declared | none captured |
| `gary_test_results` | other/support | support/legacy | gary test results support table. Columns: `gary_session_id`, `kind`, `test_spec_json`, `spawner_node`, `lease_id`, `started_at_utc`, `started_epoch_ms`, `ttl_seconds`, `expires_epoch_ms`, `ended_at_utc`, `verdict`, `teardown_status` .... PK: gary_session_id. Checks: none declared | idx_gary_results_expires on (expires_epoch_ms); idx_gary_results_started on (started_epoch_ms DESC); idx_gary_results_verdict on (verdict) |
| `idle_burn_observations` | other/support | support/legacy | idle burn observations support table. Columns: `id`, `node_id`, `role`, `ce_value`, `tool_call_count`, `active_work_turns`, `last_artifact_at_epoch_ms`, `pending_inbound_count`, `active_assigned_task_count`, `window_start_epoch_ms`, `observed_at`, `observed_at_epoch_ms`. PK: id. Checks: role: role IN ('builder','reviewer','analyst','pm','architect'; ce_value: ce_value >= 0; tool_call_count: tool_call_count >= 0; active_work_turns: active_work_turns >= 0; pending_inbound_count: pending_inbound_count >= 0; active_assigned_task_count: active_assigned_task_count >= 0 | idx_idle_burn_obs_node_recent on (node_id, observed_at_epoch_ms DESC); idx_idle_burn_obs_window on (window_start_epoch_ms) |
| `maintenance_locks` | other/support | support/legacy | maintenance locks support table. Columns: `family`, `holder_node_id`, `token`, `acquired_at_epoch_ms`, `expires_at_epoch_ms`, `reason`, `metadata_json`. PK: family. Checks: none declared | idx_maintenance_locks_expires on (expires_at_epoch_ms) |
| `motd_schedules` | other/support | support/legacy | motd schedules support table. Columns: `id`, `subject`, `message`, `interval_minutes`, `priority`, `enabled`, `created_by`, `created_at`, `created_at_epoch_ms`, `last_fired_at`, `last_fired_at_epoch_ms`, `updated_at` .... PK: id. Checks: none declared | none captured |
| `nudge_alt_mapping` | other/support | support/legacy | nudge alt mapping support table. Columns: `id`, `source_tool`, `source_response_class`, `alternative_text`, `evidence_ref`, `created_by`, `created_at`, `created_at_epoch_ms`. PK: id. Checks: none declared | idx_nudge_alt_source on (source_tool) |
| `nudge_effectiveness_ledger` | other/support | support/legacy | nudge effectiveness ledger support table. Columns: `id`, `source_rfc_id`, `target_node`, `nudge_type`, `tier`, `predicate_legs_passed_json`, `legs_count_passed`, `context_json`, `outcome_status`, `outcome_observed_at`, `outcome_observed_at_epoch_ms`, `outcome_evidence_json` .... PK: id. Checks: source_rfc_id: source_rfc_id IN ('RFC310', 'RFC548x1'; predicate_legs_passed_json: json_valid(predicate_legs_passed_json; legs_count_passed: legs_count_passed = json_array_length(predicate_legs_passed_json; outcome_status: outcome_status IN ( 'pending', 'behavior_changed', 'no_change_observed', 'resolved_by_other', 'superseded', 'expired' | idx_nudge_ledger_age on (created_at_epoch_ms); idx_nudge_ledger_node on (target_node, created_at_epoch_ms DESC); idx_nudge_ledger_pending on (outcome_status, created_at_epoch_ms) WHERE outcome_status = 'pending'; idx_nudge_ledger_rfc on (source_rfc_id, created_at_epoch_ms DESC) |
| `nudge_outcome` | other/support | support/legacy | nudge outcome support table. Columns: `id`, `ledger_id`, `audit_kind`, `audit_payload_json`, `actor`, `created_at`, `created_at_epoch_ms`. PK: id. Checks: audit_kind: audit_kind IN ('emit','observed','expired','superseded'; audit_payload_json: audit_payload_json IS NULL OR json_valid(audit_payload_json | idx_nudge_outcome_kind on (audit_kind, created_at_epoch_ms DESC); idx_nudge_outcome_ledger on (ledger_id, created_at_epoch_ms DESC) |
| `schema_migrations` | other/support | support/legacy | schema migrations support table. Columns: `version`, `applied_at`, `applied_at_epoch_ms`, `description`. PK: version. Checks: none declared | idx_schema_migrations_applied on (applied_at_epoch_ms) |
| `silenced_alerts` | other/support | support/legacy | silenced alerts support table. Columns: `id`, `alert_type`, `node_id`, `severity`, `details`, `suppressed_at`, `suppressed_at_epoch_ms`. PK: id. Checks: none declared | idx_silenced_alerts_node_ts on (node_id, suppressed_at_epoch_ms); idx_silenced_alerts_ts on (suppressed_at_epoch_ms) |
| `workload_snapshots` | other/support | support/legacy | workload snapshots support table. Columns: `id`, `node_id`, `timestamp`, `active_tasks`, `queue_depth`, `msgs_sent_1h`, `msgs_received_1h`, `reviews_1h`, `responsiveness_avg`, `workload_score`, `node_status`, `timestamp_epoch_ms`. PK: id. Checks: none declared | idx_workload_node_ts on (node_id, timestamp) |
| `task_hygiene_audit` | tasks/board | audit/log/telemetry | task hygiene audit support table. Columns: `id`, `task_id`, `tier`, `event_type`, `actor_node`, `old_assigned_to`, `new_assigned_to`, `age_hours`, `message_ids_json`, `notes`, `occurred_at`, `occurred_at_epoch_ms`. PK: id. Checks: none declared | idx_task_hygiene_audit_occurred_at on (occurred_at_epoch_ms); idx_task_hygiene_audit_task_id on (task_id) |

## 5. Legal state and enum values

The following CHECK constraints carry the most important legal values. Columns without CHECK constraints are legacy soft enums and must be validated in the application or tightened in v2. These expressions are re-extracted as balanced expressions from the reference DDL and source schema helpers; when an expression exists only in later application validation, it is not listed here.

| Table | Complete reference CHECK expressions |
|---|---|
| `archive_pin` | `CHECK(doc_type IN ('rfc','kb','scratch'))` |
| `cairn_ancestry_edges` | `CHECK(edge_type IN ('supersedes', 'inspired_by', 'related', 'patches', 'expands', 'absorbs', 'operator_directive', 'external_source'))`; `CHECK(body_section IS NULL OR body_section IN ('origin', 'problem', 'system', 'improvement'))` |
| `cairn_approval_events` | `CHECK(event_type IN ('ratify','approve_conditional','qualifier_add','revoke','defer'))`; `CHECK(source_kind IN ('ratify','message','audit_chain','operator_direct','inferred'))`; `CHECK(is_revocation IN (0,1))` |
| `cairn_council_annotation_access_audit` | `CHECK(redacted_for_inv1 IN (0,1))` |
| `cairn_council_annotations` | `CHECK(lens IN ('devils_advocate','invariant_checker','provenance_honesty'))`; `CHECK(severity IN ('info','nuance','concern','blocker_candidate'))`; `CHECK(sla_status IN ('landed','missed','retried'))` |
| `cairn_council_annotations_archive` | `CHECK(archive_reason IN ('retry','concurrent_emit','manual_override','sla_recovery'))` |
| `cairn_council_firings` | `CHECK(firing_number IN (1,2))`; `CHECK(triggered_by IN ('author','auto','operator'))` |
| `cairn_id_counter` | `CHECK(id = 1)` |
| `cairn_kb` | `CHECK(status IN ('draft','published','flagged','archived'))`; `CHECK(temporal_class IN ('doctrine','reference','pattern','observation'))`; later lifecycle policy uses `CHECK(lifecycle_state IN ('hot','cold','tombstone','purged'))` when the lifecycle column is present |
| `cairn_node_leases` | `CHECK(intent IN ('active','molt','gary_canary'))` |
| `cairn_scratch` | later lifecycle policy uses `CHECK(lifecycle_state IN ('hot','cold','tombstone','purged'))` when the lifecycle column is present |
| `cairn_swat_design_input` | `CHECK(response_stance IN ('support','object','nuance','defer') OR response_stance IS NULL)` |
| `cairn_swats` | `CHECK (stage IN ('open','in_review','fixed','closed'))`; `CHECK (severity IN ('critical','high','medium','low'))`; `CHECK (current_verdict IN ('approve','request_changes','reject') OR current_verdict IS NULL)` |
| `git_sync_outbox` | `CHECK(status IN ('pending','in_progress','done','failed'))` |
| `rfc353_council_autofire_attempts` | `CHECK(would_fire IN (0, 1))`; `CHECK(fired IN (0, 1))` |
| `rfc353_council_autofire_fires` | `CHECK(scope_type IN ('wave', 'swat'))`; `CHECK(signal IN ('pingpong'))` |
| `rfc353_verdict_history` | `CHECK(verdict IN ('approve', 'request_changes', 'reject'))` |
| `rfc_response_versions` | `CHECK(stance IN ('support','object','nuance','defer'))` |
| `rfc_responses` | `CHECK(stance IN ('support','object','nuance','defer'))` |
| `rfc_signals` | `CHECK(signal IN ('support','object','nuance','defer','star'))` |
| `rfc_standing_opa` | `CHECK(status IN ('active','revoked'))` |
| `rfc_votes` | `CHECK(verdict IN ('approve','reject','abstain'))` |
| `rfcs` | `CHECK(status IN ('seed','ideation','in_round','ratified','shipped','deferred','superseded','archived'))`; later lifecycle policy uses `CHECK(lifecycle_state IN ('hot','cold','tombstone','purged'))` when the lifecycle column is present |
| `authority_tokens` | `CHECK (scope IN ('molt_fleet', 'molt_individual', 'node_restart', 'session_clear', 'identity_update', 'consensus_override'))`; `CHECK (status IN ('active', 'consumed', 'expired', 'revoked'))` |
| `ops_elevations` | `CHECK (scope_type IN ('action', 'task', 'time'))` |
| `sudo_grants` | `CHECK (status IN ('pending', 'granted', 'expired', 'revoked', 'denied'))` |
| `audit_idle_handler_fire` | `CHECK(event_type = 'audit_idle_handler_fire')`; `CHECK(handler_class IN ('consolidation','scanner','maintenance'))` |
| `audit_lifecycle_event` | `CHECK(doc_type IN ('rfc','kb','scratch'))` |
| `events` | `CHECK(payload_json IS NULL OR json_valid(payload_json))` |
| `tool_catalog` | `CHECK(schema_tokens >= 0)`; `CHECK(description_tokens >= 0)`; `CHECK(total_static >= 0)` |
| `tool_telemetry` | `CHECK(result_token_count >= 0)` |
| `fleet_state` | `CHECK(id = 1)` |
| `node_roles` | `CHECK (tier IN ('primary', 'secondary', 'tertiary', 'aspiration'))` |
| `role_threshold_bands` | `CHECK(role IN ('builder','reviewer','analyst','pm','architect'))`; `CHECK(ce_soft > 0)`; `CHECK(ce_hard > ce_soft)`; `CHECK(ce_operator > ce_hard)`; `CHECK(emission_active IN (0,1))` |
| `topo_static` | `CHECK(id = 1)` |
| `topology_audit_log` | `CHECK (entity_type IN ('service', 'edge'))`; `CHECK (status IN ('ok', 'degraded', 'drift'))` |
| `topology_edges` | `CHECK (access_method IN ('local', 'unc', 'http'))`; `CHECK (role IN ('producer', 'consumer', 'both'))` |
| `memory_block_audits` | `CHECK(write_kind IN ('write','rollback','reset'))` |
| `memory_blocks` | `CHECK(block_type IN ('current_context','fleet_model','learned_patterns'))` |
| `merit_badges` | `CHECK (level >= 1 AND level <= 5)` |
| `merit_nominations` | `CHECK (proposed_level >= 1 AND proposed_level <= 5)`; `CHECK (status IN ('pending', 'approved', 'rejected'))`; `CHECK (nominee_node_id != nominator_node_id)` |
| `molt_requests` | `CHECK (lease_retention_policy IS NULL OR lease_retention_policy IN ('release_on_terminal','retain_owner_alive','retain_for_reclaim'))` |
| `corrections` | `CHECK(status IN ('ACTIVE', 'LEARNED', 'ARCHIVED'))`; `CHECK(severity IN ('CRITICAL', 'ADVISORY'))`; `CHECK(track IN ('learnable', 'permanent'))`; `CHECK(scope IN ('personal', 'fleet'))` |
| `idle_burn_observations` | `CHECK(role IN ('builder','reviewer','analyst','pm','architect'))`; `CHECK(ce_value >= 0)`; `CHECK(tool_call_count >= 0)`; `CHECK(active_work_turns >= 0)`; `CHECK(pending_inbound_count >= 0)`; `CHECK(active_assigned_task_count >= 0)` |
| `nudge_effectiveness_ledger` | `CHECK(source_rfc_id IN ('RFC310', 'RFC548x1'))`; `CHECK(json_valid(predicate_legs_passed_json))`; `CHECK(legs_count_passed = json_array_length(predicate_legs_passed_json))`; `CHECK(outcome_status IN ('pending', 'behavior_changed', 'no_change_observed', 'resolved_by_other', 'superseded', 'expired'))` |
| `nudge_outcome` | `CHECK(audit_kind IN ('emit','observed','expired','superseded'))`; `CHECK(audit_payload_json IS NULL OR json_valid(audit_payload_json))` |
| `strike_counter` | `CHECK(call_count >= 1)`; `CHECK(last_tier_emitted IS NULL OR last_tier_emitted IN ('T1','T3','T5'))` |

## 6. Recommended v2 DDL for a minimum viable PostgreSQL core

This section is a recommendation, not the reference. It keeps the main names recognizable, normalizes hot rows, uses real NULL, and stores time as `timestamptz`. Add migrations, RLS, retention policy, and import adapters around it before production use. The DDL below intentionally uses table-level CHECK constraints instead of PostgreSQL enum types so future migrations can add contract states without dropping enum types.

```sql
CREATE TABLE nodes (
  node_id text PRIMARY KEY,
  role text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  working_dir text,
  status text NOT NULL DEFAULT 'online',
  lifecycle_state text NOT NULL DEFAULT 'running' CHECK (lifecycle_state IN ('running','saving','ready_for_restart','restarting','stopped','stale','offline','boot_wedged','molting')),
  manual_mode boolean NOT NULL DEFAULT false,
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expected_next_at timestamptz,
  heartbeat_interval_seconds integer NOT NULL DEFAULT 90 CHECK (heartbeat_interval_seconds > 0),
  heartbeat_phase text NOT NULL DEFAULT 'active',
  node_status text NOT NULL DEFAULT '',
  interrupt_pending boolean NOT NULL DEFAULT false,
  interrupt_reason text NOT NULL DEFAULT '',
  last_bootstrap_at timestamptz,
  bootstrap_attempt_count integer NOT NULL DEFAULT 0 CHECK (bootstrap_attempt_count >= 0),
  process_start_time text,
  checkpoint_count integer NOT NULL DEFAULT 0 CHECK (checkpoint_count >= 0),
  active_work_turns integer NOT NULL DEFAULT 0 CHECK (active_work_turns >= 0),
  life_services_confirmed boolean NOT NULL DEFAULT false,
  life_services_confirmed_at timestamptz,
  life_services_proof jsonb NOT NULL DEFAULT '{}'::jsonb,
  gate_attempt_count integer NOT NULL DEFAULT 0 CHECK (gate_attempt_count >= 0),
  gate_attempt_first_at timestamptz,
  last_transition_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nodes_lifecycle_idx ON nodes(lifecycle_state, last_seen_at DESC);
CREATE INDEX nodes_last_seen_idx ON nodes(last_seen_at DESC);

CREATE TABLE node_identities (
  node_id text PRIMARY KEY REFERENCES nodes(node_id) ON DELETE CASCADE,
  default_role text,
  default_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  startup_instructions text NOT NULL DEFAULT '',
  operator_notes text NOT NULL DEFAULT '',
  node_secret_hash text,
  session_token text,
  session_token_refreshed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX node_identities_secret_hash_idx ON node_identities(node_secret_hash) WHERE node_secret_hash IS NOT NULL;

CREATE TABLE node_session_tokens (
  token_hash text PRIMARY KEY,
  node_id text NOT NULL REFERENCES nodes(node_id) ON DELETE CASCADE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by text,
  release_reason text,
  last_seen_at timestamptz,
  CHECK (expires_at IS NULL OR expires_at > issued_at),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);
CREATE INDEX node_session_tokens_node_active_idx ON node_session_tokens(node_id, issued_at DESC) WHERE revoked_at IS NULL;
CREATE FUNCTION node_session_tokens_enforce_max() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM node_session_tokens WHERE node_id = NEW.node_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())) > 3 THEN
    RAISE EXCEPTION 'MAX_TOKENS_PER_NODE exceeded for %', NEW.node_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER node_session_tokens_max_guard
AFTER INSERT OR UPDATE OF revoked_at, expires_at ON node_session_tokens
FOR EACH ROW EXECUTE FUNCTION node_session_tokens_enforce_max();

CREATE TABLE messages (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  from_node text NOT NULL REFERENCES nodes(node_id),
  to_node text NOT NULL REFERENCES nodes(node_id),
  msg_type text NOT NULL DEFAULT 'info',
  subject text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  ref_task_id text,
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','archived')),
  is_broadcast boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  requires_ack boolean NOT NULL DEFAULT false,
  attention boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  delivered_at timestamptz,
  archived_at timestamptz,
  idempotency_key text,
  payload_fingerprint text
);
CREATE UNIQUE INDEX messages_idempotency_key_idx ON messages(from_node, to_node, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX messages_to_unread_idx ON messages(to_node, created_at DESC) WHERE status = 'unread';
CREATE INDEX messages_from_created_idx ON messages(from_node, created_at DESC);

CREATE TABLE tasks (
  task_id text PRIMARY KEY,
  assigned_to text REFERENCES nodes(node_id),
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog','ready','in_progress','review','blocked','done','cancelled')),
  priority integer NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  project text NOT NULL DEFAULT '',
  cluster_id text,
  output_branch text,
  notes text,
  topology_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ref_rfc_id text,
  head_sha text,
  pr_base_sha text,
  strict_review boolean NOT NULL DEFAULT false,
  repo_path text,
  linked_swat_id text,
  repo_id text,
  artifact_class text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_assigned_status_idx ON tasks(assigned_to, status, updated_at DESC);
CREATE INDEX tasks_status_priority_idx ON tasks(status, priority, updated_at DESC);
CREATE INDEX tasks_ref_rfc_idx ON tasks(ref_rfc_id);

CREATE TABLE task_deps (
  task_id text NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  depends_on text NOT NULL REFERENCES tasks(task_id),
  PRIMARY KEY (task_id, depends_on),
  CHECK (task_id <> depends_on)
);
CREATE INDEX task_deps_depends_on_idx ON task_deps(depends_on);

CREATE TABLE task_review_acks (
  ack_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  reviewer_node text NOT NULL REFERENCES nodes(node_id),
  verdict text NOT NULL CHECK (verdict IN ('approve','request_changes')),
  notes text,
  evidence_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_review_acks_task_created_idx ON task_review_acks(task_id, created_at DESC);
CREATE INDEX task_review_acks_reviewer_idx ON task_review_acks(reviewer_node, created_at DESC);

CREATE TABLE task_evidence (
  evidence_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  task_id text REFERENCES tasks(task_id) ON DELETE CASCADE,
  item_id text NOT NULL,
  item_type text NOT NULL DEFAULT 'task' CHECK (item_type IN ('task','swat','rfc_ac')),
  leg text NOT NULL CHECK (leg IN ('BUILD','SHIP','ACCEPTANCE')),
  result text NOT NULL DEFAULT 'UNKNOWN' CHECK (result IN ('PASS','FAIL','UNKNOWN')),
  actor_node text NOT NULL REFERENCES nodes(node_id),
  artifact_ref text NOT NULL DEFAULT '',
  repo_id text NOT NULL DEFAULT '',
  method text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, item_type, leg, actor_node),
  CHECK ((item_type = 'task' AND task_id IS NOT NULL) OR item_type <> 'task')
);
CREATE INDEX task_evidence_task_leg_idx ON task_evidence(task_id, leg);
CREATE INDEX task_evidence_item_leg_idx ON task_evidence(item_id, item_type, leg);

CREATE TABLE cairn_swats (
  swat_id text PRIMARY KEY,
  title text NOT NULL CHECK (btrim(title) <> ''),
  body text NOT NULL,
  stage text NOT NULL DEFAULT 'open' CHECK (stage IN ('open','in_review','fixed','closed')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','low')),
  swat_type text NOT NULL DEFAULT 'build' CHECK (swat_type IN ('build','audit','analysis','verify')),
  created_by text NOT NULL REFERENCES nodes(node_id),
  code_author text REFERENCES nodes(node_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  current_reviewer text REFERENCES nodes(node_id),
  current_verdict text CHECK (current_verdict IS NULL OR current_verdict IN ('approve','request_changes','reject')),
  previous_reviewers text NOT NULL DEFAULT '',
  ref_kbs text NOT NULL DEFAULT '',
  ref_rfcs text NOT NULL DEFAULT '',
  fix_commit text,
  build_owner text REFERENCES nodes(node_id),
  build_owner_claimed_at timestamptz,
  cluster_id text,
  cluster_id_source text CHECK (cluster_id_source IS NULL OR cluster_id_source IN ('explicit','inferred')),
  design_input_status text CHECK (design_input_status IS NULL OR design_input_status IN ('open','closed')),
  design_review_opened_at timestamptz,
  design_input_synthesis text,
  design_input_skip_rationale text,
  previous_design_input_invitees text NOT NULL DEFAULT '',
  pool_exhausted boolean NOT NULL DEFAULT false,
  pool_exhausted_first_detected_at timestamptz,
  pool_exhausted_resolved_at timestamptz,
  threshold_override_active boolean NOT NULL DEFAULT false,
  design_input_stale_emitted_at timestamptz,
  disposition text,
  refile_target_swat_id text REFERENCES cairn_swats(swat_id),
  refile_kind text CHECK (refile_kind IS NULL OR refile_kind IN ('superseded','refiled')),
  fix_commit_merged_verified boolean,
  land_reminder_last_emitted_at timestamptz,
  repo text,
  closed_at timestamptz,
  closed_reason text,
  CHECK ((refile_target_swat_id IS NULL AND refile_kind IS NULL) OR (refile_target_swat_id IS NOT NULL AND refile_kind IS NOT NULL)),
  CHECK (stage <> 'fixed' OR swat_type <> 'build' OR fix_commit IS NOT NULL OR disposition IS NOT NULL),
  CHECK (closed_at IS NULL OR stage = 'closed')
);
CREATE INDEX cairn_swats_stage_idx ON cairn_swats(stage, updated_at DESC);
CREATE INDEX cairn_swats_severity_idx ON cairn_swats(severity, updated_at DESC);
CREATE INDEX cairn_swats_reviewer_idx ON cairn_swats(current_reviewer) WHERE current_reviewer IS NOT NULL;
CREATE INDEX cairn_swats_build_owner_idx ON cairn_swats(build_owner) WHERE build_owner IS NOT NULL;

CREATE TABLE cairn_swat_audit (
  audit_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  swat_id text NOT NULL REFERENCES cairn_swats(swat_id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created','stage_transition','ref_added','reroute','reopen','closed','verdict','fix_commit_set','cluster_set','design_input','build_claimed','corrected')),
  from_value text,
  to_value text,
  actor_node text NOT NULL REFERENCES nodes(node_id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX cairn_swat_audit_swat_idx ON cairn_swat_audit(swat_id, occurred_at DESC);
CREATE INDEX cairn_swat_audit_event_idx ON cairn_swat_audit(event_type, occurred_at DESC);

CREATE TABLE cairn_swat_id_counter (
  date_key text PRIMARY KEY,
  last_seq integer NOT NULL DEFAULT 0 CHECK (last_seq >= 0)
);

CREATE TABLE ops_elevations (
  id text PRIMARY KEY,
  node_id text NOT NULL REFERENCES nodes(node_id),
  scope_type text NOT NULL CHECK (scope_type IN ('action','task','time')),
  action_type text,
  scope text,
  granted_by text NOT NULL,
  delegated_by text,
  courier text,
  delegation_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  directive_text text,
  directive_hash text,
  reason text,
  source text NOT NULL DEFAULT 'console',
  expires_at timestamptz,
  consumed boolean NOT NULL DEFAULT false,
  consumed_by text REFERENCES nodes(node_id),
  consumed_action text,
  consumed_at timestamptz,
  revoked_by text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (directive_text IS NOT NULL OR directive_hash IS NOT NULL OR reason IS NOT NULL),
  CHECK (consumed = false OR consumed_at IS NOT NULL),
  CHECK (consumed_action IS NULL OR action_type IS NULL OR consumed_action = action_type),
  CHECK (revoked_at IS NULL OR consumed_at IS NULL OR revoked_at >= consumed_at)
);
CREATE INDEX ops_elevations_active_idx ON ops_elevations(node_id, scope_type, action_type, expires_at) WHERE consumed = false AND revoked_at IS NULL;
CREATE INDEX ops_elevations_consumed_idx ON ops_elevations(consumed_by, consumed_at DESC) WHERE consumed = true;

CREATE TABLE opa_usage_log (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  opa_id text NOT NULL REFERENCES ops_elevations(id),
  node_id text NOT NULL REFERENCES nodes(node_id),
  action text NOT NULL,
  result text NOT NULL CHECK (result IN ('allowed','rejected','already_consumed','expired','revoked')),
  rejection_reason text,
  target_node_id text REFERENCES nodes(node_id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX opa_usage_log_opa_idx ON opa_usage_log(opa_id, created_at DESC);

CREATE TABLE restart_intents (
  intent_id text PRIMARY KEY,
  deploying_node text NOT NULL REFERENCES nodes(node_id),
  target_sha text NOT NULL,
  minted_at_ms bigint NOT NULL CHECK (minted_at_ms >= 0),
  expires_at_ms bigint NOT NULL CHECK (expires_at_ms > minted_at_ms),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_at_ms bigint,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','expired','aborted')),
  CHECK ((status = 'active' AND released_at IS NULL AND released_at_ms IS NULL) OR status <> 'active')
);
CREATE UNIQUE INDEX restart_intents_one_active_per_sha ON restart_intents(target_sha) WHERE status = 'active';
CREATE INDEX restart_intents_node_status_idx ON restart_intents(deploying_node, status, claimed_at DESC);

CREATE TABLE boomerangs (
  item_id text PRIMARY KEY,
  ref_task_id text REFERENCES tasks(task_id),
  originator text NOT NULL REFERENCES nodes(node_id),
  assignee text NOT NULL REFERENCES nodes(node_id),
  status text NOT NULL DEFAULT 'thrown' CHECK (status IN ('thrown','caught','in_progress','preempted','escalated','returned_complete','returned_blocked','superseded')),
  kind text NOT NULL DEFAULT 'work' CHECK (kind IN ('work','context_refresh','dep_handoff','sample')),
  return_category text CHECK (return_category IS NULL OR return_category IN ('capacity','scope_change','blocked_by','needs_info','wrong_node','deadline_unreasonable')),
  thrown_at timestamptz NOT NULL DEFAULT now(),
  deadline timestamptz NOT NULL,
  returned_at timestamptz,
  return_reason text,
  priority integer NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  bounce_count integer NOT NULL DEFAULT 0 CHECK (bounce_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX boomerangs_assignee_status_idx ON boomerangs(assignee, status);
CREATE INDEX boomerangs_status_deadline_idx ON boomerangs(status, deadline);

CREATE TABLE audit_log (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  timestamp timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('debug','info','warning','error','critical')),
  actor_node text REFERENCES nodes(node_id),
  claimed_node text,
  target_node text,
  tool_name text,
  identity_proof text,
  detail text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','rejected','error','noop'))
);
CREATE INDEX audit_log_actor_idx ON audit_log(actor_node, timestamp DESC);
CREATE INDEX audit_log_event_idx ON audit_log(event_type, timestamp DESC);

CREATE TABLE content_acks_state (
  node_id text NOT NULL REFERENCES nodes(node_id) ON DELETE CASCADE,
  session_token text NOT NULL,
  slug text NOT NULL CHECK (btrim(slug) <> ''),
  kb_version text NOT NULL DEFAULT '',
  content_checksum text NOT NULL DEFAULT '',
  free_text_ack text NOT NULL DEFAULT '',
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  last_reject_reason text NOT NULL DEFAULT '',
  acked_at timestamptz,
  PRIMARY KEY (node_id, session_token, slug)
);
CREATE INDEX content_acks_state_node_session_idx ON content_acks_state(node_id, session_token);

CREATE TABLE content_acks_audit (
  event_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  node_id text NOT NULL REFERENCES nodes(node_id) ON DELETE CASCADE,
  session_token text NOT NULL DEFAULT '',
  slug text NOT NULL DEFAULT '',
  event_type text NOT NULL CHECK (event_type IN ('bootstrap_content_ack_required','ack_attempted','ack_verified','ack_rejected','ack_expired','ack_invalidated_kb_version')),
  actor text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  notes text NOT NULL DEFAULT ''
);
CREATE INDEX content_acks_audit_node_time_idx ON content_acks_audit(node_id, occurred_at DESC);
CREATE INDEX content_acks_audit_event_type_idx ON content_acks_audit(event_type, occurred_at DESC);

CREATE TABLE events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  node_id text REFERENCES nodes(node_id),
  task_id text REFERENCES tasks(task_id),
  event_type text NOT NULL,
  message text NOT NULL DEFAULT '',
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_node_created_idx ON events(node_id, created_at DESC);
CREATE INDEX events_task_created_idx ON events(task_id, created_at DESC);

CREATE VIEW events_all AS
SELECT id, node_id, task_id, event_type, message, payload, created_at FROM events;

CREATE TABLE memory_blocks (
  node_id text NOT NULL REFERENCES nodes(node_id) ON DELETE CASCADE,
  block_type text NOT NULL CHECK (block_type IN ('current_context','fleet_model','learned_patterns')),
  content text NOT NULL,
  revision_id bigint NOT NULL DEFAULT 1 CHECK (revision_id >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_actor text NOT NULL,
  PRIMARY KEY (node_id, block_type)
);

CREATE TABLE session_handoff (
  handoff_id text PRIMARY KEY,
  author_node text NOT NULL REFERENCES nodes(node_id),
  author_session_id text,
  authored_at timestamptz NOT NULL DEFAULT now(),
  as_of timestamptz NOT NULL,
  expires_at timestamptz,
  expected_continuation_window text,
  head_pointers jsonb NOT NULL DEFAULT '[]'::jsonb,
  in_flight_commitments jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE rfcs (
  rfc_id text PRIMARY KEY,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'seed' CHECK (status IN ('seed','ideation','in_round','ratified','shipped','deferred','superseded','archived')),
  domain text NOT NULL,
  author_id text NOT NULL,
  current_rev_id bigint,
  parent_rfc_id text REFERENCES rfcs(rfc_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rfc_revisions (rev_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, rfc_id text NOT NULL REFERENCES rfcs(rfc_id) ON DELETE CASCADE, rev_number integer NOT NULL, body text NOT NULL, body_sha256 text NOT NULL, author_id text NOT NULL, authored_at timestamptz NOT NULL DEFAULT now(), UNIQUE (rfc_id, rev_number));
CREATE TABLE rfc_waves (wave_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, rfc_id text NOT NULL REFERENCES rfcs(rfc_id) ON DELETE CASCADE, round_num integer NOT NULL, prompt text NOT NULL, mode text, opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, synthesis text, UNIQUE (rfc_id, round_num));
CREATE TABLE rfc_responses (response_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, wave_id bigint NOT NULL REFERENCES rfc_waves(wave_id) ON DELETE CASCADE, author_id text NOT NULL, stance text CHECK (stance IN ('support','object','nuance','defer')), body text NOT NULL, is_starred boolean NOT NULL DEFAULT false, is_late boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (wave_id, author_id));
CREATE TABLE rfc_votes (vote_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, rfc_id text NOT NULL REFERENCES rfcs(rfc_id) ON DELETE CASCADE, voter_id text NOT NULL, verdict text NOT NULL CHECK (verdict IN ('approve','reject','abstain')), justification text, cast_at timestamptz NOT NULL DEFAULT now(), UNIQUE (rfc_id, voter_id));
CREATE TABLE rfc_signals (node_id text NOT NULL, response_id bigint NOT NULL REFERENCES rfc_responses(response_id) ON DELETE CASCADE, signal text NOT NULL CHECK (signal IN ('support','object','nuance','defer','star')), comment text, cast_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (node_id, response_id, signal));
CREATE TABLE cairn_rfc_gates (rfc_id text NOT NULL REFERENCES rfcs(rfc_id) ON DELETE CASCADE, gate_id text NOT NULL, gate_kind text NOT NULL, state text NOT NULL DEFAULT 'open', close_disposition text, opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, metadata jsonb, PRIMARY KEY (rfc_id, gate_id));
CREATE TABLE cairn_kb (slug text PRIMARY KEY, title text NOT NULL, content text NOT NULL, tags jsonb NOT NULL DEFAULT '[]'::jsonb, author_id text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','flagged','archived')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE cairn_scratch (id text PRIMARY KEY, author_id text NOT NULL, content text NOT NULL, tags jsonb NOT NULL DEFAULT '[]'::jsonb, ref_task_id text REFERENCES tasks(task_id), ref_rfc_id text REFERENCES rfcs(rfc_id), pinned boolean NOT NULL DEFAULT false, expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
```

Contract traceability:

| Core-contracts section | DDL objects that implement it |
|---|---|
| 1. Scope and compatibility rules | `nodes`, `node_identities`, `node_session_tokens`, `messages`, `tasks`, `task_evidence`, `audit_log`, `events`, `events_all`, `restart_intents` |
| 2. Authentication and identity | `node_identities.node_secret_hash`, `node_identities.session_token`, `node_session_tokens`, `node_session_tokens_max_guard`, token indexes, `audit_log` |
| 2.1 `register_node` | `nodes`, `node_identities`, `audit_log`, `events` |
| 3 and 11. `bootstrap_node` | `nodes`, `node_identities`, `node_session_tokens`, `memory_blocks`, `session_handoff`, `audit_log`, `events` |
| 4 and 12. First-node tools | `messages`, `tasks`, `task_deps`, `task_evidence`, `task_review_acks`, `nodes.life_services_*`, `content_acks_state`, `content_acks_audit`, `audit_log`, `events` |
| 12.5 Content acknowledgement state | `content_acks_state`, `content_acks_audit`, `nodes.life_services_proof`, `audit_log`, `events` |
| 5.6 and 13.6 SWAT | `cairn_swats`, `cairn_swat_audit`, `cairn_swat_id_counter`, SWAT indexes and CHECK constraints |
| 5 and 13. State machines | CHECK constraints on `nodes.lifecycle_state`, `tasks.status`, `boomerangs.status`, `cairn_swats.stage`, `cairn_swats.current_verdict`, `ops_elevations.scope_type`, OPA consumed/revoked fields, Cairn and RFC CHECK constraints |
| 6 and 14. Restart lever | `restart_intents`, `restart_intents_one_active_per_sha`, `audit_log`, `events`, `ops_elevations` |
| 7 and 15. Restore proof | required tables `nodes`, `messages`, `tasks`, `task_evidence`, `node_identities`, `node_session_tokens`, `ops_elevations`, `boomerangs`, `restart_intents`, `cairn_swats`, `cairn_swat_audit`, `content_acks_state`, `content_acks_audit`, plus `events_all` |
| 8 and 16. Manual-mode boot | `nodes.manual_mode`, `nodes.life_services_proof`, `nodes.life_services_confirmed`, `content_acks_state`, `content_acks_audit`, `messages`, `audit_log`, `events` |
| 10. Transport and trusted fields | `audit_log.identity_proof`, `audit_log.claimed_node`, `audit_log.actor_node`, `events.payload` |

## 7. Unresolved

- Some soft status values are enforced only in application code and not by CHECK constraints; the reference catalog lists the hard constraints and flags the rest as soft enums.
- The exact production PostgreSQL JSONB upgrade set is not reproduced here; the rebuild should choose JSONB deliberately rather than by legacy sync side effects.
- The events split uses a compatibility view in production posture; this reference lists the base event table and recommends preserving a tolerant `events_all` view if storage is split.
- The standalone Cairn PostgreSQL schema exists, but the reference deployment kept Cairn on SQLite; v2 DDL here treats Cairn as a PostgreSQL first-class domain.
- Derived FTS shadow tables are listed, but their internal columns should be generated by the selected search implementation rather than hand-authored.

## 8. Coverage summary

- Full core table entries: 86
- Compact entries: 59
- Total table-like entries listed: 145
- Reference counts include base tables, SQLite virtual FTS tables, FTS shadow tables, and the migration registry table.
