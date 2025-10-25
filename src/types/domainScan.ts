// Extensible domain scanning types allowing independent scanner execution.
// Adding a new scanner: implement DomainScanner definition and add to SCANNERS array.

export type ScannerStatus = 'idle' | 'running' | 'success' | 'error';

export interface BaseScannerResult {
  // Raw data captured by the scanner; shape varies.
  data?: unknown;
  // Optional human-readable summary.
  summary?: string;
  // Issues detected by this scanner alone (not global aggregation).
  issues?: string[];
}

export interface DomainScanner {
  id: string; // unique key
  label: string; // display name
  description?: string; // short description for UI
  run: (domain: string) => Promise<BaseScannerResult>; // Executes scanner
  // Optional function to derive issues from the raw scanner result if not filled in run.
  deriveIssues?: (result: BaseScannerResult, domain: string) => string[];
  // Optional priority/order weight (lower first); default appended order.
  order?: number;
}

export interface ExecutedScannerResult extends BaseScannerResult {
  id: string;
  label: string;
  status: ScannerStatus;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface DomainScanAggregate {
  domain: string;
  timestamp: string;
  scanners: ExecutedScannerResult[];
  // Combined issues across all scanners.
  issues: string[];
}

export type SeverityLevel = 'success' | 'info' | 'warning' | 'critical' | 'error';

export interface ScannerInterpretation {
  severity: SeverityLevel;
  message: string;
  recommendation: string;
}
