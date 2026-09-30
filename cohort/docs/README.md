# COHORT documentation

This documentation is organized around verified system boundaries rather than the historical filesystem layout.

## Start here

1. [`blueprint.md`](blueprint.md) - the top-level start-here map: building blocks, connections, site prerequisites, build order, and coverage
2. [`rebuild/`](rebuild/) - the deep, rebuild-grade layer: how to reconstruct the system and which properties are load-bearing
3. [`system-catalog.md`](system-catalog.md) - what is covered and what remains unresolved
4. [`architecture/cohort-project.md`](architecture/cohort-project.md) - COHORT and Zerobrain hierarchy
5. [`architecture/verified-map.md`](architecture/verified-map.md) - current relationship model
6. [`architecture/rebuild-sequence.md`](architecture/rebuild-sequence.md) - dependency-oriented reconstruction order
7. [`source-hierarchy.md`](source-hierarchy.md) - how to resolve conflicting evidence
8. [`source-inventory.md`](source-inventory.md) - authoritative sources and investigation gaps
9. [`operations/content-triage.md`](operations/content-triage.md) - what to keep, salvage, archive, or ditch

## Reading by concern

- **Control and data:** `systems/coordinator.md`, `systems/zerobrain.md`, `systems/cairn-rfc.md`, `architecture/data-ownership.md`
- **Work and authority:** `systems/work-routing-and-evidence.md`, `systems/swatter.md`, `systems/review.md`, `systems/authorization-and-review.md`
- **Node operation:** `systems/fleet-boot.md`, `systems/identity-and-memory.md`, `systems/lifecycle-and-molt.md`, `operations/manual-wake.md`
- **Liveness and testing:** `systems/breathing.md`, `systems/gary.md`, `systems/failure-episodes.md`
- **Knowledge and decisions:** `systems/knowledge-lifecycle.md`, `decisions/`
- **Historical context:** `systems/legacy.md`

Each page distinguishes current contract, implementation evidence, deployment evidence, historical material, and unresolved questions.
