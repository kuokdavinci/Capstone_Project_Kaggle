import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  inspectCsvPair,
  loadSampleDataset,
  reconcileCsvPair,
  validateCsvMapping,
} from './reconciliation_service.js';

const fieldMappingSchema = z.object({
  transaction_id: z.object({ internal: z.string(), partner: z.string() }),
  amount: z.object({ internal: z.string(), partner: z.string() }),
  status: z.object({ internal: z.string(), partner: z.string() }),
  timestamp: z.object({ internal: z.string(), partner: z.string() }),
});

function asToolResult<T extends object>(payload: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

export function createReconciliationMcpServer() {
  const server = new McpServer({
    name: 'reconcopilot-mcp',
    version: '1.0.0',
  });

  server.registerTool(
    'load_sample_dataset',
    {
      title: 'Load Sample Dataset',
      description: 'Return the built-in reconciliation demo CSV payloads.',
      inputSchema: z.object({}),
      annotations: {
        title: 'Load Sample Dataset',
        idempotentHint: true,
      },
    },
    async () => asToolResult(loadSampleDataset()),
  );

  server.registerTool(
    'inspect_csv',
    {
      title: 'Inspect CSV Pair',
      description: 'Profile an internal ledger CSV and a partner CSV.',
      inputSchema: z.object({
        internalFilename: z.string().optional(),
        internalCsv: z.string(),
        partnerFilename: z.string().optional(),
        partnerCsv: z.string(),
      }),
      annotations: {
        title: 'Inspect CSV Pair',
        idempotentHint: true,
      },
    },
    async (args) => asToolResult(inspectCsvPair(args)),
  );

  server.registerTool(
    'validate_mapping',
    {
      title: 'Validate Field Mapping',
      description: 'Validate a canonical field mapping against both CSV datasets.',
      inputSchema: z.object({
        internalCsv: z.string(),
        partnerCsv: z.string(),
        mapping: fieldMappingSchema,
      }),
      annotations: {
        title: 'Validate Field Mapping',
        idempotentHint: true,
      },
    },
    async (args) => asToolResult(validateCsvMapping(args)),
  );

  server.registerTool(
    'run_reconciliation',
    {
      title: 'Run Reconciliation',
      description: 'Run deterministic reconciliation over both CSV datasets.',
      inputSchema: z.object({
        internalCsv: z.string(),
        partnerCsv: z.string(),
        mapping: fieldMappingSchema,
      }),
      annotations: {
        title: 'Run Reconciliation',
        idempotentHint: true,
      },
    },
    async (args) => asToolResult(reconcileCsvPair(args)),
  );

  return server;
}
