import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { 
  parseCSV, 
  profileCSV, 
  validateMapping, 
  runReconciliation, 
  parseAmount, 
  normalizeStatus,
  suggestMappingHeuristic
} from './src/reconciliation_engine.js';
import { FieldMapping } from './src/types.js';

dotenv.config();

const app = express();
const PORT = 3000;

// Enable large JSON and body payloads for CSV transfers
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// Initialize the official @google/genai SDK on the server
// User-Agent: aistudio-build is mandatory for AI Studio telemetry
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Helper function to safely execute generateContent with automatic retry on 503 / UNAVAILABLE errors
// and model-fallback to high-availability Gemini models if needed.
async function generateContentWithRetry(params: any, retries = 3, delay = 1000) {
  let lastError: any = null;
  const modelsToTry = Array.from(new Set([
    params.model,
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ])).filter(Boolean);

  for (const model of modelsToTry) {
    if (!model) continue;
    const currentParams = { ...params, model };
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Calling Gemini with model ${model}, attempt ${attempt}...`);
        const response = await ai.models.generateContent(currentParams);
        return response;
      } catch (err: any) {
        lastError = err;
        console.error(`Attempt ${attempt} failed for model ${model}:`, err);
        
        // Convert error to string safely
        const errStr = typeof err === 'object' ? JSON.stringify(err) : String(err);
        const isUnavailable = errStr.includes('503') || 
                              errStr.toLowerCase().includes('unavailable') || 
                              errStr.toLowerCase().includes('high demand') ||
                              errStr.toLowerCase().includes('overloaded');
        
        if (isUnavailable && attempt < retries) {
          const backoffDelay = delay * Math.pow(2, attempt - 1);
          console.log(`Model ${model} is experiencing high demand. Retrying in ${backoffDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        } else {
          // If it's a non-retriable error, or we ran out of retries, break loop to try fallback model
          break;
        }
      }
    }
  }
  throw lastError || new Error('GenerateContent failed after fallback and retries');
}

// Endpoint 1: Inspect and profile uploaded files
app.post('/api/inspect', (req, res) => {
  try {
    const { internalFilename, internalCsv, partnerFilename, partnerCsv } = req.body;
    
    if (!internalCsv || !partnerCsv) {
      return res.status(400).json({ error: 'Thiếu dữ liệu tệp Hệ thống hoặc Đối tác.' });
    }

    const internalData = parseCSV(internalCsv);
    const partnerData = parseCSV(partnerCsv);

    const internalSchema = profileCSV(internalFilename || 'internal.csv', internalData);
    const partnerSchema = profileCSV(partnerFilename || 'partner.csv', partnerData);

    res.json({
      success: true,
      internalSchema,
      partnerSchema,
      internalCount: internalData.length,
      partnerCount: partnerData.length
    });
  } catch (err: any) {
    console.error('Inspect API error:', err);
    res.status(500).json({ error: err.message || 'Error processing data file structure.' });
  }
});

// Endpoint 2: Suggest field mappings using Gemini
app.post('/api/suggest-mapping', async (req, res) => {
  const { internalSchema, partnerSchema } = req.body;
  try {
    if (!internalSchema || !partnerSchema) {
      return res.status(400).json({ error: 'Missing file structure info (Schema) to suggest mapping.' });
    }

    // Call Gemini to intelligently map headers based on names and samples
    const prompt = `You are a financial reconciliation expert (Reconciliation Agent).
Analyze the 2 data file schemas below to automatically suggest mappings to 4 canonical fields:
1. transaction_id: Transaction identifier (must be unique or matching identifier between the 2 files)
2. amount: Transaction amount
3. status: Payment status (usually contains values like success, paid, failed, pending)
4. timestamp: Transaction timestamp

PLEASE CAREFULLY ANALYZE the column names and sample values of the 2 files.

Internal Schema:
${JSON.stringify(internalSchema, null, 2)}

Partner Schema:
${JSON.stringify(partnerSchema, null, 2)}

Output Requirements: Return a JSON object matching exactly the defined schema. Write a highly professional reason in English explaining why you matched these columns and any format warnings/notes (e.g. different date/time formats, amount might have fees deducted).`;

    const response = await generateContentWithRetry({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mapping: {
              type: Type.OBJECT,
              properties: {
                transaction_id: {
                  type: Type.OBJECT,
                  properties: {
                    internal: { type: Type.STRING, description: "Name of the transaction identifier column in the internal file" },
                    partner: { type: Type.STRING, description: "Name of the transaction identifier column in the partner file" },
                    confidence: { type: Type.NUMBER, description: "Confidence score from 0.0 to 1.0" },
                    reason: { type: Type.STRING, description: "Reason for mapping in English" }
                  },
                  required: ["internal", "partner", "confidence", "reason"]
                },
                amount: {
                  type: Type.OBJECT,
                  properties: {
                    internal: { type: Type.STRING, description: "Name of the transaction amount column in the internal file" },
                    partner: { type: Type.STRING, description: "Name of the transaction amount column in the partner file" },
                    confidence: { type: Type.NUMBER, description: "Confidence score from 0.0 to 1.0" },
                    reason: { type: Type.STRING, description: "Reason for mapping in English" }
                  },
                  required: ["internal", "partner", "confidence", "reason"]
                },
                status: {
                  type: Type.OBJECT,
                  properties: {
                    internal: { type: Type.STRING, description: "Name of the payment status column in the internal file" },
                    partner: { type: Type.STRING, description: "Name of the payment status column in the partner file" },
                    confidence: { type: Type.NUMBER, description: "Confidence score from 0.0 to 1.0" },
                    reason: { type: Type.STRING, description: "Reason for mapping in English" }
                  },
                  required: ["internal", "partner", "confidence", "reason"]
                },
                timestamp: {
                  type: Type.OBJECT,
                  properties: {
                    internal: { type: Type.STRING, description: "Name of the transaction timestamp column in the internal file" },
                    partner: { type: Type.STRING, description: "Name of the transaction timestamp column in the partner file" },
                    confidence: { type: Type.NUMBER, description: "Confidence score from 0.0 to 1.0" },
                    reason: { type: Type.STRING, description: "Reason for mapping in English" }
                  },
                  required: ["internal", "partner", "confidence", "reason"]
                }
              },
              required: ["transaction_id", "amount", "status", "timestamp"]
            }
          },
          required: ["mapping"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error('Did not receive a valid response from AI.');
    }
    const mappingResult = JSON.parse(resultText);
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
      res.status(500).json({ error: err.message || 'Error suggesting mapping.' });
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

    const internalData = parseCSV(internalCsv);
    const partnerData = parseCSV(partnerCsv);

    const validationResult = validateMapping(internalData, partnerData, mapping);
    res.json(validationResult);
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

    const internalData = parseCSV(internalCsv);
    const partnerData = parseCSV(partnerCsv);

    const result = runReconciliation(internalData, partnerData, mapping);
    res.json(result);
  } catch (err: any) {
    console.error('Reconcile error:', err);
    res.status(500).json({ error: err.message || 'System error executing reconciliation algorithm.' });
  }
});

// Endpoint 5: Analyze mismatches using Gemini clustering
app.post('/api/analyze-mismatches', async (req, res) => {
  try {
    const { summary, mismatchRows } = req.body;
    if (!mismatchRows || !summary) {
      return res.status(400).json({ error: 'Missing mismatch list to analyze.' });
    }

    // Send a curated representative subset of mismatches to prevent token limits
    const representativeRows = mismatchRows.slice(0, 30);

    const prompt = `You are an AI Financial Reconciliation Auditor (AI Reconciliation Auditor).
    Your task is to identify and cluster mismatches from the unmatched transaction list below.
    Find logical financial patterns and formulate hypotheses to explain each mismatch cluster in English.

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
    1. Group these mismatches into a maximum of 3-4 smart clusters (Mismatch Clusters).
    2. Write in extremely concise, clear, and punchy professional English with deep financial logic.
    3. Keep all fields strictly short and clean:
       - "confirmedFacts": Maximum of 1 or 2 bullet points (under 15 words each).
       - "hypothesis": Exactly 1 or 2 sentences max.
       - "recommendedAction": Exactly 1 action-oriented sentence under 20 words for the audit/accounting team.
    4. Avoid any boilerplate, verbose summaries, or generic filler comments. Focus directly on the specific data patterns.`;

    const response = await generateContentWithRetry({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "Broad overview of the reconciliation mismatch status" },
            clusters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  clusterId: { type: Type.STRING, description: "Unique identifier for the cluster (e.g. fee_deviation)" },
                  clusterName: { type: Type.STRING, description: "Short intuitive cluster name" },
                  size: { type: Type.INTEGER, description: "Estimated number of transactions affected in this cluster" },
                  severity: { type: Type.STRING, description: "Severity level: low, medium, or high" },
                  confirmedFacts: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Clear factual evidence supported by data in the file"
                  },
                  hypothesis: { type: Type.STRING, description: "Financial reasoning/hypothesis explaining why this happens" },
                  recommendedAction: { type: Type.STRING, description: "Actionable step-by-step guidance for auditors to verify/resolve" }
                },
                required: ["clusterId", "clusterName", "size", "severity", "confirmedFacts", "hypothesis", "recommendedAction"]
              }
            }
          },
          required: ["summary", "clusters"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error('Did not receive valid analysis from AI.');
    }
    const analysisResult = JSON.parse(resultText);
    res.json(analysisResult);
  } catch (err: any) {
    console.error('Analyze mismatches error:', err);
    res.status(500).json({ error: err.message || 'Error executing AI mismatch clustering analysis.' });
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

    const fullPrompt = `${chatHistoryPrompt}\nUser: ${message}\nAgent:`;

    const response = await generateContentWithRetry({
      model: 'gemini-2.5-flash',
      contents: fullPrompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    res.json({
      success: true,
      text: response.text || 'Sorry, I am unable to answer this question at the moment.'
    });
  } catch (err: any) {
    console.error('Chat Assistant error:', err);
    res.status(500).json({ error: err.message || 'Error connecting to the AI assistant.' });
  }
});

// Configure Vite or Static Asset Serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is booted and running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
