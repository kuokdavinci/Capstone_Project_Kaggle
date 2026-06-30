import { spawn } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const port = 8091;
const serverUrl = new URL(`http://127.0.0.1:${port}/mcp`);

async function waitForServer(url: URL, attempts = 40) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `probe-${index}`,
          method: 'tools/list',
          params: {},
        }),
      });

      if (response.status < 500) {
        return;
      }
    } catch {
      // Server is still booting.
    }

    await delay(500);
  }

  throw new Error(`Server did not become ready at ${url}`);
}

async function main() {
  const child = spawn(
    'node',
    ['--import', 'tsx', 'server.ts'],
    {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  child.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));

  try {
    await waitForServer(serverUrl);

    const client = new Client({
      name: 'reconcopilot-smoke-client',
      version: '1.0.0',
    });

    await client.connect(new StreamableHTTPClientTransport(serverUrl));

    const toolsResponse = await client.listTools();
    const toolNames = toolsResponse.tools.map((tool) => tool.name).sort();
    console.log('Available MCP tools:', toolNames.join(', '));

    const sampleResponse = await client.callTool({
      name: 'load_sample_dataset',
      arguments: {},
    });

    const sample = sampleResponse.structuredContent as {
      internalFilename: string;
      internalCsv: string;
      partnerFilename: string;
      partnerCsv: string;
    };

    const inspectResponse = await client.callTool({
      name: 'inspect_csv',
      arguments: sample,
    });

    const inspect = inspectResponse.structuredContent as {
      internalCount: number;
      partnerCount: number;
    };

    const reconcileResponse = await client.callTool({
      name: 'run_reconciliation',
      arguments: {
        internalCsv: sample.internalCsv,
        partnerCsv: sample.partnerCsv,
        mapping: {
          transaction_id: { internal: 'Transaction_ID', partner: 'Partner_Ref' },
          amount: { internal: 'Amount', partner: 'Gross_Value' },
          status: { internal: 'Status', partner: 'Payment_State' },
          timestamp: { internal: 'Timestamp', partner: 'Settled_At' },
        },
      },
    });

    const reconcile = reconcileResponse.structuredContent as {
      summary: Record<string, number>;
    };

    console.log('Inspection counts:', inspect.internalCount, inspect.partnerCount);
    console.log('Reconciliation summary:', JSON.stringify(reconcile.summary));

    await client.close();
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
