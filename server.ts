import express from 'express';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { 
  suggestMappingHeuristic
} from './src/reconciliation_engine.js';
import {
  inspectCsvPair,
  reconcileCsvPair,
  validateCsvMapping,
} from './src/reconciliation_service.js';
import { createReconciliationMcpServer } from './src/mcp.js';

dotenv.config({ path: ['.env.local', '.env'] });

const app = express();
const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

// Enable large JSON and body payloads for CSV transfers
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

async function handleMcpRequest(req: Request, res: Response) {
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const server = createReconciliationMcpServer();

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'MCP request failed.' });
    }
  } finally {
    await server.close().catch(() => undefined);
  }
}

app.all('/mcp', (req, res) => {
  void handleMcpRequest(req, res);
});

const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

const llmCache = new Map<string, { expiresAt: number; value: unknown }>();

function ensureOpenAI() {
  if (!openai) {
    throw new Error('OPENAI_API_KEY is not configured on the server.');
  }
  return openai;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCacheKey(namespace: string, payload: unknown) {
  return createHash('sha256')
    .update(namespace)
    .update(JSON.stringify(payload))
    .digest('hex');
}

function getCachedValue<T>(cacheKey: string): T | null {
  const cached = llmCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    llmCache.delete(cacheKey);
    return null;
  }
  return cached.value as T;
}

function setCachedValue(cacheKey: string, value: unknown, ttlMs: number) {
  llmCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

async function createResponseWithRetry(payload: Parameters<OpenAI['responses']['create']>[0], retries = 4, baseDelayMs = 1200) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      console.log(`Calling OpenAI model ${payload.model}, attempt ${attempt}...`);
      return await ensureOpenAI().responses.create(payload);
    } catch (error: any) {
      lastError = error;
      const status = error?.status;
      const isRetriable = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
      if (!isRetriable || attempt === retries) {
        break;
      }

      const backoffMs = Math.min(baseDelayMs * Math.pow(2, attempt - 1), 8000) + Math.floor(Math.random() * 350);
      console.warn(`OpenAI request failed with status ${status}. Retrying in ${backoffMs}ms...`);
      await delay(backoffMs);
    }
  }

  throw lastError;
}

function extractOutputText(response: Awaited<ReturnType<OpenAI['responses']['create']>>) {
  if (!('output_text' in response) || typeof response.output_text !== 'string') {
    throw new Error('Received an unexpected response type from OpenAI.');
  }
  return response.output_text.trim();
}

async function createStructuredJson<T extends object>(options: {
  cacheNamespace: string;
  cachePayload: unknown;
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  ttlMs?: number;
}) {
  const cacheKey = buildCacheKey(options.cacheNamespace, options.cachePayload);
  const cached = getCachedValue<T>(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await createResponseWithRetry({
    model: OPENAI_MODEL,
    instructions: options.instructions,
    input: options.input,
    max_output_tokens: 1200,
    text: {
      format: {
        type: 'json_schema',
        name: options.schemaName,
        strict: true,
        schema: options.schema,
      },
    },
  });

  const text = extractOutputText(response);
  if (!text) {
    throw new Error('Did not receive valid structured output from OpenAI.');
  }

  const parsed = JSON.parse(text) as T;
  setCachedValue(cacheKey, parsed, options.ttlMs ?? 10 * 60 * 1000);
  return parsed;
}

async function createTextReply(options: {
  cacheNamespace?: string;
  cachePayload?: unknown;
  instructions: string;
  input: string;
  maxOutputTokens?: number;
  ttlMs?: number;
}) {
  const cacheKey = options.cacheNamespace && options.cachePayload
    ? buildCacheKey(options.cacheNamespace, options.cachePayload)
    : null;

  if (cacheKey) {
    const cached = getCachedValue<string>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const response = await createResponseWithRetry({
    model: OPENAI_MODEL,
    instructions: options.instructions,
    input: options.input,
    max_output_tokens: options.maxOutputTokens ?? 600,
  });

  const text = extractOutputText(response);
  if (!text) {
    throw new Error('Did not receive a text response from OpenAI.');
  }

  if (cacheKey) {
    setCachedValue(cacheKey, text, options.ttlMs ?? 2 * 60 * 1000);
  }

  return text;
}

// Endpoint 1: Inspect and profile uploaded files
app.post('/api/inspect', (req, res) => {
  try {
    const { internalFilename, internalCsv, partnerFilename, partnerCsv } = req.body;
    
    if (!internalCsv || !partnerCsv) {
      return res.status(400).json({ error: 'Thiếu dữ liệu tệp Hệ thống hoặc Đối tác.' });
    }

    res.json(inspectCsvPair({
      internalFilename,
      internalCsv,
      partnerFilename,
      partnerCsv,
    }));
  } catch (err: any) {
    console.error('Inspect API error:', err);
    res.status(500).json({ error: err.message || 'Error processing data file structure.' });
  }
});

// Endpoint 2: Suggest field mappings using OpenAI
app.post('/api/suggest-mapping', async (req, res) => {
  const { internalSchema, partnerSchema } = req.body;
  try {
    if (!internalSchema || !partnerSchema) {
      return res.status(400).json({ error: 'Missing file structure info (Schema) to suggest mapping.' });
    }

    const prompt = `Analyze the 2 data file schemas below to automatically suggest mappings to 4 canonical fields:
1. transaction_id: Transaction identifier (must be unique or matching identifier between the 2 files)
2. amount: Transaction amount
3. status: Payment status (usually contains values like success, paid, failed, pending)
4. timestamp: Transaction timestamp

PLEASE CAREFULLY ANALYZE the column names and sample values of the 2 files.

Internal Schema:
${JSON.stringify(internalSchema, null, 2)}

Partner Schema:
${JSON.stringify(partnerSchema, null, 2)}`;

    const mappingResult = await createStructuredJson({
      cacheNamespace: 'suggest-mapping',
      cachePayload: { internalSchema, partnerSchema },
      instructions: `You are a financial reconciliation expert.
Analyze the 2 data file schemas below to automatically suggest mappings to 4 canonical fields:
1. transaction_id
2. amount
3. status
4. timestamp

Return JSON matching the schema exactly.
Reasons must be concise, professional English.
Confidence must be between 0 and 1.
Do not add extra fields.`,
      input: prompt,
      schemaName: 'reconciliation_mapping',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          mapping: {
            type: 'object',
            additionalProperties: false,
            properties: {
              transaction_id: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  internal: { type: 'string' },
                  partner: { type: 'string' },
                  confidence: { type: 'number' },
                  reason: { type: 'string' },
                },
                required: ['internal', 'partner', 'confidence', 'reason'],
              },
              amount: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  internal: { type: 'string' },
                  partner: { type: 'string' },
                  confidence: { type: 'number' },
                  reason: { type: 'string' },
                },
                required: ['internal', 'partner', 'confidence', 'reason'],
              },
              status: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  internal: { type: 'string' },
                  partner: { type: 'string' },
                  confidence: { type: 'number' },
                  reason: { type: 'string' },
                },
                required: ['internal', 'partner', 'confidence', 'reason'],
              },
              timestamp: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  internal: { type: 'string' },
                  partner: { type: 'string' },
                  confidence: { type: 'number' },
                  reason: { type: 'string' },
                },
                required: ['internal', 'partner', 'confidence', 'reason'],
              },
            },
            required: ['transaction_id', 'amount', 'status', 'timestamp'],
          },
        },
        required: ['mapping'],
      },
    });
    res.json(mappingResult);
  } catch (err: any) {
    console.error('Suggest mapping error, falling back to heuristic:', err);
    try {
      const heuristicResult = suggestMappingHeuristic(internalSchema, partnerSchema);
      // Annotate the reasons to transparently indicate fallback mode
      heuristicResult.mapping.transaction_id.reason += " (AI Fallback Heuristic Mode)";
      heuristicResult.mapping.amount.reason += " (AI Fallback Heuristic Mode)";
      heuristicResult.mapping.status.reason += " (AI Fallback Heuristic Mode)";
      heuristicResult.mapping.timestamp.reason += " (AI Fallback Heuristic Mode)";
      res.json(heuristicResult);
    } catch (fallbackErr: any) {
      console.error('Heuristic fallback mapping failed:', fallbackErr);
      res.status(err?.status === 429 ? 429 : 500).json({
        error: err?.status === 429
          ? 'OpenAI rate limit reached while suggesting mapping. Please retry in a few seconds.'
          : (err.message || 'Error suggesting mapping.'),
      });
    }
  }
});

// Endpoint 3: Validate field mapping with runtime preview
app.post('/api/validate-mapping', (req, res) => {
  try {
    const { internalCsv, partnerCsv, mapping } = req.body;
    if (!internalCsv || !partnerCsv || !mapping) {
      return res.status(400).json({ error: 'Missing data or mapping configuration for validation.' });
    }

    res.json(validateCsvMapping({ internalCsv, partnerCsv, mapping }));
  } catch (err: any) {
    console.error('Validate mapping error:', err);
    res.status(500).json({ error: err.message || 'Error validating field mapping.' });
  }
});

// Endpoint 4: Run deterministic reconciliation
app.post('/api/reconcile', (req, res) => {
  try {
    const { internalCsv, partnerCsv, mapping } = req.body;
    if (!internalCsv || !partnerCsv || !mapping) {
      return res.status(400).json({ error: 'Missing data or mapping configuration to run reconciliation.' });
    }

    res.json(reconcileCsvPair({ internalCsv, partnerCsv, mapping }));
  } catch (err: any) {
    console.error('Reconcile error:', err);
    res.status(500).json({ error: err.message || 'System error executing reconciliation algorithm.' });
  }
});

// Endpoint 5: Analyze mismatches using OpenAI structured outputs
app.post('/api/analyze-mismatches', async (req, res) => {
  try {
    const { summary, mismatchRows } = req.body;
    if (!mismatchRows || !summary) {
      return res.status(400).json({ error: 'Missing mismatch list to analyze.' });
    }

    // Keep the payload tight to reduce token usage and demo-time rate-limit risk.
    const representativeRows = mismatchRows.slice(0, 12).map((row: any) => ({
      transaction_id: row.transaction_id,
      issue_flags: row.issue_flags,
      internal_amount: row.internal_amount,
      partner_amount: row.partner_amount,
      internal_status: row.internal_status,
      partner_status: row.partner_status,
      details: row.details,
    }));

    const prompt = `Identify and cluster reconciliation mismatches from the rows below.

Current summary statistics:
    - Total: ${summary.total} transactions
    - Matched: ${summary.matched}
    - Amount mismatches: ${summary.amount_mismatch}
    - Status mismatches: ${summary.status_mismatch}
    - Missing in System (Only in Partner): ${summary.missing_internal}
    - Missing in Partner (Only in System): ${summary.missing_partner}

    Here are some typical mismatch rows for reference:
    ${JSON.stringify(representativeRows, null, 2)}

Analysis requirements:
1. Group these mismatches into a maximum of 3 clusters.
2. Keep output concise and audit-friendly.
3. confirmedFacts: maximum 2 short bullets.
4. hypothesis: 1 or 2 sentences.
5. recommendedAction: 1 action sentence.
6. Avoid boilerplate.`;

    const analysisResult = await createStructuredJson({
      cacheNamespace: 'analyze-mismatches',
      cachePayload: { summary, representativeRows },
      instructions: `You are an AI financial reconciliation auditor.
Return strict JSON matching the schema exactly.
Only use evidence visible in the provided summary and mismatch rows.
Keep all text concise and specific.`,
      input: prompt,
      schemaName: 'mismatch_cluster_report',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          summary: { type: 'string' },
          clusters: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                clusterId: { type: 'string' },
                clusterName: { type: 'string' },
                size: { type: 'integer' },
                severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                confirmedFacts: {
                  type: 'array',
                  items: { type: 'string' },
                },
                hypothesis: { type: 'string' },
                recommendedAction: { type: 'string' },
              },
              required: ['clusterId', 'clusterName', 'size', 'severity', 'confirmedFacts', 'hypothesis', 'recommendedAction'],
            },
          },
        },
        required: ['summary', 'clusters'],
      },
    });
    res.json(analysisResult);
  } catch (err: any) {
    console.error('Analyze mismatches error:', err);
    res.status(err?.status === 429 ? 429 : 500).json({
      error: err?.status === 429
        ? 'OpenAI rate limit reached while generating mismatch insights. Please retry in a few seconds.'
        : (err.message || 'Error executing AI mismatch clustering analysis.'),
    });
  }
});

// Endpoint 6: Chat assistant for general Q&A and detail explanation
app.post('/api/chat-assistant', async (req, res) => {
  try {
    const { message, history, context } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Please provide message content.' });
    }

    const { currentPhase, internalSchema, partnerSchema, mapping, summary, selectedRow } = context || {};

    const chatHistoryPrompt = history && history.length > 0 
      ? history.map((h: any) => `${h.sender === 'user' ? 'User' : 'Agent'}: ${h.text}`).join('\n')
      : '';

    const systemInstruction = `You are "ReconCopilot" - a professional AI Assistant in the Agentic Reconciliation Workspace.
Your task is to support financial controllers/auditors, answer queries, analyze reconciliation data, and suggest actions to resolve mismatches.

Current Workspace Context:
- Current Phase: ${currentPhase || 'INTAKE'}
- Internal Ledger: ${internalSchema ? internalSchema.rowCount + ' rows' : 'Not uploaded'}
- Partner Ledger: ${partnerSchema ? partnerSchema.rowCount + ' rows' : 'Not uploaded'}
- Field Mapping: ${mapping ? JSON.stringify(mapping) : 'Not configured'}
- Reconciliation Summary: ${summary ? JSON.stringify(summary) : 'Not executed'}
${selectedRow ? `- Transaction currently selected for detailed audit: ${JSON.stringify(selectedRow)}` : ''}

Communication Rules:
1. Always respond in professional, polite, and extremely concise English.
2. Format your response using clean Markdown. Use **bolding**, lists, bullet points, and inline \`code blocks\` for IDs or parameters. Keep lists short (3 items max) and descriptions punchy. Avoid long paragraphs of prose.
3. NEVER invent mock transaction IDs, amounts, or data not present in the files or conversation.
4. If the user selects a specific mismatch transaction, analyze the values briefly (e.g. amount difference could indicate a gateway processing fee; status mismatch could indicate a late webhook trigger). Keep explanations under 2-3 sentences.
5. Always preserve a direct, helpful, and action-oriented tone. Avoid generic filler.`;

    const compactContext = {
      currentPhase,
      internalRows: internalSchema?.rowCount ?? null,
      partnerRows: partnerSchema?.rowCount ?? null,
      mapping,
      summary,
      selectedRow: selectedRow ? {
        transaction_id: selectedRow.transaction_id,
        issue_flags: selectedRow.issue_flags,
        internal_amount: selectedRow.internal_amount,
        partner_amount: selectedRow.partner_amount,
        internal_status: selectedRow.internal_status,
        partner_status: selectedRow.partner_status,
        details: selectedRow.details,
      } : null,
    };

    const fullPrompt = `Recent conversation:
${chatHistoryPrompt || 'No prior messages.'}

Workspace context:
${JSON.stringify(compactContext, null, 2)}

User:
${message}`;

    const text = await createTextReply({
      cacheNamespace: 'chat-assistant',
      cachePayload: {
        message,
        history: history?.slice(-4) ?? [],
        context: compactContext,
      },
      instructions: systemInstruction,
      input: fullPrompt,
      maxOutputTokens: 400,
      ttlMs: 60 * 1000,
    });

    res.json({
      success: true,
      text: text || 'Sorry, I am unable to answer this question at the moment.'
    });
  } catch (err: any) {
    console.error('Chat Assistant error:', err);
    const status = err?.status === 429 ? 429 : 500;
    res.status(status).json({
      error: err?.status === 429
        ? 'OpenAI rate limit reached for this demo step. Please retry in a few seconds.'
        : (err.message || 'Error connecting to the AI assistant.'),
    });
  }
});

// Configure Vite or Static Asset Serving
async function startServer() {
  const distPath = path.join(process.cwd(), 'dist');
  
  if (fs.existsSync(distPath)) {
    console.log('Serving production static assets from dist/ folder');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.log('Vite dist folder not found, starting Vite in development mode');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server is booted and running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
