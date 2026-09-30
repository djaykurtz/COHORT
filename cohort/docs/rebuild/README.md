# Rebuild documentation

Start with [`../blueprint.md`](../blueprint.md). It is the top-level map of the system's building blocks, connections, site prerequisites, build order, and coverage. This directory is the deeper rebuild layer behind that map.

## Purpose

This section exists so the coordination system can be rebuilt after any particular deployment is retired. The repository should survive host relocation, repository reshaping, and infrastructure replacement.

The goal is **not** a byte-faithful clone of the original deployment. The goal is that a competent engineer or AI agent, with no access to the original machines, could rebuild the system with the same load-bearing properties and better local choices where appropriate.

Design intent is the primary payload. Concrete specifics are used only when they explain a mechanism, invariant, or failure contract; deployment identifiers are replaced with roles, placeholders, service IDs, and repository-relative anchors.

## How these documents are structured

Every document in this section separates three different kinds of claim, and never blurs them:

| Layer | What it is | How to treat it |
| --- | --- | --- |
| Reference implementation | Read at source from code, config, specs, or runtime observation | Evidence for how one implementation satisfied the design |
| Design intent and rationale | Why a decision was made, what it traded away, what failure it prevents | The reusable payload |
| Assessment | The author's engineering opinion about what to keep, simplify, or replace | Explicitly opinion, not evidence |

Each document also carries an explicit **unresolved** section. An honest gap is more useful than a confident guess, because a guess will be trusted by a future rebuilder who cannot check it.

## The most important sections

If you are rebuilding and can only read a little, read the **load-bearing invariants** section of each document. Those state the properties a reimplementation must preserve for the system to work at all, separated from incidental implementation choices. Everything not listed there is negotiable.

The second priority is the **failure modes and scar tissue** material. A large fraction of the rules, guards, and gates in this system exist because something broke. A rebuild that does not understand those failures will reintroduce them.

## The five pillars plus checklist

| Document | Scope |
| --- | --- |
| [`backend-hosting.md`](backend-hosting.md) | The coordinator service, its database, API and MCP surfaces, auth, event streams, and how to stand the backend up on fresh hardware |
| [`website-superdash.md`](website-superdash.md) | The operator dashboard: server, front-end architecture, browser-to-API route map, design system, and deployment |
| [`labor-division.md`](labor-division.md) | How the agent workforce is organized and governed: roles, authority, work routing, task and review lifecycle, coordination protocol |
| [`rnd-processes.md`](rnd-processes.md) | How the cohort thinks, decides, and learns: the RFC pipeline, Cairn knowledge store, council and consensus, SWAT, knowledge lifecycle, and engineering doctrine |
| [`node-runtime.md`](node-runtime.md) | How an individual agent node is hosted, launched, configured, connected, kept alive, and recycled |
| [`decommission-capture.md`](decommission-capture.md) | The generic checklist of what to carry off a deployment before retiring it |
| [`starter-kit.md`](starter-kit.md) | Seed content for a new site: role catalog, startup-instruction templates, core skill specifications, first doctrine articles |
| [`core-contracts.md`](core-contracts.md) | The implementable contract: auth, the bootstrap algorithm, first-node tools, state machines, restart lever, restore proof, manual-mode boot |
| [`schema-reference.md`](schema-reference.md) | Every coordinator and Cairn table, with columns, keys and enums, plus recommended v2 DDL |
| [`backend-reference-tables.md`](backend-reference-tables.md) | Every coordinator environment variable and REST route |
| [`mcp-tool-catalog.md`](mcp-tool-catalog.md) | The coordinator's full MCP tool surface: every tool, its purpose, and its parameters |

## Relationship to the rest of the repository

The existing [`docs/systems/`](../systems/) pages remain the concise per-subsystem orientation. This section is the deep, rebuild-grade layer beneath them. Where the two disagree, correct them into agreement or record any genuine contradiction in [`conflict-log.md`](../conflict-log.md) instead of silently merging the claims.

The evidence rules in [`source-reference-policy.md`](../source-reference-policy.md) apply here in full. Host names, drive letters, UNC prefixes, and worktree paths are evidence locators, not architecture. They are not requirements for a rebuild.

## Security constraint

No document in this section may contain live credentials, node session tokens, personal access tokens, API keys, credential-bearing connection strings, host addresses, account names, or identifiers from a previous organization. Where a secret is structurally relevant, only its shape and provenance are recorded.
