# RFC candidate catalog

This catalog is a source-backed first pass over active or recently active RFCs that may contain reusable design for the COHORT rebuild. Dispositions are provisional until the full body, implementation state, and dependency graph are reviewed.

| RFC | Current Cairn status | Verified design value | Initial disposition | Next action |
|---|---|---|---|---|
| RFC681 | seed | architect-authored, unratified event-driven communication substrate intended to separate liveness, wake, and state transfer from scheduled polling. | Salvage / architect review | Read full body and compare with current manual-mode decision and Breathbus contracts; do not present it as adopted doctrine. |
| RFC525 | ratified | Token-efficiency doctrine, idle economics, and work-seeking behavior. | Keep as historical design input; reconcile current manual mode | Extract durable economics and discard automated-mode assumptions that no longer apply. |
| RFC525c2 | in_round | Narrow idle gate, PM sweep, and continuation receipts. | Salvage | Separate useful receipt concepts from scheduled-prompt behavior rejected by current policy. |
| RFC561 | in_round | Cohort trust and dispatch handshake: suggest, consent, and push. | Salvage | Compare with TotemTask and explicit-wake operation. |
| RFC561x1 | ratified | Self-service dispatch from a ratified backlog. | Salvage / optional module | Determine whether it is compatible with frozen manual mode or should remain opt-in. |
| RFC643x2 | in_round | Boot-core minimization and KEEP/SHIM/RELOCATE/DELETE taxonomy. | Keep / architect review | Use as a core-versus-module classification input for the rebuild guide. |
| RFC639 | seed | Prevents loss of blessed build tips across Molt successor recycle. | Salvage | Map to COHORT continuity, Git provenance, and handoff contracts. |
| RFC620 | ratified | Graceful binary/launch version resolution and no-fatal-pin-brick behavior. | Keep | Extract the launch safety invariants and distinguish implementation details from doctrine. |
| RFC660 | ratified | Coordinator-enforced topology awareness and push-not-pull discipline. | Keep | Map to source hierarchy, cross-host verification, and deployment boundaries. |
| RFC257x1 | deferred | Breathbus as a governed job-execution platform with heartbeat isolation. | Archive as deferred candidate | Re-evaluate only after current manual mode and breathing lineage are documented. |

## Triage notes

- `ratified` does not mean implemented or current; implementation and deployment evidence must be checked separately.
- `in_round` does not mean adopted; preserve the design questions and responses, not just the title.
- `seed` does not mean low value; RFC681 and RFC639 are examples of seeds with potentially reusable architecture.
- `deferred` is not deletion; RFC257x1 remains useful historical context and a possible future module.

## First body-level findings

- **RFC681** is not merely a polling optimization. Its strongest reusable idea is a shared, replayable cohort room that separates message delivery from liveness and lets a newly booted node reconstruct context. Its own body also records substantial prior-art and failed-wake lineage, so it must be reviewed against that lineage before adoption.
- **RFC643x2** provides a direct classification framework for the rebuild: keep only the minimal locally-live boot core, relocate broad checks and repair into post-live or release processes, and make fallback boundaries explicit instead of claiming total independence.
- **RFC639** captures a concrete continuity failure: a blessed local-only Git SHA disappears when the author Molts. Its reusable rule is that build tips must be pushed/reachable before they are treated as durable review or ship evidence.
- **RFC620** contains shipped prior art plus residual invariants. The COHORT guide should preserve the provenance-gated, non-bricking launch principle while separating already-shipped layers from outstanding drift-audit and verified-running parity work.
- **RFC525c2** is a proposed change to RFC525, not current doctrine: its useful idea is a fail-closed work-seeking/receipt-continuation gate, but its idle policy must be reconciled with the current explicit-freeze manual mode.
- **RFC561** proposes a veto-preserving peer dispatch suggestion handshake. It is a governance candidate, not a replacement for PM authority or the current TotemTask workflow.
- **RFC561x1** proposes coordinator-native self-service pulls from a ratified backlog. It explicitly rejects plan files as a second source of truth and should be evaluated as an optional future module.
- **RFC660** proposes coordinator-enforced topology context, version checks, cross-host probe gates, and evidence-backed topology reads. Its authority-boundary principles are useful even where the full implementation is not adopted.
- **RFC257x1** is a deferred Breathbus job-platform charter. Its heartbeat-isolation and zero-foreground invariants are reusable; its scheduled-job model conflicts with current manual mode and remains future/optional.

## Sources

- Live `cairn_list_active` query from the source query.
- Full RFC bodies to be read through `cairn_get` before final disposition.
- `docs/operations/content-triage.md`.
