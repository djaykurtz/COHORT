# Glossary

This glossary will grow as the system guides are written. Terms are defined by their role in the architecture, not by a particular host or workforce arrangement.

| Term | Meaning |
|---|---|
| COHORT | The cooperating Copilot CLI and MCP-coordinator project documented by this repository. |
| Zerobrain | The web-backed control plane connecting dashboards, work systems, authorization, planning, review, and evidence. |
| MCP coordinator | The service that brokers node identity, messaging, routing, lifecycle, and coordinator-side gates for Copilot CLI sessions. |
| TotemTask | The manual-mode planning and proof overlay used to distribute work chunks and collect receipts. |
| OPA | Operational authority elevation used to authorize bounded actions beyond a node's ordinary role. |
| Swatter | Tracked operational work and remediation system with evidence and closure gates. |
| Spyglass | Derived search index over Cairn and coordinator content; rebuildable, not authoritative. |
| Gary | Test, canary, or harness system used to exercise fleet behavior. |
| Breathbus | The current family of node liveness and wake/notification services. |
| Molt | A controlled lifecycle transition that recycles a node session while preserving required continuity. |
| Manual mode | The default mode in which scheduled prompt polling is disabled and nodes wait for explicit wakes. |
