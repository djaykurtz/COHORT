# Cairn and RFC lifecycle

## Responsibility

Cairn is the durable knowledge and RFC lifecycle layer associated with the coordinator. It stores design records, revisions, waves, responses, signals, votes, tags, lifecycle transitions, and deployment references.

## Verified data model

The implementation defines separate Cairn persistence alongside coordinator state. RFCs have explicit lifecycle states:

`seed -> rfc -> in_round -> ratified -> shipped`

with additional `deferred`, `superseded`, and `archived` outcomes.

RFC revisions are content-addressed with body hashes. Waves collect cohort responses and signals. Votes and lifecycle audits preserve the decision trail. Deployment records link an RFC to commit, host, actor, and rollback metadata.

## Lifecycle boundary

- RFCs are design-of-record and consensus artifacts.
- Tasks implement phased work under an RFC.
- Swatters track targeted fixes or doctrine clarification.
- Spyglass indexes content for search but does not own RFC durability.
- Superdash renders lifecycle and decision views but does not replace Cairn transitions.

The published document-lifecycle design also distinguishes staged RFC files from living operational references and requires cross-links between durable KB records and readable Markdown artifacts.

## Evidence conflict to preserve

The older living coordinator overview describes SQLite as the production database. The current coordinator README and backend selection docs state that PostgreSQL is the production write-of-record and SQLite is retained for tests/legacy compatibility after the cutover. COHORT must label the older overview as historical/stale rather than merge the two claims.

## Sources

- `coordinator repository: cairn_core.py`
- `coordinator repository: coordinator/cairn.py`
- `coordinator repository: README.md`
- `shared-scripts repository: specs/living/coordinator-overview.md`
- `shared-scripts repository: specs/ratified/rfc-document-lifecycle.md`
- KB `three-lane-routing-rfc-swat-task`
