# Manual-mode wake and work cycle

## Purpose

Manual mode freezes nodes between explicit commands. A wake is a bounded work session, not permission to recreate the scheduled-prompt loop.

## Wake sequence

`rebuild/core-contracts.md` holds the normative manual-mode boot algorithm. This page is the operational wake checklist.

1. Read the node identity and current operator/PM directives.
2. Bootstrap or reattach to the coordinator using the persistent identity/session contract.
3. Set or confirm coordinator manual-mode state using the gate-exemption rule in `rebuild/core-contracts.md` section 8; do not submit schedule proof unless a schedule exists.
4. Do not create or re-arm `bb4-poll` or another recurring prompt.
5. Perform one inbox and heartbeat check for the explicit wake.
6. Reply substantively to actionable messages and acknowledge only after processing.
7. Read the node's TotemTask section and verify each item against authoritative coordinator state before acting.
8. Execute the work chunk, preserving role, OPA, reviewer, freeze, and dependency gates.
9. Perform the authoritative completion action first.
10. Write the proof receipt after that action succeeds.
11. Report the bounded result and freeze again until another explicit wake.

## Failure behavior

- A failed bootstrap is reported and does not create a recurring retry schedule.
- A coordinator outage follows the bounded recovery procedure; it does not become a hidden poll loop.
- A stale plan is not treated as permission to work; verify the live board and skip already-owned or completed items.
- A proof line cannot convert a rejected coordinator action into completion.

## Sources

- KB `fleet-topology` manual-mode operating note.
- KB `totemtask-manual-mode-kanban-workflow`.
- Shared node launcher manual-mode boot prompt.
- `docs/source-hierarchy.md`.
