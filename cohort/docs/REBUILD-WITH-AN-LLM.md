# Rebuilding COHORT with an AI model

This page is written for a future AI model (or an engineer directing one) that has been handed this
repository and asked to rebuild COHORT. Read it first, then follow it.

## What you have

| Material | Where | Authority |
| --- | --- | --- |
| The map: building blocks, connections, build order, trip hazards | [`blueprint.md`](blueprint.md) | Start here |
| Deep rebuild guides, one per area | [`rebuild/`](rebuild/) | Design intent, invariants, rebuild steps, acceptance tests |
| Seed content: roles, startup templates, skill specs, first doctrine | [`rebuild/starter-kit.md`](rebuild/starter-kit.md) | Copy and adapt |
| Implementable contracts: auth, bootstrap, first tools, state machines, restart, restore | [`rebuild/core-contracts.md`](rebuild/core-contracts.md) | Build phase 1-2 from this |
| Database schema, every table, with v2 DDL | [`rebuild/schema-reference.md`](rebuild/schema-reference.md) | Write the DDL from this |
| The coordinator's full tool surface, env vars, routes | [`rebuild/mcp-tool-catalog.md`](rebuild/mcp-tool-catalog.md), [`rebuild/backend-reference-tables.md`](rebuild/backend-reference-tables.md) | Contract shape |
| What the running system looked like, and the dashboard code | [`../zerobrain/`](../zerobrain/) | Visual reference; runnable front end |
| Who the original nodes were | [`personas/`](personas/) | Character and lineage, not operations |
| Per-subsystem orientation | [`systems/`](systems/), [`architecture/`](architecture/), [`operations/`](operations/) | Short summaries |
| Reference source code and prior research | **Not in this repository.** A separate private archive may be available (see below). | Use it as a reference implementation, not as a spec |

Every guide separates **reference implementation** (what the original did), **design intent** (why),
and **assessment** (opinion). When they disagree, design intent wins. Every guide also lists what is
**unresolved**. Do not guess past those items; ask the operator.

## Reading order

1. [`blueprint.md`](blueprint.md), in full.
2. [`rebuild/README.md`](rebuild/README.md), then the **load-bearing invariants** section of each
   guide in `rebuild/`. Those are the properties that must survive any reimplementation.
3. Section 7 of the blueprint ("What a new site will trip over") and the pitfalls section of
   [`rebuild/backend-hosting.md`](rebuild/backend-hosting.md).
4. For each phase you are about to build, the matching deep guide in full.

Do not read everything before starting. Read the map and the invariants, then read deeply per phase.

## How to run the rebuild

Follow the blueprint's build order (section 5). For each phase:

1. **Confirm the site decisions first.** Ask the operator about the eight up-front decisions in
   blueprint section 6: host count, OS, manual versus automated mode, MCP bridge or direct, roles,
   Cairn engine, dashboard authentication, alert destination. Do not assume the original answers.
2. **Implement from the design, consulting the reference source where it helps.** Ports, paths,
   versions and names in the reference are incidental. Invariants are not.
3. **Pass that phase's acceptance tests** before moving on. The tests are in each guide.
   Phase 1 is not done until a backup has been restored into scratch and checked.
4. **Record what you changed and why** in the new deployment's own design records. The original
   cohort's habit was to turn every correction into a rule with a reason; keep it.

## Guardrails

- **Never block the operator.** In the original, a blocking prompt could freeze a session. Use the
  coordinator's messaging, not an interactive prompt, for anything asynchronous.
- **Verify, do not assert.** "Built" means landed where the next consumer can check it. "Ready"
  means the end-to-end path ran. "Backed up" means restored.
- **Secrets are never carried over.** Generate new tokens and passwords at the new site.
- **Start in manual mode** (the operator relays; nothing polls) unless the operator explicitly opts in
  to automated mode, and make every gate aware of the mode.
- **Keep the persona names for personas only.** Operational documents name nodes by role.

## If the private archive is available

The operator kept one private directory with everything this public repository deliberately omits.
Its own `README.md` explains the layout. In short:

- `2-source/plain/`: the latest reference source of the coordinator, shared scripts, liveness daemon,
  and dashboard, as plain files. `2-source/bundles/` holds full git history for every repository.
- `3-knowledge/cairn-archive/`: every RFC, seed and knowledge article the cohort wrote, one Markdown
  file per item. Mine it for ideas, triage it (see [`operations/content-triage.md`](operations/content-triage.md)),
  and rewrite what you keep. Do not bulk-import it.
- `4-private-raw/`: verbatim node identity records and role instructions behind the personas.

That archive is **not sanitized**. It contains original names, dates and incident history. Nothing
from it goes into a public document without applying the
[genericity rule](source-reference-policy.md).

## What cannot be rebuilt from here

The trust between the operator and each node was earned over time. The same goes for the specific
conversations and the feel of a system learned by hand. The docs give a new cohort the design, the
rules and a lineage; it will have to earn the rest.
