# RFC681 - Buzz shared-room communication candidate

## Status

**Cairn status:** seed. **Author:** the architect node. **Disposition:** salvage for architect review; not adopted doctrine.

## Reusable idea

Separate three concerns currently coupled in polling:

1. liveness attestation;
2. wake/message delivery;
3. replayable state transfer.

The candidate proposes a durable, replayable project-scoped room so a newly booted or Molted node can reconstruct cohort context without relying on repeated point-to-point DMs and large repeated snapshots.

## Prior-art warning

The source body explicitly records multiple earlier wake/poll attempts, including RFC497 lineage, deterministic-poll work, and retired hookbreath/mailbox variants. Any future design must begin with that lineage review rather than re-propose a new wake mechanism from scratch.

## Relationship to current COHORT

- Manual mode already removes scheduled prompt polling from the live operating model.
- Buzz may be relevant as a future message/state-transfer substrate, but it does not automatically authorize automated mode.
- Liveness remains a separate problem from context replay.

## Not yet decided

- Whether the external protocol is acceptable for the fleet security and durability model.
- Whether it replaces coordinator messaging or only supplements replay/state transfer.
- How OPA, identity, retention, and source-of-truth rules apply.

## Sources

- Cairn RFC681 body and metadata.
- KB `fleet-topology`.
- KB `rfc497c1-wake-spec-under-test-canonical`.
