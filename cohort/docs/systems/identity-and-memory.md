# Identity, memory, and continuity

## Scope

Identity and memory preserve what a node is, what it is allowed to do, what it has learned, and what must survive session replacement. They are related but not interchangeable.

## Verified identity model

The identity-enhancement RFC distinguishes:

- immutable/operator-controlled identity and startup fields;
- evidence-derived earned competencies;
- aspirational or in-progress competencies;
- node-owned factual session summary;
- corrections that are not silently self-removable.

Competence claims must come from completed work, reviews, and durable contributions rather than self-declaration.

The coordinator's runtime identity resolver treats the session token as authoritative and uses IP association only as a fallback when no valid token is present. It caps active in-memory tokens per node and expires buffered pre-identification handshake calls.

## Bootstrap continuity

The fleet-boot RFC identifies the continuity chain as:

- local identity file and node-specific configuration;
- bootstrap authentication and session-token synchronization;
- per-node MCP configuration;
- startup template and generated node artifacts;
- saved session/work state before lifecycle transition;
- successor bootstrap and post-transition verification.

The exact storage and coordinator API contracts for memory blocks, handoff records, and session summaries require direct source tracing before this guide can be considered complete.

## Memory blocks

The current memory-block implementation defines three bounded, typed blocks per node:

- `current_context` (bounded size);
- `fleet_model` (bounded size);
- `learned_patterns` (bounded size).

Writes are self-owned at the MCP boundary, reads are unrestricted for sharing, overflow fails rather than truncating, and writes are rate-limited. Every revision is audited with full content, rollback is point-in-time, and bootstrap checks that current content matches the latest audit row. The audit history is retained with a pinned current revision.

## Handoff

Session handoff is a coordinator continuity artifact, not a knowledge document. It is self-authored and capped at a bounded set of head pointers with one primary pointer when non-empty. In-flight commitments are typed and require subject references so a successor can resume concrete obligations instead of receiving an empty promise. Handoff validation also tracks staleness and supports bounded preview/finalize behavior.

## Non-substitution rule

A local summary, workplan, dashboard view, or memory note is not a replacement for an authoritative coordinator transition. Continuity artifacts tell a successor what to resume; they do not mark work complete or grant authority.

## Sources

- `shared-scripts repository: specs/ratified/rfc-identity-enhancement.md`
- `shared-scripts repository: specs/ratified/rfc-fleet-boot-v2.md`
- KB `fleet-topology-reference` (vital-launch and identity-file discipline)
- KB `molt-protocol`
- `coordinator repository: coordinator/identity.py`
- `coordinator repository: coordinator/memory_blocks.py`
- `coordinator repository: coordinator/session_handoff.py`
