# Legacy and retired systems

This page preserves historical context without presenting retired mechanisms as rebuild targets.

## Historical breathing eras

- HB3 Start-Sleep, HB4 interrupt, HB5 long-poll, HB51NA, HB6/HB61 heartbeat-wait/sentinel: historical lineage.
- HB8 unified-breathing proposals: historical design attempts.
- `breathbus-bubble.ps1`, legacy watcher scripts, and sentinel-era variants: retired or superseded.
- `coordinator-poll_and_ack`: retained compatibility surface, not the canonical automated first-call.

## Historical lifecycle paths

- Remote request/approval/execute Molt sequence: legacy history; current self-Molt uses TrueMolt/QC-REFRESH subject to current verification caveats.
- Smooth-Molt and Swift-Molt: historical/retired variants unless a current source explicitly reactivates them.

## Historical storage/deployment descriptions

- SQLite production coordinator descriptions: historical after the PostgreSQL cutover.
- Retired backup roots and old mirror layouts: forensic history only; recover from the current backend-aware backup contract.
- Host-specific paths, retired hosts, old launch bundles, and stale generated mirrors: evidence of prior deployment, not current architecture.

## Preservation rule

Legacy content stays available when it explains a failure, design transition, or migration constraint. It is not copied into current operating playbooks without an explicit current-source verification.

## Sources

- KB `breathbus-p4-definitive-spec`.
- KB `molt-protocol`.
- KB `fleet-topology` and `fleet-topology-reference`.
- `docs/conflict-log.md`.
