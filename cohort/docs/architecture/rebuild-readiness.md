# Rebuild readiness

## Current assessment

COHORT reproduces the architecture, authority boundaries, operating modes, and subsystem relationships. The [`docs/rebuild/`](../rebuild/) section adds the deep reconstruction layer for five high-value areas plus a decommission checklist: backend hosting, the operator dashboard, the labor-division model, the research-and-development process, node runtime, and pre-retirement capture.

The goal of that section is explicitly **reconstructable design intent**, not a byte-faithful or state-faithful clone. It records why decisions were made, which properties are load-bearing, and which failures the guards exist to prevent, so that a reimplementation may differ in specifics and still be correct.

State-faithful recreation remains out of scope for this repository because durable data and live secrets are deliberately not stored here.

## Closed by the rebuild section

- Coordinator service inventory, process model, configuration surface, API and MCP contracts, auth, and event streams
- Superdash server, front-end architecture, browser-to-coordinator route map, design tokens, and dashboard authority handling
- Legacy-versus-current dashboard separation
- Role catalog, authority model, three-lane work routing, task and review lifecycle, coordination protocol
- Cairn data model, RFC pipeline, council and consensus, SWAT process, knowledge lifecycle, and engineering doctrine
- Node hosting, launch, configuration, MCP bridge connection, liveness, keepalive, and recycle concepts
- Decommission capture checklist for preserving design, data, source, operations, and acceptance evidence before retirement
- Load-bearing invariants and scar-tissue indexes for each of the above

## Still required for a faithful recreation

The rebuild set now covers the coordinator schema reference, core contracts, MCP catalog, backend reference tables, and starter kit. The remaining open work is narrower:

### 1. Non-Windows port

- Port launcher, supervision, scheduled job, and local IPC assumptions to the target OS.
- Re-run node launch, wake, recycle, and MCP bridge acceptance checks on that OS.

### 2. Real restore automation

- Implement the restore drill automation rather than documenting the contract only.
- Prove coordinator and Cairn restore order with integrity, hash, and post-restore derived-index rebuild receipts.

### 3. Per-site Phase 0 setup

- Choose source hosting, secret handling, backup destination, clock synchronization, service accounts, and network reachability for the target site.
- Seed operator authority, node identities, memory/handoff starting state, and initial TotemTask inputs without copying live secrets.

### 4. Acceptance package execution

- Run coordinator health and MCP smoke tests.
- Run Cairn/RFC/KB lifecycle tests.
- Run Superdash degraded-state and API contract tests.
- Run OPA/review/evidence gate tests.
- Run manual-mode wake/freeze tests, and automated-mode tests only when explicitly authorized.

## Readiness rule

Do not claim a new deployment is equivalent until the database restore, service wiring, authority bootstrap, identity seed, node runtime checks, and acceptance package have all produced durable evidence.
