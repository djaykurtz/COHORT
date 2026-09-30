# COHORT system catalog

This catalog separates implementation evidence, doctrine, and unresolved project scope. It is the index for the deeper system guides and rebuild pillars.

| System | Evidence state | Current COHORT treatment |
|---|---|---|
| MCP coordinator | Implementation and tool contracts verified | Core execution-plane guide |
| Coordinator database substrate | Backend selector and recovery contract verified | Current write-of-record; test and legacy backends are explicitly labeled |
| Cairn/RFC lifecycle | Source and published lifecycle material verified | Core design/knowledge lifecycle guide |
| Spyglass | Source and tool contracts verified | Derived search/index guide |
| Swatter | Source and routing doctrine verified | Targeted-fix state-machine guide |
| Failure Episodes | Coordinator implementation verified | Separate durable incident-evidence guide |
| Coordinator database backup/recovery | Backend-aware backup and restore contract verified | Logical recovery contract; deployment paths are non-normative |
| Kanban tasks | Tool contracts, review schema, and routing doctrine verified | Durable build-work guide |
| Superdash | Service contract, dashboard source, and design guide verified | Operator dashboard guide |
| Zerobrain integration subsystem | Subsystem role defined; complete implementation boundary may span multiple surfaces | Explicit investigation target |
| OPA and privilege checks | Authorization routes, tests, and doctrine verified | Authorization guide |
| Review | API/MCP schemas and tests verified | Review/evidence guide |
| TotemTask | Manual-mode doctrine verified | Manual work planning and proof overlay |
| Manual mode | Current operating directive verified | Default operating model |
| Automated Breathbus/bb4-poll | Automated-mode specification verified | Explicit opt-in contract |
| Node runtime | Boot, identity, MCP bridge, supervision, liveness, and recycle contracts partially verified | Rebuild pillar: `rebuild/node-runtime.md` |
| Fleet boot/bootstrap | Launcher source, boot doctrine, and topology rules verified | Boot continuity guide |
| Identity and session tokens | Coordinator identity source and bootstrap contracts verified | Identity guide |
| Memory blocks | Coordinator implementation verified | Typed memory and audit guide |
| Session handoff | Coordinator implementation verified | Molt continuity guide |
| Molt/refresh | Published protocol and local artifacts verified | Lifecycle guide |
| Gary | Harness source, guide, and doctrine verified | Disposable test-system guide |
| Merit | Coordinator implementation verified; active use depends on deployment | Historical/low-priority guide |
| Lessons | Coordinator implementation and derived search adapter verified | Historical/low-priority guide |
| RFC/KB/research corpus | Knowledge inventory available through Cairn and Spyglass | Triage into keep/salvage/archive/ditch |

## Catalog rules

- A system is not marked current solely because it has a published article.
- A system is not marked obsolete solely because a newer name exists.
- Every unresolved row must have a source-discovery task or an explicit reason it is deferred.
- Every guide must distinguish normative contract, implementation, deployment, and observed runtime.
- Deployment-specific hosts, paths, ports, counts, and account details are excluded from catalog rows.
