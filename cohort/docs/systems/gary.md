# Gary disposable test system

## Responsibility

Gary is a disposable crash-test-dummy for candidate startup-instruction and life-service changes. It isolates a risky candidate change in a throwaway subprocess so a failed experiment does not brick a real cohort node.

## Verified integration boundary

Gary is agent-orchestrated:

1. The invoking agent acquires the singleton Gary lease and opens the coordinator result row through `start_gary_test`.
2. The agent writes a test specification and invokes the node-side harness.
3. The harness spawns, observes, and evaluates only the disposable subprocess.
4. The agent submits the verdict through `stop_gary_test`, releasing the lease and finalizing the result.

The harness does not call the coordinator, does not bootstrap a node, and does not persist cohort identity. This separation is load-bearing: coordinator authority and durable results stay in the agent/coordinator boundary, while process isolation stays in the harness.

## Test contract

The test specification includes a kind, candidate instructions, and assertions. Supported assertion families include exit code, stdout/stderr content, and artifact existence.

The harness emits one structured verdict with `pass`, `fail`, or `bricked`. A timeout or abnormal termination is a `bricked` verdict, and missing success is treated as failure evidence rather than requiring a death-side signal.

## Safety and limitations

- Runs use a fresh isolated temporary work directory.
- The subprocess has no cohort identity, bootstrap, or persistence.
- The full ephemeral cohort-join path is a separate future/M4-gated slice.
- The harness is vital-LS-adjacent and requires the applicable independent review discipline before land.

## Sources

- `shared-scripts repository: scripts/Gary-Harness.README.md`
- `shared-scripts repository: scripts/Gary-Harness.ps1`
- KB `rfc588-gary-optimal-usage`
