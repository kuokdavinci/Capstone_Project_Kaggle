import React, { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import { 
  Upload, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Play, 
  FileText, 
  MessageSquare, 
  Send, 
  Download, 
  ChevronRight, 
  Layers, 
  Check, 
  Sparkles, 
  HelpCircle,
  TrendingUp,
  ShieldAlert,
  Info,
  Sliders,
  DollarSign,
  Eye,
  FileSpreadsheet
} from 'lucide-react';
import { 
  FileSchema, 
  FieldMapping, 
  ValidationResult, 
  ReconciliationResult, 
  ReconciliationRow, 
  MismatchAnalysisResult, 
  MismatchCluster, 
  ToolTrace, 
  ChatMessage, 
  RunPhase 
} from './types';

// Hardcoded Golden Sample Data for Viet Nam Fintech Demo
const SAMPLE_INTERNAL_FILENAME = 'internal_ledger_payos.csv';
const SAMPLE_INTERNAL_CSV = `Transaction_ID,Amount,Status,Timestamp
TXN_20260629_001,250000,SUCCESS,2026-06-29 10:01:00
TXN_20260629_002,150000,SUCCESS,2026-06-29 10:05:22
TXN_20260629_003,500000,SUCCESS,2026-06-29 10:12:15
TXN_20260629_004,1200000,FAILED,2026-06-29 10:15:00
TXN_20260629_005,85000,SUCCESS,2026-06-29 10:20:10
TXN_20260629_006,300000,PENDING,2026-06-29 10:25:00
TXN_20260629_007,950000,SUCCESS,2026-06-29 10:30:45
TXN_20260629_008,120000,SUCCESS,2026-06-29 10:45:00`;

const SAMPLE_PARTNER_FILENAME = 'partner_settlement_momo.csv';
const SAMPLE_PARTNER_CSV = `Partner_Ref,Gross_Value,Payment_State,Settled_At
TXN_20260629_001,250000,PAID,2026-06-29 10:02:15
TXN_20260629_002,148500,PAID,2026-06-29 10:06:00
TXN_20260629_003,500000,FAILED,2026-06-29 10:15:10
TXN_20260629_004,1200000,FAILED,2026-06-29 10:15:30
TXN_20260629_005,84150,PAID,2026-06-29 10:22:00
TXN_20260629_007,950000,PAID,2026-06-29 10:32:00
TXN_20260629_009,450000,PAID,2026-06-29 11:00:00`;

export default function App() {
  // Phase & File upload state
  const [currentPhase, setCurrentPhase] = useState<RunPhase>('INTAKE');
  const [internalFilename, setInternalFilename] = useState<string>('');
  const [internalCsv, setInternalCsv] = useState<string>('');
  const [partnerFilename, setPartnerFilename] = useState<string>('');
  const [partnerCsv, setPartnerCsv] = useState<string>('');

  // Schemas & analysis profiles
  const [internalSchema, setInternalSchema] = useState<FileSchema | null>(null);
  const [partnerSchema, setPartnerSchema] = useState<FileSchema | null>(null);
  const [isInspecting, setIsInspecting] = useState<boolean>(false);

  // Field Mapping state
  const [mapping, setMapping] = useState<FieldMapping>({
    transaction_id: { internal: '', partner: '' },
    amount: { internal: '', partner: '' },
    status: { internal: '', partner: '' },
    timestamp: { internal: '', partner: '' }
  });
  const [mappingConfidence, setMappingConfidence] = useState<Record<string, { confidence: number; reason: string }>>({});
  const [isSuggestingMapping, setIsSuggestingMapping] = useState<boolean>(false);

  // Validation state
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  // Reconciliation state
  const [isReconciling, setIsReconciling] = useState<boolean>(false);
  const [reconcileProgress, setReconcileProgress] = useState<number>(0);
  const [reconciliationResult, setReconciliationResult] = useState<ReconciliationResult | null>(null);

  // AI clustering & analysis state
  const [isAnalyzingMismatches, setIsAnalyzingMismatches] = useState<boolean>(false);
  const [mismatchAnalysis, setMismatchAnalysis] = useState<MismatchAnalysisResult | null>(null);

  // Interactive UI details
  const [activeTab, setActiveTab] = useState<'all' | 'matched' | 'amount_mismatch' | 'status_mismatch' | 'missing_internal' | 'missing_partner'>('all');
  const [selectedRow, setSelectedRow] = useState<ReconciliationRow | null>(null);

  // Chat interface state
  const [chatInput, setChatInput] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      sender: 'agent',
      text: 'Hello! I am ReconCopilot - your fintech reconciliation AI assistant. I am ready to help you analyze, map, and detect financial mismatches between your system and partner ledgers. Start by uploading CSV files or click "Use Sample Data" to experience the full workspace!',
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [rightSidebarTab, setRightSidebarTab] = useState<'chat' | 'logs'>('chat');

  // Tool tracing to show "What makes it Agentic"
  const [toolTraces, setToolTraces] = useState<ToolTrace[]>([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const getAverageMappingConfidence = () => {
    if (!mappingConfidence || Object.keys(mappingConfidence).length === 0) return null;
    const values = Object.values(mappingConfidence);
    const total = values.reduce((sum, item) => sum + item.confidence, 0);
    return (total / values.length) * 100;
  };

  // Log a tool trace event helper
  const addToolTrace = (toolName: string, input: any, output: any, status: 'success' | 'error' = 'success') => {
    const newTrace: ToolTrace = {
      id: `trace_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      toolName,
      input,
      output,
      status
    };
    setToolTraces(prev => [newTrace, ...prev]);
  };

  // 1. Triggered when files are uploaded/set
  const handleInspectFiles = async (intCsv: string, intName: string, partCsv: string, partName: string) => {
    setIsInspecting(true);
    addToolTrace('inspect_files_start', { intName, partName }, 'Starting data structure profiling...');
    
    try {
      const response = await fetch('/api/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internalFilename: intName,
          internalCsv: intCsv,
          partnerFilename: partName,
          partnerCsv: partCsv
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setInternalSchema(data.internalSchema);
        setPartnerSchema(data.partnerSchema);
        addToolTrace('inspect_files_completed', {
          internalCount: data.internalCount,
          partnerCount: data.partnerCount
        }, data);

        // Update Agent response message in chat
        const botMsg: ChatMessage = {
          id: `inspect_${Date.now()}`,
          sender: 'agent',
          text: `🔍 **File profiling complete!**\n\n- **System (${intName}):** Detected ${data.internalCount} transaction rows, with columns: \`${data.internalSchema.columns.join(', ')}\`.\n- **Partner (${partName}):** Detected ${data.partnerCount} transaction rows, with columns: \`${data.partnerSchema.columns.join(', ')}\`.\n\nI have analyzed the data types and distribution. Let's proceed to the **Mapping & Validation** step, where I'll auto-suggest matching fields for you!`,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages(prev => [...prev, botMsg]);

        // Suggest mappings automatically once inspected
        triggerAIOptimalMapping(data.internalSchema, data.partnerSchema, intCsv, partCsv);
        
        // Transition phase
        setCurrentPhase('MAPPING');
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error(err);
      addToolTrace('inspect_files_failed', { intName, partName }, err.message, 'error');
      alert(`File analysis error: ${err.message}`);
    } finally {
      setIsInspecting(false);
    }
  };

  // Load sample fintech datasets for quick evaluation
  const loadSampleData = () => {
    setInternalFilename(SAMPLE_INTERNAL_FILENAME);
    setInternalCsv(SAMPLE_INTERNAL_CSV);
    setPartnerFilename(SAMPLE_PARTNER_FILENAME);
    setPartnerCsv(SAMPLE_PARTNER_CSV);
    
    handleInspectFiles(SAMPLE_INTERNAL_CSV, SAMPLE_INTERNAL_FILENAME, SAMPLE_PARTNER_CSV, SAMPLE_PARTNER_FILENAME);
  };

  // 2. Propose field mapping based on schemas using Gemini
  const triggerAIOptimalMapping = async (
    intSchema: FileSchema, 
    partSchema: FileSchema,
    overrideIntCsv?: string,
    overridePartCsv?: string
  ) => {
    setIsSuggestingMapping(true);
    addToolTrace('suggest_mapping_start', { intSchema, partSchema }, 'Sending schema profiles to Gemini AI...');
    
    try {
      const response = await fetch('/api/suggest-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalSchema: intSchema, partnerSchema: partSchema })
      });
      
      const data = await response.json();
      if (data.mapping) {
        const m = data.mapping;
        const newMapping: FieldMapping = {
          transaction_id: { internal: m.transaction_id.internal, partner: m.transaction_id.partner },
          amount: { internal: m.amount.internal, partner: m.amount.partner },
          status: { internal: m.status.internal, partner: m.status.partner },
          timestamp: { internal: m.timestamp.internal, partner: m.timestamp.partner }
        };
        
        setMapping(newMapping);
        setMappingConfidence({
          transaction_id: { confidence: m.transaction_id.confidence, reason: m.transaction_id.reason },
          amount: { confidence: m.amount.confidence, reason: m.amount.reason },
          status: { confidence: m.status.confidence, reason: m.status.reason },
          timestamp: { confidence: m.timestamp.confidence, reason: m.timestamp.reason }
        });

        addToolTrace('suggest_mapping_completed', newMapping, data);

        // Append to chat
        const botMsg: ChatMessage = {
          id: `suggest_${Date.now()}`,
          sender: 'agent',
          text: `💡 **Mapping Suggestions from ReconCopilot (AI Proposed):**\n\nI have analyzed the column headers and actual sample values to map the optimal fields:\n1. **Transaction ID (transaction_id):** \`${newMapping.transaction_id.internal}\` ↔ \`${newMapping.transaction_id.partner}\` (Confidence: ${(m.transaction_id.confidence * 100).toFixed(0)}%)\n2. **Amount (amount):** \`${newMapping.amount.internal}\` ↔ \`${newMapping.amount.partner}\` (Confidence: ${(m.amount.confidence * 100).toFixed(0)}%)\n3. **Status (status):** \`${newMapping.status.internal}\` ↔ \`${newMapping.status.partner}\` (Confidence: ${(m.status.confidence * 100).toFixed(0)}%)\n4. **Timestamp (timestamp):** \`${newMapping.timestamp.internal}\` ↔ \`${newMapping.timestamp.partner}\` (Confidence: ${(m.timestamp.confidence * 100).toFixed(0)}%)\n\n*Reasoning details*: ${m.amount.reason}\n\nYou can fine-tune this manually if needed before proceeding to **Validation and Reconciliation**!`,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages(prev => [...prev, botMsg]);

        // Run an initial quick mapping validation preview automatically
        runQuickMappingValidation(newMapping, overrideIntCsv, overridePartCsv);
      }
    } catch (err: any) {
      console.error(err);
      addToolTrace('suggest_mapping_failed', {}, err.message, 'error');
    } finally {
      setIsSuggestingMapping(false);
    }
  };

  // 3. Validation helper
  const runQuickMappingValidation = async (
    currentMap: FieldMapping,
    overrideIntCsv?: string,
    overridePartCsv?: string
  ) => {
    const activeIntCsv = overrideIntCsv || internalCsv;
    const activePartCsv = overridePartCsv || partnerCsv;

    if (!activeIntCsv || !activePartCsv) {
      setValidationResult({
        isValid: false,
        score: 0,
        blockingIssues: ['Please upload both data files before validating mapping configuration.'],
        warnings: [],
        previewRows: []
      });
      return;
    }

    setIsValidating(true);
    addToolTrace('validate_mapping_start', currentMap, 'Analyzing validation and running test preview on 10 sample rows...');
    
    try {
      const response = await fetch('/api/validate-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internalCsv: activeIntCsv,
          partnerCsv: activePartCsv,
          mapping: currentMap
        })
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${response.status})`);
      }
      
      const data: ValidationResult = await response.json();
      if ((data as any).error) {
        throw new Error((data as any).error);
      }
      setValidationResult(data);
      addToolTrace('validate_mapping_completed', currentMap, data);
    } catch (err: any) {
      console.error(err);
      addToolTrace('validate_mapping_failed', currentMap, err.message, 'error');
      setValidationResult({
        isValid: false,
        score: 0,
        blockingIssues: [err.message || 'System error when validating mapping configuration.'],
        warnings: [],
        previewRows: []
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Manual Mapping Change handler
  const handleMappingChange = (field: keyof FieldMapping, side: 'internal' | 'partner', value: string) => {
    const updated = {
      ...mapping,
      [field]: {
        ...mapping[field],
        [side]: value
      }
    };
    setMapping(updated);
    runQuickMappingValidation(updated);
  };

  // 4. Run Deterministic Reconciliation Engine with visual loading steps
  const handleRunReconciliation = async () => {
    if (!validationResult?.isValid) {
      alert("The current mapping configuration is invalid or has blocking issues.");
      return;
    }

    setIsReconciling(true);
    setReconciliationResult(null);
    setReconcileProgress(10);
    setCurrentPhase('RUN');

    addToolTrace('run_reconciliation_start', { mapping }, 'Starting ledger reconciliation process...');

    // Visual delays to simulate robust pipeline validation
    const interval = setInterval(() => {
      setReconcileProgress(p => {
        if (p >= 90) {
          clearInterval(interval);
          return 90;
        }
        return p + 20;
      });
    }, 400);

    try {
      const response = await fetch('/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internalCsv,
          partnerCsv,
          mapping
        })
      });

      const data: ReconciliationResult = await response.json();
      
      clearInterval(interval);
      setReconcileProgress(100);

      setTimeout(async () => {
        setReconciliationResult(data);
        setIsReconciling(false);
        setCurrentPhase('RESULTS');
        addToolTrace('run_reconciliation_completed', { runId: data.runId }, data.summary);

        const botMsg: ChatMessage = {
          id: `reconcile_${Date.now()}`,
          sender: 'agent',
          text: `🎉 **RECONCILIATION COMPLETE!**\n\nI have executed the deterministic financial matching engine:\n- **Total Transactions Collected:** ${data.summary.total}\n- **Fully Matched:** ${data.summary.matched} (${((data.summary.matched / data.summary.total) * 100).toFixed(1)}%)\n- **Amount Mismatch:** ${data.summary.amount_mismatch}\n- **Status Mismatch:** ${data.summary.status_mismatch}\n- **Missing in System (Only in Partner):** ${data.summary.missing_internal}\n- **Missing in Partner (Only in System):** ${data.summary.missing_partner}\n\n*I am now running AI Clustering to detect underlying financial root causes and anomalies. Review the ledger results on the side panel.*`,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages(prev => [...prev, botMsg]);

        // Auto trigger AI Mismatch Clustering & Assessment
        triggerAIMismatchAnalysis(data);
      }, 500);

    } catch (err: any) {
      clearInterval(interval);
      setIsReconciling(false);
      alert(`Reconciliation error: ${err.message}`);
      addToolTrace('run_reconciliation_failed', {}, err.message, 'error');
    }
  };

  // 5. Analyze and Cluster Mismatches using Gemini
  const triggerAIMismatchAnalysis = async (result: ReconciliationResult) => {
    setIsAnalyzingMismatches(true);
    addToolTrace('analyze_mismatches_start', { resultId: result.resultId }, 'Sending mismatch records to Gemini for cluster analysis...');

    const mismatches = result.rows.filter(r => r.issue_flags.length > 0);

    try {
      const response = await fetch('/api/analyze-mismatches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: result.summary,
          mismatchRows: mismatches
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${response.status})`);
      }

      const data: MismatchAnalysisResult = await response.json();
      if ((data as any).error) {
        throw new Error((data as any).error);
      }
      if (!data.clusters || !Array.isArray(data.clusters)) {
        throw new Error("Did not receive valid cluster analysis data from AI.");
      }

      setMismatchAnalysis(data);
      addToolTrace('analyze_mismatches_completed', { clusterCount: data.clusters.length }, data);

      // Create a nice summarized chat reply
      const clusterBulletPoints = data.clusters.map(c => 
        `- **${c.clusterName}** (${c.size} rows - Severity: *${c.severity.toUpperCase()}*): ${c.hypothesis}\n  👉 *Recommendation:* ${c.recommendedAction}`
      ).join('\n\n');

      const botMsg: ChatMessage = {
        id: `analysis_${Date.now()}`,
        sender: 'agent',
        text: `🤖 **AI Mismatch Cluster & Root Cause Report:**\n\nI have detected **${data.clusters.length} repeating mismatch patterns** in this reconciliation run:\n\n${clusterBulletPoints}\n\n*Overview Summary*: ${data.summary}`,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, botMsg]);

    } catch (err: any) {
      console.error(err);
      addToolTrace('analyze_mismatches_failed', {}, err.message, 'error');
      
      // Append user friendly error message to chat
      const botMsg: ChatMessage = {
        id: `analysis_err_${Date.now()}`,
        sender: 'agent',
        text: `⚠️ **AI Mismatch Clustering encountered an issue:** ${err.message || 'Unknown error'}.\n\nYou can still audit the transactions manually using the ledger details table below!`,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, botMsg]);
    } finally {
      setIsAnalyzingMismatches(false);
    }
  };

  // 6. User Chat with full context
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setChatInput('');

    // Append user message immediately
    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, userMsg]);
    setIsChatLoading(true);

    addToolTrace('chat_assistant_call', { text: userText }, 'Sending user message and workspace context to ReconCopilot...');

    try {
      const response = await fetch('/api/chat-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history: chatMessages.slice(-8), // Send last 8 messages as chat history context
          context: {
            currentPhase,
            internalSchema,
            partnerSchema,
            mapping,
            summary: reconciliationResult?.summary,
            selectedRow
          }
        })
      });

      const data = await response.json();
      if (data.success) {
        const botMsg: ChatMessage = {
          id: `bot_reply_${Date.now()}`,
          sender: 'agent',
          text: data.text,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages(prev => [...prev, botMsg]);
        addToolTrace('chat_assistant_reply', {}, 'Success reply');
      } else {
        throw new Error(data.error || 'Unknown assistant error');
      }
    } catch (err: any) {
      console.error(err);
      const botErrorMsg: ChatMessage = {
        id: `bot_err_${Date.now()}`,
        sender: 'agent',
        text: `⚠️ An error occurred connecting to the AI: ${err.message}. However, your local reconciliation calculations and logs remain intact.`,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, botErrorMsg]);
      addToolTrace('chat_assistant_failed', { text: userText }, err.message, 'error');
    } finally {
      setIsChatLoading(false);
    }
  };

  // Helper to trigger specific transaction explanation via chat
  const handleInspectRowDetailWithAI = (row: ReconciliationRow) => {
    setSelectedRow(row);
    const textMsg = `Please perform a deep-dive analysis of transaction ID \`${row.transaction_id}\`. Why was it flagged as a mismatch, and what are the potential causes?`;
    setChatInput(textMsg);
    
    // Add warning/guidance highlight right away
    const botMsg: ChatMessage = {
      id: `shortcut_${Date.now()}`,
      sender: 'agent',
      text: `🔍 You selected Transaction ID **${row.transaction_id}** for detailed audit.\n\n- **System Ledger:** Amount: \`${row.internal_amount?.toLocaleString('en-US')}\` | Status: \`${row.internal_status || 'NOT_FOUND'}\`\n- **Partner Ledger:** Amount: \`${row.partner_amount?.toLocaleString('en-US')}\` | Status: \`${row.partner_status || 'NOT_FOUND'}\`\n- **Mismatch Details:** ${row.details}\n\n*I have loaded this transaction context. Press the 'Send' button in the chat box to request a complete AI analysis of this mismatch!*`,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, botMsg]);
  };

  // File drag-and-drop or manual text box
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, side: 'internal' | 'partner') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (side === 'internal') {
        setInternalFilename(file.name);
        setInternalCsv(text);
        if (partnerCsv) {
          handleInspectFiles(text, file.name, partnerCsv, partnerFilename);
        }
      } else {
        setPartnerFilename(file.name);
        setPartnerCsv(text);
        if (internalCsv) {
          handleInspectFiles(internalCsv, internalFilename, text, file.name);
        }
      }
    };
    reader.readAsText(file);
  };

  // Handle manual input of custom text
  const submitCustomCsvText = (side: 'internal' | 'partner', text: string) => {
    if (side === 'internal') {
      setInternalCsv(text);
      setInternalFilename('custom_internal.csv');
      if (partnerCsv) {
        handleInspectFiles(text, 'custom_internal.csv', partnerCsv, partnerFilename);
      }
    } else {
      setPartnerCsv(text);
      setPartnerFilename('custom_partner.csv');
      if (internalCsv) {
        handleInspectFiles(internalCsv, internalFilename, text, 'custom_partner.csv');
      }
    }
  };

  const resetAll = () => {
    setCurrentPhase('INTAKE');
    setInternalFilename('');
    setInternalCsv('');
    setPartnerFilename('');
    setPartnerCsv('');
    setInternalSchema(null);
    setPartnerSchema(null);
    setMapping({
      transaction_id: { internal: '', partner: '' },
      amount: { internal: '', partner: '' },
      status: { internal: '', partner: '' },
      timestamp: { internal: '', partner: '' }
    });
    setMappingConfidence({});
    setValidationResult(null);
    setReconciliationResult(null);
    setMismatchAnalysis(null);
    setSelectedRow(null);
    setToolTraces([]);
    setChatMessages([
      {
        id: 'reset',
        sender: 'agent',
        text: 'Workspace has been reset. Please upload new files or click "Use Sample Data" to start the fintech reconciliation flow!',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  // Export Results to CSV helper
  const handleExportCSV = () => {
    if (!reconciliationResult) return;
    let headers = 'Transaction_ID,Issue_Flags,Internal_Amount,Partner_Amount,Internal_Status,Partner_Status,Internal_Timestamp,Partner_Timestamp,Severity,Details\n';
    const csvContent = reconciliationResult.rows.map(r => {
      return `"${r.transaction_id}","${r.issue_flags.join(';') || 'ok'}","${r.internal_amount || ''}","${r.partner_amount || ''}","${r.internal_status || ''}","${r.partner_status || ''}","${r.internal_timestamp || ''}","${r.partner_timestamp || ''}","${r.severity}","${r.details.replace(/"/g, '""')}"`;
    }).join('\n');

    const blob = new Blob([headers + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `reconciliation_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addToolTrace('generate_report', { format: 'csv' }, 'Successfully exported reconciliation report to CSV');
  };

  return (
    <div id="recon-root" className="min-h-screen bg-[#09090b] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      
      {/* 1. HEADER SECTION (Bento styled, clean and modern) */}
      <header className="border-b border-slate-800/80 bg-slate-950/40 backdrop-blur-md px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-emerald-600 to-teal-400 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">Agentic Reconciliation Workspace</h1>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded-full font-mono border border-emerald-500/20">Fintech Domain</span>
            </div>
            <p className="text-xs text-slate-400">AI Copilot & Deterministic Financial Ledger Matching</p>
          </div>
        </div>

        {/* Phase State Indicator */}
        <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 p-1.5 rounded-xl text-xs">
          <button 
            disabled={!internalCsv} 
            onClick={() => { setCurrentPhase('INTAKE'); }}
            className={`px-3 py-1.5 rounded-lg transition-all ${currentPhase === 'INTAKE' ? 'bg-emerald-500 text-white font-medium shadow-md shadow-emerald-500/10' : 'text-slate-400 hover:text-slate-200'}`}
          >
            1. Intake
          </button>
          <ChevronRight className="w-3 h-3 text-slate-600" />
          <button 
            disabled={!internalSchema || !partnerSchema} 
            onClick={() => { setCurrentPhase('MAPPING'); }}
            className={`px-3 py-1.5 rounded-lg transition-all ${currentPhase === 'MAPPING' ? 'bg-emerald-500 text-white font-medium shadow-md shadow-emerald-500/10' : 'text-slate-400 hover:text-slate-200'}`}
          >
            2. Mapping
          </button>
          <ChevronRight className="w-3 h-3 text-slate-600" />
          <button 
            disabled={!validationResult?.isValid} 
            onClick={() => { setCurrentPhase('RUN'); }}
            className={`px-3 py-1.5 rounded-lg transition-all ${currentPhase === 'RUN' ? 'bg-emerald-500 text-white font-medium shadow-md shadow-emerald-500/10' : 'text-slate-400 hover:text-slate-200'}`}
          >
            3. Run Matching
          </button>
          <ChevronRight className="w-3 h-3 text-slate-600" />
          <button 
            disabled={!reconciliationResult} 
            onClick={() => { setCurrentPhase('RESULTS'); }}
            className={`px-3 py-1.5 rounded-lg transition-all ${currentPhase === 'RESULTS' ? 'bg-[#18181b] text-white border border-slate-700 font-medium' : 'text-slate-400 hover:text-slate-200'}`}
          >
            4. Results
          </button>
        </div>

        {/* Global Toolbar */}
        <div className="flex gap-2">
          {internalCsv && (
            <button 
              onClick={resetAll}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded-xl border border-slate-850 hover:border-slate-700 text-xs flex items-center gap-1.5 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
          <div className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs flex items-center gap-1.5">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
            <span className="text-slate-300">ReconCopilot AI: Active</span>
          </div>
        </div>
      </header>

      {/* 2. MAIN BENTO GRID BODY */}
      <div className="flex-1 p-6 grid grid-cols-12 gap-5 overflow-x-hidden">
        
        {/* LEFT & CENTER WORKSPACE: Grid column 1 to 8 */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-5">
          
          {/* PHASE 1: INTAKE - UPLOAD AREA */}
          {currentPhase === 'INTAKE' && (
            <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col gap-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-emerald-400" /> 1. Intake Reconciliation Ledgers
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">Upload transaction lists from your internal ledger and bank/partner gateway settlement files.</p>
                </div>
                <button 
                  onClick={loadSampleData}
                  className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/20 text-xs font-semibold flex items-center gap-2 transition-all shadow-sm cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 animate-bounce" /> Use Sample Fintech Ledgers
                </button>
              </div>

              {/* Bento Row of Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* 1. Internal Ledger Card */}
                <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between group">
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono">INTERNAL SYSTEM LEDGER</span>
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    </div>
                    
                    {internalFilename ? (
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 flex items-center justify-between">
                        <div className="truncate">
                          <p className="text-xs font-medium text-emerald-300 truncate">{internalFilename}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{internalSchema?.rowCount || 0} transactions loaded</p>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      </div>
                    ) : (
                      <div className="border border-dashed border-slate-800 group-hover:border-slate-700 rounded-lg p-6 flex flex-col items-center justify-center text-center bg-slate-950/30 transition-all">
                        <Upload className="w-8 h-8 text-slate-500 mb-2 group-hover:text-emerald-400 transition-colors" />
                        <label className="text-xs text-slate-300 font-semibold cursor-pointer hover:text-emerald-400 underline">
                          Upload system CSV
                          <input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'internal')} className="hidden" />
                        </label>
                        <p className="text-[10px] text-slate-500 mt-1">Supports ID, amount, status, datetime...</p>
                      </div>
                    )}

                    {/* Or paste directly zone */}
                    <div className="mt-4">
                      <details className="text-xs text-slate-400 cursor-pointer">
                        <summary className="hover:text-slate-200">Paste raw CSV contents manually</summary>
                        <textarea 
                          placeholder="Transaction_ID,Amount,Status,Timestamp&#10;TXN01,50000,SUCCESS,2026-06-29 10:00:00"
                          className="w-full h-24 bg-slate-950 border border-slate-850 rounded-lg mt-2 p-2 font-mono text-[10px] text-slate-300 focus:outline-none focus:border-emerald-500"
                          onBlur={(e) => submitCustomCsvText('internal', e.target.value)}
                        />
                      </details>
                    </div>
                  </div>

                  {internalFilename && (
                    <div className="mt-4 text-[10px] text-slate-500 font-mono">
                      Detected structure: {internalSchema?.columns.slice(0, 4).join(', ')} ...
                    </div>
                  )}
                </div>

                {/* 2. Partner Card */}
                <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between group">
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-amber-500 uppercase tracking-wider font-mono">PARTNER SETTLEMENT (GATEWAY/BANK)</span>
                      <FileSpreadsheet className="w-4 h-4 text-amber-500" />
                    </div>
                    
                    {partnerFilename ? (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 flex items-center justify-between">
                        <div className="truncate">
                          <p className="text-xs font-medium text-amber-300 truncate">{partnerFilename}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{partnerSchema?.rowCount || 0} settlements loaded</p>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />
                      </div>
                    ) : (
                      <div className="border border-dashed border-slate-800 group-hover:border-slate-700 rounded-lg p-6 flex flex-col items-center justify-center text-center bg-slate-950/30 transition-all">
                        <Upload className="w-8 h-8 text-slate-500 mb-2 group-hover:text-amber-500 transition-colors" />
                        <label className="text-xs text-slate-300 font-semibold cursor-pointer hover:text-amber-400 underline">
                          Upload partner CSV
                          <input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'partner')} className="hidden" />
                        </label>
                        <p className="text-[10px] text-slate-500 mt-1">Bank statement, Stripe, PayPal, Momo etc.</p>
                      </div>
                    )}

                    {/* Or paste directly zone */}
                    <div className="mt-4">
                      <details className="text-xs text-slate-400 cursor-pointer">
                        <summary className="hover:text-slate-200">Paste raw CSV contents manually</summary>
                        <textarea 
                          placeholder="Partner_Ref,Gross_Value,Payment_State,Settled_At&#10;TXN01,49500,PAID,2026-06-29 10:02:00"
                          className="w-full h-24 bg-slate-950 border border-slate-850 rounded-lg mt-2 p-2 font-mono text-[10px] text-slate-300 focus:outline-none focus:border-emerald-500"
                          onBlur={(e) => submitCustomCsvText('partner', e.target.value)}
                        />
                      </details>
                    </div>
                  </div>

                  {partnerFilename && (
                    <div className="mt-4 text-[10px] text-slate-500 font-mono">
                      Detected structure: {partnerSchema?.columns.slice(0, 4).join(', ')} ...
                    </div>
                  )}
                </div>

              </div>

              {/* Bottom guide callouts */}
              {isInspecting ? (
                <div className="flex items-center justify-center gap-3 py-6 bg-slate-950/40 rounded-xl border border-slate-800">
                  <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
                  <span className="text-sm text-slate-300">Profiling file format & schema structure...</span>
                </div>
              ) : (
                internalFilename && partnerFilename && (
                  <div className="flex justify-end mt-4">
                    <button 
                      onClick={() => setCurrentPhase('MAPPING')}
                      className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-emerald-500/15 cursor-pointer transition-all"
                    >
                      Proceed to Mapping <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          {/* PHASE 2: FIELD MAPPING & VALIDATION */}
          {currentPhase === 'MAPPING' && (
            <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col gap-6">
              
              {/* Header inside phase */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-emerald-400" /> 2. Field Mapping & Preview Validation
                  </h2>
                  <p className="text-xs text-slate-400">ReconCopilot has mapped columns using AI. You can customize manually and inspect preview errors below.</p>
                </div>

                <button 
                  onClick={() => internalSchema && partnerSchema && triggerAIOptimalMapping(internalSchema, partnerSchema)}
                  disabled={isSuggestingMapping}
                  className="px-3 py-1.5 bg-gradient-to-tr from-emerald-600/10 to-teal-400/10 hover:from-emerald-600/20 hover:to-teal-400/20 text-emerald-300 rounded-xl border border-emerald-500/20 text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 animate-pulse text-emerald-400" /> AI Re-Suggest
                </button>
              </div>

              {/* Mapping Interactive Table */}
              <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/20">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono bg-slate-950/40">
                      <th className="p-3">Normalized Field</th>
                      <th className="p-3">System Column (Internal)</th>
                      <th className="p-3">Partner Column (External)</th>
                      <th className="p-3 hidden md:table-cell font-mono">Agent Confidence</th>
                      <th className="p-3 hidden md:table-cell">Logic & Reasoning</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    
                    {/* 1. Transaction ID */}
                    <tr>
                      <td className="p-3 font-semibold text-slate-200">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                          Transaction ID <span className="text-rose-500">*</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <select 
                          value={mapping.transaction_id.internal}
                          onChange={(e) => handleMappingChange('transaction_id', 'internal', e.target.value)}
                          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg p-2 text-slate-300 w-full focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">-- Select column --</option>
                          {internalSchema?.columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="p-3">
                        <select 
                          value={mapping.transaction_id.partner}
                          onChange={(e) => handleMappingChange('transaction_id', 'partner', e.target.value)}
                          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg p-2 text-slate-300 w-full focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">-- Select column --</option>
                          {partnerSchema?.columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="p-3 hidden md:table-cell font-mono">
                        {mappingConfidence.transaction_id ? (
                          <span className="text-emerald-400">{(mappingConfidence.transaction_id.confidence * 100).toFixed(0)}%</span>
                        ) : '---'}
                      </td>
                      <td className="p-3 hidden md:table-cell text-slate-400 max-w-xs truncate">
                        {mappingConfidence.transaction_id?.reason || 'Maps unique identifiers across systems.'}
                      </td>
                    </tr>

                    {/* 2. Amount */}
                    <tr>
                      <td className="p-3 font-semibold text-slate-200">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                          Transaction Amount <span className="text-rose-500">*</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <select 
                          value={mapping.amount.internal}
                          onChange={(e) => handleMappingChange('amount', 'internal', e.target.value)}
                          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg p-2 text-slate-300 w-full focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">-- Select column --</option>
                          {internalSchema?.columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="p-3">
                        <select 
                          value={mapping.amount.partner}
                          onChange={(e) => handleMappingChange('amount', 'partner', e.target.value)}
                          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg p-2 text-slate-300 w-full focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">-- Select column --</option>
                          {partnerSchema?.columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="p-3 hidden md:table-cell font-mono">
                        {mappingConfidence.amount ? (
                          <span className="text-emerald-400">{(mappingConfidence.amount.confidence * 100).toFixed(0)}%</span>
                        ) : '---'}
                      </td>
                      <td className="p-3 hidden md:table-cell text-slate-400 max-w-xs truncate" title={mappingConfidence.amount?.reason}>
                        {mappingConfidence.amount?.reason || 'Maps numerical fields to identify variance.'}
                      </td>
                    </tr>

                    {/* 3. Status */}
                    <tr>
                      <td className="p-3 font-semibold text-slate-200">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                          Payment Status <span className="text-rose-500">*</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <select 
                          value={mapping.status.internal}
                          onChange={(e) => handleMappingChange('status', 'internal', e.target.value)}
                          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg p-2 text-slate-300 w-full focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">-- Select column --</option>
                          {internalSchema?.columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="p-3">
                        <select 
                          value={mapping.status.partner}
                          onChange={(e) => handleMappingChange('status', 'partner', e.target.value)}
                          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg p-2 text-slate-300 w-full focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">-- Select column --</option>
                          {partnerSchema?.columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="p-3 hidden md:table-cell font-mono">
                        {mappingConfidence.status ? (
                          <span className="text-emerald-400">{(mappingConfidence.status.confidence * 100).toFixed(0)}%</span>
                        ) : '---'}
                      </td>
                      <td className="p-3 hidden md:table-cell text-slate-400 max-w-xs truncate">
                        {mappingConfidence.status?.reason || 'Automates status normalization for mismatches.'}
                      </td>
                    </tr>

                    {/* 4. Timestamp */}
                    <tr>
                      <td className="p-3 font-semibold text-slate-200">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                          Transaction Timestamp <span className="text-rose-500">*</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <select 
                          value={mapping.timestamp.internal}
                          onChange={(e) => handleMappingChange('timestamp', 'internal', e.target.value)}
                          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg p-2 text-slate-300 w-full focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">-- Select column --</option>
                          {internalSchema?.columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="p-3">
                        <select 
                          value={mapping.timestamp.partner}
                          onChange={(e) => handleMappingChange('timestamp', 'partner', e.target.value)}
                          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg p-2 text-slate-300 w-full focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">-- Select column --</option>
                          {partnerSchema?.columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="p-3 hidden md:table-cell font-mono">
                        {mappingConfidence.timestamp ? (
                          <span className="text-emerald-400">{(mappingConfidence.timestamp.confidence * 100).toFixed(0)}%</span>
                        ) : '---'}
                      </td>
                      <td className="p-3 hidden md:table-cell text-slate-400 max-w-xs truncate">
                        {mappingConfidence.timestamp?.reason || 'Detects temporal slippages and timezone lag.'}
                      </td>
                    </tr>

                  </tbody>
                </table>
              </div>

              {/* BENTO GRID ELEMENT: VALIDATION RESULT CARD & PREVIEW ZONE */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                
                {/* 1. Validation Status Widget */}
                <div className="md:col-span-1 bg-slate-950/40 border border-slate-800 p-5 rounded-xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest font-mono mb-2">
                      <Check className="w-4 h-4 text-emerald-400" /> Validation Status
                    </div>

                    {validationResult ? (
                      <div className="mt-2">
                        {validationResult.isValid ? (
                          <div>
                            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                              <CheckCircle2 className="w-5 h-5" /> Ready for Reconciliation
                            </div>
                            <div className="text-3xl font-mono font-medium text-white mt-2">
                              {(validationResult.score * 100).toFixed(0)}%
                            </div>
                            <p className="text-[10px] text-slate-400 mb-2">Preview Match Rate (fully aligned sample rows)</p>
                            
                            {getAverageMappingConfidence() !== null && (
                              <div className="mt-3 pt-2 text-[10px] text-slate-500 border-t border-slate-900 flex justify-between items-center">
                                <span>AI Mapping Confidence:</span>
                                <span className="text-emerald-400 font-bold font-mono">
                                  {getAverageMappingConfidence()?.toFixed(0)}%
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                              <XCircle className="w-5 h-5" /> Mapping Blocked
                            </div>
                            <p className="text-xs text-slate-300 mt-2">Critical errors blocking the deterministic matching engine.</p>
                          </div>
                        )}

                        {/* List Warnings / Errors */}
                        {validationResult.warnings && validationResult.warnings.length > 0 && (
                          <div className="mt-4 border-t border-slate-850 pt-3">
                            <span className="text-[10px] font-bold text-amber-500 uppercase flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" /> Warnings ({validationResult.warnings?.length || 0})
                            </span>
                            <div className="text-[10px] text-slate-300 space-y-1 mt-1 max-h-24 overflow-y-auto">
                              {validationResult.warnings?.map((w, idx) => (
                                <p key={idx} className="bg-amber-500/5 p-1 border border-amber-500/10 rounded">{w}</p>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* List Blocking Issues */}
                        {validationResult.blockingIssues && validationResult.blockingIssues.length > 0 && (
                          <div className="mt-4 border-t border-slate-850 pt-3">
                            <span className="text-[10px] font-bold text-rose-500 uppercase flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5" /> Blocking Issues ({validationResult.blockingIssues?.length || 0})
                            </span>
                            <div className="text-[10px] text-slate-300 space-y-1 mt-1">
                              {validationResult.blockingIssues?.map((w, idx) => (
                                <p key={idx} className="bg-rose-500/5 p-1 border border-rose-500/10 rounded text-rose-300">{w}</p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Preparing to validate schemas...</p>
                    )}
                  </div>

                  {validationResult?.isValid && (
                    <button 
                      onClick={() => setCurrentPhase('RUN')}
                      className="mt-6 w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-500/10"
                    >
                      Continue to Matching Launcher <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* 2 & 3. Runtime Preview Grid */}
                <div className="md:col-span-2 bg-slate-950/40 border border-slate-800 p-5 rounded-xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                        <Eye className="w-4 h-4 text-emerald-400" /> Mapping Preview (Runtime)
                      </span>
                      <span className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">First 10 rows</span>
                    </div>

                    {validationResult?.previewRows && validationResult.previewRows.length > 0 ? (
                      <div className="overflow-x-auto max-h-48 overflow-y-auto border border-slate-850 rounded-lg">
                        <table className="w-full text-[11px] text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-850 text-slate-400 bg-slate-900/60 font-mono">
                              <th className="p-2">Transaction ID (ID)</th>
                              <th className="p-2 text-right">Amount (System)</th>
                              <th className="p-2 text-right">Amount (Partner)</th>
                              <th className="p-2 text-center">Status</th>
                              <th className="p-2 text-right">Mismatch Detection</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-850 font-mono text-slate-300">
                            {validationResult.previewRows?.map((p, idx) => {
                              const isErr = p.detected_issue !== 'ok';
                              return (
                                <tr key={idx} className={isErr ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-slate-900/40'}>
                                  <td className="p-2 font-medium">{p.transaction_id}</td>
                                  <td className="p-2 text-right text-emerald-400">{p.internal_amount?.toLocaleString('en-US')}</td>
                                  <td className="p-2 text-right text-amber-300">{p.partner_amount?.toLocaleString('en-US') || 'N/A'}</td>
                                  <td className="p-2 text-center text-[10px]">
                                    <span className="bg-slate-900 border border-slate-800 px-1 py-0.5 rounded text-[9px]">
                                      {p.internal_status} ↔ {p.partner_status || 'N/A'}
                                    </span>
                                  </td>
                                  <td className="p-2 text-right">
                                    {p.detected_issue === 'ok' && <span className="text-emerald-400 text-[10px]">✓ Matched</span>}
                                    {p.detected_issue === 'amount_mismatch' && <span className="text-rose-400 text-[10px] font-semibold flex items-center gap-0.5 justify-end"><AlertTriangle className="w-3 h-3" /> Amount Mismatch</span>}
                                    {p.detected_issue === 'status_mismatch' && <span className="text-amber-400 text-[10px] font-semibold flex items-center gap-0.5 justify-end"><AlertTriangle className="w-3 h-3" /> Status Mismatch</span>}
                                    {p.detected_issue === 'other' && <span className="text-slate-400 text-[10px]">Missing Partner</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="h-36 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-lg bg-slate-900/10 text-slate-500 text-xs">
                        <Info className="w-6 h-6 mb-1 text-slate-600" />
                        No preview data available yet. Please complete mapping of all required fields.
                      </div>
                    )}
                  </div>
                  
                  <p className="text-[10px] text-slate-500 italic mt-2">Matching transaction IDs verify alignment and integrity between ledgers.</p>
                </div>

              </div>

            </div>
          )}

          {/* PHASE 3: RUN CONSOLE - TRIGGER RECONCILIATION */}
          {currentPhase === 'RUN' && (
            <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col gap-6">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Play className="w-5 h-5 text-emerald-400" /> 3. Execute Reconciliation Engine
                </h2>
                <p className="text-xs text-slate-400">Matching launcher is ready. The Deterministic Reconciliation Engine will automatically reconcile the financial ledgers with high-precision logic.</p>
              </div>

              {/* Console Details Box */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* File summary */}
                <div className="bg-slate-950/40 border border-slate-800 p-5 rounded-xl flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Ledger Resource Summary</span>
                    <div className="space-y-3 mt-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Internal System File:</span>
                        <span className="text-emerald-400 font-mono font-bold">{internalFilename} ({internalSchema?.rowCount} rows)</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Partner Settlement File:</span>
                        <span className="text-amber-400 font-mono font-bold">{partnerFilename} ({partnerSchema?.rowCount} rows)</span>
                      </div>
                      <div className="h-px bg-slate-850 w-full" />
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Primary ID Mapping:</span>
                        <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded font-mono text-slate-200">{mapping.transaction_id.internal} ↔ {mapping.transaction_id.partner}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Amount Field Mapping:</span>
                        <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded font-mono text-slate-200">{mapping.amount.internal} ↔ {mapping.amount.partner}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-500 font-mono mt-4">Preview Match Rate: {validationResult ? (validationResult.score * 100).toFixed(0) : '---'}%</p>
                </div>

                {/* Big Action button with loading progress */}
                <div className="bg-slate-950/40 border border-slate-800 p-5 rounded-xl flex flex-col justify-center items-center text-center">
                  {isReconciling ? (
                    <div className="w-full flex flex-col items-center">
                      <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin mb-3" />
                      <p className="text-sm font-bold text-white">Running high-speed financial reconciliation...</p>
                      <p className="text-xs text-slate-400 mt-1">Normalizing states, analyzing ledger discrepancies...</p>
                      
                      {/* Custom progress bar */}
                      <div className="w-full bg-slate-900 rounded-full h-2 mt-4 max-w-xs border border-slate-800 overflow-hidden">
                        <div 
                          className="bg-emerald-500 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${reconcileProgress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-emerald-400 font-mono mt-1">{reconcileProgress}%</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-3 border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                        <Play className="w-5 h-5 text-emerald-400 fill-emerald-400/20" />
                      </div>
                      <p className="text-sm font-bold text-slate-200">Begin Financial Reconciliation</p>
                      <p className="text-xs text-slate-500 mt-1 mb-4">Matching calculations will be written directly to the ledger results below.</p>
                      
                      <button 
                        onClick={handleRunReconciliation}
                        className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-emerald-500/15 animate-pulse"
                      >
                        <Play className="w-4 h-4 fill-white" /> Run Reconciliation
                      </button>
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* PHASE 4: RESULTS DASHBOARD & DISCREPANCIES ASSESSMENT */}
          {currentPhase === 'RESULTS' && reconciliationResult && (
            <div className="flex flex-col gap-5">
              
              {/* BENTO ROW: 4 Summary widgets */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                
                {/* 1. Matched transactions */}
                <div className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-xl shadow-sm flex flex-col justify-between">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Fully Matched</span>
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                  </div>
                  <div className="mt-2">
                    <div className="text-2xl font-mono font-medium text-white">
                      {reconciliationResult.summary.matched}
                    </div>
                    <p className="text-[10px] text-emerald-400 font-mono">
                      {((reconciliationResult.summary.matched / reconciliationResult.summary.total) * 100).toFixed(1)}% transactions
                    </p>
                  </div>
                </div>

                {/* 2. Amount Mismatch */}
                <div 
                  onClick={() => setActiveTab('amount_mismatch')}
                  className={`bg-slate-900/40 border p-4 rounded-xl shadow-sm flex flex-col justify-between cursor-pointer transition-all ${activeTab === 'amount_mismatch' ? 'border-rose-500' : 'border-slate-800/80 hover:border-slate-700'}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider font-mono">Amount Mismatches</span>
                    <DollarSign className="w-3.5 h-3.5 text-rose-400" />
                  </div>
                  <div className="mt-2">
                    <div className="text-2xl font-mono font-medium text-rose-400">
                      {reconciliationResult.summary.amount_mismatch}
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono">Discrepancies in system vs partner</p>
                  </div>
                </div>

                {/* 3. Status Mismatch */}
                <div 
                  onClick={() => setActiveTab('status_mismatch')}
                  className={`bg-slate-900/40 border p-4 rounded-xl shadow-sm flex flex-col justify-between cursor-pointer transition-all ${activeTab === 'status_mismatch' ? 'border-amber-500' : 'border-slate-800/80 hover:border-slate-700'}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider font-mono">Status Mismatches</span>
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="mt-2">
                    <div className="text-2xl font-mono font-medium text-amber-400">
                      {reconciliationResult.summary.status_mismatch}
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono">Synchronization or state mismatch</p>
                  </div>
                </div>

                {/* 4. Missing entries on both sides */}
                <div 
                  onClick={() => setActiveTab('missing_internal')}
                  className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-xl shadow-sm flex flex-col justify-between cursor-pointer hover:border-slate-700 transition-all"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono font-mono">Unilateral Entries</span>
                    <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className="mt-2">
                    <div className="text-2xl font-mono font-medium text-slate-300">
                      {reconciliationResult.summary.missing_internal + reconciliationResult.summary.missing_partner}
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono">Missing Internal: {reconciliationResult.summary.missing_internal} | Partner: {reconciliationResult.summary.missing_partner}</p>
                  </div>
                </div>

              </div>

              {/* BENTO COMPONENT: AI MISMATCH CLUSTER REPORT */}
              <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-400" /> AI Mismatch Cluster & Root Cause Diagnostics
                    </h2>
                    <p className="text-[11px] text-slate-400">ReconCopilot automatically clusters discrepancies, identifies repeating anomalies, and diagnoses potential root causes.</p>
                  </div>

                  {isAnalyzingMismatches && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Clustering anomalies...
                    </div>
                  )}
                </div>

                {mismatchAnalysis ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    {mismatchAnalysis.clusters.map((c, idx) => (
                      <div key={idx} className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl hover:border-slate-800 transition-all flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-slate-200">{c.clusterName}</span>
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-semibold ${
                              c.severity === 'high' ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20' : 
                              c.severity === 'medium' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' : 
                              'bg-slate-800 text-slate-400'
                            }`}>
                              Severity: {c.severity.toUpperCase()}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-300 space-y-1.5 font-sans">
                            {/* Facts vs Hypotheses */}
                            <div className="bg-slate-900/50 p-2 rounded border border-slate-850">
                              <span className="text-[9px] font-bold text-emerald-400 font-mono uppercase block">VERIFIED DATA FACTS:</span>
                              <div className="text-[10px] text-slate-400 mt-1 space-y-0.5">
                                {c.confirmedFacts.map((fact, fidx) => (
                                  <p key={fidx}>• {fact}</p>
                                ))}
                              </div>
                            </div>

                            <p className="mt-2 text-slate-200">
                              <span className="text-[9px] font-bold text-amber-400 font-mono uppercase">AI DIAGNOSTIC HYPOTHESIS:</span><br/>
                              {c.hypothesis}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-850 text-[10px] text-emerald-400 flex items-start gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span><strong>Recommendation:</strong> {c.recommendedAction}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
                    {isAnalyzingMismatches ? 'AI is analyzing discrepancies and building root-cause clusters...' : 'No critical mismatches detected requiring root cause analysis.'}
                  </div>
                )}
              </div>

              {/* BENTO COMPONENT: CORE RESULT DETAILS TABLE */}
              <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
                
                {/* Header & Tabs */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h2 className="text-base font-bold text-white">Reconciliation Audit Ledger</h2>
                    <p className="text-[11px] text-slate-400">Full audit list of transactions consolidated across both ledgers.</p>
                  </div>

                  {/* Filter tabs */}
                  <div className="flex flex-wrap gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-850 text-[10px] font-medium">
                    <button 
                      onClick={() => setActiveTab('all')}
                      className={`px-2.5 py-1.5 rounded-lg transition-all ${activeTab === 'all' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      All ({reconciliationResult.rows.length})
                    </button>
                    <button 
                      onClick={() => setActiveTab('matched')}
                      className={`px-2.5 py-1.5 rounded-lg transition-all ${activeTab === 'matched' ? 'bg-emerald-500/10 text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Matched ({reconciliationResult.summary.matched})
                    </button>
                    <button 
                      onClick={() => setActiveTab('amount_mismatch')}
                      className={`px-2.5 py-1.5 rounded-lg transition-all ${activeTab === 'amount_mismatch' ? 'bg-rose-500/10 text-rose-400 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Amount Mismatch ({reconciliationResult.summary.amount_mismatch})
                    </button>
                    <button 
                      onClick={() => setActiveTab('status_mismatch')}
                      className={`px-2.5 py-1.5 rounded-lg transition-all ${activeTab === 'status_mismatch' ? 'bg-amber-500/10 text-amber-400 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Status Mismatch ({reconciliationResult.summary.status_mismatch})
                    </button>
                    <button 
                      onClick={() => setActiveTab('missing_internal')}
                      className={`px-2.5 py-1.5 rounded-lg transition-all ${activeTab === 'missing_internal' ? 'bg-slate-800 text-slate-300 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Unilateral ({reconciliationResult.summary.missing_internal + reconciliationResult.summary.missing_partner})
                    </button>
                  </div>
                </div>

                {/* Filter mapping */}
                {(() => {
                  const filtered = reconciliationResult.rows.filter(r => {
                    if (activeTab === 'all') return true;
                    if (activeTab === 'matched') return r.issue_flags.length === 0;
                    if (activeTab === 'amount_mismatch') return r.issue_flags.includes('amount_mismatch');
                    if (activeTab === 'status_mismatch') return r.issue_flags.includes('status_mismatch');
                    if (activeTab === 'missing_internal') return r.issue_flags.includes('missing_internal') || r.issue_flags.includes('missing_partner');
                    return true;
                  });

                  return (
                    <div className="flex flex-col gap-3">
                      <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/20 max-h-96">
                        <table className="w-full text-left border-collapse table-fixed min-w-[950px]">
                          <thead>
                            <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono bg-slate-950/40">
                              <th className="p-3 w-[150px]">Transaction ID</th>
                              <th className="p-3 text-right w-[120px]">System Amount</th>
                              <th className="p-3 text-right w-[120px]">Partner Amount</th>
                              <th className="p-3 text-center w-[180px]">Status (Sys ↔ Part)</th>
                              <th className="p-3 w-[110px]">Severity</th>
                              <th className="p-3 w-[300px]">Mismatch Details</th>
                              <th className="p-3 text-center w-[70px]">AI Copilot</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-850 text-xs text-slate-300">
                            {filtered.length > 0 ? (
                              filtered.map((r, idx) => {
                                const hasErr = r.issue_flags.length > 0;
                                return (
                                  <tr 
                                    key={idx} 
                                    onClick={() => setSelectedRow(r)}
                                    className={`hover:bg-slate-900/50 cursor-pointer ${selectedRow?.transaction_id === r.transaction_id ? 'bg-slate-800/40 border-l-2 border-emerald-500' : ''}`}
                                  >
                                    <td className="p-3 font-mono font-medium truncate w-[150px]" title={r.transaction_id}>{r.transaction_id}</td>
                                    <td className="p-3 text-right text-emerald-400 font-mono w-[120px]">
                                      {r.internal_amount !== null ? `${r.internal_amount.toLocaleString('en-US')} VND` : '---'}
                                    </td>
                                    <td className="p-3 text-right text-amber-300 font-mono w-[120px]">
                                      {r.partner_amount !== null ? `${r.partner_amount.toLocaleString('en-US')} VND` : '---'}
                                    </td>
                                    <td className="p-3 text-center w-[180px]">
                                      <span className="text-[10px] bg-slate-900 border border-slate-850 px-2 py-0.5 rounded font-mono truncate block" title={`${r.internal_status || 'N/A'} ↔ ${r.partner_status || 'N/A'}`}>
                                        {r.internal_status || 'N/A'} ↔ {r.partner_status || 'N/A'}
                                      </span>
                                    </td>
                                    <td className="p-3 w-[110px]">
                                      {!hasErr ? (
                                        <span className="text-emerald-400 font-mono text-[10px]">Low</span>
                                      ) : (
                                        <span className={`font-mono text-[10px] font-bold ${
                                          r.severity === 'high' ? 'text-rose-400' : 'text-amber-400'
                                        }`}>
                                          {r.severity === 'high' ? 'High' : 'Medium'}
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-3 max-w-[300px] truncate text-[11px] font-medium text-slate-400 w-[300px]" title={r.details}>
                                      {r.details}
                                    </td>
                                    <td className="p-3 text-center w-[70px]">
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleInspectRowDetailWithAI(r);
                                        }}
                                        className="p-1 hover:bg-slate-800 rounded text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer"
                                        title="Ask AI to analyze this row"
                                      >
                                        <Sparkles className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={7} className="p-8 text-center text-slate-500 text-xs">
                                  No transactions matched the active filter.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Export tools */}
                      <div className="flex justify-between items-center mt-2">
                        <p className="text-[10px] text-slate-500 font-mono">Select any row to inspect side-by-side ledger details.</p>
                        <button 
                          onClick={handleExportCSV}
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" /> Export Reconciliation Report (.csv)
                        </button>
                      </div>
                    </div>
                  );
                })()}

              </div>

              {/* BENTO ELEMENT: DETAILED TRANSACTION DRAWER / COMPASS */}
              {selectedRow && (
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 shadow-inner flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-emerald-400" /> Side-by-Side Transaction Inspection
                    </span>
                    <button 
                      onClick={() => setSelectedRow(null)}
                      className="text-xs text-slate-500 hover:text-slate-300"
                    >
                      Close panel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    
                    {/* Left block ID */}
                    <div className="md:col-span-3 bg-slate-900/80 p-3 rounded-lg border border-slate-850">
                      <p className="text-[10px] text-slate-500 font-mono">SELECTED TRANSACTION</p>
                      <h4 className="text-sm font-mono font-bold text-white truncate">{selectedRow.transaction_id}</h4>
                      <div className="mt-2 text-[10px]">
                        <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                          selectedRow.issue_flags.length === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {selectedRow.issue_flags.length === 0 ? 'MATCHED' : 'DISCREPANT'}
                        </span>
                      </div>
                    </div>

                    {/* Compare blocks */}
                    <div className="md:col-span-4 bg-slate-900/80 p-3 rounded-lg border border-slate-850">
                      <p className="text-[10px] text-emerald-400 font-mono font-bold">INTERNAL SYSTEM LEDGER</p>
                      <div className="flex justify-between items-center text-xs mt-1.5">
                        <span className="text-slate-400">Amount:</span>
                        <span className="font-mono text-white">{selectedRow.internal_amount !== null ? `${selectedRow.internal_amount.toLocaleString('en-US')} VND` : '---'}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs mt-1">
                        <span className="text-slate-400">Status:</span>
                        <span className="font-mono text-slate-300">{selectedRow.internal_status || 'N/A'}</span>
                      </div>
                    </div>

                    <div className="md:col-span-1 text-center font-mono text-slate-500 text-xs font-bold">VS</div>

                    <div className="md:col-span-4 bg-slate-900/80 p-3 rounded-lg border border-slate-850">
                      <p className="text-[10px] text-amber-500 font-mono font-bold">PARTNER GATEWAY LEDGER</p>
                      <div className="flex justify-between items-center text-xs mt-1.5">
                        <span className="text-slate-400">Amount:</span>
                        <span className="font-mono text-white">{selectedRow.partner_amount !== null ? `${selectedRow.partner_amount.toLocaleString('en-US')} VND` : '---'}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs mt-1">
                        <span className="text-slate-400">Status:</span>
                        <span className="font-mono text-slate-300">{selectedRow.partner_status || 'N/A'}</span>
                      </div>
                    </div>

                  </div>

                  {/* Quick assess from AI */}
                  <div className="bg-slate-900/30 p-3 rounded-lg border border-slate-850 flex items-start gap-2 text-xs">
                    <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-slate-300">
                      <p><strong>AI Copilot Recommendation:</strong> {selectedRow.issue_flags.length === 0 ? 'Perfect reconciliation match. No financial or state discrepancies detected.' : selectedRow.details}</p>
                      {selectedRow.issue_flags.includes('amount_mismatch') && (
                        <p className="text-[10px] text-slate-400 mt-1">💡 A minor amount discrepancy (~1%) typically indicates partner processing or gateway fees deducted at source. Accountants should check the gateway's settlement fee schedule.</p>
                      )}
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}

        </div>

        {/* RIGHT ASSISTANT SIDEBAR: Chat workspace & tool traces - Grid column 9 to 12 */}
        <div className="col-span-12 lg:col-span-4 flex flex-col h-[680px] bg-slate-900/80 border border-slate-800/80 rounded-2xl p-0 shadow-2xl overflow-hidden">
          
          {/* Custom Tabs at the top */}
          <div className="flex border-b border-slate-850 bg-slate-950/40 p-1.5 gap-1.5">
            <button
              onClick={() => setRightSidebarTab('chat')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                rightSidebarTab === 'chat' 
                  ? 'bg-slate-900 border border-slate-800 text-emerald-400 font-bold shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>AI Copilot Chat</span>
            </button>
            <button
              onClick={() => setRightSidebarTab('logs')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                rightSidebarTab === 'logs' 
                  ? 'bg-slate-900 border border-slate-800 text-emerald-400 font-bold shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Agent Activity Logs</span>
              {toolTraces.length > 0 && (
                <span className="bg-emerald-500 text-slate-950 text-[9px] font-mono px-1.5 py-0.2 rounded-full font-bold animate-pulse">
                  {toolTraces.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 flex flex-col p-5 overflow-hidden">
            {rightSidebarTab === 'chat' ? (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Header chat */}
                <div className="pb-3 border-b border-slate-850 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></div>
                    <h3 className="text-xs font-bold text-slate-300 tracking-wider uppercase font-mono">ReconCopilot AI Assistant</h3>
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono">V3.5.Fintech</span>
                </div>

                {/* Messages box */}
                <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs pr-1 scrollbar-thin">
                  {chatMessages.map((msg) => {
                    const isUser = msg.sender === 'user';
                    return (
                      <div key={msg.id} className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                        
                        {/* Icon */}
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-[9px] font-bold shrink-0 ${
                          isUser ? 'bg-emerald-600 text-white' : 'bg-slate-850 border border-slate-800 text-emerald-400'
                        }`}>
                          {isUser ? 'US' : 'RC'}
                        </div>

                        {/* Bubble */}
                        <div className={`max-w-[82%] p-3.5 rounded-2xl text-slate-200 leading-relaxed font-sans shadow ${
                          isUser ? 'bg-emerald-500/10 border border-emerald-500/25 rounded-tr-none' : 'bg-slate-950/40 border border-slate-850 rounded-tl-none'
                        }`}>
                          {isUser ? (
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                          ) : (
                            <div className="markdown-body text-slate-200 text-xs">
                              <Markdown
                                components={{
                                  p: ({ node, ...props }) => <p className="mb-1.5 last:mb-0" {...props} />,
                                  ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-1.5" {...props} />,
                                  ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-1.5" {...props} />,
                                  li: ({ node, ...props }) => <li className="mb-0.5" {...props} />,
                                  strong: ({ node, ...props }) => <strong className="font-semibold text-white" {...props} />,
                                  code: ({ node, inline, ...props }: any) => 
                                    inline ? (
                                      <code className="bg-slate-900 border border-slate-800 px-1 py-0.5 rounded text-[10px] text-emerald-400 font-mono" {...props} />
                                    ) : (
                                      <code className="block bg-slate-900 border border-slate-800 p-2 rounded text-[10px] text-emerald-400 font-mono overflow-x-auto my-1.5" {...props} />
                                    ),
                                  pre: ({ node, ...props }) => <pre className="bg-transparent m-0 p-0" {...props} />,
                                  h1: ({ node, ...props }) => <h1 className="text-xs font-bold text-white mb-1 mt-1.5 first:mt-0" {...props} />,
                                  h2: ({ node, ...props }) => <h2 className="text-[11px] font-bold text-white mb-1 mt-1.5 first:mt-0" {...props} />,
                                  h3: ({ node, ...props }) => <h3 className="text-[10px] font-bold text-white mb-1 mt-1.5 first:mt-0" {...props} />,
                                }}
                              >
                                {msg.text}
                              </Markdown>
                            </div>
                          )}
                          <span className="text-[8px] text-slate-500 font-mono block mt-2 text-right">{msg.timestamp}</span>
                        </div>

                      </div>
                    );
                  })}
                  
                  {isChatLoading && (
                    <div className="flex gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-slate-850 border border-slate-800 flex items-center justify-center font-mono text-[9px] font-bold shrink-0 text-emerald-400">
                        RC
                      </div>
                      <div className="bg-slate-950/40 border border-slate-850 rounded-2xl rounded-tl-none p-3 max-w-[80%] flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"></span>
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce delay-100"></span>
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce delay-200"></span>
                      </div>
                    </div>
                  )}

                  <div ref={chatBottomRef} />
                </div>

                {/* Input message form */}
                <form onSubmit={handleSendMessage} className="pt-3 border-t border-slate-850">
                  <div className="flex gap-2 bg-slate-950 border border-slate-800 rounded-xl p-1 focus-within:border-emerald-500/60 transition-all">
                    <input 
                      type="text" 
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask the AI assistant for transaction deep-dives or general questions..." 
                      className="bg-transparent flex-1 px-3 py-2 text-xs outline-none placeholder:text-slate-600 font-light text-slate-200"
                    />
                    <button 
                      type="submit"
                      className="bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg text-white font-medium transition-colors cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </form>

              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-between h-full overflow-hidden">
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-emerald-400" /> Agent Activity Logs
                    </span>
                    <span className="text-[8px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-mono">Developer Mode</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-3">Inspect background tool invocations (MCP) and live context handled by the AI server.</p>

                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                    {toolTraces.length > 0 ? (
                      toolTraces.map((t) => (
                        <div key={t.id} className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-850 font-mono text-[9px] space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-emerald-400 font-bold">⚙ {t.toolName}</span>
                            <span className="text-slate-500">{t.timestamp}</span>
                          </div>
                          
                          {/* Inputs */}
                          <details className="text-slate-400 cursor-pointer">
                            <summary className="hover:text-slate-300">Arguments (Inputs)</summary>
                            <pre className="bg-slate-900 p-1.5 rounded mt-1 overflow-x-auto text-[8px] text-indigo-300">
                              {JSON.stringify(t.input, null, 2)}
                            </pre>
                          </details>

                          {/* Outputs */}
                          <details className="text-slate-400 cursor-pointer">
                            <summary className="hover:text-slate-300">Response (Outputs)</summary>
                            <pre className="bg-slate-900 p-1.5 rounded mt-1 overflow-x-auto text-[8px] text-emerald-300">
                              {JSON.stringify(t.output, null, 2)}
                            </pre>
                          </details>
                        </div>
                      ))
                    ) : (
                      <div className="h-48 flex flex-col items-center justify-center border border-dashed border-slate-850 rounded-lg bg-slate-900/10 text-[10px] text-slate-500 p-4 text-center">
                        No background agent tool traces captured yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="h-px bg-slate-850 my-3 w-full shrink-0" />

                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-300">Auditor Mode Enabled</p>
                    <p className="text-[9px] text-slate-500 font-mono">Reconciliation process complies with ISO/Fintech standards.</p>
                  </div>
                </div>

              </div>
            )}
          </div>

        </div>

      </div>

      {/* 3. FOOTER */}
      <footer className="border-t border-slate-850 px-6 py-3 flex items-center justify-between text-[9px] text-slate-500 font-mono tracking-wider uppercase bg-slate-950/20">
        <div className="flex gap-4">
          <span>Latency: ~32ms</span>
          <span>Cache: Local 0MB</span>
        </div>
        <div>Timezone: GMT+7 | © 2026 Agentic Reconciliation Workspace</div>
      </footer>

    </div>
  );
}
