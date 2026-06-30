# Security Notes

## Current posture

- API keys are loaded from environment variables
- The application keeps reconciliation logic local and deterministic
- AI output is not trusted for final counts or ledger truth
- Demo datasets are synthetic

## Operational cautions

- Do not upload real production ledgers without adding access control, audit logging, and data retention policy
- The current app keeps uploaded CSV content in memory for the session
- The chat assistant can summarize selected transaction context, so production deployment should add redaction and user authorization
- The MCP endpoint is intentionally open in local development; production deployment should protect it behind auth and network controls

## Recommended next steps before production use

- Add authentication and role-based access
- Add request logging and audit trails
- Encrypt or avoid storing sensitive uploaded files
- Add rate limiting and payload size enforcement
- Add automated dependency scanning in CI
