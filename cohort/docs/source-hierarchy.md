# Source-of-truth hierarchy

This hierarchy is the cross-system contract for COHORT documentation. It prevents a dashboard, message, stale mirror, or local plan from being mistaken for authoritative state.

## Precedence

When sources disagree, use the highest applicable source below and record the conflict rather than silently merging them.

1. **Operator authority and explicit current directives**
   These establish current operating mode, authority, freezes, and exceptions. They must be preserved with provenance and scope.
2. **Live authoritative service state**
   Coordinator/API state, coordinator database state, and at-source runtime observations establish current node, task, lifecycle, authorization, and delivery state.
3. **Published current doctrine**
   Published KB/RFC material defines durable contracts and operating rules. Prefer the canonical current article; archived or superseded articles are historical references only.
4. **Canonical implementation source**
   The repository and branch designated as canonical for a subsystem define what the implementation is intended to do. Verify the deployed artifact separately when runtime behavior matters.
5. **Generated manifests and deployed artifacts**
   These are useful evidence of a vended or deployed state, but can be stale or drifted. Confirm freshness and provenance before relying on them.
6. **Plans, proof files, dashboards, and messages**
   These organize work, communicate intent, or display derived state. They are not substitutes for the authoritative completion or state transition.
7. **Historical notes and memory**
   These are discovery aids. They do not establish a current contract without verification.

## Cross-system rules

### Durable work state

The coordinator task, SWAT, and RFC systems own their respective work state. TotemTask plans and proof files are a manual-mode coordination overlay; they point to real items and receipts but do not replace the coordinator-side action.

The RFC/SWAT/Task lanes are intentionally separate. Use the published three-lane decision tree before creating or classifying work.

### Runtime versus doctrine

A published doctrine explains the intended contract. A live API response, source inspection, or observed runtime check establishes whether that contract is currently active. COHORT documentation must distinguish:

- **normative** - what the system is supposed to do;
- **implemented** - what the canonical source contains;
- **deployed** - what the target environment carries;
- **observed** - what the live system actually did.

### Manual mode

Manual mode disables scheduled prompt polling and auto-dispatch. The automated liveness specification remains the automated-mode contract and must not be presented as the current live path while manual mode is active.

### Host and path evidence

Host-local paths, UNC paths, drive letters, and machine names are evidence locators only. They do not define architecture and must be replaced with roles, service IDs, logical locations, or repository-relative anchors.

## Evidence record required on each system page

Every COHORT system guide should record:

- authority level and source links;
- source revision or observed-at marker when appropriate;
- owner and state boundary;
- implementation/deployment distinction;
- conflicts or stale sources found;
- unresolved questions.

## Stable reference policy

Prefer KB/RFC IDs, repository names plus relative paths, service IDs, API/tool contracts, logical artifact names, and role names. See `source-reference-policy.md`.

## Basis

This hierarchy is grounded in current authority doctrine, source verification, lane separation, manual-mode operating rules, and the rule that durable owners outrank derived views.
