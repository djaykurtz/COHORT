# Superdash

## Responsibility

Superdash is the operator-facing dashboard service. It renders derived views and provides operator interaction paths over coordinator APIs; it is not the durable owner of task, Swatter, RFC, authorization, or lesson state.

## Verified service boundary

- Canonical service: `service:superdash`.
- Canonical host role: the dashboard service runs on a host resolved through the service registry.
- Canonical port placeholder: `<DASHBOARD_PORT>`.
- Source anchor: shared-scripts repository: `superdash-v2`.
- The server serves static UI assets and exposes health, version, deployment-status, and lane-health endpoints.
- Other dashboard API reads are proxied to the coordinator through the configured coordinator endpoint.
- The service exposes its own source revision and cache version in deployment responses so UI provenance is observable.
- The coordinator sends selected lifecycle events to a dashboard render-cache channel over its outbox/SSE integration.

## Design and deployment

`DESIGN.md` is the dashboard design-token source. CSS/JS should consume the canonical tokens rather than duplicate raw visual values. The deployment source and dashboard test suite are separate from the coordinator repository and are reached through the service registry/topology.

## Safety boundary

Dashboard actions still pass through coordinator authorization, CSRF, role, OPA, and audit gates. A dashboard display is derived state and must not be treated as evidence that a backend transition succeeded.

## Sources

- `shared-scripts repository: superdash-v2/superdash-server.py`
- `shared-scripts repository: superdash-v2/DESIGN.md`
- `shared-scripts repository: tests/superdash-v2/README.md`
- Coordinator `resolve_service_uri('service:superdash')`
- KB `fleet-topology`
