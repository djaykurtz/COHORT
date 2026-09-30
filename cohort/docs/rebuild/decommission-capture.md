# Retiring a deployment: what to carry off

## Purpose

A COHORT deployment accumulates things that exist only on its hosts. This checklist names the
**categories** that must be captured before those hosts are retired, so that a later rebuild is a
port rather than a reimplementation. It is generic: apply it to any deployment.

Rule: an artifact counts as captured only when it is **verified** (bundle verification, a restore
into scratch, a hash that matches) **and** stored somewhere that does not share fate with the hosts.
A copy on another disk inside the same deployment is staging, not capture.

## 1. Source code, with every ref

| Category | Why |
| --- | --- |
| Coordinator repository | The reference implementation of the control plane, the MCP tool surface, and the schema |
| Dashboard repository, including its deploy tree | The reference UI and its promote flow |
| Liveness daemon repository | The reference daemon |
| Shared-scripts repository | Launchers, boot prompt, molt engine, skills, and specs |
| Node templates and node homes | Instructions, skills, and continuity notes worth keeping |

Method: bundle every repository with all refs (`git bundle create <name>.bundle --all`), run
`git bundle verify`, record SHA-256 sums, then push the bundles to a durable origin. Capture
**working clones as well as shared remotes**: working clones often hold refs that were never pushed.
Check every host, because each host's clones can differ.

**Keep the bundles private.** Old commits often contain credentials, such as legacy launchers or
deploy notes with literal tokens. Only sanitized documentation is suitable for publication.

## 2. Durable data (only if the new deployment wants the history)

A new deployment can start empty. Carry data only if the history itself is wanted.

| Category | Capture method | Proof |
| --- | --- | --- |
| Coordinator database | Logical dump in the database's custom/compressed format, plus a roles/globals dump | A restore into a scratch database that passes a parity check on table count, core row counts, and the newest primary key |
| Authoritative schema | A schema-only dump | This is the real DDL. Do not trust a migration baseline that has never been proven. |
| Knowledge store (Cairn) | An online backup through the engine's backup API, never a raw copy of a live file | Open the copy and count records |

Before publishing anything derived from the knowledge store, triage it
([`operations/content-triage.md`](../operations/content-triage.md)). Never publish raw dumps.
They contain messages, hashed tokens, and operator directives.

## 3. Design knowledge that is not in git

Record these **as principles in the design docs**, not as copied files:

- the real dependency set of each service, turned into the rule "one lock file, enforced at build
  time";
- how each service is supervised and what its restart contract is;
- what each scheduled job does, its cadence class, and its failure contract;
- which settings mattered for the database and the connection pools.

Deployment-specific names, paths, accounts, and version numbers do not need to survive.

## 4. Secrets: never carry, always regenerate

Fleet bearer tokens, node session tokens, lifecycle tokens, database role passwords, and personal
access tokens are **not** copied. The rebuild procedures regenerate every one of them. Revoke the
old ones when the hosts are retired.

## 5. Order of operations

1. Bundle every repository on every host, then verify.
2. Dump and restore-verify the durable data, if it is wanted.
3. Fold any remaining design knowledge into these docs.
4. Move the bundles and dumps off the deployment, then re-verify the hashes at the destination.
5. Revoke the credentials.
