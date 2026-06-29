export interface ColumnProfile {
  name: string;
  dtype: 'number' | 'string' | 'date' | 'boolean' | 'unknown';
  nullCount: number;
  uniqueCount: number;
  sampleValues: string[];
}

export interface FileSchema {
  filename: string;
  rowCount: number;
  columns: string[];
  columnProfiles: Record<string, ColumnProfile>;
}

export type CanonicalField = 'transaction_id' | 'amount' | 'status' | 'timestamp';

export interface MappingCandidate {
  canonicalField: CanonicalField;
  internalColumn: string;
  partnerColumn: string;
  confidence: number;
  reason: string;
  warnings: string[];
}

export interface FieldMapping {
  transaction_id: { internal: string; partner: string };
  amount: { internal: string; partner: string };
  status: { internal: string; partner: string };
  timestamp: { internal: string; partner: string };
}

export interface ValidationPreviewRow {
  transaction_id: string;
  internal_amount: number | null;
  partner_amount: number | null;
  internal_status: string;
  partner_status: string;
  detected_issue: 'ok' | 'amount_mismatch' | 'status_mismatch' | 'format_issue' | 'other';
}

export interface ValidationResult {
  isValid: boolean;
  score: number;
  blockingIssues: string[];
  warnings: string[];
  previewRows: ValidationPreviewRow[];
}

export interface ReconciliationSummary {
  total: number;
  matched: number;
  amount_mismatch: number;
  status_mismatch: number;
  missing_internal: number;
  missing_partner: number;
  needs_review: number;
}

export interface ReconciliationRow {
  transaction_id: string;
  issue_flags: ('ok' | 'amount_mismatch' | 'status_mismatch' | 'missing_internal' | 'missing_partner')[];
  internal_amount: number | null;
  partner_amount: number | null;
  internal_status: string | null;
  partner_status: string | null;
  internal_timestamp: string | null;
  partner_timestamp: string | null;
  severity: 'low' | 'medium' | 'high';
  details: string;
}

export interface ReconciliationResult {
  runId: string;
  resultId: string;
  summary: ReconciliationSummary;
  rows: ReconciliationRow[];
}

export interface MismatchCluster {
  clusterId: string;
  clusterName: string;
  size: number;
  severity: 'low' | 'medium' | 'high';
  confirmedFacts: string[];
  hypothesis: string;
  recommendedAction: string;
}

export interface MismatchAnalysisResult {
  clusters: MismatchCluster[];
  summary: string;
}

export type RunPhase = 'INTAKE' | 'MAPPING' | 'RUN' | 'RESULTS';

export interface ToolTrace {
  id: string;
  timestamp: string;
  toolName: string;
  input: any;
  output: any;
  status: 'success' | 'error';
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
}
