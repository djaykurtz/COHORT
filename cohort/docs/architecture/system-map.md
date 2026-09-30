# COHORT and Zerobrain system map

## Purpose

This document establishes the top-level relationship model for the COHORT documentation. It is a design map, not a deployment recipe.

For the start-here build map that connects this relationship model to concrete blocks, site prerequisites, build order, and coverage, read [`../blueprint.md`](../blueprint.md).

## Project and subsystem boundary

**COHORT is the overall project. Zerobrain is a subsystem of COHORT and the glue that connects the project's systems.** Zerobrain connects the web dashboard, work/task systems, Swatter, Spyglass/Cairn planning and research, authorization/OPA, review, evidence, and related backend surfaces. The MCP coordinator and Copilot node cohort are other COHORT surfaces integrated through that subsystem.

Operationally, Zerobrain is analogous to a vehicle's electrical relay system: it routes control signals and state between many functions without being identical to each actuator, sensor, or display.

### Zerobrain integration subsystem

**Evidence status: subsystem role supplied by OPERATOR; implementation mapping is partial.** The coordinator is verified as one Zerobrain backend component; the complete Zerobrain implementation boundary is still being located.

The project description identifies Zerobrain as the web-backed coordination and product surface. It is expected to connect:

- the website dashboard and operator-facing views;
- task systems, the job board, and work-state tracking;
- Swatter work and closure/evidence state;
- Spyglass RFC planning, research, and decision workflows;
- authorization, OPA, and verbal-versus-key authority handling;
- review and approval workflows;
- Gary test and canary systems;
- historical or lower-priority Merit and Lessons systems.

The control plane is the source of truth for durable work state, permissions, approvals, and evidence. A local file, message, or dashboard rendering is not a substitute for the authoritative record.

### Coordinator and cohort execution surfaces

**Evidence status: coordinator and cohort interfaces are verified from source, MCP contracts, and published KBs.** They are COHORT project surfaces connected through Zerobrain, not the whole Zerobrain subsystem.

COHORT is the cooperating-agent layer around an MCP coordinator. It connects:

- Copilot CLI sessions and node identity;
- bootstrap, fleet boot, and session continuity;
- coordinator messaging, task routing, and review handoffs;
- manual-mode wake/execute/freeze behavior;
- TotemTask work chunks and proof receipts;
- identity, memory, and handoff state;
- lifecycle and Molt transitions;
- the breathing stack that provides liveness when automated operation is explicitly enabled.

The execution plane performs work and reports evidence back to the control plane. It should not become a second source of truth for durable project state.

## Relationship model

```text
Operator authority
        |
        v
Zerobrain authorization and OPA
        |
        +--> Dashboard / work views
        +--> Task board / job board / Swatter
        +--> Spyglass RFC planning and research
        +--> Review and closure evidence
        |
        v
MCP coordinator
        |
        +--> Cohort messaging and routing
        +--> Node identity and bootstrap
        +--> Manual-mode wake and work execution
        +--> TotemTask chunks and proof receipts
        +--> Memory / handoff / lifecycle
        +--> Breathing and liveness (explicit automated-mode opt-in)
        |
        v
Copilot CLI node sessions
```

## Authority lines

1. Cairn owns authoritative RFC, KB, research, seed, and scratch records.
2. Spyglass is a derived index and never outranks a Cairn source record.
3. Failure Episodes are a separate durable incident-evidence stream, not RFC/KB content.
4. Superdash is presentation and interaction surface; degraded backend state must remain visible.
5. The coordinator owns live fleet state.
6. `fleet-topology` owns canonical static host/reachability reference; it is distinct from live coordinator state.

## Boundary rules

1. **Authority is not activity.** A heartbeat, ACK, dashboard count, or proof line does not complete work.
2. **The coordinator is not the whole project or subsystem.** It coordinates agent sessions; Zerobrain is the integration glue across the broader COHORT work and authorization systems.
3. **TotemTask is a manual-mode substitution workflow.** Its plan and proof files replace coordinator-driven task dispatch while manual mode is active; they do not create a seventh durable work lane or replace coordinator task state and gated completion actions.
4. **Breathing is a mode-dependent service.** The breathing stack supports liveness and automated wake behavior when enabled; manual mode deliberately stops scheduled prompt polling and leaves nodes frozen until an explicit wake.
5. **Credentials and host details are deployment inputs.** The architecture documents their relationships without embedding live secrets.

## Current priority order

1. Coordinator, cohort messaging, and node bootstrap
2. Manual-mode operation and TotemTask
3. Zerobrain task, board, Swatter, and dashboard relationships
4. Spyglass RFC planning and research
5. Authorization and OPA
6. Identity, memory, handoff, and lifecycle/Molt
7. Review and evidence systems
8. Gary
9. Breathbus and earlier HB variants
10. Merit, Lessons, and legacy systems

## Canonical map source

The published KB `fleet-systems-services-map` is the current human-reference relationship map. This COHORT map preserves its authority boundaries while adding source-status labels and rebuild-oriented details.
