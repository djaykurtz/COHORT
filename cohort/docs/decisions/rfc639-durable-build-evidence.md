# RFC639 - Durable build evidence across Molt

## Status

**Cairn status:** seed. **Author:** the architect node. **Disposition:** salvage as a continuity doctrine.

## Problem

A reviewer can bless a local-only Git SHA that never reaches a durable shared repository. When the author Molts, the local branch disappears while the approval record survives, leaving a dead SHA that cannot be reactivated or verified.

## Reusable rules

- Push blessed or ship-candidate tips before the authoring successor Molts.
- Reviewers should cosign reachable SHAs; local-only cosigns are provisional.
- PM post-Molt continuity checks must re-resolve blessed SHAs at source.
- Never carry a prior-session SHA claim as current without a fresh source check.

## Relationship to COHORT

This is a direct continuity rule for COHORT documentation, TotemTask proof, review records, Molt handoff, and GitHub publication. A local commit is not a durable project artifact until pushed to the official remote.

## Sources

- Cairn RFC639 body and metadata.
- KB `molt-protocol`.
- COHORT source hierarchy and publication workflow.
