# Work routing and evidence

## Three durable lanes

The fleet uses distinct RFC, SWAT, and Task lanes:

- RFC: design-of-record, architectural decisions, cross-system contracts, and doctrine.
- SWAT: targeted fixes, narrow doctrine clarification, and observations requiring triage or remediation.
- Task: PM-routed build work and phased execution under an existing design.

The first matching decision in the published decision tree determines the lane. The lanes may reference one another, but a task is not a substitute for design ratification and a SWAT is not a substitute for multi-phase RFC work.

## Evidence boundary

The authoritative coordinator-side action is the completion event. A local proof file, dashboard state, message, or plan entry is only a receipt or coordination aid.

Manual-mode TotemTask adds:

- a shared plan containing per-node work chunks;
- node-owned append-only proof receipts;
- PM reconciliation of those receipts against the actual coordinator action.

This preserves the same completion gates while reducing wake-time dispatch overhead.

## Review and closure

Build work normally moves through ready, in-progress, review, and done. Review acknowledgements, verdicts, fix citations, and acceptance evidence are distinct from the builder's claim. A failed or rejected coordinator action means the work is not complete even if the proof file says otherwise.

When a task carries PR ancestry metadata, review can include an at-source checkout verification from base SHA to head SHA. Strict tasks fail closed on an ancestry mismatch; non-strict tasks retain the mismatch as audit evidence. This makes a review receipt evidence about the reviewed artifact rather than only a statement about the reviewer's intent.

## Sources

- KB `three-lane-routing-rfc-swat-task`.
- KB `totemtask-manual-mode-kanban-workflow`.
- Live coordinator task, SWAT, RFC, review, and evidence tool contracts.
- `coordinator repository: coordinator/api.py` `submit_review_ack` route.
- `coordinator repository: coordinator/mcp_handler.py` task/review schemas.
