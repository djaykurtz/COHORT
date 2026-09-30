# Swatter

## Responsibility

Swatter is the targeted-fix and operational observation system. It is a coordination artifact with assignee, deadline, stage, verdict, review, and closure state-not a knowledge article.

## Verified state model

Stages are:

- `open`
- `in_review`
- `fixed`
- `closed`

Verdicts are:

- `approve`
- `request_changes`
- `reject`

Swatter also supports a design-input sub-state, typed refile/supersede relationships, fix metadata, review history, and explicit no-fix closure dispositions.

Reviewer verdicts have deterministic stage effects:

- `in_review + approve -> fixed`;
- `in_review + request_changes -> open`;
- `in_review + reject -> closed` with rejection reason.

Closing a fixed Swatter requires a `fix_commit` or an allowed no-fix disposition. A Swatter with open design input cannot advance out of the open stage until the design review is synthesized or explicitly skipped with rationale. This prevents a design gate from being silently bypassed by a later stage transition.

## Ownership and storage

The coordinator implementation stores Swatter state in the coordinator database. The `cairn_` prefix identifies knowledge-network relationships and Spyglass indexing membership; it does not mean the rows live in the Cairn knowledge database.

Swatter owns its state and verdict. Boomerang is transport only, and return handling writes back atomically through the Swatter path.

## Relationship to other lanes

The RFC/SWAT/Task doctrine keeps Swatter distinct from RFC design-of-record and Kanban build tasks. A Swatter may promote to an RFC when cross-system, vital-life-service, multi-axis, or phased-build triggers fire.

## Sources

- `coordinator repository: coordinator/swatter.py`
- KB `three-lane-routing-rfc-swat-task`
- Coordinator Swatter and review tests.
