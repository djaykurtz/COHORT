# RFC, KB, seed, and research triage

## Purpose

COHORT should preserve the valuable design work without importing every historical artifact into the rebuild guide. Triage is a disposition process, not a bulk-delete operation.

## Keep

Keep a first-class COHORT guide when an item is:

- current doctrine or a still-used contract;
- a ratified design with implementation or deployment implications;
- an incident-derived safety or reliability invariant;
- a reusable architecture pattern with evidence;
- an operator-directed priority or an active cross-system dependency;
- a seed whose unresolved idea is still relevant to the target design.

The guide must preserve the original RFC/KB/seed ID and link back to the source.

## Salvage

Move an item into a concise candidate record when it is valuable but incomplete:

- seed with a strong problem statement but no wave;
- half-complete RFC with useful design material but stale implementation details;
- deferred work that remains relevant under the new manual-mode/token-economy constraints;
- external research that contains a reusable pattern but is not itself a fleet contract.

Candidate records retain provenance, the useful idea, known objections, what was tried, current relevance, and the next decision needed. They are not presented as current doctrine.

## Archive

Archive from the active guide, while retaining source history, when an item is:

- superseded by a later RFC or implementation;
- a duplicate or refactored child whose design is fully represented elsewhere;
- a historical incident record whose lesson has been extracted;
- deferred with no current dependency and no novel reusable idea;
- implementation-specific detail that no longer applies to the target design.

Archive is a discoverability decision, not deletion.

## Ditch

Delete or omit only after explicit verification that an item is:

- duplicate with no unique rationale or evidence;
- malformed or empty and not referenced by a durable decision;
- known false, superseded, and operationally harmful if reused;
- secret-bearing or unsafe content that must not be copied.

When in doubt, archive and mark the conflict instead of ditching.

## Triage record

Each triaged artifact should record:

| Field | Required content |
|---|---|
| Source | RFC/seed/KB/scratch identifier and stable source anchor |
| Current status | Live, ratified, in-round, seed, deferred, superseded, archived |
| Disposition | Keep, salvage, archive, or ditch |
| Reason | Evidence-backed rationale |
| Reusable design | The part worth preserving |
| Lost/stale parts | What must not be copied forward |
| Dependencies | Systems, tasks, Swatters, or RFCs that constrain it |
| Next action | Document, request architect review, reopen, implement, or close |

## Initial high-value candidates

The current active RFC list already contains candidates worth preserving or reviewing:

- **RFC681** - event-driven Buzz substrate to decouple liveness, wake, and state transfer from polling.
- **RFC525/RFC525c2** - token efficiency, work-seeking, idle gates, and PM sweep receipts.
- **RFC561/RFC561x1** - dispatch handshake and self-service dispatch from a ratified backlog.
- **RFC643x2** - boot-core minimization and KEEP/SHIM/RELOCATE/DELETE taxonomy.
- **RFC639** - persistence of blessed build tips across Molt.
- **RFC620** - graceful binary/launch version resolution and no-fatal-pin-brick behavior.
- **RFC660** - topology-aware push-not-pull enforcement.
- **RFC257x1** - deferred Breathbus service-platform charter, to be evaluated against the current manual-mode decision.

These are candidate dispositions, not final judgments. Each requires source review and, for architecture decisions, the architect node review.

## Sources

- Live `cairn_list_active` output and RFC metadata.
- KB `three-lane-routing-rfc-swat-task`.
- KB `the-7cs-authoritative`.
- `docs/source-hierarchy.md`.
