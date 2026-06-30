import { spawn } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import dotenv from 'dotenv';
import { getSampleDataset } from '../src/sampleData.js';

dotenv.config({ path: ['.env.local', '.env'] });

const port = 8092;
const baseUrl = `http://127.0.0.1:${port}`;

async function waitForServer(url: string, attempts = 40) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(`${url}/api/inspect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(getSampleDataset()),
      });

      if (response.status < 500) {
        return;
      }
    } catch {
      // booting
    }

    await delay(500);
  }

  throw new Error(`Server did not become ready at ${url}`);
}

async function postJson<T>(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  return { status: response.status, data: data as T };
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in the current shell environment.');
  }

  const child = spawn(
    'node',
    ['--import', 'tsx', 'server.ts'],
    {
      cwd: process.cwd(),
      env: { ...process.env, OPENAI_API_KEY: apiKey, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  child.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));

  try {
    await waitForServer(baseUrl);

    const sample = getSampleDataset();
    const inspect = await postJson<any>('/api/inspect', sample);
    console.log('inspect:', inspect.status, inspect.data.internalCount, inspect.data.partnerCount);

    const mapping = await postJson<any>('/api/suggest-mapping', {
      internalSchema: inspect.data.internalSchema,
      partnerSchema: inspect.data.partnerSchema,
    });
    console.log('suggest-mapping:', mapping.status, Object.keys(mapping.data.mapping || {}));

    const validate = await postJson<any>('/api/validate-mapping', {
      internalCsv: sample.internalCsv,
      partnerCsv: sample.partnerCsv,
      mapping: mapping.data.mapping && {
        transaction_id: {
          internal: mapping.data.mapping.transaction_id.internal,
          partner: mapping.data.mapping.transaction_id.partner,
        },
        amount: {
          internal: mapping.data.mapping.amount.internal,
          partner: mapping.data.mapping.amount.partner,
        },
        status: {
          internal: mapping.data.mapping.status.internal,
          partner: mapping.data.mapping.status.partner,
        },
        timestamp: {
          internal: mapping.data.mapping.timestamp.internal,
          partner: mapping.data.mapping.timestamp.partner,
        },
      },
    });
    console.log('validate-mapping:', validate.status, validate.data.score, validate.data.blockingIssues?.length ?? 0);

    const reconcile = await postJson<any>('/api/reconcile', {
      internalCsv: sample.internalCsv,
      partnerCsv: sample.partnerCsv,
      mapping: {
        transaction_id: {
          internal: mapping.data.mapping.transaction_id.internal,
          partner: mapping.data.mapping.transaction_id.partner,
        },
        amount: {
          internal: mapping.data.mapping.amount.internal,
          partner: mapping.data.mapping.amount.partner,
        },
        status: {
          internal: mapping.data.mapping.status.internal,
          partner: mapping.data.mapping.status.partner,
        },
        timestamp: {
          internal: mapping.data.mapping.timestamp.internal,
          partner: mapping.data.mapping.timestamp.partner,
        },
      },
    });
    console.log('reconcile:', reconcile.status, JSON.stringify(reconcile.data.summary));

    const mismatches = reconcile.data.rows.filter((row: any) => row.issue_flags.length > 0);
    const insights = await postJson<any>('/api/analyze-mismatches', {
      summary: reconcile.data.summary,
      mismatchRows: mismatches,
    });
    console.log('analyze-mismatches:', insights.status, insights.data.clusters?.length ?? 0);

    const chat = await postJson<any>('/api/chat-assistant', {
      message: 'Summarize the main reconciliation issues in 3 bullets.',
      history: [],
      context: {
        currentPhase: 'RESULTS',
        internalSchema: inspect.data.internalSchema,
        partnerSchema: inspect.data.partnerSchema,
        mapping: {
          transaction_id: {
            internal: mapping.data.mapping.transaction_id.internal,
            partner: mapping.data.mapping.transaction_id.partner,
          },
          amount: {
            internal: mapping.data.mapping.amount.internal,
            partner: mapping.data.mapping.amount.partner,
          },
          status: {
            internal: mapping.data.mapping.status.internal,
            partner: mapping.data.mapping.status.partner,
          },
          timestamp: {
            internal: mapping.data.mapping.timestamp.internal,
            partner: mapping.data.mapping.timestamp.partner,
          },
        },
        summary: reconcile.data.summary,
        selectedRow: mismatches[0] ?? null,
      },
    });
    console.log('chat-assistant:', chat.status, typeof chat.data.text === 'string' ? chat.data.text.slice(0, 120) : chat.data.error);
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
