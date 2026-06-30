# Architecture

## System shape

ReconCopilot uses a single TypeScript codebase with one runtime for both the product UI and the tool surface:

- **React frontend**: upload files, inspect mappings, run reconciliation, review mismatches
- **Express API**: REST-style endpoints used by the frontend
- **Deterministic engine**: CSV parsing, mapping validation, reconciliation, normalization
- **OpenAI Responses API integration**: schema mapping suggestions, mismatch clustering, analyst chat
- **MCP endpoint**: tool-based access to trusted reconciliation actions at `/mcp`

## Core design decisions

### 1. Keep correctness-critical logic deterministic

The model does not decide final counts or ledger comparisons. It can suggest mappings or summarize issues, but totals and mismatch classes come from the local engine.

### 2. Reuse the same shared service layer

The REST API and the MCP tools both call the same functions in [`src/reconciliation_service.ts`](../src/reconciliation_service.ts). This avoids drift between demo surfaces.

### 3. Expose a minimal but real MCP surface

The project uses a small MCP tool set:

- `load_sample_dataset`
- `inspect_csv`
- `validate_mapping`
- `run_reconciliation`

This is enough to prove protocol-based tool access without overbuilding the architecture.

## Data flow

1. User uploads or loads demo CSVs
2. Frontend posts files to `/api/inspect`
3. Server profiles schemas
4. Frontend requests AI mapping suggestion
5. Frontend validates mapping and triggers deterministic reconciliation
6. Frontend optionally asks AI to cluster mismatches and explain specific rows
7. External MCP clients can invoke the same trusted reconciliation actions through `/mcp`

## Failure handling

- OpenAI calls use retry, compact prompts, short-lived caching, and smaller context payloads
- Mapping suggestion falls back to heuristics if AI is unavailable
- Deterministic reconciliation is isolated from AI failure
- MCP tools return structured outputs suitable for programmatic verification
