import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStatus,
  parseAmount,
  parseCSV,
  runReconciliation,
  validateMapping,
} from '../src/reconciliation_engine.js';
import { getSampleDataset } from '../src/sampleData.js';

const sample = getSampleDataset();
const mapping = {
  transaction_id: { internal: 'Transaction_ID', partner: 'Partner_Ref' },
  amount: { internal: 'Amount', partner: 'Gross_Value' },
  status: { internal: 'Status', partner: 'Payment_State' },
  timestamp: { internal: 'Timestamp', partner: 'Settled_At' },
};

test('parseCSV supports semicolon delimiters and quoted commas', () => {
  const rows = parseCSV('id;note;amount\n1;"fee, adjusted";1000');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].note, 'fee, adjusted');
  assert.equal(rows[0].amount, '1000');
});

test('parseAmount normalizes currency and thousands separators', () => {
  assert.equal(parseAmount('1,250,000 VND'), 1250000);
  assert.equal(parseAmount('1250,50'), 1250.5);
  assert.equal(parseAmount('84,150'), 84150);
});

test('normalizeStatus aligns English and Vietnamese variants', () => {
  assert.equal(normalizeStatus('PAID'), 'SUCCESS');
  assert.equal(normalizeStatus('Thất bại'), 'FAILED');
  assert.equal(normalizeStatus('processing_payout'), 'PENDING');
});

test('validateMapping returns a usable preview for the sample data', () => {
  const result = validateMapping(
    parseCSV(sample.internalCsv),
    parseCSV(sample.partnerCsv),
    mapping,
  );

  assert.equal(result.isValid, true);
  assert.equal(result.blockingIssues.length, 0);
  assert.ok(result.previewRows.length > 0);
});

test('runReconciliation summarizes all expected mismatch classes', () => {
  const result = runReconciliation(
    parseCSV(sample.internalCsv),
    parseCSV(sample.partnerCsv),
    mapping,
  );

  assert.equal(result.summary.total, 9);
  assert.equal(result.summary.matched, 3);
  assert.equal(result.summary.amount_mismatch, 2);
  assert.equal(result.summary.status_mismatch, 1);
  assert.equal(result.summary.missing_internal, 1);
  assert.equal(result.summary.missing_partner, 2);
});
