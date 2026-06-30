import { 
  FileSchema, 
  ColumnProfile, 
  FieldMapping, 
  ReconciliationResult, 
  ReconciliationSummary, 
  ReconciliationRow,
  ValidationResult,
  ValidationPreviewRow
} from './types';

// Simple CSV parser supporting common delimiters
export function parseCSV(text: string): Record<string, string>[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '');
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes(';')) delimiter = ';';
  else if (firstLine.includes('\t')) delimiter = '\t';

  const headers = splitCSVRow(firstLine, delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));

  const result: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = splitCSVRow(lines[i], delimiter);
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      let val = row[index] !== undefined ? row[index] : '';
      obj[header] = val.trim().replace(/^["']|["']$/g, '');
    });
    result.push(obj);
  }
  return result;
}

function splitCSVRow(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Extract schemas and profiling
export function profileCSV(filename: string, rows: Record<string, string>[]): FileSchema {
  const rowCount = rows.length;
  if (rowCount === 0) {
    return { filename, rowCount: 0, columns: [], columnProfiles: {} };
  }
  const columns = Object.keys(rows[0]);
  const columnProfiles: Record<string, ColumnProfile> = {};

  columns.forEach(col => {
    let nullCount = 0;
    const uniqueValues = new Set<string>();
    const samples: string[] = [];
    
    let isNumeric = true;
    let isDate = true;
    let isBoolean = true;

    rows.forEach(row => {
      const val = row[col];
      if (val === undefined || val === null || val.trim() === '') {
        nullCount++;
      } else {
        uniqueValues.add(val);
        if (samples.length < 5 && !samples.includes(val)) {
          samples.push(val);
        }

        const numericVal = val.replace(/[,.%$₫\s]/g, '');
        if (isNaN(Number(numericVal)) && isNaN(Number(val))) {
          isNumeric = false;
        }

        const dateVal = Date.parse(val);
        if (isNaN(dateVal) || val.length < 6) {
          isDate = false;
        }

        const lowerVal = val.toLowerCase();
        if (lowerVal !== 'true' && lowerVal !== 'false' && lowerVal !== '0' && lowerVal !== '1' && lowerVal !== 'yes' && lowerVal !== 'no') {
          isBoolean = false;
        }
      }
    });

    let dtype: ColumnProfile['dtype'] = 'string';
    if (rowCount > nullCount) {
      if (isNumeric) dtype = 'number';
      else if (isDate) dtype = 'date';
      else if (isBoolean) dtype = 'boolean';
    }

    columnProfiles[col] = {
      name: col,
      dtype,
      nullCount,
      uniqueCount: uniqueValues.size,
      sampleValues: samples
    };
  });

  return { filename, rowCount, columns, columnProfiles };
}

// Normalize strings to float values safely
export function parseAmount(s: string | null): number | null {
  if (s === null || s === undefined || s.trim() === '') return null;
  const raw = s.trim().replace(/[^\d,.-]/g, '');
  let clean = raw;

  if (raw.includes(',') && raw.includes('.')) {
    clean = raw.replace(/,/g, '');
  } else if (raw.includes(',') && !raw.includes('.')) {
    const commaCount = (raw.match(/,/g) || []).length;
    const commaIndex = raw.lastIndexOf(',');
    const digitsAfterComma = raw.length - commaIndex - 1;

    if (commaCount === 1 && digitsAfterComma > 0 && digitsAfterComma <= 2) {
      clean = raw.replace(',', '.');
    } else {
      clean = raw.replace(/,/g, '');
    }
  }

  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

// Normalize payment statuses to SUCCESS, FAILED, PENDING
export function normalizeStatus(s: string | null): string {
  if (!s) return '';
  const lower = s.trim().toLowerCase();
  if (['success', 'paid', 'thành công', 'đã thanh toán', 'completed', 'thanh cong', 'da thanh toan', 'success_payout', 'hoàn thành'].some(x => lower.includes(x))) {
    return 'SUCCESS';
  }
  if (['fail', 'thất bại', 'error', 'cancel', 'bị hủy', 'that bai', 'huy', 'failed', 'rejected', 'từ chối'].some(x => lower.includes(x))) {
    return 'FAILED';
  }
  if (['pending', 'processing', 'chờ', 'cho thanh toan', 'cho_thanh_toan', 'processing_payout'].some(x => lower.includes(x))) {
    return 'PENDING';
  }
  return lower.toUpperCase();
}

// Validate the current mapping and run preview
export function validateMapping(
  internalData: Record<string, string>[],
  partnerData: Record<string, string>[],
  mapping: FieldMapping
): ValidationResult {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  const checkField = (field: keyof FieldMapping, label: string) => {
    const map = mapping[field];
    if (!map.internal) {
      blockingIssues.push(`Internal data column for field '${label}' is not mapped.`);
    }
    if (!map.partner) {
      blockingIssues.push(`Partner data column for field '${label}' is not mapped.`);
    }
  };

  checkField('transaction_id', 'Transaction ID');
  checkField('amount', 'Amount');
  checkField('status', 'Status');
  checkField('timestamp', 'Timestamp');

  if (blockingIssues.length > 0) {
    return {
      isValid: false,
      score: 0,
      blockingIssues,
      warnings,
      previewRows: []
    };
  }

  // Preview on a sample of up to 10 rows
  const internalSample = internalData.slice(0, 10);
  const previewRows: ValidationPreviewRow[] = [];

  let validCount = 0;
  internalSample.forEach(row => {
    const id = row[mapping.transaction_id.internal];
    if (!id) return;

    // Find in partner
    const partnerRow = partnerData.find(pr => pr[mapping.transaction_id.partner] === id);
    
    const internal_amt = parseAmount(row[mapping.amount.internal]);
    const partner_amt = partnerRow ? parseAmount(partnerRow[mapping.amount.partner]) : null;

    const internal_st = row[mapping.status.internal];
    const partner_st = partnerRow ? partnerRow[mapping.status.partner] : '';

    let detected_issue: ValidationPreviewRow['detected_issue'] = 'ok';
    if (!partnerRow) {
      detected_issue = 'other';
    } else {
      const amt_diff = internal_amt !== null && partner_amt !== null ? Math.abs(internal_amt - partner_amt) > 0.01 : true;
      const st_diff = normalizeStatus(internal_st) !== normalizeStatus(partner_st);

      if (amt_diff) {
        detected_issue = 'amount_mismatch';
      } else if (st_diff) {
        detected_issue = 'status_mismatch';
      } else {
        validCount++;
      }
    }

    previewRows.push({
      transaction_id: id,
      internal_amount: internal_amt,
      partner_amount: partner_amt,
      internal_status: internal_st || 'N/A',
      partner_status: partner_st || 'N/A',
      detected_issue
    });
  });

  // Calculate score based on first 10 sample matches
  const score = previewRows.length > 0 ? parseFloat((validCount / previewRows.length).toFixed(2)) : 1.0;

  // Add warning if status formats look completely unaligned
  const uniqueInternalStatus = Array.from(new Set(internalData.slice(0, 20).map(r => r[mapping.status.internal]).filter(Boolean)));
  const uniquePartnerStatus = Array.from(new Set(partnerData.slice(0, 20).map(r => r[mapping.status.partner]).filter(Boolean)));
  
  if (uniqueInternalStatus.length > 0 && uniquePartnerStatus.length > 0) {
    const normInternal = uniqueInternalStatus.map(s => normalizeStatus(s));
    const normPartner = uniquePartnerStatus.map(s => normalizeStatus(s));
    
    const hasMatch = normInternal.some(ns => normPartner.includes(ns));
    if (!hasMatch) {
      warnings.push("Transaction statuses are not matching. Normalization rules should be verified (e.g., matching 'SUCCESS' with 'PAID').");
    }
  }

  return {
    isValid: true,
    score,
    blockingIssues,
    warnings,
    previewRows
  };
}

// Run deterministic reconciliation
export function runReconciliation(
  internalData: Record<string, string>[],
  partnerData: Record<string, string>[],
  mapping: FieldMapping
): ReconciliationResult {
  const mapTxnId = mapping.transaction_id;
  const mapAmount = mapping.amount;
  const mapStatus = mapping.status;
  const mapTimestamp = mapping.timestamp;

  const internalMap = new Map<string, Record<string, string>>();
  const partnerMap = new Map<string, Record<string, string>>();

  internalData.forEach(row => {
    const id = row[mapTxnId.internal];
    if (id) internalMap.set(id, row);
  });

  partnerData.forEach(row => {
    const id = row[mapTxnId.partner];
    if (id) partnerMap.set(id, row);
  });

  const allTxnIds = new Set<string>([...internalMap.keys(), ...partnerMap.keys()]);

  const rows: ReconciliationRow[] = [];
  let matched = 0;
  let amount_mismatch = 0;
  let status_mismatch = 0;
  let missing_internal = 0;
  let missing_partner = 0;
  let needs_review = 0;

  allTxnIds.forEach(id => {
    const internalRow = internalMap.get(id);
    const partnerRow = partnerMap.get(id);

    const issue_flags: ReconciliationRow['issue_flags'] = [];
    let severity: ReconciliationRow['severity'] = 'low';
    let details = 'Fully matched';

    const internal_amount_str = internalRow ? internalRow[mapAmount.internal] : null;
    const partner_amount_str = partnerRow ? partnerRow[mapAmount.partner] : null;

    const internal_status_raw = internalRow ? internalRow[mapStatus.internal] : null;
    const partner_status_raw = partnerRow ? partnerRow[mapStatus.partner] : null;

    const internal_amount = parseAmount(internal_amount_str);
    const partner_amount = parseAmount(partner_amount_str);

    const internal_status_normalized = internal_status_raw ? normalizeStatus(internal_status_raw) : '';
    const partner_status_normalized = partner_status_raw ? normalizeStatus(partner_status_raw) : '';

    if (!internalRow) {
      issue_flags.push('missing_internal');
      severity = 'high';
      details = `Only in Partner (${partner_status_raw || 'Unknown status'})`;
      missing_internal++;
    } else if (!partnerRow) {
      issue_flags.push('missing_partner');
      severity = 'medium';
      details = `Only in System (${internal_status_raw || 'Unknown status'})`;
      missing_partner++;
    } else {
      let amountMismatch = false;
      let statusMismatch = false;

      if (internal_amount !== null && partner_amount !== null) {
        if (Math.abs(internal_amount - partner_amount) > 0.01) {
          amountMismatch = true;
          issue_flags.push('amount_mismatch');
        }
      } else {
        amountMismatch = true;
        issue_flags.push('amount_mismatch');
      }

      if (internal_status_normalized !== partner_status_normalized) {
        statusMismatch = true;
        issue_flags.push('status_mismatch');
      }

      if (amountMismatch && statusMismatch) {
        severity = 'high';
        details = `Mismatch on both Amount (System: ${internal_amount_str} ↔ Partner: ${partner_amount_str}) & Status (System: ${internal_status_raw} ↔ Partner: ${partner_status_raw})`;
        amount_mismatch++;
        status_mismatch++;
        needs_review++;
      } else if (amountMismatch) {
        severity = 'high';
        const diff = Math.abs((internal_amount || 0) - (partner_amount || 0));
        details = `Amount mismatch: System ${internal_amount_str} ↔ Partner ${partner_amount_str} (Diff: ${diff.toLocaleString('en-US')})`;
        amount_mismatch++;
      } else if (statusMismatch) {
        severity = 'medium';
        details = `Status mismatch: System '${internal_status_raw}' ↔ Partner '${partner_status_raw}'`;
        status_mismatch++;
      } else {
        matched++;
      }
    }

    rows.push({
      transaction_id: id,
      issue_flags,
      internal_amount,
      partner_amount,
      internal_status: internal_status_raw,
      partner_status: partner_status_raw,
      internal_timestamp: internalRow ? internalRow[mapTimestamp.internal] : null,
      partner_timestamp: partnerRow ? partnerRow[mapTimestamp.partner] : null,
      severity,
      details
    });
  });

  const summary: ReconciliationSummary = {
    total: allTxnIds.size,
    matched,
    amount_mismatch,
    status_mismatch,
    missing_internal,
    missing_partner,
    needs_review
  };

  return {
    runId: `run_${Date.now()}`,
    resultId: `res_${Date.now()}`,
    summary,
    rows
  };
}

// Heuristic-based automatic mapping fallback algorithm
export function suggestMappingHeuristic(internalSchema: FileSchema, partnerSchema: FileSchema) {
  const findBestColumn = (
    schema: FileSchema,
    fieldType: 'transaction_id' | 'amount' | 'status' | 'timestamp'
  ): { name: string; confidence: number; reason: string } => {
    const columns = schema.columns;
    const profiles = schema.columnProfiles;
    
    let bestCol = '';
    let maxScore = -1000;
    let confidence = 0.5;
    let bestReason = 'Found based on data structure profile.';

    for (const col of columns) {
      const profile = profiles[col];
      if (!profile) continue;

      let score = 0;
      const lowerCol = col.toLowerCase();

      // Normalize Vietnamese strings to lowercase unaccented for easy match
      const cleanCol = lowerCol
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd');

      if (fieldType === 'transaction_id') {
        // High preference names
        if (cleanCol.includes('transactionid') || cleanCol.includes('transaction_id') || cleanCol.includes('txid') || cleanCol.includes('txn_id') || cleanCol.includes('txn id')) {
          score += 100;
        } else if (cleanCol.includes('ma_gd') || cleanCol.includes('ma gd') || cleanCol.includes('magiaodich') || cleanCol.includes('ma giao dich') || cleanCol.includes('ma_giao_dich')) {
          score += 90;
        } else if (cleanCol === 'id' || cleanCol === 'txid' || cleanCol === 'ref' || cleanCol === 'reference' || cleanCol === 'trace') {
          score += 80;
        } else if (cleanCol.includes('id') || cleanCol.includes('ref') || cleanCol.includes('trace') || cleanCol.includes('reference')) {
          score += 40;
        } else if (cleanCol.includes('ma_don') || cleanCol.includes('ma don') || cleanCol.includes('order_id') || cleanCol.includes('orderid') || cleanCol.includes('madonhang') || cleanCol.includes('ma don hang')) {
          score += 35;
        }

        // Penalty for numeric columns that are likely amount
        if (profile.dtype === 'number') {
          if (cleanCol.includes('tien') || cleanCol.includes('amount') || cleanCol.includes('gia') || cleanCol.includes('price')) {
            score -= 80;
          }
        }
        // Unique count ratio (high unique count is extremely good for ID)
        if (schema.rowCount > 0) {
          const ratio = profile.uniqueCount / schema.rowCount;
          score += ratio * 50;
        }
      } else if (fieldType === 'amount') {
        if (cleanCol === 'amount' || cleanCol === 'sotien' || cleanCol === 'so_tien' || cleanCol === 'ma_tien') {
          score += 100;
        } else if (cleanCol.includes('sotien') || cleanCol.includes('so_tien') || cleanCol.includes('so tien') || cleanCol.includes('amount') || cleanCol.includes('amt')) {
          score += 90;
        } else if (cleanCol.includes('tien') || cleanCol.includes('vnd') || cleanCol.includes('money') || cleanCol.includes('gia_tri') || cleanCol.includes('value')) {
          score += 60;
        } else if (cleanCol.includes('total') || cleanCol.includes('sum') || cleanCol.includes('price') || cleanCol.includes('gia')) {
          score += 40;
        }

        // Type matching is extremely important for Amount
        if (profile.dtype === 'number') {
          score += 50;
        } else {
          score -= 30; // Strong penalty if not number
        }
      } else if (fieldType === 'status') {
        if (cleanCol === 'status' || cleanCol === 'trangthai' || cleanCol === 'trang_thai') {
          score += 100;
        } else if (cleanCol.includes('trangthai') || cleanCol.includes('trang_thai') || cleanCol.includes('trang thai') || cleanCol.includes('status') || cleanCol.includes('state')) {
          score += 90;
        } else if (cleanCol.includes('code') || cleanCol.includes('result') || cleanCol.includes('ketqua') || cleanCol.includes('ket_qua') || cleanCol.includes('ket qua') || cleanCol.includes('response')) {
          score += 50;
        }

        // Low unique values count is very typical for status
        if (profile.uniqueCount >= 1 && profile.uniqueCount <= 10) {
          score += 30;
        }
      } else if (fieldType === 'timestamp') {
        if (cleanCol === 'timestamp' || cleanCol === 'thoigian' || cleanCol === 'thoi_gian' || cleanCol === 'created_at') {
          score += 100;
        } else if (cleanCol.includes('thoigian') || cleanCol.includes('thoi_gian') || cleanCol.includes('thoi gian') || cleanCol.includes('timestamp') || cleanCol.includes('createdat')) {
          score += 90;
        } else if (cleanCol.includes('date') || cleanCol.includes('time') || cleanCol.includes('ngay') || cleanCol.includes('created') || cleanCol.includes('updated')) {
          score += 70;
        }

        if (profile.dtype === 'date') {
          score += 50;
        }
      }

      if (score > maxScore) {
        maxScore = score;
        bestCol = col;
      }
    }

    // Default column fallback if nothing matched well
    if (!bestCol && columns.length > 0) {
      if (fieldType === 'transaction_id') {
        let bestUnique = -1;
        for (const col of columns) {
          if (profiles[col].uniqueCount > bestUnique) {
            bestUnique = profiles[col].uniqueCount;
            bestCol = col;
          }
        }
      } else if (fieldType === 'amount') {
        bestCol = columns.find(c => profiles[c].dtype === 'number') || columns[0];
      } else if (fieldType === 'status') {
        bestCol = columns.find(c => profiles[c].uniqueCount > 1 && profiles[c].uniqueCount <= 5) || columns[0];
      } else if (fieldType === 'timestamp') {
        bestCol = columns.find(c => profiles[c].dtype === 'date') || columns[0];
      }
    }

    if (!bestCol && columns.length > 0) {
      bestCol = columns[0];
    }

    // Generate smart reasoning and confidence score
    if (maxScore > 80) {
      confidence = 0.95;
      bestReason = `Auto-mapped column [${bestCol}] because column name perfectly matches canonical definition.`;
    } else if (maxScore > 40) {
      confidence = 0.8;
      bestReason = `Mapped column [${bestCol}] based on similar name and data type profile (${profiles[bestCol]?.dtype}).`;
    } else {
      confidence = 0.5;
      bestReason = `Suggested column [${bestCol}] based on sample data distribution analysis (Dtype: ${profiles[bestCol]?.dtype || 'string'}).`;
    }

    return { name: bestCol, confidence, reason: bestReason };
  };

  const transaction_id = findBestColumn(internalSchema, 'transaction_id');
  const transaction_id_partner = findBestColumn(partnerSchema, 'transaction_id');

  const amount = findBestColumn(internalSchema, 'amount');
  const amount_partner = findBestColumn(partnerSchema, 'amount');

  const status = findBestColumn(internalSchema, 'status');
  const status_partner = findBestColumn(partnerSchema, 'status');

  const timestamp = findBestColumn(internalSchema, 'timestamp');
  const timestamp_partner = findBestColumn(partnerSchema, 'timestamp');

  return {
    mapping: {
      transaction_id: {
        internal: transaction_id.name,
        partner: transaction_id_partner.name,
        confidence: Math.min(transaction_id.confidence, transaction_id_partner.confidence),
        reason: `${transaction_id.reason} (System) | ${transaction_id_partner.reason} (Partner)`
      },
      amount: {
        internal: amount.name,
        partner: amount_partner.name,
        confidence: Math.min(amount.confidence, amount_partner.confidence),
        reason: `${amount.reason} (System) | ${amount_partner.reason} (Partner)`
      },
      status: {
        internal: status.name,
        partner: status_partner.name,
        confidence: Math.min(status.confidence, status_partner.confidence),
        reason: `${status.reason} (System) | ${status_partner.reason} (Partner)`
      },
      timestamp: {
        internal: timestamp.name,
        partner: timestamp_partner.name,
        confidence: Math.min(timestamp.confidence, timestamp_partner.confidence),
        reason: `${timestamp.reason} (System) | ${timestamp_partner.reason} (Partner)`
      }
    }
  };
}
