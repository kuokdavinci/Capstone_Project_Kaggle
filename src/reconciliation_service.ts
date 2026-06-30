import { FieldMapping } from './types.js';
import { getSampleDataset } from './sampleData.js';
import {
  parseCSV,
  profileCSV,
  runReconciliation,
  validateMapping,
} from './reconciliation_engine.js';

export interface InspectPayload {
  internalFilename?: string;
  internalCsv: string;
  partnerFilename?: string;
  partnerCsv: string;
}

export interface MappingPayload {
  internalCsv: string;
  partnerCsv: string;
  mapping: FieldMapping;
}

export function inspectCsvPair(payload: InspectPayload) {
  const internalData = parseCSV(payload.internalCsv);
  const partnerData = parseCSV(payload.partnerCsv);

  return {
    success: true,
    internalSchema: profileCSV(payload.internalFilename || 'internal.csv', internalData),
    partnerSchema: profileCSV(payload.partnerFilename || 'partner.csv', partnerData),
    internalCount: internalData.length,
    partnerCount: partnerData.length,
  };
}

export function validateCsvMapping(payload: MappingPayload) {
  return validateMapping(
    parseCSV(payload.internalCsv),
    parseCSV(payload.partnerCsv),
    payload.mapping,
  );
}

export function reconcileCsvPair(payload: MappingPayload) {
  return runReconciliation(
    parseCSV(payload.internalCsv),
    parseCSV(payload.partnerCsv),
    payload.mapping,
  );
}

export function loadSampleDataset() {
  return getSampleDataset();
}
