# Zerobrain control plane

## Evidence status

COHORT is the overall project, and Zerobrain is the integration subsystem/glue connecting its web dashboard, work systems, Cairn/Spyglass planning and research, authorization/OPA, review, evidence, and related backend surfaces. The locally available implementation evidence is strongest for the coordinator backend and Superdash integration; the complete Zerobrain implementation boundary still needs to be located.

## Verified local implementation

The coordinator repository is one Zerobrain backend component within COHORT. It exposes:

- FastAPI REST routes and an MCP JSON-RPC endpoint;
- coordinator database access and task/lifecycle APIs;
- Cairn/RFC/seed/KB and Spyglass search surfaces;
- Swatter and review routes;
- Merit and Lessons routes;
- dashboard-specific reads, writes, SSE streams, and outbox dispatch;
- dashboard caller handling distinct from node-token callers.

The coordinator server dispatches Cairn lifecycle events to a dashboard render-cache channel and exposes dashboard-oriented API projections. It is therefore an integration hub, but not proof that all web UI code lives in the coordinator repository.

## Superdash boundary

The service registry identifies the operator dashboard as Superdash. The coordinator exposes APIs and event streams consumed by that service. The dashboard is a derived presentation and interaction surface; durable task, Swatter, RFC, authorization, and evidence state remains in authoritative backend records.

The Superdash source resolves through service discovery to the dashboard source repository. Its server serves the static operator UI, exposes health/version/deploy/lane-health endpoints, and proxies appropriate read requests to the coordinator endpoint. The server embeds its own source revision and cache version in runtime responses, making deployed UI provenance observable.

## Derived search boundary

Spyglass is a separate, rebuildable search index used by coordinator/Cairn content and dashboard search consumers. Search corruption or index failure must not invalidate durable source rows or block coordinator readiness.

## Authority boundaries

- Cairn owns authoritative RFC, KB, research, seed, and scratch records.
- Spyglass is derived search only and never outranks Cairn.
- Failure Episodes remain a separate incident-evidence stream.
- Superdash presents coordinator/Cairn state and must show degraded errors rather than silently empty results.
- Coordinator state is the live fleet-state truth.
- Fleet Topology is the static host/reachability reference, not a replacement for live coordinator state.

## Remaining source work

- Locate and identify the complete Superdash repository and deployment source.
- Trace browser routes to coordinator endpoints and SSE channels.
- Trace dashboard authentication and operator authority handling.
- Map which parts of the user-described Zerobrain web backend are outside this coordinator repository.
- Separate current routes from legacy `/dashboard` aliases and retired UI bundles.

## Sources

- `coordinator repository: README.md`
- `coordinator repository: coordinator/api.py`
- `coordinator repository: coordinator/server.py`
- `coordinator repository: coordinator/mcp_handler.py`
- KB `fleet-topology`
- KB `breathbus-p4-definitive-spec` and Spyglass implementation sources
- Coordinator `resolve_service_uri('service:superdash')`
- `shared-scripts repository: superdash-v2/superdash-server.py`
- `shared-scripts repository: superdash-v2/DESIGN.md`
