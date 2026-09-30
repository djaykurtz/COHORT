# RFC525 - Token economy and idle behavior

## Status

**Cairn status:** ratified. **Disposition:** preserve the structural economics and manual-mode implications; treat automated backoff and implementation details as separate candidates.

## Core observation

The token problem was measured as orchestration overhead rather than model quality: repeated polling, cosign ceremony, relays, and activity narration can dominate productive work. Idle activity can cost as much as useful work and can incentivize invented work.

## Reusable design

- Cheap, correct idle is better than activity theater.
- Scheduled polling should not spend a full model turn on empty work.
- Topology and other static payloads should be version/hash gated rather than retransmitted every beat.
- Model selection should be reversible and task-specific.
- Protocol ceremony itself is a cost center and should be minimized.

## Relationship to current COHORT

The current manual-mode decision implements the strongest low-code part of this direction: nodes freeze awaiting explicit work rather than burning scheduled empty beats. Automated backoff and event-driven wake remain opt-in design candidates and must not be treated as current behavior.

## Sources

- Cairn RFC525 body and metadata.
- KB `fleet-topology`.
- COHORT `docs/operations/manual-mode.md`.
