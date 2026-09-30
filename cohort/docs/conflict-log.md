# COHORT unresolved conflict log

This ledger prevents contradictions from being silently flattened into a false single story. Entries are kept only when they teach a reusable design lesson.

| ID | Conflict | Current resolution | Status |
|---|---|---|---|
| C-001 | Older documentation may describe a previous production database while current implementation uses a different write-of-record. | Treat older backend descriptions as historical; current runtime configuration and backend selector win. | Resolved for current docs |
| C-002 | Automated heartbeat doctrine and manual-mode operation can both exist, but only one is current at a time. | Label automated liveness as explicit opt-in and manual mode as frozen until explicit wake. | Resolved for current docs |
| C-003 | The named integration subsystem is broader than the locally verified coordinator implementation. | Document the coordinator as one component and keep the broader boundary unresolved until source-mapped. | Open |
| C-004 | The dashboard has service code and cached views while the coordinator owns durable state. | Treat the dashboard as presentation and interaction over coordinator/Cairn state, not as the durable owner. | Resolved for current docs |
| C-005 | A derived search index can be stale, missing, or corrupt. | Durable knowledge remains authoritative; search is rebuildable and failure-isolated. | Resolved for current docs |
| C-006 | Manual plans/proofs and coordinator tasks can both describe work. | Plans and proofs coordinate manual work; coordinator actions remain authoritative for completion. | Resolved for current docs |
| C-007 | A lifecycle recycle may be described as context-fresh even when host or wrapper behavior can reuse context. | Do not claim unconditional freshness without observed successor isolation and acceptance evidence. | Open |
| C-008 | Candidate event-driven communication designs can be valuable without being current doctrine. | Preserve reusable ideas as candidates and require lineage review before adoption. | Resolved for current docs |
| C-009 | Verbal operator authority and key-based elevation are distinct surfaces. | The captured directive and scope are the authority instrument; the key/grant is the bounded enforcement substrate. | Resolved for current docs |
| C-010 | Incident evidence and design knowledge are both durable but serve different purposes. | Keep failure episodes as a separate evidence stream and link them from design records when relevant. | Resolved for current docs |

## Rules

- Open conflicts block normative wording but do not block historical documentation.
- Every resolution states which authority wins and which source became historical, derived, or unresolved.
- A new implementation observation can reopen a resolved conflict.
