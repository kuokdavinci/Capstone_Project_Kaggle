# Evaluation Notes

## Why this should score as an agent project

- It has an explicit workflow, not a generic free-form chat
- Tool-like actions are visible and structured
- The business-critical logic is deterministic
- MCP is genuinely implemented as a callable tool surface

## What is intentionally simple

- MCP currently exposes tools only, not advanced resources/prompts
- There is no multi-user backend, audit database, or production auth layer
- The smoke test is terminal-based rather than a full CI integration environment

## Why those tradeoffs are acceptable for this capstone

The project optimizes for clarity and trust:

- deterministic business logic where correctness matters
- explicit AI reasoning only where it helps
- real MCP usage without decorative complexity
- a repo that another engineer can run quickly
- lower demo-time rate-limit pressure by keeping insight generation on demand

## Recommended demo talking points

- Show the mapping suggestion with confidence and fallback story
- Emphasize that reconciliation counts are local and deterministic
- Show mismatch clustering as a secondary reasoning layer
- Run `npm run mcp:smoke` to prove protocol-based tool access
