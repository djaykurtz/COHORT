# Data ownership and derived surfaces

## Why this matters

The systems expose many overlapping views of the same work. Rebuild guidance must say which component owns a state transition and which components only index, display, route, or receipt it.

## Ownership matrix

| Concern | Durable owner | Derived or coordinating surfaces |
|---|---|---|
| Node registration, lifecycle, liveness, session state | Coordinator state | Superdash, messages, topology views |
| RFC/seed/KB lifecycle | Cairn/RFC persistence in the coordinator backend | Spyglass index, Superdash, messages |
| Swatter stage/verdict/closure | Coordinator Swatter state | Boomerang transport, Superdash, task references |
| Failure Episode degraded/recovered transitions | Coordinator failure-episode feed, replayed from watchdog artifacts | Superdash incident views and post-incident guides |
| Kanban task status and review acknowledgements | Coordinator task state | TotemTask plan, proof files, Superdash |
| Lessons and revisions | Coordinator lesson tables | Spyglass lesson documents, dashboard widgets |
| Merit badges and audit history | Coordinator Merit tables | Identity/profile views and dashboard |
| Manual work assignment | TotemTask plan authored by the PM node | Node proof files and coordinator task actions |
| Search | Spyglass derived index | Search API and dashboard |
| Dashboard rendering | Superdash client/cache | Coordinator APIs and SSE/outbox events |

## Completion rule

Only the durable owner can complete its state transition. A derived index, dashboard rendering, proof file, or message may provide evidence or coordination context, but cannot substitute for the owning action.

## Failure rule

Derived surfaces should fail independently where possible:

- Spyglass corruption must not erase or roll back durable knowledge.
- Dashboard cache or SSE failure must not invalidate coordinator state.
- Failure Episode replay must preserve watchdog evidence and must not be collapsed into RFC/KB content.
- TotemTask proof writing must happen after, not before, the authoritative completion action.
- Messages and dashboard cards must not be treated as durable task state without a coordinator read.

## Sources

- `coordinator repository: coordinator/swatter.py`
- `coordinator repository: coordinator/spyglass.py`
- `coordinator repository: coordinator/lessons.py`
- KB `totemtask-manual-mode-kanban-workflow`
- KB `three-lane-routing-rfc-swat-task`
- Superdash and coordinator source traces in `docs/systems/zerobrain.md` and `docs/systems/superdash.md`
