# Coordinator database backup and recovery

## Current recovery contract

The coordinator production backend is PostgreSQL after the RFC629 cutover. The backup path must therefore use a live PostgreSQL dump (`pg_dump` custom format) and validate it with `pg_restore --list`. A frozen SQLite file is not a valid current production backup source.

The existing backend-aware backup process:

- selects the backend from coordinator configuration;
- uses `pg_dump -Fc` for PostgreSQL;
- reads the database password from a secret file rather than embedding it in the DSN;
- verifies the archive with `pg_restore --list`;
- hashes and atomically publishes the snapshot;
- keeps local and offsite copies with retention;
- writes status only after the artifact is durably published and verified.

SQLite backup remains relevant for legacy/test databases and uses the SQLite online backup API plus integrity checking.

## What must be backed up

The coordinator database contains durable coordinator state that cannot be recreated from node worktrees:

- nodes, identity/lifecycle state, messages, tasks, review evidence;
- OPA/audit records;
- Swatter and Failure Episodes;
- lessons, Merit, memory, and handoff records.

Cairn RFC/KB/seed/scratch state lives in the separate Cairn store. Back it up with Cairn's own backup path and restore it alongside the coordinator database in the documented order. Derived Spyglass indexes and dashboards can be rebuilt from durable records and should not be treated as the only backup.

## Restore authority

Restore is a controlled coordinator operation:

1. stop writes through the sanctioned coordinator maintenance/restart path;
2. choose the latest integrity-verified backup;
3. restore to the correct backend/cluster;
4. verify schema, readiness, identity, and event/replay surfaces;
5. re-establish derived indexes and dashboard caches;
6. record the restore evidence and resume normal operation.

## Sources

- `backup-snapshot.ps1` backend-aware backup contract, observed in the fleet source.
- `BACKUP-RESTORE-README.md` legacy SQLite and transition documentation.
- Coordinator README current PostgreSQL production substrate.
- RFC603/RFC629 PostgreSQL cutover documentation.
