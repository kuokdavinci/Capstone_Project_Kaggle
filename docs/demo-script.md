# Demo Script

## Public links

- Live app: https://capstone-project-kaggle-551626064921.asia-southeast3.run.app/
- End-to-end demo: https://youtu.be/9hlX9yKYTjs
- Build/design workflow demo: https://youtu.be/PIyI1F_fjk0

## 90-second version

1. Open the app and explain the target user: finance operations reconciling partner settlements.
2. Click `Use Sample Data`.
3. Show the AI mapping suggestion and note the confidence output.
4. Run validation and reconciliation.
5. Trigger mismatch clustering and explain one cluster.
6. Show the activity logs panel and explain that UI logs are not the MCP protocol.
7. Run `npm run mcp:smoke` in a terminal and show the discovered tools and reconciliation summary.
8. Run `npm run openai:flow-smoke` to prove the mapping, insight, and chat path works end to end.

## Key lines to say

- "The model helps with schema understanding and mismatch interpretation, but the final ledger comparison is deterministic."
- "We expose the trusted reconciliation actions through MCP so external agent systems can call the same business logic."
- "This is designed as an operations workflow, not a chatbot."
