# Agent Workflow

## End-to-end flow

### Intake and schema inspection

The agent first inspects the internal and partner CSV structures. This produces row counts, column lists, and sample-value profiling.

### AI mapping suggestion

OpenAI receives the two schema profiles and returns a structured mapping suggestion for:

- `transaction_id`
- `amount`
- `status`
- `timestamp`

If that step fails, the system falls back to a heuristic matcher based on column names, data types, and uniqueness.

### Mapping validation

Before running reconciliation, the workspace validates that the selected columns are usable and previews likely issues against a sample.

### Deterministic reconciliation

The local engine compares every transaction ID across both ledgers and classifies rows as:

- matched
- amount mismatch
- status mismatch
- missing in internal
- missing in partner

### AI mismatch clustering

After deterministic reconciliation, OpenAI can group mismatches into a few short analyst-friendly clusters with suggested follow-up actions.

### MCP tool access

The same trusted engine is also exposed over MCP. This gives the project a real protocol-based tool layer instead of a UI-only simulation.
