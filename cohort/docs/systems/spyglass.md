# Spyglass

## Responsibility

Spyglass is the dedicated full-text search/indexing surface for Cairn knowledge content. Its purpose is to decouple search indexing from the primary knowledge database so index size, corruption, and rebuild behavior do not become coordinator-startup blockers.

## Verified implementation model

- Spyglass uses a separate SQLite/FTS5 database.
- The path and size cap are configurable.
- RFC/seed/KB/scratch content can be indexed into the derived search database.
- The index is rebuildable from durable source content.
- Malformed or corrupt index files are quarantined rather than deleted, then rebuilt within a bounded retry budget.
- Corruption health is advisory and must not gate coordinator readiness.
- Search/index failures can degrade to a soft error while durable source rows remain committed.

## Relationship to lessons

Lessons are durable coordinator-side rows. A post-commit adapter indexes lessons into Spyglass with stable `LESSON-{id}` document IDs. If indexing fails, the lesson remains durable and the failure is recorded rather than rolling back the lesson.

## Open boundaries

The complete relationship between Spyglass, RFC/seed/KB lifecycle, the web dashboard, and external research views requires tracing the Cairn service/API routes and rendered dashboard consumers.

## Sources

- `coordinator repository: coordinator/spyglass.py`
- `coordinator repository: coordinator/spyglass_lessons.py`
- Coordinator tests `test_spyglass.py` and Spyglass-related SWAT tests.
- KB entries migrated into Spyglass, to be catalogued by lifecycle.
