# KB and research candidate catalog

This is an initial catalog of published, migrated, historical, and flagged knowledge sources discovered through live Cairn search. It is not a bulk import list.

| Source | Evidence state | Initial disposition |
|---|---|---|
| `fleet-systems-services-map` | Published human-reference architecture map | Keep as a source to reconcile against implementation; do not copy blindly. |
| `fleet-systems-services-map-quickref` | Published quick reference | Keep as navigation aid after its claims are checked against current topology. |
| `cairn-spyglass-migration-pattern` | Published migration doctrine | Keep; it defines how to preserve discoverability when moving research out of Cairn. |
| `spyglass-usage-guide` | Published deployed usage guide | Keep; use as the research/search integration reference. |
| `knowledge-infra-cleanup-surfaces` | Published living cleanup catalog | Keep as triage methodology; do not import its bookkeeping backlog as architecture. |
| `superdash-architecture` | Published living document | Reconcile with the current the coordinator host Superdash source and retain only current controls. |
| `rfc031-cairn-3tier` | Published ratified Cairn architecture | Keep as historical design input, then reconcile with the current coordinator/PostgreSQL/Spyglass implementation. |
| `rfc497c1-wake-spec-under-test-canonical` | Flagged with explicit deprecation notice | Preserve as lineage evidence only; do not use as current breathing doctrine. |
| `breathbus-operations` | Published but explicitly historical/superseded | Archive from active guidance; retain as Phase 2/3 history. |
| `impeccable-design-principles` | Published and migrated to Spyglass | Keep a short research pointer only; preserve the full body in the derived research source. |
| `eureka-dive-rfc626-smart-doorbell` | Published and migrated to Spyglass | Salvage reusable wake-filtering ideas, but require current-system validation. |
| `seed candidate` | Published survey migrated to Spyglass | Salvage patterns selectively; do not treat external survey claims as fleet doctrine. |
| `research candidate` | Published external research migrated to Spyglass | Salvage communication-compression patterns selectively. |
| `vend-manifest-transverse-check` | Flagged draft | Review before reuse; preserve as a candidate, not current policy. |
| `fail-states-catalog` | Published machine-readable failure catalog | Keep and cross-reference recovery guides after current-state verification. |

## Triage rules

- A migration marker means the full research body moved to Spyglass; it does not mean the source is worthless.
- A flagged document is evidence requiring review, not automatically deleted.
- A superseded document remains useful for lineage and failure analysis but must not be cited as current behavior.
- Architecture maps are orientation aids; implementation and live coordinator state win when they disagree.
