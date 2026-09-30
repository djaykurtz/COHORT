# Breathing and liveness systems

## Scope

The breathing family spans older HB variants through Breathbus and the current automated life-services contract. The documentation must separate historical mechanisms from the currently enabled operating mode.

## Current mode distinction

Manual mode is currently the live operating model: scheduled prompt polling and auto-dispatch are suspended, and nodes wait for explicit operator wakes.

The HB3 -> HB61 heartbeat-wait/sentinel era is historical lineage. The published Breathbus Phase 4 specification describes the later automated-mode contract: `bb4-poll` scheduling, batched inbox/heartbeat behavior, substantive message processing, and acknowledgement discipline when automated mode is explicitly enabled. It must not be presented as current while manual mode is active.

These are not contradictory claims; they describe different operating modes. COHORT must never present the automated contract as the current live path while manual mode is active.

## Verified design concerns

- Liveness and productive work are separate concepts.
- A heartbeat or poll does not constitute completion of actionable work.
- Scheduled prompting consumes credits even when the inbox is empty.
- The automated path has strict first-call and acknowledgement ordering.
- Retired or superseded breathing variants must remain labeled as historical and must not be silently revived.
- TrueMolt must not be documented as unconditionally context-fresh without an open issue being fixed and verified.

## Lineage disposition

| Era/variant | Evidence | Disposition |
|---|---|---|
| HB3 Start-Sleep | RFC-305/RFC203 lineage | Historical only |
| HB4 interrupt | RFC-305/RFC203 lineage | Historical only |
| HB5 long-poll | RFC-305/RFC203 lineage | Historical only |
| HB51NA/HB6/HB61 heartbeat-wait and sentinel | Archived RFCs plus published HB61 reference | Historical lineage; not the current operating path |
| HB8/unified breathing proposals | Archived RFC-273/RFC-274 material | Historical design attempts; retain for lessons, not current contract |
| Breathbus daemon | Current infrastructure source and topology | Active underlying service |
| bb4-poll | Current automated-mode specification | Explicit opt-in automated contract; suspended in current manual mode |
| bubble, Smooth-Molt, Swift-Molt, legacy watcher variants | Published retirement/supersession evidence | Retired or historical; do not revive silently |

## Required lineage work

The HB3-to-Breathbus lineage still needs source-backed reconstruction:

- identify each version and its actual contract;
- record why each transition occurred;
- separate daemon, sentinel, heartbeat, wake, and scheduled-prompt responsibilities;
- identify which variants are deployed, retained, retired, or historical;
- map the manual-mode override and explicit return-to-automated-mode gate.

## Sources

- KB `breathbus-p4-definitive-spec`.
- KB `fleet-topology`.
- KB `fleet-topology-reference`.
- KB `molt-protocol` and the open context-freshness issue.
- Local Breathbus configuration and scripts, to be inspected at source before describing implementation details.
