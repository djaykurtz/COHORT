# Knowledge and research lifecycle

## Cairn owns current knowledge

Cairn is the authoritative source for:

- operational doctrine;
- current runbooks and contracts;
- RFCs and their lifecycle;
- research records, seeds, and scratch evidence;
- links and provenance needed to reconstruct decisions.

Operationally load-bearing doctrine stays in Cairn even when Spyglass indexes it.

## Spyglass migration

Research-shaped, bulky, external, or long-form material may move through the two-step migration pattern:

1. ingest the full body into Spyglass using the original Cairn slug and enriched provenance tags;
2. replace the published Cairn body with a pointer stub containing the title, summary, Spyglass ID, retrieval hint, and migration provenance.

Archived records use the one-step variant because an archived Cairn article cannot be edited; the archived source remains preserved while the full body is indexed in Spyglass.

## What must not migrate

Do not move current operational doctrine, prohibitions, runbooks, schemas, or contracts out of Cairn merely because they are long. Search convenience cannot outrank source authority.

## Triage

- Research with reusable patterns becomes a candidate or Spyglass pointer.
- Ratified RFC commitments remain decision records.
- Historical or superseded material remains discoverable but is labeled.
- A Spyglass result always requires source verification in Cairn before it becomes current guidance.

## Sources

- KB `cairn-spyglass-migration-pattern`.
- `coordinator repository: coordinator/spyglass.py`.
- `docs/operations/content-triage.md`.
- `docs/source-hierarchy.md`.
