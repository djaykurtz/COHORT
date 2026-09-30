# RFC643x2 - Boot-core minimization

## Status

**Cairn status:** in_round. **Author:** the architect node. **Disposition:** preserve as architecture input; not ratified current doctrine.

## Reusable design

Classify boot behavior as:

- **KEEP** in the minimal locally-live core;
- **SHIM** through a bounded interface;
- **RELOCATE** to post-live observers, release/promotion, or repair flows;
- **DELETE** when redundant or unsafe.

The body separates:

- Stage A: locally-live, network-free boot from sealed/preseeded fallback;
- Stage B: post-live coordinator registration, token bootstrap, inbox, and retryable network behavior.

The core must not accumulate broad freshness, network, repair, git, or policy gates that can prevent reaching a live session.

## Relationship to current COHORT

This directly informs the manual-mode startup decision: bootstrap and identity remain core, while scheduled polling and auto-dispatch are not boot defaults. It also provides the classification method for legacy modules and future automated-mode opt-ins.

## Open review points

- Exact relationship to RFC643 and RFC643x1.
- Which current launcher checks belong in Stage A versus post-live observers.
- How sealed/preseeded fallback is represented in the rebuild guide without becoming a deployment recipe.

## Sources

- Cairn RFC643x2 body and metadata.
- KB `fleet-topology-reference` G1/G2/G3.
