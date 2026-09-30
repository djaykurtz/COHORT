# MCP coordinator

## Status

This page documents the coordinator boundary from live MCP tool contracts and published fleet doctrine. Zerobrain/backend integrations remain an open investigation.

## Responsibility

The coordinator is the execution-plane service for cooperating Copilot CLI sessions. Its verified responsibilities include:

- node bootstrap and session-token continuity;
- node lifecycle and liveness state;
- coordinator-authenticated messaging and inbox handling;
- task and work routing;
- review and evidence handoffs;
- manual-mode state;
- coordinator-side authorization and safety gates.

It is not, by itself, the complete Zerobrain product or a replacement for the durable RFC, SWAT, and task systems.

## Current implementation facts

The local Zerobrain coordinator repository identifies the implementation as an MCP JSON-RPC 2.0 server built on FastAPI/Uvicorn-style. Its production database substrate is PostgreSQL 16-class; SQLite is retained as a test fixture/legacy backend. The repository documents the MCP endpoint, task and message tools, and the production backend guard.

These are implementation facts for the current coordinator repository, not assumptions about every historical coordinator variant.

## Verified interaction rules

- Bootstrap returns node identity and a session token used for subsequent authenticated operations.
- Inbox processing must use the batched `check_inbox` plus `heartbeat` path when the node is operating on an active poll/wake cycle.
- Messages with actionable content require a substantive response before acknowledgement.
- Multiple acknowledgements use the bulk acknowledgement operation after processing.
- Manual mode is set explicitly through coordinator state and suppresses scheduled-prompt drift expectations.
- A coordinator task transition is authoritative over a local plan or proof statement.

## Work lanes

The coordinator is the routing and execution surface for three distinct durable work lanes:

- RFCs for new behavior, cross-system contracts, and doctrine;
- SWATs for targeted fixes and narrow doctrine clarification;
- Kanban tasks for routed build work and phased execution.

The lanes are related through explicit coordinator references, not by collapsing them into one board.

## Failure and recovery questions

The following require direct source tracing before this page is complete:

- coordinator database ownership boundaries relative to Zerobrain;
- task/SWAT/RFC API persistence and cross-database synchronization;
- exact authorization gates for every privileged coordinator operation;
- restart, outage, and replay semantics;
- which coordinator state survives Molt and which is reconstructed at bootstrap.

## Sources

- Live coordinator MCP tool contracts: `bootstrap_node`, `batch`, `send_message`, `bulk_acknowledge`, `set_manual_mode`, task and lifecycle tools.
- KB `three-lane-routing-rfc-swat-task`.
- KB `the-7cs-authoritative`.
- KB `fleet-topology` and `fleet-topology-reference`.
- Local source: `coordinator repository: README.md`.
