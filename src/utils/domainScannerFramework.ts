// Framework composing individual domain scanners for independent execution.
// Each scanner is async and reports its own success/error state; results aggregated.
// Adding a new scanner:
// 1. Define const myScanner: DomainScanner = { id, label, description, run }
// 2. Implement run(domain) returning BaseScannerResult (data, summary, issues?).
// 3. Push scanner into SCANNERS array below.
// 4. UI auto-renders scanner with status; no additional wiring needed.
// 5. Optionally add deriveIssues if issues not computed within run.

import { DomainScanner, ExecutedScannerResult, DomainScanAggregate } from '../types/domainScan';
import {
  fetchDNS,
  extractSPF,
  fetchDMARC,
  checkDKIM,
  fetchCertificates,
  attemptSecurityHeaders
} from './domainChecks';

// DNS Scanner: collects common record types.
const dnsScanner: DomainScanner = {
  id: 'dns',
  label: 'DNS Records',
  description: 'Retrieves A, AAAA, MX, TXT, CNAME records',
  run: async (domain) => {
    const types = ['A', 'AAAA', 'MX', 'TXT', 'CNAME'];
    const records = [] as { type: string; data: string[] }[];
    for (const t of types) {
      const r = await fetchDNS(domain, t);
      if (r) records.push(r);
    }
    return {
      data: { records },
      summary: `${records.length} record types queried`,
    };
  }
};

// Email Auth scanner: SPF / DMARC / DKIM.
const emailAuthScanner: DomainScanner = {
  id: 'emailAuth',
  label: 'Email Authentication',
  description: 'Checks SPF, DMARC, and common DKIM selectors',
  run: async (domain) => {
    // Reuse DNS TXT from dnsScanner if already run? For simplicity, fetch SPF via DNS again.
    const txtRec = await fetchDNS(domain, 'TXT');
    const txtRecords = txtRec?.data || [];
    const spf = extractSPF(txtRecords);
    const dmarc = await fetchDMARC(domain);
    const dkimSelectorsFound = await checkDKIM(domain);
    const data = { spf, dmarc, dkimSelectorsFound };
    const issues: string[] = [];
    if (!spf) issues.push('Missing SPF record');
    if (!dmarc) issues.push('Missing DMARC record');
    if (dkimSelectorsFound.length === 0) issues.push('No DKIM selectors detected (heuristic)');
    const summary = [
      `SPF ${spf ? 'found' : 'missing'}`,
      `DMARC ${dmarc ? 'found' : 'missing'}`,
      `DKIM selectors: ${dkimSelectorsFound.length || '0'}`
    ].join(', ');
    return {
      data,
      summary,
      issues
    };
  }
};

// Certificate enumeration scanner using crt.sh
const certificateScanner: DomainScanner = {
  id: 'certificates',
  label: 'Certificates',
  description: 'Enumerates certificate entries via crt.sh public API',
  run: async (domain) => {
    const certificates = await fetchCertificates(domain);
    return {
      data: { certificates },
      summary: certificates ? `${certificates.length} entries` : 'No data',
    };
  }
};

// Security headers scanner (HEAD request limited by CORS)
const securityHeadersScanner: DomainScanner = {
  id: 'securityHeaders',
  label: 'Security Headers',
  description: 'Attempts to fetch select security headers via HEAD request',
  run: async (domain) => {
    const securityHeaders = await attemptSecurityHeaders(domain);
    const issues: string[] = [];
    if (securityHeaders.status === 'fetched' && securityHeaders.headers) {
      const required = ['strict-transport-security', 'content-security-policy', 'x-frame-options'];
      for (const r of required) {
        if (!securityHeaders.headers[r]) issues.push(`Header likely missing: ${r}`);
      }
    } else {
      issues.push('Security headers not validated client-side');
    }
    return {
      data: securityHeaders,
      summary: securityHeaders.status === 'fetched' ? 'Headers fetched' : 'Unavailable (CORS)',
      issues
    };
  }
};

export const SCANNERS: DomainScanner[] = [
  dnsScanner,
  emailAuthScanner,
  certificateScanner,
  securityHeadersScanner
];

// Execute all scanners sequentially (could be parallel, but sequential eases rate limits & ordering).
export const runAllScanners = async (
  domain: string,
  onProgress?: (partial: ExecutedScannerResult[]) => void
): Promise<DomainScanAggregate> => {
  const trimmed = domain.trim().toLowerCase();
  const results: ExecutedScannerResult[] = [];
  for (const scanner of SCANNERS.sort((a,b) => (a.order ?? 999) - (b.order ?? 999))) {
    const start = new Date().toISOString();
    const base: ExecutedScannerResult = {
      id: scanner.id,
      label: scanner.label,
      status: 'running',
      startedAt: start,
      data: undefined,
      summary: undefined,
      issues: [],
    };
    results.push(base);
    onProgress?.([...results]);
    try {
      const r = await scanner.run(trimmed);
      const issues = r.issues || scanner.deriveIssues?.(r, trimmed) || [];
      Object.assign(base, r, { status: 'success', issues, finishedAt: new Date().toISOString() });
    } catch (err: unknown) {
      base.status = 'error';
      base.error = err instanceof Error ? err.message : 'Unknown error';
      base.finishedAt = new Date().toISOString();
    }
    onProgress?.([...results]);
  }
  const allIssues = results.flatMap((r) => r.issues || []);
  return {
    domain: trimmed,
    timestamp: new Date().toISOString(),
    scanners: results,
    issues: allIssues
  };
};

// Convenience to run an individual scanner (e.g., rerun one that errored) without affecting others.
export const runScanner = async (domain: string, scannerId: string): Promise<ExecutedScannerResult> => {
  const scanner = SCANNERS.find((s) => s.id === scannerId);
  if (!scanner) throw new Error('Scanner not found: ' + scannerId);
  const start = new Date().toISOString();
  try {
    const r = await scanner.run(domain.trim().toLowerCase());
    return {
      id: scanner.id,
      label: scanner.label,
      status: 'success',
      startedAt: start,
      finishedAt: new Date().toISOString(),
      ...r,
      issues: r.issues || scanner.deriveIssues?.(r, domain) || []
    };
  } catch (err: unknown) {
    return {
      id: scanner.id,
      label: scanner.label,
      status: 'error',
      startedAt: start,
      finishedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
};
