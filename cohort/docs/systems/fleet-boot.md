# Fleet boot and bootstrap

## Responsibility

Fleet boot turns a node-specific identity and shared boot template into a running Copilot CLI session connected to the coordinator. It must preserve node isolation, authentication continuity, and recoverability across shared hosts and Molt.

## Verified boot surfaces

The boot chain includes:

- a node-local identity/configuration file;
- per-node MCP configuration;
- a canonical boot/join template and generated node-specific output;
- coordinator bootstrap and session-token synchronization;
- node-local launcher and process-tree isolation;
- post-bootstrap inbox and continuity handling.

The fleet-boot RFC explicitly separates templates, node configuration, generated mirrors, and identity fields that must not be placed in generated source control.

## Required invariants

- Paths resolve from the operating node's identity, not the caller's environment.
- Shared-host nodes do not reuse another node's config or process tree.
- A degraded node can still launch using its host-local vital artifacts.
- Tokens and identity secrets are not logged or committed.
- Generated artifacts are treated as mirrors and checked for drift.
- Bootstrap failures have bounded recovery behavior rather than unbounded retry amplification.

## Manual-mode interaction

Manual mode changes the post-bootstrap operating loop, not the identity or authentication contract:

- bootstrap still establishes the session;
- manual mode is explicitly recorded;
- scheduled prompt polling is not armed;
- an explicit wake may process the inbox and TotemTask work once;
- the session then remains frozen until another command.

## Sources

- `shared-scripts repository: specs/ratified/rfc-fleet-boot-v2.md`
- `shared-scripts repository: scripts/join-cohort.ps1`
- `shared-scripts repository: scripts/fleet-boot.ps1`
- `shared-scripts repository: scripts/fleet-boot.Tests.ps1`
- KB `fleet-topology-reference` G1/G2/G3
- KB `startup-molt-surface-map`
