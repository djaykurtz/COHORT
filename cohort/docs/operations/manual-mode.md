# Manual-mode operating model

## Intent

Manual mode is the default operating model under credit constraints. It is specifically a decision to stop scheduled prompt polling and its recurring idle inbox checks. It is not a statement about interactive Copilot behavior or a prohibition on an operator explicitly waking a node. The normative boot rule is `rebuild/core-contracts.md` section 8.

## Behavior

- No recurring `bb4-poll` schedule is created or re-armed.
- No scheduled inbox-check or heartbeat cadence runs.
- A node is frozen between explicit wakes rather than repeatedly consuming credits while idle.
- A wake may bootstrap the node, record manual-mode state through the coordinator gate-exemption path, inspect the inbox once, and execute its assigned TotemTask work chunk.
- The node must not claim scheduled life services that are intentionally disabled.
- Returning to scheduled prompting is an explicit, separately authorized operating-mode change.

## Work coordination

TotemTask provides the manual-mode work surface:

- the PM node publishes a daily plan and per-node work chunks.
- A node reads its section when explicitly woken.
- The node performs work autonomously through its chunk.
- Completion proof is written only after the authoritative coordinator action succeeds.
- the PM node reconciles proof receipts with the actual task, Swatter, review, or closure state.

## Non-goals

Manual mode does not:

- replace the coordinator;
- make local files authoritative over Zerobrain or coordinator state;
- remove bootstrap, identity, authorization, review, or evidence requirements;
- change interactive/autopilot behavior;
- authorize work that lacks the required OPA, role, reviewer, or build gate.
