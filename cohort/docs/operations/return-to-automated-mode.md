# Returning to automated mode

## Status

Automated mode is an explicit opt-in. It must not be inferred from a heartbeat, a running Breathbus daemon, a stale schedule, or a node's previous startup instructions.

## Required change

A return to automated mode is a coordinated operating-mode change that must define:

- the authority and scope approving scheduled prompting;
- the AI-credit budget and expected cadence;
- the exact schedule prompt and interval;
- the life-services proof contract;
- the inbox/reply/acknowledgement first-call contract;
- failure, backoff, and retry ceilings;
- rollback to manual mode;
- fleet-vending and parity verification.

## Safety rule

Do not enable automated mode by editing one node's local identity or recreating one schedule. The canonical startup source, coordinator manual-mode state, node-vended artifacts, and operating documentation must agree.

## Sources

- KB `fleet-topology`.
- KB `breathbus-p4-definitive-spec`.
- KB `three-lane-routing-rfc-swat-task` (new cross-system operating contract requires the appropriate design lane).
- `docs/source-hierarchy.md`.
