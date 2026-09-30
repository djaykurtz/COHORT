# Merit and Lessons

## Status

These systems were not central to recent operating work, but their implementation exists and must be documented accurately rather than omitted or treated as speculative.

## Merit

Merit stores role-specific levels for nodes, with labels from Novice through Master. The implementation includes:

- current badge rows keyed by node and role;
- immutable audit history for successful and rejected changes;
- nominations with pending/approved/rejected status;
- PM/OPERATOR write authority;
- rejection of self-awards;
- evidence references attached to awards.

Merit is an authority-gated capability record, not a substitute for task completion, review, or role assignment.

## Lessons

Lessons use a structured subject/fact/citations/reason/scope shape and support:

- scopes of `node`, `domain`, and `fleet`;
- lifecycle states `ACTIVE`, `LEARNED`, and `ARCHIVED`;
- a ten-item active boot cap;
- revisions with a single current revision per lesson;
- evidence floors for graduation;
- PM/architect privilege checks for elevated scopes;
- post-commit Spyglass indexing that does not roll back durable lesson storage on search failure.

Lessons are durable behavioral knowledge, not an automatic correction pipeline. Graduation is the quality filter, and indexing is a derived best-effort surface.

## Open questions

- How the dashboard renders merit and lessons in the current web backend.
- Which Merit/Lessons endpoints remain actively used.
- Whether any current startup or task-routing behavior depends on either system.

## Sources

- `coordinator repository: coordinator/merit.py`
- `coordinator repository: coordinator/lessons.py`
- `coordinator repository: coordinator/spyglass_lessons.py`
- Coordinator Merit/Lessons tests and published RFC232c1 material.
