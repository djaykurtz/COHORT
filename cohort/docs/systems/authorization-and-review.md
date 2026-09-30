# Authorization, OPA, and review

## Scope

Authorization answers whether an action is permitted. Review answers whether a completed change is acceptable. They are separate gates.

## Verified authority layers

- **Operator directives** establish top-level intent, exceptions, freezes, and bounded authority.
- **PM delegation** routes approved work to a node within the PM's normal authority.
- **OPA grants** provide time-boxed or single-use elevation for actions that require explicit operational authority. Grants record the target node, scope, directive, reason, delegation chain, and expiry.
- **Role and task gates** constrain who may build, review, close, or perform protected lifecycle actions.

An OPA grant is not a blanket replacement for role gates, evidence, or review. It authorizes the bounded action described by the grant.

The coordinator REST authorization middleware fails closed when `AUTH_TOKEN` is unset, applies security headers, and keeps MCP/bootstrap/SSE paths on their handler-level authentication contracts rather than double-gating them through dashboard middleware. Dashboard callers are represented separately from node-token callers, and sensitive identity fields are filtered from public responses.

Direct OPA REST operations are restricted to OPERATOR/DASHBOARD authority. Delegated grants preserve the OPERATOR -> delegator -> target chain, reject forged `delegated_by` values, and record audit history.

The authority model also has a behavioral contract: an OPERATOR's verbatim directive, scope, and delegation chain captured in the guestbook/message archive is the authority instrument. Within that already-blessed scope, nodes should re-cite the captured directive rather than repeatedly re-ask. Novel, out-of-scope, or genuinely ambiguous actions still require a new decision.

The coordinator's privilege check evaluates identity first, then the required role, then an author allowlist where applicable, then a valid OPA elevation, with a deprecated legacy grant fallback. Callers can explicitly disable the OPA escape for irreversible or PM-only actions.

OPA scope is explicit: empty means a single action, a numeric value is a bounded task duration in minutes, and named scopes represent bounded time windows. Action-scoped grants are consumed on the first privileged use; expiry and revocation are checked per call.

## Review boundary

Review should verify the actual artifact and its source lineage, not merely the author's status message. The coordinator task/review system records reviewer eligibility, review acknowledgements, and the evidence required to move work toward closure.

For vital launch or lifecycle surfaces, the review bar is higher: rollback, tracked source, independent cosigns, topology/profile isolation, and Fleet Topology consultation are all part of the required trail.

For tasks carrying strict review metadata, the coordinator can verify that the reviewer's claimed checkout is in the declared base-to-head ancestry range. A strict mismatch is rejected; a non-strict mismatch is recorded for audit.

## Verbal versus key authority

The relationship between operator words, coordinator-issued OPA keys, and ordinary node credentials must be documented from the coordinator authorization implementation. This page records the verified distinction between directive and grant but does not invent an authentication flow that has not yet been traced.

## Sources

- Live coordinator tools: `grant_opa`, `verify_opa`, `update_task`, review acknowledgement and verdict tools.
- Task delegation skill and coordinator protocol.
- KB `three-lane-routing-rfc-swat-task`.
- KB `fleet-topology-reference` G1/G2/G3 vital-launch discipline.
- Local coordinator source: `coordinator repository: README.md`.
- `coordinator repository: coordinator/api_auth.py`
- `coordinator repository: tests/test_opa_delegation_chain.py`
- `coordinator repository: coordinator/api.py` review and OPA routes
- `coordinator repository: coordinator/database.py` `check_privileged` and OPA v2 implementation
- KB `operator-verbatim-directive-as-standing-authority`
