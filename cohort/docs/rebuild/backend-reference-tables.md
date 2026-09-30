# Backend reference tables

Complete lookup tables for the coordinator's configuration surface and REST routes, taken from
the reference implementation. They are here so a rebuild can see the whole contract, not a sample.
Defaults that were addresses, ports, paths or tokens are replaced with placeholders. File names
point into the reference source (see the private archive), without line numbers.

Read these with [`backend-hosting.md`](backend-hosting.md) sections 4 (configuration) and 6 (API).
The assessment in section 17 applies: several hundred unvalidated variables and routes is a
surface to rationalize in a rebuild, not one to copy blindly.

## 1. Environment variables

Every variable the reference coordinator reads. `(truthy flag)` means it is read through the
truthiness helper and is off unless set to a truthy value. `(none)` means no literal default.
Variables read only by test scaffolds are included and marked by their file.

| Variable | Default | Occurrences | Where it is read (reference source file) |
|---|---|---|---|
| `ALLOWED_NODES` | `""` | 1 | `coordinator/config.py` |
| `AUTH_TOKEN` | `""` | 51 | `cairn_service.py` |
| `B4_RESILIENCE_QUERY_ENABLED` | `"true"` | 1 | `coordinator/config.py` |
| `BACKEND_PORT` | `"<LEGACY_BACKEND_PORT>"` | 2 | `gateway-test/gateway.py` |
| `BOARD_BLOCKED_STALE_HOURS` | `"72"` | 1 | `coordinator/database.py` |
| `BOARD_ORPHAN_THRESHOLD_HOURS` | `"48"` | 1 | `coordinator/database.py` |
| `BOARD_RATING_YELLOW_BLOCKED` | `"2"` | 1 | `coordinator/database.py` |
| `BOARD_RATING_YELLOW_ORPHAN` | `"3"` | 1 | `coordinator/database.py` |
| `CAIRN_DB_BACKEND` | `"sqlite"` | 1 | `coordinator/config.py` |
| `CAIRN_DB_PATH` | `"cairn.db"` | 122 | `cairn_core.py` |
| `CAIRN_PORT` | `"<CAIRN_PORT>"` | 3 | `cairn_service.py` |
| `CODECRETE_V1_ENABLED` | `"false"` | 1 | `coordinator/config.py` |
| `COORDINATOR_DB_PATH` | (required, no default) | 7 | `tests/conftest.py` |
| `COORDINATOR_HIGH_WATER_ENFORCE` | (none) | 1 | `coordinator/server.py` |
| `COORDINATOR_READER_POOL_SIZE` | (none) | 1 | `coordinator/reader_pool.py` |
| `COORDINATOR_URL` | `"http://<host-address>:<LEGACY_BACKEND_PORT>"` | 3 | `cairn_service.py` |
| `COORDINATOR_WRITER_POOL_SIZE` | (none) | 1 | `coordinator/writer_pool.py` |
| `COORD_ACTIVE_PRIMARY_DIALECT` | `"sqlite"` | 1 | `coordinator/config.py` |
| `COORD_ALLOW_NON_PG_BACKEND` | `""` | 1 | `coordinator/config.py` |
| `COORD_COSIGN_ENVELOPE_SCHEMA_ENFORCED` | `"false"` | 1 | `coordinator/config.py` |
| `COORD_DB_BACKEND` | `"sqlite"` | 12 | `coordinator/config.py` |
| `COORD_DB_IDLE_TXN_TIMEOUT_S` | `"0"` | 1 | `coordinator/config.py` |
| `COORD_ENV` | `"prod"` | 1 | `coordinator/deploy_gate.py` |
| `COORD_EVENT_DECOUPLE_ENABLED` | `""` | 1 | `coordinator/config.py` |
| `COORD_FAILURE_EPISODES_ENABLED` | `"1"` | 1 | `coordinator/config.py` |
| `COORD_FAILURE_EPISODES_READ_TIMEOUT_S` | `"3.0"` | 1 | `coordinator/config.py` |
| `COORD_FAILURE_EPISODE_CURSOR_PATH` | (none) | 1 | `coordinator/failure_episodes.py` |
| `COORD_FAILURE_EPISODE_SCAN_INTERVAL_S` | `"30"` | 1 | `coordinator/config.py` |
| `COORD_FROZEN_RELAUNCH_ENABLED` | `""` | 1 | `coordinator/database.py` |
| `COORD_G4_SAMPLE_LIMIT` | `""` | 1 | `coordinator/rfc603/g4_shadow_compare.py` |
| `COORD_G4_TABLES` | `""` | 1 | `coordinator/rfc603/g4_shadow_compare.py` |
| `COORD_HEALTH_URL` | `DEFAULT_COORD_HEALTH_URL` | 2 | `coordinator/deploy_gate.py` |
| `COORD_INSERT_MESSAGE_TXN_GUARD_ENABLED` | `"true"` | 1 | `coordinator/config.py` |
| `COORD_PG_COMMAND_TIMEOUT_S` | `"45"` | 1 | `coordinator/config.py` |
| `COORD_PG_DSN` | `"host=<host-address> port=<DB_PORT> dbname=coordinator user=coordinator"` | 2 | `coordinator/config.py` |
| `COORD_PG_EVENTS_SPLIT_ENABLED` | (truthy flag) | 3 | `coordinator/events_router.py` |
| `COORD_PG_HEALTH_PROBE_TIMEOUT_MS` | `"10000"` | 1 | `coordinator/config.py` |
| `COORD_PG_IDLE_IN_TXN_TIMEOUT_MS` | `"60000"` | 1 | `coordinator/config.py` |
| `COORD_PG_LOCK_TIMEOUT_MS` | `"15000"` | 1 | `coordinator/config.py` |
| `COORD_PG_NATIVE_RETENTION_ENABLED` | (truthy flag) | 1 | `coordinator/pg_retention.py` |
| `COORD_PG_NATIVE_TYPES_DUAL_WRITE` | (truthy flag) | 2 | `coordinator/pg_native_types.py` |
| `COORD_PG_PARTMAN_ENABLED` | (truthy flag) | 2 | `coordinator/events_router.py` |
| `COORD_PG_PASSWORD` | (none) | 3 | `coordinator/alembic/env.py` |
| `COORD_PG_PASSWORD_FILE` | `DEFAULT_COORD_PG_PASSWORD_FILE` | 1 | `coordinator/deploy_gate.py` |
| `COORD_PG_POOL_BULK_SIZE` | `"2"` | 1 | `coordinator/config.py` |
| `COORD_PG_POOL_CAIRN_SIZE` | `"4"` | 1 | `coordinator/config.py` |
| `COORD_PG_POOL_HEARTBEAT_SIZE` | `"4"` | 1 | `coordinator/config.py` |
| `COORD_PG_POOL_INTERACTIVE_SIZE` | `"8"` | 1 | `coordinator/config.py` |
| `COORD_PG_POOL_LONGPOLL_SIZE` | `"0"` | 1 | `coordinator/config.py` |
| `COORD_PG_SECRET_FILE` | `_DEFAULT_SECRET_FILE` | 1 | `coordinator/alembic/env.py` |
| `COORD_PG_STATEMENT_TIMEOUT_MS` | `"30000"` | 1 | `coordinator/config.py` |
| `COORD_PG_TEST_DSN` | (none) | 1 | `tests/test_rfc629_og12_c1_ledger_rehearsal.py` |
| `COORD_PG_WRITER_POOL_ENABLED` | `"false"` | 2 | `coordinator/config.py` |
| `COORD_PORT` | `"<COORD_PORT>"` | 1 | `scripts/serve_dualstack.py` |
| `COORD_PULL_EVENT_INGEST_ENABLED` | `""` | 1 | `coordinator/pull_event_ingest.py` |
| `COORD_PULL_EVENT_MAX_BYTES` | `"32768"` | 1 | `coordinator/pull_event_ingest.py` |
| `COORD_PULL_EVENT_OUTBOX_SWEEP_S` | `"30"` | 1 | `coordinator/pull_event_ingest.py` |
| `COORD_PULL_EVENT_RATE_LIMIT` | `str(limit` | 1 | `coordinator/pull_event_ingest.py` |
| `COORD_PULL_EVENT_STARTUP_MAX_BATCHES` | `"100"` | 1 | `coordinator/pull_event_ingest.py` |
| `COORD_RESTART_STORM_THRESHOLD` | `"3"` | 1 | `coordinator/restart_storm_detector.py` |
| `COORD_RESTART_STORM_WINDOW_MIN` | `"30"` | 1 | `coordinator/restart_storm_detector.py` |
| `COORD_ROOT` | (none) | 3 | `coordinator/server.py` |
| `COORD_SCHEMA_MIGRATIONS_ENABLED` | (truthy flag) | 8 | `coordinator/events_router.py` |
| `COORD_SHADOW_DROP_LOG` | `"logs/shadow_drops.jsonl"` | 1 | `coordinator/rfc603/dual_write_shadow.py` |
| `COORD_SHADOW_ENABLED` | `""` | 1 | `coordinator/rfc603/dual_write_shadow.py` |
| `COORD_SHADOW_INSTANCE_CONFIRMED` | `""` | 1 | `coordinator/rfc603/dual_write_shadow.py` |
| `COORD_SHADOW_QUEUE_MAXSIZE` | `"1024"` | 1 | `coordinator/rfc603/dual_write_shadow.py` |
| `COORD_SHADOW_SCHEMA_RECHECK_S` | `"900"` | 1 | `coordinator/rfc603/dual_write_shadow.py` |
| `COORD_SRC` | (none) | 6 | `coordinator/schema/gen_cairn_connection_manifest.py` |
| `COORD_STRIKE_COUNTER_RETENTION_DAYS` | (none) | 1 | `coordinator/database.py` |
| `COORD_SUPERVISED` | `""` | 1 | `coordinator/database.py` |
| `COORD_SWAT_ANCESTRY_GATE_ENABLED` | `"false"` | 1 | `coordinator/config.py` |
| `COORD_WATCHDOG_ALERT_DIR` | (none) | 1 | `coordinator/config.py` |
| `COORD_WRITE_LOCK_ACQUIRE_TIMEOUT_S` | `"0"` | 1 | `coordinator/config.py` |
| `CORS_EXTRA_ORIGINS` | `""` | 1 | `coordinator/server.py` |
| `COUNCIL_AUDIT_SECRET` | `""` | 3 | `coordinator/council_access.py` |
| `COUNCIL_AUTODISABLE_THRESHOLD` | `"20"` | 1 | `coordinator/config.py` |
| `COUNCIL_BUSY_TIMEOUT_MS` | `"5000"` | 1 | `coordinator/config.py` |
| `COUNCIL_MAX_CONCURRENT_FIRES` | `"8"` | 1 | `coordinator/config.py` |
| `COUNCIL_MAX_CONCURRENT_LENS_CALLS` | `"16"` | 1 | `coordinator/config.py` |
| `COUNCIL_SLA_CEILING_MS` | `"30000"` | 1 | `coordinator/config.py` |
| `COUNCIL_SLA_P50_MS` | `"15000"` | 1 | `coordinator/config.py` |
| `COUNCIL_V1_ENABLED` | `"false"` | 1 | `coordinator/config.py` |
| `COUNCIL_VESSEL_SLA_SECONDS` | `"3600"` | 1 | `coordinator/config.py` |
| `DB_PATH` | (required, no default) | 312 | `scripts/capture-schema-snapshot.py` |
| `DEPLOYING_NODE` | `"<ops-node>"` | 1 | `coordinator/swat0013_revert.py` |
| `DESIGN_INPUT_STALE_SCAN_INTERVAL_SECONDS` | `"300"` | 1 | `coordinator/design_input_stale_monitor.py` |
| `DESIGN_INPUT_STALE_THRESHOLD_SECONDS` | `str(48 * 3600` | 1 | `coordinator/design_input_stale_monitor.py` |
| `ENVIRONMENT` | `"prod"` | 1 | `coordinator/config.py` |
| `FALLBACK_DIR` | `r"<path>"` | 1 | `coordinator/config.py` |
| `FALLBACK_ENABLED` | `"true"` | 1 | `coordinator/config.py` |
| `FALLBACK_HEARTBEAT_INTERVAL` | `"30"` | 1 | `coordinator/config.py` |
| `FLEET_STATUS_CACHE_TTL_S` | `"2.0"` | 1 | `coordinator/database.py` |
| `GARY_REAPER_ENABLED` | `"false"` | 1 | `coordinator/config.py` |
| `GARY_REAPER_INTERVAL_S` | `"60"` | 1 | `coordinator/config.py` |
| `GATEWAY_PORT` | `"<COORD_PORT>"` | 2 | `gateway-test/gateway.py` |
| `GOVERNOR_SUGGESTIONS_ENABLED` | `"false"` | 1 | `coordinator/config.py` |
| `HANDOFF_V1_ENABLED` | `"false"` | 1 | `coordinator/config.py` |
| `HOST` | `"<host-address>"` | 1 | `coordinator/config.py` |
| `JWT_SECRET` | `""` | 8 | `coordinator/auth_jwt.py` |
| `JWT_SKEW_SECONDS` | `"60"` | 2 | `coordinator/auth_jwt.py` |
| `JWT_TTL_SECONDS` | `"900"` | 3 | `coordinator/auth_jwt.py` |
| `LIFECYCLE_TOKEN` | `""` | 1 | `coordinator/config.py` |
| `M1_LEASE_ENABLED` | `"false"` | 1 | `coordinator/config.py` |
| `M2_HEALTHGATE_ENABLED` | `"false"` | 1 | `coordinator/config.py` |
| `M2_REORDER_ONLY` | `"false"` | 1 | `coordinator/config.py` |
| `M3_CLASSIFIER_ENABLED` | `"true"` | 1 | `coordinator/config.py` |
| `M4_AUTORELAUNCH_HOSTS` | `""` | 1 | `coordinator/config.py` |
| `M4_AUTORELAUNCH_LEASE_ACQUIRE_ENABLED` | `"false"` | 1 | `coordinator/config.py` |
| `M4_AUTORELAUNCH_PROBE_TIMEOUT_SEC` | `"300"` | 1 | `coordinator/config.py` |
| `M4_AUTORELAUNCH_REATTACH_FIRST` | `"true"` | 1 | `coordinator/config.py` |
| `M4_AUTORELAUNCH_USERLOGON_ONLY` | `"false"` | 1 | `coordinator/config.py` |
| `M5B_C3_OBSERVABILITY_ENABLED` | `"false"` | 1 | `coordinator/config.py` |
| `M5_DRIFT_OVERRIDE_REASON` | (none) | 2 | `coordinator/flag_enforce.py` |
| `M5_FLAG_AUDIT_ONLY` | `"false"` | 1 | `coordinator/config.py` |
| `M5_FLAG_DEFAULT_ENFORCE` | `"false"` | 1 | `coordinator/config.py` |
| `MOLT_WATCHDOG_ACTIVE` | `"false"` | 1 | `coordinator/config.py` |
| `MOLT_WATCHDOG_SHADOW_ENABLED` | `"false"` | 1 | `coordinator/config.py` |
| `OOB_WATCHDOG_ENABLED` | `""` | 1 | `coordinator/oob_watchdog_integration.py` |
| `PORT` | `"<COORD_PORT>"` | 2 | `coordinator/config.py` |
| `QUERY_GUARD_PG_DSN` | (required, no default) | 2 | `tests/test_query_guard_s3_explain.py` |
| `RECENT_EVENTS_CACHE_TTL_S` | `"5.0"` | 1 | `coordinator/database.py` |
| `RECOVERY_GRACE_S` | `"900"` | 1 | `coordinator/server.py` |
| `RECOVERY_MODE` | (none) | 3 | `coordinator/api.py` |
| `RFC017_SKILLS_BU_ROOT` | `r"<path>"` | 1 | `coordinator/database.py` |
| `RFC270C1_RETUNE_ENABLED` | `""` | 1 | `coordinator/config.py` |
| `RFC340_SKILL_INVOCATION_TOKEN` | (none) | 1 | `coordinator/flag_enforce.py` |
| `RFC392_DEBUG_NESTING` | (none) | 1 | `coordinator/writer_pool.py` |
| `RFC549_ACTIVE_VERSION` | `RFC549_ACTIVE_VERSION` | 1 | `coordinator/cairn.py` |
| `RFC549_DARK_LOG_ENABLED` | `"1"` | 6 | `coordinator/cairn.py` |
| `RFC549_STRICT_ENFORCE_IMPROVEMENT` | (required, no default) | 7 | `tests/test_cairn_rfc_recycle.py` |
| `RFC549_STRICT_ENFORCE_ORIGIN` | (required, no default) | 7 | `tests/test_cairn_rfc_recycle.py` |
| `RFC549_STRICT_ENFORCE_PROBLEM` | (required, no default) | 7 | `tests/test_cairn_rfc_recycle.py` |
| `RFC549_STRICT_ENFORCE_SYSTEM` | (required, no default) | 7 | `tests/test_cairn_rfc_recycle.py` |
| `RFC588_OPERATOR_VIEW_LANDED` | (none) | 1 | `tests/test_rfc588_gary_e2e_canary_mcp.py` |
| `RFC603_RUN_PG_PARITY` | (none) | 1 | `tests/test_rfc603_search_parity.py` |
| `RFC626_VERIFIED_DONE_ROLLUP` | `"0"` | 10 | `coordinator/database.py` |
| `RFC626_VERIFY_INTERVAL_S` | `"300"` | 1 | `coordinator/server.py` |
| `RUN_LIVE_COORD_TESTS` | (none) | 6 | `tests/conftest.py` |
| `SPYGLASS_DB_PATH` | (required, no default) | 5 | `tests/test_spyglass.py` |
| `SPYGLASS_SIZE_CAP_MB` | `"50"` | 1 | `coordinator/spyglass.py` |
| `SSH_PROBE_HOST` | `"<host-address>"` | 1 | `coordinator/server.py` |
| `SSH_PROBE_PORT` | `"<GIT_SSH_PORT>"` | 2 | `coordinator/server.py` |
| `SUMMARY_IDENTIFIER_AUDIT_ENABLED` | `"false"` | 1 | `coordinator/config.py` |
| `SWAT0015_COORD_SHA` | (none) | 1 | `tests/test_swat0015_cross_repo_canary.py` |
| `SWATTER_V1_ENABLED` | `"false"` | 2 | `coordinator/config.py` |
| `SWAT_BUILD_OWNERSHIP_LEASE_MS` | (none) | 1 | `coordinator/config.py` |
| `TOPOLOGY_AUDIT_HEARTBEAT_FRESH_SECONDS` | `"600"` | 1 | `coordinator/database.py` |
| `USER` | (none) | 1 | `coordinator/node_sdk/__init__.py` |
| `USERNAME` | (none) | 1 | `coordinator/node_sdk/__init__.py` |
| `VERDICT_STALENESS_DAYS` | `"30"` | 1 | `coordinator/rfc603/audit_helpers.py` |
| `ZB_DB_PATH` | (required, no default) | 1 | `tests/test_fs1_01.py` |
| `ZEROBRAIN_ENV` | (required, no default) | 6 | `tests/test_merit.py` |

## 2. REST routes

Every live route in the reference coordinator, with prefixes applied. Authentication
requirements by route family are in `backend-hosting.md` section 6.2. The MCP tool surface is
separate: see [`mcp-tool-catalog.md`](mcp-tool-catalog.md).

| Method | Path | Handler | Reference source file |
|---|---|---|---|
| GET | `/api/artifacts/{artifact_id}` | `api_get_artifact` | `coordinator/api.py` |
| POST | `/api/auth/refresh` | `api_auth_refresh` | `coordinator/api.py` |
| POST | `/api/batch` | `batch_endpoint` | `coordinator/api.py` |
| GET | `/api/board/health` | `board_health` | `coordinator/api.py` |
| GET | `/api/board/hygiene-log` | `board_hygiene_log` | `coordinator/api.py` |
| GET | `/api/board/summary` | `board_summary` | `coordinator/api.py` |
| GET | `/api/boomerangs` | `api_boomerangs` | `coordinator/api.py` |
| GET | `/api/boot-manifest/{node_id}` | `get_boot_manifest` | `coordinator/api.py` |
| POST | `/api/breathbus/mint_daemon_post_token` | `breathbus_mint_daemon_post_token` | `coordinator/api.py` |
| POST | `/api/breathbus/rider_alive` | `breathbus_rider_alive` | `coordinator/api.py` |
| POST | `/api/breathbus/rider_died` | `breathbus_rider_died` | `coordinator/api.py` |
| GET | `/api/breathbus/rider_liveness` | `breathbus_get_rider_liveness` | `coordinator/api.py` |
| POST | `/api/breathbus_sync_status` | `api_breathbus_sync_status` | `coordinator/server.py` |
| GET | `/api/cairn/approval_events` | `cairn_approval_events` | `coordinator/api.py` |
| GET | `/api/cairn/filter` | `cairn_filter` | `coordinator/api.py` |
| POST | `/api/cairn/frame` | `cairn_frame` | `coordinator/api.py` |
| GET | `/api/cairn/kb` | `cairn_kb_list` | `coordinator/api.py` |
| POST | `/api/cairn/kb` | `cairn_kb_create` | `coordinator/api.py` |
| GET | `/api/cairn/kb/search` | `cairn_kb_search` | `coordinator/api.py` |
| GET | `/api/cairn/kb/{slug}` | `cairn_kb_get` | `coordinator/api.py` |
| PUT | `/api/cairn/kb/{slug}` | `cairn_kb_update` | `coordinator/api.py` |
| POST | `/api/cairn/kb/{slug}/archive` | `cairn_kb_archive` | `coordinator/api.py` |
| POST | `/api/cairn/kb/{slug}/flag` | `cairn_kb_flag` | `coordinator/api.py` |
| POST | `/api/cairn/kb/{slug}/publish` | `cairn_kb_publish` | `coordinator/api.py` |
| GET | `/api/cairn/recent` | `cairn_recent` | `coordinator/api.py` |
| GET | `/api/cairn/rfc/{rfc_id}/forum` | `cairn_rfc_forum` | `coordinator/api.py` |
| GET | `/api/cairn/rfc/{rfc_id}/notes` | `cairn_rfc_notes_get` | `coordinator/api.py` |
| POST | `/api/cairn/rfc/{rfc_id}/notes` | `cairn_rfc_notes_post` | `coordinator/api.py` |
| POST | `/api/cairn/rfc/{rfc_id}/ratify` | `cairn_rfc_ratify` | `coordinator/api.py` |
| POST | `/api/cairn/rfc/{rfc_id}/respond` | `cairn_rfc_respond` | `coordinator/api.py` |
| POST | `/api/cairn/rfc/{rfc_id}/revise` | `cairn_rfc_revise` | `coordinator/api.py` |
| POST | `/api/cairn/rfc/{rfc_id}/transition` | `cairn_rfc_transition` | `coordinator/api.py` |
| GET | `/api/cairn/rfcs/pending-ratification` | `cairn_rfcs_pending_ratification` | `coordinator/api.py` |
| GET | `/api/cairn/scratch` | `cairn_scratch_list` | `coordinator/api.py` |
| POST | `/api/cairn/scratch` | `cairn_scratch_create` | `coordinator/api.py` |
| GET | `/api/cairn/scratch/{scratch_id:path}` | `cairn_scratch_get` | `coordinator/api.py` |
| GET | `/api/cairn/search` | `cairn_search` | `coordinator/api.py` |
| POST | `/api/cairn/seed` | `cairn_seed_create` | `coordinator/api.py` |
| GET | `/api/cairn/ship-report` | `cairn_ship_report` | `coordinator/api.py` |
| POST | `/api/cairn/signal` | `cairn_signal` | `coordinator/api.py` |
| POST | `/api/cairn/star` | `cairn_star` | `coordinator/api.py` |
| GET | `/api/cairn/swats` | `cairn_swats` | `coordinator/api.py` |
| GET | `/api/cairn/trail` | `cairn_trail` | `coordinator/api.py` |
| POST | `/api/cairn/transition` | `cairn_transition_body` | `coordinator/api.py` |
| GET | `/api/canonical-domains` | `api_canonical_domains` | `coordinator/server.py` |
| GET | `/api/console` | `get_console` | `coordinator/api.py` |
| GET | `/api/corrections/{node_id}` | `api_get_corrections` | `coordinator/api.py` |
| GET | `/api/csrf-token` | `csrf_token_endpoint` | `coordinator/api.py` |
| GET | `/api/dashboard/heartbeats` | `dashboard_heartbeats` | `coordinator/api.py` |
| GET | `/api/debug/identity` | `identity_debug` | `coordinator/api.py` |
| GET | `/api/drop` | `api_list_drops` | `coordinator/api.py` |
| POST | `/api/drop` | `api_create_drop` | `coordinator/api.py` |
| POST | `/api/drop/from-artifact/{artifact_id}` | `api_drop_from_artifact` | `coordinator/api.py` |
| DELETE | `/api/drop/{drop_id}` | `api_delete_drop` | `coordinator/api.py` |
| GET | `/api/drop/{drop_id}` | `api_get_drop` | `coordinator/api.py` |
| GET | `/api/events` | `get_events` | `coordinator/api.py` |
| GET | `/api/events/timeline` | `get_events_timeline` | `coordinator/api.py` |
| GET | `/api/failure-episodes` | `api_failure_episodes` | `coordinator/server.py` |
| GET | `/api/fallback/status` | `fallback_status` | `coordinator/api.py` |
| GET | `/api/fallback/topology` | `fallback_topology` | `coordinator/api.py` |
| GET | `/api/files` | `list_or_download_files` | `coordinator/api.py` |
| GET | `/api/files/{subpath:path}` | `list_or_download_files` | `coordinator/api.py` |
| POST | `/api/files/{subpath:path}` | `upload_file` | `coordinator/api.py` |
| GET | `/api/fleet` | `get_fleet` | `coordinator/api.py` |
| GET | `/api/fleet/state` | `get_fleet_state` | `coordinator/api.py` |
| POST | `/api/graceful-restart` | `api_graceful_restart` | `coordinator/api.py` |
| GET | `/api/graceful-restart/status` | `api_graceful_restart_status` | `coordinator/api.py` |
| GET | `/api/health` | `api_health` | `coordinator/api.py` |
| GET | `/api/health/fleet` | `fleet_health` | `coordinator/api.py` |
| GET | `/api/health/nodes` | `get_node_health` | `coordinator/api.py` |
| GET | `/api/health/ssh` | `api_health_ssh` | `coordinator/server.py` |
| GET | `/api/health/stale` | `get_stale_nodes` | `coordinator/api.py` |
| GET | `/api/identity/{node_id}` | `get_identity` | `coordinator/api.py` |
| POST | `/api/internal/court_leak_audit` | `api_court_leak_audit` | `coordinator/api.py` |
| POST | `/api/internal/resolve-token` | `internal_resolve_token` | `coordinator/api.py` |
| POST | `/api/interrupt/all` | `trigger_interrupt_all` | `coordinator/api.py` |
| GET | `/api/interrupt/{node_id}` | `poll_interrupt` | `coordinator/api.py` |
| POST | `/api/interrupt/{node_id}` | `trigger_interrupt` | `coordinator/api.py` |
| GET | `/api/lifecycle/audit` | `lifecycle_audit` | `coordinator/recovery.py` |
| POST | `/api/lifecycle/crash-recycle` | `crash_recycle` | `coordinator/api.py` |
| GET | `/api/lifecycle/events` | `get_lifecycle_events` | `coordinator/api.py` |
| POST | `/api/lifecycle/service/{service}/restart` | `lifecycle_service_restart` | `coordinator/recovery.py` |
| POST | `/api/lifecycle/service/{service}/stop` | `lifecycle_service_stop` | `coordinator/recovery.py` |
| POST | `/api/lifecycle/token/rotate` | `lifecycle_token_rotate` | `coordinator/recovery.py` |
| GET | `/api/lifecycle/token/status` | `lifecycle_token_status` | `coordinator/recovery.py` |
| POST | `/api/maintenance/archive` | `api_maintenance_archive` | `coordinator/api.py` |
| POST | `/api/maintenance/lock/acquire` | `api_maintenance_lock_acquire` | `coordinator/api.py` |
| POST | `/api/maintenance/lock/release` | `api_maintenance_lock_release` | `coordinator/api.py` |
| GET | `/api/maintenance/mode` | `api_get_maintenance_mode` | `coordinator/api.py` |
| POST | `/api/maintenance/mode` | `api_set_maintenance_mode` | `coordinator/api.py` |
| GET | `/api/mcp-health` | `api_mcp_health` | `coordinator/api.py` |
| POST | `/api/merit/nominate` | `api_nominate` | `coordinator/merit.py` |
| GET | `/api/merit/nominations` | `api_get_nominations` | `coordinator/merit.py` |
| POST | `/api/merit/nominations/{nomination_id}/review` | `api_review_nomination` | `coordinator/merit.py` |
| GET | `/api/merit/{node_id}` | `api_get_node_merit` | `coordinator/merit.py` |
| POST | `/api/merit/{node_id}` | `api_set_merit` | `coordinator/merit.py` |
| POST | `/api/messages` | `send_message` | `coordinator/api.py` |
| GET | `/api/messages/broadcast` | `get_broadcast_messages` | `coordinator/api.py` |
| POST | `/api/messages/broadcast` | `broadcast_message` | `coordinator/api.py` |
| GET | `/api/messages/by-id/{message_id}` | `read_message_by_id` | `coordinator/api.py` |
| GET | `/api/messages/recent` | `get_recent_messages_fleet` | `coordinator/api.py` |
| GET | `/api/messages/{node_id}` | `get_messages` | `coordinator/api.py` |
| GET | `/api/metrics/pm-throughput` | `get_pm_throughput_metrics` | `coordinator/api.py` |
| GET | `/api/metrics/rfc353-council-autofire` | `get_rfc353_autofire_metrics` | `coordinator/api.py` |
| GET | `/api/metrics/rfc660-topology-dryrun` | `get_rfc660_topology_dryrun_metrics` | `coordinator/api.py` |
| POST | `/api/molt/confirm-self` | `molt_confirm_self_endpoint` | `coordinator/api.py` |
| GET | `/api/molt/cooldowns` | `molt_cooldowns_endpoint` | `coordinator/api.py` |
| POST | `/api/molt/execute` | `molt_execute_endpoint` | `coordinator/api.py` |
| GET | `/api/molt/history` | `molt_history_endpoint` | `coordinator/api.py` |
| GET | `/api/molt/moratorium` | `molt_moratorium_get` | `coordinator/api.py` |
| POST | `/api/molt/moratorium` | `molt_moratorium_set` | `coordinator/api.py` |
| POST | `/api/molt/prepare` | `molt_prepare_endpoint` | `coordinator/api.py` |
| POST | `/api/molt/release_all_leases` | `molt_release_all_leases_endpoint` | `coordinator/api.py` |
| POST | `/api/molt/request` | `molt_request_endpoint` | `coordinator/api.py` |
| GET | `/api/molt/status` | `molt_status_generic` | `coordinator/api.py` |
| GET | `/api/molt/status/{molt_id}` | `molt_status_endpoint` | `coordinator/api.py` |
| DELETE | `/api/motd` | `clear_all_motd_schedules` | `coordinator/api.py` |
| GET | `/api/motd` | `get_motd_schedules` | `coordinator/api.py` |
| POST | `/api/motd` | `create_motd_schedule` | `coordinator/api.py` |
| DELETE | `/api/motd/{motd_id}` | `delete_motd_schedule` | `coordinator/api.py` |
| PATCH | `/api/motd/{motd_id}` | `toggle_motd_schedule` | `coordinator/api.py` |
| GET | `/api/node/{node_id}/boot-package` | `get_boot_package` | `coordinator/api.py` |
| POST | `/api/node/{node_id}/bootstrap` | `api_node_bootstrap` | `coordinator/api.py` |
| GET | `/api/nodes` | `get_nodes` | `coordinator/api.py` |
| POST | `/api/nodes/{node_id}/restart` | `api_safe_restart` | `coordinator/api.py` |
| POST | `/api/onboard/manifest` | `onboard_manifest` | `coordinator/api.py` |
| GET | `/api/opa/active` | `opa_active` | `coordinator/api.py` |
| GET | `/api/opa/audit` | `opa_audit` | `coordinator/api.py` |
| POST | `/api/opa/grant` | `opa_grant` | `coordinator/api.py` |
| POST | `/api/opa/revoke` | `opa_revoke` | `coordinator/api.py` |
| GET | `/api/opa/usage/{opa_id}` | `opa_usage` | `coordinator/api.py` |
| GET | `/api/perf-summary` | `api_perf_summary` | `coordinator/server.py` |
| GET | `/api/pin_ledger_drift_events` | `api_pin_ledger_drift_events` | `coordinator/api.py` |
| POST | `/api/pull_event` | `api_pull_event` | `coordinator/server.py` |
| POST | `/api/reauth` | `api_reauth` | `coordinator/api.py` |
| POST | `/api/recovery/breathbus/{host}/restart` | `recovery_breathbus_restart` | `coordinator/recovery.py` |
| POST | `/api/recovery/coordinator/restart` | `recovery_coordinator_restart` | `coordinator/recovery.py` |
| GET | `/api/recovery/health` | `recovery_health` | `coordinator/recovery.py` |
| POST | `/api/recovery/node/{node_id}/revive` | `recovery_node_revive` | `coordinator/recovery.py` |
| POST | `/api/recovery/nodes/batch` | `recovery_nodes_batch` | `coordinator/recovery.py` |
| GET | `/api/recovery/status` | `recovery_status` | `coordinator/recovery.py` |
| POST | `/api/recovery/superdash/restart` | `recovery_superdash_restart` | `coordinator/recovery.py` |
| POST | `/api/release-session` | `api_release_session` | `coordinator/api.py` |
| GET | `/api/resilience-incidents` | `api_resilience_incidents` | `coordinator/server.py` |
| POST | `/api/restart/expire-stale` | `api_restart_expire_stale` | `coordinator/api.py` |
| POST | `/api/restart/release` | `api_restart_release` | `coordinator/api.py` |
| POST | `/api/restart/reserve` | `api_restart_reserve` | `coordinator/api.py` |
| GET | `/api/review-pipeline` | `get_review_pipeline_api` | `coordinator/api.py` |
| GET | `/api/roles/{node_id}` | `api_get_node_roles` | `coordinator/role_registry.py` |
| POST | `/api/roles/{node_id}` | `api_set_node_role` | `coordinator/role_registry.py` |
| DELETE | `/api/roles/{node_id}/{role_id}` | `api_delete_node_role` | `coordinator/role_registry.py` |
| GET | `/api/scripts` | `api_list_scripts` | `coordinator/server.py` |
| GET | `/api/scripts/{script_id}` | `api_get_script` | `coordinator/server.py` |
| GET | `/api/scripts/{script_id}/download` | `api_download_script` | `coordinator/server.py` |
| POST | `/api/shutdown` | `api_shutdown` | `coordinator/api.py` |
| GET | `/api/silence_mode` | `get_silence_mode_api` | `coordinator/api.py` |
| POST | `/api/silence_mode` | `set_silence_mode_api` | `coordinator/api.py` |
| GET | `/api/silence_mode/log` | `get_silence_mode_log_api` | `coordinator/api.py` |
| GET | `/api/stream` | `sse_all_stream` | `coordinator/api.py` |
| GET | `/api/stream/{node_id}` | `sse_node_stream` | `coordinator/api.py` |
| GET | `/api/sudo/grants` | `sudo_grants_endpoint` | `coordinator/api.py` |
| GET | `/api/swats` | `api_list_swats` | `coordinator/server.py` |
| GET | `/api/swats/count` | `api_count_swats` | `coordinator/server.py` |
| GET | `/api/swats/{swat_id}` | `api_get_swat` | `coordinator/server.py` |
| GET | `/api/tasks` | `get_tasks` | `coordinator/api.py` |
| GET | `/api/tasks/{node_id}` | `get_tasks_for_node` | `coordinator/api.py` |
| PUT | `/api/tasks/{task_id}` | `update_task_api` | `coordinator/api.py` |
| POST | `/api/tasks/{task_id}/review-ack` | `submit_review_ack` | `coordinator/api.py` |
| GET | `/api/tool-failures` | `get_tool_failures` | `coordinator/api.py` |
| GET | `/api/tool_costs` | `get_tool_costs` | `coordinator/api.py` |
| GET | `/api/topo/static` | `get_topo_static_api` | `coordinator/api.py` |
| PUT | `/api/topo/static` | `set_topo_static_api` | `coordinator/api.py` |
| GET | `/api/topo/static/history` | `get_topo_s_history_api` | `coordinator/api.py` |
| GET | `/api/topology` | `get_topology` | `coordinator/api.py` |
| GET | `/api/topology-audit` | `get_topology_audit` | `coordinator/api.py` |
| POST | `/api/topology-audit` | `run_topology_audit` | `coordinator/api.py` |
| GET | `/api/wait/{node_id}` | `wait_for_wakeup` | `coordinator/api.py` |
| GET | `/api/wedge-diagnostics` | `api_wedge_diagnostics` | `coordinator/api.py` |
| GET | `/api/wedge-telemetry` | `api_wedge_telemetry` | `coordinator/server.py` |
| GET | `/api/workload` | `get_workload` | `coordinator/api.py` |
| GET | `/events` | `sse_multi_endpoint` | `coordinator/server.py` |
| GET | `/events/{node_id}` | `sse_endpoint` | `coordinator/server.py` |
| GET | `/health` | `health` | `coordinator/server.py` |
| POST | `/mcp` | `mcp_endpoint` | `coordinator/server.py` |
| GET | `/onboard.ps1` | `serve_onboard_script` | `coordinator/server.py` |
| GET | `/operator/gary-status` | `operator_gary_status` | `coordinator/server.py` |
| GET | `/ping` | `ping` | `coordinator/server.py` |
| GET | `/static/{filepath:path}` | `serve_static` | `coordinator/server.py` |
