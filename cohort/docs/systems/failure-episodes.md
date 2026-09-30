# Failure Episodes

## Responsibility

Failure Episodes are a separate durable incident-evidence stream for coordinator health failures. They are not RFCs, KB articles, Swatters, or ordinary task records.

## Verified implementation model

- An external coordinator-health watchdog writes `UNHEALTHY` and `RECOVERED` JSON artifacts.
- A bounded background ingester replays those artifacts into durable coordinator failure-episode transitions once the coordinator is available.
- Filename timestamps provide ordering and deduplication.
- A durable cursor prevents rescanning the full artifact history.
- Episodes record degraded and recovered transitions, cause class/summary, remediation, and evidence URI.
- The ingest path is bounded and non-fatal; an unreadable artifact does not block coordinator startup or request handling.

## Data boundary

Failure Episodes preserve incident truth that cannot reliably be recorded by a wedged coordinator. They should be linked from architecture and post-incident guides, but they should not be copied into the RFC/KB corpus as if they were design decisions.

Superdash may render the feed, but the durable episode transition remains the source of truth.

## Sources

- `coordinator repository: coordinator/failure_episodes.py`
- Coordinator `GET /api/failure-episodes` implementation.
- KB `fleet-systems-services-map` and related resilience doctrine.
