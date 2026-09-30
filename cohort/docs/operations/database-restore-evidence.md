# Database restore evidence procedure and template

Use this record when a coordinator/Cairn backup is restored or a new-server rebuild is validated. `rebuild/core-contracts.md` section 15 is the executable restore-proof specification. This page is the operator procedure and receipt template.

## Procedure

1. Select the newest complete backup according to the backup manifest and retention policy.
2. Verify the archive, data file, publish marker, and manifest or sidecar digest before restore.
3. Restore into a scratch PostgreSQL database or disposable instance, never directly over production.
4. Run the PostgreSQL checks from `rebuild/core-contracts.md` section 15 and capture their outputs.
5. If Cairn is stored separately in SQLite, run only the short Cairn SQLite checks from section 15 against the restored Cairn file.
6. Record row counts, missing-table/column results, enum violations, token integrity, restart-fence integrity, dependency/ownership checks, and Cairn consistency.
7. Promote the restore only if every hard pass rule succeeds, or document an explicit fixture exception for warning-only cases.
8. Close scratch connections and remove transient restore artifacts.

## Source

- Backup artifact logical ID:
- Backend: `postgres` plus optional separate `sqlite-cairn`:
- Source database role:
- Dump format:
- Source revision or schema migration head:
- Artifact integrity digest:
- Created-at marker:

## Integrity

- Archive/list validation:
- Manifest/publish-marker validation:
- Schema migration validation:
- Row/count check reference: `rebuild/core-contracts.md` section 15:
- Secret-sanitization check:
- Backup retention/source authority:

## Restore

- Target environment:
- Scratch database or instance identifier:
- Restore start/end marker:
- Restore operator/authority:
- Restore command/procedure reference:
- Restore result:
- Rollback artifact:

## PostgreSQL acceptance evidence

- Table count and required tables:
- Core row counts:
- Newest-key recency:
- Required columns:
- Enum value checks:
- Restart fence integrity:
- Token integrity:
- Message ownership and task dependencies:
- Cairn-in-PostgreSQL checks, if applicable:

## Separate Cairn SQLite evidence, if applicable

- `PRAGMA integrity_check` result:
- SWAT stage counts:
- Documented tombstones or exceptions:

## Post-restore functional acceptance

- Coordinator readiness:
- MCP bootstrap:
- Message/task lifecycle:
- Cairn/RFC/KB read/write:
- Search/index rebuild:
- Swatter/review/evidence:
- OPA/authority verification:
- Dashboard or health endpoint behavior:
- Failure-episode replay:
- Manual-mode wake/freeze:
- Optional automated-mode verification:

## Evidence handling

Attach durable receipts, test results, hashes, and source revisions. Do not paste live credentials or rely on a dashboard screenshot as the only proof.
