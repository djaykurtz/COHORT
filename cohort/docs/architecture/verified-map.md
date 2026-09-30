# Verified architecture map

## Current relationship map

```text
OPERATOR authority
  |
  +--> guestbook / directive / OPA scope
  |
  v
ZEROBRAIN COHORT system family
  |
  +--> Coordinator: live fleet state, identity, messages, tasks, lifecycle
  |      |
  |      +--> MCP node sessions and manual-mode wakes
  |      +--> REST/SSE consumers
  |      +--> Failure Episodes replay
  |
  +--> Cairn: authoritative RFC / KB / seed / scratch records
  |      |
  |      +--> Spyglass: derived search index
  |      +--> RFC / SWAT / Task lane references
  |
  +--> Superdash: operator presentation and interaction
  |
  +--> Breathbus: underlying liveness/wake infrastructure
  |
  +--> Node cohort: Copilot CLI sessions, identity, memory, handoff, Molt
  |
  +--> TotemTask: manual-mode substitute for coordinator-driven dispatch
```

## Authority boundaries

| Boundary | Durable truth | Derived/coordination surface |
|---|---|---|
| Live fleet state | Coordinator | Superdash, topology views, messages |
| Design and knowledge | Cairn | Spyglass, Superdash search |
| Targeted remediation | Swatter | Boomerang transport, dashboard cards |
| Build execution | Coordinator Tasks | TotemTask plan/proof in manual mode |
| Incident evidence | Failure Episodes | Superdash incident views |
| Static host topology | Fleet Topology KB | Coordinator topology snapshots |
| Liveness | Mode-specific Breathbus/coordinator contract | Dashboard health indicators |

## Evidence status

- **Confirmed:** coordinator, Cairn, Spyglass, Swatter, Tasks, Superdash, Failure Episodes, TotemTask, identity, memory, handoff, Molt, OPA, review, and current manual-mode behavior.
- **Historical:** HB3 through HB61 heartbeat lineage, retired bubble and legacy wake variants, older SQLite production descriptions, and superseded RFC/KB attempts.
- **Unresolved:** complete broader Zerobrain web-backend repository boundary, full HB3 chronology evidence, current Merit/Lessons usage, and final disposition of incomplete RFC/seed ideas.

## Publication rule

This map is a verified orientation model, not a replacement for subsystem guides. Each edge must remain traceable to its source and may be revised when live implementation or architect review contradicts it.
