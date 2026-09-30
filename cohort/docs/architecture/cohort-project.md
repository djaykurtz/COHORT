# COHORT project architecture

## Project definition

COHORT is the overall project for making cooperating Copilot CLI systems work together through a coordinator and the connected Zerobrain systems.

## Zerobrain subsystem

Zerobrain is the integration glue inside COHORT. It connects the web dashboard, task and job systems, Swatter, Cairn/Spyglass RFC planning and research, authorization/OPA, review, evidence, and related backend services.

A useful operator analogy is a car's electrical relay system: Zerobrain is not every actuator or instrument, but most functions depend on it to connect control signals, state, authority, and feedback. A relay-system failure can make otherwise healthy subsystems appear disconnected; a dashboard or node should not be mistaken for the relay layer itself.

Zerobrain is not synonymous with the whole COHORT project:

- COHORT includes the Copilot CLI node cohort and its execution/lifecycle surfaces.
- Zerobrain connects and coordinates the broader system surfaces.
- The MCP coordinator is a COHORT execution/control component integrated with Zerobrain.
- Superdash is a Zerobrain-facing operator presentation surface.

## Rebuild principle

Rebuild guidance should preserve the relationships and authority boundaries, not reproduce historical host paths or workforce arrangements:

- Zerobrain integrates systems; it does not make derived dashboards authoritative.
- Coordinator state is authoritative for live fleet state.
- Cairn state is authoritative for RFC, KB, research, seed, and scratch records.
- Spyglass is a derived search layer.
- TotemTask is the manual-mode operating substitution.
- Node identity, memory, handoff, Molt, and liveness are COHORT execution concerns integrated through the coordinator.

## Evidence status

The project hierarchy is operator-defined and now documented as the top-level architecture. Specific implementation repositories and service boundaries remain source-mapped per subsystem, with unresolved items tracked explicitly in `docs/conflict-log.md`.
