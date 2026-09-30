# COHORT source authority model

This page defines how evidence is classified for the documentation project. It is not an inventory of one deployment. A system is not treated as documented merely because it has a name or appears in a message. Each relationship must be tied to an authoritative source.

## Source authority levels

| Level | Meaning | Use |
|---|---|---|
| A | Live service behavior, canonical source code, or an operator-authoritative current contract | May establish current behavior when provenance and scope are recorded |
| B | Published doctrine maintained by the responsible system owners | May establish intended contracts; verify implementation separately when behavior matters |
| C | Generated artifacts, workplans, dashboards, manifests, or node-local configuration | Useful as evidence of a rendered or deployed state; not authoritative for ownership or completion |
| D | Messages, historical notes, memory, or unverified descriptions | Discovery input only; cannot establish a normative relationship by itself |

## Required investigation

When documenting a subsystem, identify:

- the canonical repository or service contract;
- the durable data owner;
- whether a dashboard, search index, plan, or proof file is derived;
- the current operating mode and whether automated behavior is enabled;
- the authority path for privileged actions;
- the backup, restore, and acceptance evidence needed to recreate the subsystem;
- any historical or stale source that conflicts with the current contract.

## Known source conflict

Older documentation may describe a previous production backend, launch process, liveness model, or storage layout. Current runtime configuration and the canonical implementation source win for present-state behavior; the older source remains historical context only. Record the conflict in `conflict-log.md` instead of merging incompatible claims.

## Evidence rules for future pages

Every system page should include:

1. authoritative sources and freshness;
2. owned state and external state;
3. inbound and outbound interfaces;
4. lifecycle and failure behavior;
5. manual-mode and automated-mode behavior;
6. unresolved questions and conflicting sources.

Repository-relative source anchors are acceptable, for example `coordinator repository: coordinator/api.py` or `shared-scripts repository: scripts/join-cohort.ps1`. Absolute paths, host names, addresses, account names, timestamps, and deployment-specific counts are not part of the authority model.
