# Source reference policy

COHORT is intended to survive host relocation and repository reshaping. File paths in the current fleet are evidence locators, not permanent architecture identifiers.

## Preferred references

Use these stable forms in new documentation:

1. **Cairn/KB/RFC IDs and slugs**  -  for doctrine, decisions, research, and durable records.
2. **Git repository + branch/tag/commit**  -  for implementation source and reproducible history.
3. **Service IDs and API contracts**  -  for deployed services (`service:superdash`, coordinator endpoints, MCP tool names).
4. **Observed-at timestamp and environment role**  -  for runtime facts.
5. **Logical artifact names**  -  for identity, handoff, backup, and manifest contracts.

Use local paths only as a temporary evidence locator inside a source note. Do not make a host, drive letter, UNC prefix, or worktree path part of a normative relationship unless the path itself is the subject of the contract.

## Relocation rule

When a source moves:

- update the locator;
- preserve the stable source ID, repository identity, service ID, or commit;
- do not rewrite the architectural claim merely because the host path changed.

## Database backup rule

Database recovery documentation must identify the database role, backend, backup format, integrity gate, retention, and restore authority. A backup path is a deployment detail, not the definition of recoverability.

## Naming and disclosure rule

This repository is published. It must not contain information that identifies the organization that hosted the original fleet, or that could assist in reaching its infrastructure.

Prohibited in all documents:

- real machine names, fully-qualified domain names, or corporate DNS suffixes
- IP addresses of any real host, including private-range addresses
- user account names, email addresses, or personal identifiers
- credentials of any kind: tokens, passwords, access tokens, API keys, or connection strings containing credentials

Permitted and preferred:

- **Role names** for hosts and nodes: "the coordinator host", "a worker host", "the PM node", "the
  architect node", "a co-tenant node". The original host and node codenames are not used.
- **Placeholders** for anything that must show shape rather than value, for example `<host-address>`, `<FLEET_ROOT>`, or `<FLEET_BEARER_TOKEN>`. State where the real value comes from.

Nothing in this repository should allow a reader to locate or contact the original systems.

## Genericity rule

These are **design documents**, not a deployment manifest. The goal is to rebuild the system on
new hardware, not to reproduce the original deployment. Write every page as generically as the
design allows:

| Do not record | Record instead |
| --- | --- |
| Host or node codenames, machine names | The role: coordinator host, worker host, PM node, architect node |
| IP addresses, including loopback literals | "loopback only", "a private interface", `<coordinator-host>` |
| Port numbers | Named placeholders (`<COORD_PORT>`, `<DB_PORT>`, `<DASHBOARD_PORT>`, `<DAEMON_PORT>`) and the rule that governs them, for example "the database listens on loopback only" |
| Drive letters, absolute paths, UNC paths, install locations | Logical locations (`<repo>`, `<node-home>`, `<shared-root>`, `<secrets-dir>`, `<backup-destination>`) |
| Service account names, group memberships, specific grants | The privilege principle, for example "the database runs as a low-privilege service account" or "the application role cannot create databases; restores need a separate administrative credential" |
| Exact package, runtime, or binary version pins, and hashes | The requirement and its category ("a PostgreSQL 16-class server", "an async PostgreSQL driver", "a single lock file enforced at build time") |
| Dates, timestamps, commit SHAs, line numbers, incident and ticket IDs | The mechanism and the principle. Repository-relative file names may be kept as source anchors where they help a reader find the reference implementation. |
| Measured counts from one deployment (rows, tables, alerts, sizes) | Orders of magnitude, only where they inform a design decision |
| Scheduled-task, service, or file names specific to one deployment | What the job does, its cadence class, and its failure contract |

Product and subsystem names that describe the design itself (ZeroBrain, COHORT, Cairn, Spyglass,
Superdash, Breathbus, Swatter, TotemTask, Molt, Gary) are kept. They are concepts, not locations.

**Deliberate exceptions: [`personas/`](personas/) and [`../zerobrain/`](../zerobrain/).** The persona files record the character of
each node the cohort actually had, so they use the nodes' own names. Those names are the family's
names, not infrastructure. Every other rule still applies inside `personas/`: no host names,
addresses, paths, dates, IDs, or credentials. The ZeroBrain screenshots and dashboard code keep node
names for the same reason, with host names, addresses and credentials masked. Everywhere else in
the repository, nodes are named by role.

