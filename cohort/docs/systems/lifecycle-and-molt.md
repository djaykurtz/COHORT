# Lifecycle and Molt

## Responsibility

Molt is the controlled lifecycle transition for replacing a node session while preserving required continuity and enforcing safety gates. It is not an ad-hoc process kill.

## Current standard

The current self-Molt path uses the local TrueMolt skill and `QC-REFRESH.ps1`. The older remote request/approval/execute sequence is retained as historical protocol material, not as the current self-Molt path.

## Verified gates

- A node must not self-trigger a Molt before the minimum dwell interval without an explicit exception.
- Normal session duration and tool/activity values are directional context, not automatic triggers.
- Moratorium, co-tenant safety, recovery, and post-fire observed-runtime checks remain required.
- The node saves continuity state before the point of no return.
- The post-Molt session bootstraps with the persistent identity/session token and re-establishes continuity.
- A node cannot self-authorize protected lifecycle states through the PM-only lifecycle setter. The node-callable path uses the benign `saving` state followed by `confirm_state_saved`.

## Continuity surfaces

The Molt design depends on:

- durable workplan or handoff state outside the dying session context;
- identity and session-token persistence;
- co-tenant and topology checks;
- a verified QC-REFRESH artifact;
- successor bootstrap and observed-runtime confirmation.

The exact serialization and ownership of each continuity artifact requires source-level documentation in the identity/memory guide.

## Sources

- KB `molt-protocol`.
- KB `molt-freshness-triangle-doctrine`.
- KB `fleet-topology` and `fleet-topology-reference`.
- Local fleet launcher and QC-REFRESH artifacts, to be cited after at-source inspection.
