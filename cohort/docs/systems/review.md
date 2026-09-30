# Review system

## Responsibility

Review is the acceptance layer between implemented work and durable closure. It verifies the artifact, reviewer eligibility, evidence lineage, and required verdict before the owning task or Swatter can advance.

## Verified task review contract

Task review acknowledgements carry:

- task ID;
- reviewer identity;
- verdict;
- optional notes;
- claimed checkout SHA;
- base SHA;
- review method.

When strict review metadata is enabled, the coordinator verifies the reviewer's checkout ancestry against the declared base-to-head range. A mismatch is rejected in strict mode and recorded as an audit event in non-strict mode.

Task review acknowledgement is distinct from a builder's status update. Review acknowledgements are required before review-to-done closure.

## Verified Swatter review contract

Swatter review uses explicit verdicts:

- approve;
- request_changes;
- reject.

The Swatter state machine records current reviewer, current verdict, previous reviewers, and audit events. Re-routing excludes prior reviewers to avoid ping-pong and escalates when the eligible pool is exhausted.

## Separation from completion

Review is not a replacement for the authoritative completion action:

- the builder must land or otherwise produce the required evidence;
- the reviewer verifies the actual artifact;
- the coordinator records the review acknowledgement/verdict;
- the owning task or Swatter transitions only through the accepted lifecycle gate.

## Review depth

Review depth is scope-sensitive:

- one independent axis is the default for narrow work;
- two independent axes apply near vital life-services or doctrine;
- triple-gate review applies to vital launch/lifecycle surfaces such as QC-REFRESH, Molt machinery, `bb4-poll`, and life-services confirmation.

Vital-launch review also requires an armed rollback, tracked source, topology/profile-isolation review, and explicit Fleet Topology citation.

## Sources

- `coordinator repository: coordinator/api.py` `submit_review_ack`
- `coordinator repository: coordinator/mcp_handler.py` task and review schemas
- `coordinator repository: coordinator/swatter.py`
- Coordinator review and Swatter tests
- KB `three-lane-routing-rfc-swat-task`
