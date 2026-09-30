# COHORT blueprint: building blocks, connections, and build order

**Start here if you are standing COHORT up somewhere new.** This page is the map. It names every
building block, what each one owns, how they connect, what the new site has to provide, and the
order to build them in. The deep, per-area guidance lives in [`rebuild/`](rebuild/); this page
links to it.

Everything here is generic. It describes the design, not the original deployment. Host counts,
addresses, ports, paths, versions, and accounts are choices the new site makes.

## 1. What COHORT is, in one paragraph

COHORT is a team of AI agent sessions (**nodes**), each with a role (architect, PM, builder,
reviewer, analyst), working under a human **operator**. The nodes do not talk to each other
directly. Every message, task, review, approval, and piece of evidence goes through one
**coordinator** service, which is the single source of truth for live team state. A durable
**knowledge store** (Cairn) holds how the team thinks: RFCs, knowledge articles, research, and
decisions. A **dashboard** (Superdash) lets the operator see and steer all of it. **ZeroBrain** is
the name for this integration layer: the coordinator plus the services around it that tie
dashboard, work, knowledge, authority, and review together.

## 2. Building blocks

"Core" blocks are required for a working COHORT. "Optional" blocks add capability, and the system
must boot and operate without them.

| # | Block | What it is | Owns (source of truth for) | Core? | Deep guide |
| --- | --- | --- | --- | --- | --- |
| 1 | **Operator** | The human in charge. Sets direction, grants authority, and relays messages in manual mode. | Authority. Every privilege traces back to an operator grant. | Core | [`labor-division.md`](rebuild/labor-division.md) section 3 |
| 2 | **Agent nodes** | Long-lived AI agent CLI sessions, one per role. Each has a durable identity and a disposable session. | Nothing durable. Nodes do work and report evidence. | Core | [`node-runtime.md`](rebuild/node-runtime.md) |
| 3 | **Node home** | A per-node directory: identity file, instructions, skills, MCP configuration, logs, and continuity notes. | Node-local identity and continuity notes | Core | [`node-runtime.md`](rebuild/node-runtime.md) sections 1, 3, 4, 8 |
| 4 | **Launcher and boot scripts** | Starts a node session, writes its MCP configuration, injects the boot prompt, and resolves and verifies binaries. | Nothing durable | Core | [`node-runtime.md`](rebuild/node-runtime.md) sections 5, 6 |
| 5 | **Coordinator service** | One HTTP service exposing a REST API, an MCP JSON-RPC endpoint for the agents, and server-sent event streams. | Live team state: nodes, messages, tasks, reviews, SWATs, authorizations, evidence, memory, handoffs | Core | [`backend-hosting.md`](rebuild/backend-hosting.md) sections 1, 3, 6-8 |
| 6 | **Coordinator database** | A relational database behind the coordinator. It listens on loopback only. | Persistence for block 5 | Core | [`backend-hosting.md`](rebuild/backend-hosting.md) section 5 |
| 7 | **Cairn knowledge store** | A separate store for RFCs, knowledge articles, research, seeds, and scratch notes, with its own backend selector. | The team's decisions and knowledge | Core | [`rnd-processes.md`](rebuild/rnd-processes.md) sections 1-2 |
| 8 | **Spyglass index** | A search index built from Cairn and coordinator content. | Nothing. It is derived and can be rebuilt at any time. | Optional | [`rnd-processes.md`](rebuild/rnd-processes.md) section 8 |
| 9 | **Superdash dashboard** | A small web server plus a static UI. It proxies API reads to the coordinator and shows degraded state honestly. | Nothing. It is a presentation layer. | Strongly recommended | [`website-superdash.md`](rebuild/website-superdash.md) |
| 10 | **Out-of-band watchdog** | Two halves. (a) A scheduled health probe, independent of the coordinator, whose alerts go to a channel that does **not** depend on the coordinator. It is cheap: build it with the coordinator. (b) Automated restart through block 17. It is heavy: add it late. In manual mode, Breathbus is optional; when automated restart or a life-services gate is enabled, its configured liveness dependency applies. | Alerts | (a) Core, (b) Recommended | [`backend-hosting.md`](rebuild/backend-hosting.md) sections 3.2-3.3 |
| 11 | **Backup and restore check** | A scheduled database dump plus an automated restore into scratch that proves the backup is usable. The **restore result**, not the job's exit status, is the health signal. | Recoverability | Core | [`backend-hosting.md`](rebuild/backend-hosting.md) sections 5.6-5.7 |
| 12 | **Breathbus liveness daemon** | A per-host daemon that heartbeats for local nodes and wakes them on events. Optional in manual mode. Required when automated mode is enabled, and required by any enabled life-services gate that names daemon proof as a dependency. | Liveness signals | Optional in manual mode; required for automated mode or that gate | [`backend-hosting.md`](rebuild/backend-hosting.md) section 9 |
| 13 | **MCP bridge** | A local proxy binary between the agent CLI and the coordinator's MCP endpoint. Used only if the CLI cannot speak remote HTTP MCP directly. | Nothing | Optional | [`node-runtime.md`](rebuild/node-runtime.md) section 2 |
| 14 | **Source hosting** | A git origin for the coordinator, dashboard, daemon, shared scripts, and node templates. | Code history | Core | [`decommission-capture.md`](rebuild/decommission-capture.md) |
| 15 | **Secret store** | Wherever the fleet bearer token, node tokens, DB role passwords, and any lifecycle token live. They never go in git or in documents. | Credentials | Core | [`backend-hosting.md`](rebuild/backend-hosting.md) sections 4.3, 7; [`node-runtime.md`](rebuild/node-runtime.md) section 3 |
| 16 | **TotemTask plan and proof files** | A daily plan per node plus proof lines, used in manual mode instead of automatic dispatch. | Nothing. The coordinator stays authoritative. | Core in manual mode | [`labor-division.md`](rebuild/labor-division.md) section 9 |
| 17 | **Sanctioned restart lever** | The **only** supported way to restart the coordinator. It checks for a clean tree and fresh source, takes the concurrent-restart claim (block 18), stops gracefully, cleans up orphans, waits for health, then verifies an MCP round trip and an unbuffered event stream. Its job is to make restart boring and verifiable. It must work while the coordinator is fully unresponsive, so none of its steps may depend on the service it is restarting. | Restart receipts | Core | [`backend-hosting.md`](rebuild/backend-hosting.md) section 3.3 |
| 18 | **Concurrent-restart fence** | An atomic claim, keyed on the target revision and explicitly released, so that two actors (operators, the watchdog, automation) cannot restart at once. A broadcast "I am restarting" message is not a fence: it drops exactly under the load that makes a double restart likely. | The restart claim | Core once more than one actor can restart | [`backend-hosting.md`](rebuild/backend-hosting.md) section 3.3 |
| 19 | **Deployed artifact** | A versioned build or copy that the service actually runs, separate from any source checkout. If the service runs straight out of a working checkout, ordinary development (creating a branch, a dirty tree) can disable recovery, because the restart lever correctly refuses to deploy the wrong code. | What is running | Core | [`backend-hosting.md`](rebuild/backend-hosting.md) section 15.2 (pitfall 18) |

## 3. How the blocks connect

```text
                         +-------------------+
   Operator  ----------> |   Superdash (UI)  |  browser -> dashboard server (HTTP)
      |                  +---------+---------+
      |                            |  proxied REST reads, SSE
      |                            v
      |      MCP over HTTP  +-----------------------------+   loopback   +--------------+
      |   +---------------> |      Coordinator service    | <----------> | Coordinator  |
      |   |  (JSON-RPC,     |  REST  |  MCP  |  SSE events |              |   database   |
      |   |   bearer +      +----+---------+--------+------+              +--------------+
      |   |   node token)        |         |        |                     +--------------+
      v   |                      |         |        +-------------------> | Cairn store  |
  +-------+-------+              |         |                              +------+-------+
  |  Agent nodes  | <------------+         |  SSE / MCP                          | derive
  |  (agent CLI   |   wake (local)    +----+--------------+               +------v-------+
  |   sessions)   | <-----------------|  Breathbus daemon |  (optional)   |   Spyglass   |
  +-------+-------+                   +-------------------+               +--------------+
          |
          |  git (clone / pull shared scripts, repos)      Watchdog --HTTP health--> Coordinator
          v                                                 Watchdog --restart--> sanctioned lever
  +---------------+                                         Watchdog --alerts--> file/channel outside the bus
  | Source hosting|                                         Backup job --dump--> backup destination
  +---------------+                                         Restore check --restore--> scratch DB
```

| From | To | Channel | Authentication | Notes |
| --- | --- | --- | --- | --- |
| Agent node | Coordinator | MCP JSON-RPC 2.0 over HTTP POST | Fleet bearer token plus a per-node session token header (`X-Node-Token`) | The only way nodes talk to anything shared. Every tool call carries the node's identity. |
| Agent node | Agent node | **None directly** | - | All node-to-node traffic is a coordinator message. In manual mode the operator relays. |
| Operator browser | Superdash server | HTTP (static UI) | Dashboard or operator credential | The server itself holds no durable state. |
| Superdash server | Coordinator | HTTP proxy of REST `GET`s, plus SSE | The dashboard's credential is forwarded; the coordinator decides | A coordinator outage must show as degraded, never as empty. |
| Coordinator | Coordinator DB | Database wire protocol, loopback only | Least-privilege application role | Restores need a separate administrative credential. |
| Coordinator | Cairn store | Same process, separate store | - | A separate backend selector, so the two can be migrated independently. |
| Coordinator | Subscribers | Server-sent events | Node token header | Must stream unbuffered, and support replay from a last-seen event ID. |
| Breathbus daemon | Coordinator | MCP (heartbeat or inbox) and SSE | Fleet credential, injected from a secret file | Automated mode only. One daemon per host serves all nodes on that host. |
| Breathbus daemon | Local nodes | Local IPC (named pipe) and wake | Host-local | Automated mode only. |
| Watchdog | Coordinator | HTTP health probe (`/api/health`: a real read **and** write) | None or health-only | Runs outside the coordinator. Its alerts must not route through the coordinator. |
| Backup job | DB -> backup destination | Database dump plus a hash sidecar | Service identity; no inline secrets | The destination must not share fate with the host. |
| Nodes and hosts | Source hosting | git | Source-hosting credential | Nodes pull shared scripts and skills from here. |

**Network reachability the new site must provide.** Worker hosts need to reach one coordinator
port. Operator workstations need to reach the dashboard port. The database, daemon and health ports
stay on loopback. All hosts need to reach source hosting and the model provider used by the agent
CLI. Nothing else needs to cross a host boundary.

## 4. What the new site has to provide

| Need | Minimum | Notes |
| --- | --- | --- |
| Compute | **One host** can run everything. The reference design ran the backend on a coordinator host, with more nodes on worker hosts. | Multi-host adds co-tenancy and reachability work, not capability. Start single-host. |
| Operating system | The reference implementation uses Windows and PowerShell for launchers, supervision, scheduled jobs, and named pipes. | The coordinator itself (Python / FastAPI) is portable. Launchers, supervision and the daemon's IPC would need porting for a different OS. |
| Agent runtime | An agent CLI that supports MCP servers, custom instructions, skills, and scheduled or recurring prompts. Plus model access for every node. | Each node is a long-running session, so budget model usage per node. Manual mode exists largely to control that cost. **Ordering is load-bearing:** a node must register its recurring self-wake *before* it first contacts the coordinator. Otherwise a coordinator that is down or slow leaves the node with no retry path, and it dies silently. |
| Clock synchronization | Every host synchronized to a common time source. | Heartbeat freshness, staleness thresholds, leases, message expiry, cooldowns and rate-limit windows are all timestamp-ordered. Skewed clocks do not raise errors; they silently misclassify. |
| Database | A PostgreSQL-class server for the coordinator. SQLite is acceptable for Cairn at small scale. | See `backend-hosting.md` section 17 for what to do better. |
| Source hosting | A git origin **independent of the hosts**. | Establish it on day one. |
| Secret handling | A way to provision tokens and DB passwords to services and node homes outside git. | Tokens are regenerated at the new site; nothing is carried over. Keep an explicit **list of config files that carry inline credentials**. Those are the files that leak during an export or a documentation pass. |
| Backup storage | A destination that does not share fate with the hosts. | Plus a scheduled restore check. |
| People | One operator with authority, and an agreement on the role roster. | The roles are a design choice; see `labor-division.md` section 2. |

## 5. Build order

Each phase is usable on its own. Stop at any phase that meets the need.

| Phase | Build | You then have | Guide |
| --- | --- | --- | --- |
| 0 | Source hosting, secret handling, backup destination, clock synchronization | Somewhere safe to put everything else | `rebuild/phase-0-site.md` |
| 1 | Coordinator database + coordinator service + restart lever + out-of-band health probe and alerting. **Phase acceptance includes a successful restore of a backup into scratch.** You do not have a backup until you have restored one. | A working control plane you can recover and that tells you when it is sick | `backend-hosting.md` sections 3, 5, 10-11 |
| 2 | One agent node: node home, identity, instructions, core skills, launcher. Bootstrap it against the coordinator. | One agent that can message, take tasks and record evidence | `node-runtime.md` sections 11-12; `starter-kit.md`; [`personas/`](personas/) to give it a lineage |
| 3 | The role roster, authority model, and routing lanes. Add the remaining nodes. Enumerate every gate that assumes a mode (section 7, item 5). | A working team in **manual mode** (the operator relays; TotemTask plans the work) | `labor-division.md` |
| 4 | Cairn plus the RFC, SWAT and knowledge lifecycles | A team that records decisions and learns | `rnd-processes.md` |
| 5 | Superdash | Operator visibility and control without reading the database | `website-superdash.md` |
| 6 | Recurring backup schedule, automated restart via the watchdog, and the concurrent-restart fence | Something you can leave running unattended | `backend-hosting.md` sections 3, 5 |
| 7 (optional) | Spyglass, Breathbus and automated mode, Gary, molt automation | Search, autonomy and self-recycling. Add them only with explicit operator opt-in. | respective guides |

## 6. Decisions the new site must make up front

1. **Single host or several?** Start with one.
2. **Manual or automated mode?** Manual (the operator relays messages, with no polling) is the safe,
   cheap default. Automated mode needs the liveness daemon and costs model usage on every poll.
3. **Direct MCP or a bridge?** Use direct HTTP MCP if the agent CLI supports it. The bridge only
   exists for CLIs that cannot.
4. **Which roles?** The reference roster was architect, PM, reviewer, builders, analyst, and an
   operations builder that owns the coordinator. Fewer roles are fine. Keep the review-recusal and
   authority rules regardless.
5. **Database engine for Cairn?** Keep it separate from the coordinator's backend selector, whatever
   you choose.
6. **How is the dashboard authenticated?** Do not ship the fleet token in front-end config.
7. **Where do alerts go?** Somewhere that still works when the coordinator is down.
8. **Which OS?** The reference is Windows throughout for launchers, supervision and local IPC. If the
   new site is Linux, plan that port **before** committing to the build order (see section 8).

## 7. What a new site will trip over (principles)

These are generalized from the reference system. Each one is cheap to design in and expensive to
retrofit.

1. **Liveness must be proven by the thing whose liveness is claimed.** A proxy (a daemon, a
   scheduled task) that heartbeats on an agent's behalf makes the signal describe the proxy. In the
   reference this failed both ways: a node with no agent running read as healthy, and a live
   session in manual mode read as dead. A proxy must report *as* the proxy, in its own field.
   "The host daemon is up" and "this agent is up" are different facts.
2. **An indicator that renders identical states differently is worse than none.** If two nodes in
   the same real state display opposite status because of incidental configuration, readers see
   variance, build a confident wrong model, and never investigate. Uniformly wrong can be learned
   around; inconsistently wrong cannot.
3. **Verify the outcome, never the operation.** A backup job that faithfully copies a store nobody
   writes to any more reports success forever. The restore result is the health signal.
4. **Every health number must be derived from the thing it claims to measure.** A number that looks
   derived but has no provable derivation is a liability, because people believe it.
5. **A mode change must propagate to every gate that assumes the old mode.** If manual mode stops
   polling, then any gate that requires a recent poll (inbox access, lifecycle transitions,
   staleness classification) becomes unsatisfiable or wrong. Make mode an explicit input to every
   such gate. Otherwise adopting the cheap mode silently breaks the safety machinery, in ways that
   look unrelated.
6. **Recovery tooling must not depend on the thing it recovers.** Every recovery step must run while
   the target is fully unresponsive. A bypass flag the operator must remember mid-incident is a
   design smell.
7. **Rationale must travel with the rule.** A rule copied without its reason decays into an apparent
   bug, and someone eventually "fixes" it. Duplicated doctrine carries the why, or a pointer to it.
8. **Test fixtures must not collide with the running system.** Use unique per-run fixture paths so
   the pre-change gate can run against a live host, which is exactly when it is needed.
9. **An alert that is always firing is a bug in the alert.** A permanently true, non-actionable
   condition must not be CRITICAL. It trains people to ignore the channel and buries the real
   failures.

## 8. Do we have enough guidance? Coverage by block

| Block | Coverage | Gap |
| --- | --- | --- |
| Coordinator service and database | Contracts, rebuild steps, acceptance tests, pitfalls, and MCP parameters. Schema and core invariants are covered by [`schema-reference.md`](rebuild/schema-reference.md) and [`core-contracts.md`](rebuild/core-contracts.md); the full MCP surface is in [`mcp-tool-catalog.md`](rebuild/mcp-tool-catalog.md). | Full per-tool validation and behavior live in the reference source |
| Agent nodes and launcher | Deep: identity schema, boot sequence, skills catalogue, molt, co-tenancy, acceptance tests | Launch scripts are Windows-specific |
| Roles, authority, routing, review | Deep | - |
| Cairn and the R&D process | Deep | Seed content: role instructions, core skill specs, and first doctrine articles are in [`starter-kit.md`](rebuild/starter-kit.md). Prior research is in a private archive (see `decommission-capture.md`). |
| Superdash | Deep: routes, front-end architecture, design tokens, deploy/promote | - |
| Watchdog, backup, restore | Good: contracts plus lessons learned | - |
| Breathbus / automated mode | Good for the coordinator side | Daemon internals are best taken from its reference source |
| Spyglass, Gary, Merit, Lessons | Orientation-level (`systems/`) | Enough to decide whether to build them, not to build them blind |
| Non-Windows port | Not covered | Launchers, supervision and IPC need a port plan |
| Model and licensing cost | Not covered | Budget per node, and per poll in automated mode |

**Bottom line.** A competent engineer or agent can rebuild COHORT from these documents: the
architecture, contracts, lifecycles and failure lessons are all here. The reference source code
(kept privately, see `decommission-capture.md`) turns a reimplementation into a port, and is
strongly recommended for the coordinator, the MCP tool surface, and the dashboard.

**The single largest practical gap is the operating system.** The coordinator is portable, but the
launchers, supervision, scheduled jobs and local IPC are Windows-specific. A Linux site should
scope that port first.
