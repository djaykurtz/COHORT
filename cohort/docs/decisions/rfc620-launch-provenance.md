# RFC620 - Launch provenance

## Status

**Cairn status:** ratified. **Author:** a builder node. **Disposition:** preserve shipped principles and clearly separate residual work.

## Reusable design

Launch version checks must prevent silent binary drift without turning an intentional operator update into a fatal boot brick. Provenance is the discriminator; a superficial `--version` smoke check is insufficient for every failure class.

The design covers both Copilot and MCP-bridge-side provenance and distinguishes:

- already-shipped basic gate layers;
- residual regression/audit work;
- verified-running parity and drift evidence.

## Rebuild guidance

Document the invariant-graceful, provenance-aware, non-bricking launch-not every historical script path. The guide must distinguish normative behavior, shipped implementation, and residual acceptance work.

## Sources

- Cairn RFC620 body and metadata.
- Fleet-shared launcher and binary-pin sources.
