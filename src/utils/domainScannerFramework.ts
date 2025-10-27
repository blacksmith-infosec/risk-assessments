// Framework composing individual domain scanners for independent execution.
// Each scanner is async and reports its own success/error state; results aggregated.
// Adding a new scanner:
// 1. Define const myScanner: DomainScanner = { id, label, description, run }
// 2. Implement run(domain) returning BaseScannerResult (data, summary, issues?).
// 3. Push scanner into SCANNERS array below.
// 4. UI auto-renders scanner with status; no additional wiring needed.
// 5. Optionally add deriveIssues if issues not computed within run.

import { DomainScanner, ExecutedScannerResult, DomainScanAggregate, ScannerInterpretation } from '../types/domainScan';
import {
  fetchDNS,
  extractSPF,
  fetchDMARC,
  checkDKIM,
  fetchCertificates,
} from './domainChecks';

// Default timeout for each scanner (30 seconds). Made mutable for testing.
let DEFAULT_SCANNER_TIMEOUT = 30000;

// Allow runtime override (e.g., tests forcing quick timeout)
export const setScannerTimeout = (ms: number) => {
  if (ms <= 0 || !Number.isFinite(ms)) throw new Error('Invalid timeout value');
  DEFAULT_SCANNER_TIMEOUT = ms;
};

// Utility to run a promise with timeout
const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, scannerLabel: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${scannerLabel} timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
};

// Interpret scanner results to provide user-friendly status and recommendations
export const interpretScannerResult = (scanner: ExecutedScannerResult): ScannerInterpretation => {
  if (scanner.status === 'error') {
    return {
      severity: 'error',
      message: scanner.error || 'Scanner failed to execute',
      recommendation: 'This check could not be completed. Please try again or check your network connection.'
    };
  }

  const issueCount = scanner.issues?.length || 0;

  // Scanner-specific interpretations
  switch (scanner.id) {
    case 'dns':
      return {
        severity: 'success',
        message: 'DNS records retrieved successfully',
        recommendation: 'Your domain\'s DNS configuration is accessible and responding normally.'
      };

    case 'emailAuth': {
      if (issueCount === 0) {
        return {
          severity: 'success',
          message: 'Excellent email authentication',
          recommendation: 'SPF, DMARC, and DKIM are all properly configured. This helps prevent email spoofing.'
        };
      } else if (issueCount <= 2) {
        return {
          severity: 'warning',
          message: 'Email authentication needs attention',
          recommendation: 'Configure missing email authentication records (SPF, DMARC, DKIM) ' +
            'to prevent email spoofing and improve deliverability.'
        };
      } else {
        return {
          severity: 'critical',
          message: 'Email authentication missing',
          recommendation: 'Your domain lacks critical email authentication. This makes it vulnerable to spoofing. ' +
            'Implement SPF, DMARC, and DKIM immediately.'
        };
      }
    }

    case 'certificates': {
      const data = scanner.data as { certificates?: unknown[] };
      const certCount = data?.certificates?.length || 0;
      if (certCount > 0) {
        return {
          severity: 'success',
          message: `Found ${certCount} certificate entries`,
          recommendation: certCount > 50
            ? 'Large number of certificates found. Review for any unexpected or expired certificates.'
            : 'Certificate transparency logs show your domain has valid SSL certificates.'
        };
      }
      return {
        severity: 'info',
        message: 'No certificates found',
        recommendation: 'No SSL certificates found in public certificate transparency logs. ' +
          'If you use HTTPS, this might indicate a very new certificate.'
      };
    }

    case 'securityHeaders': {
      const data = scanner.data as { status?: string; grade?: string; score?: number; testUrl?: string };
      if (data?.status === 'unavailable') {
        return {
          severity: 'info',
          message: 'Headers check unavailable',
          recommendation: data.testUrl
            ? `Visit ${data.testUrl} for a comprehensive security headers analysis.`
            : 'Visit securityheaders.com for a full analysis.'
        };
      }

      // Grade-based interpretation
      const grade = data?.grade || 'Unknown';
      const gradeMap: Record<string, { severity: 'success' | 'info' | 'warning' | 'critical'; message: string }> = {
        'A+': { severity: 'success', message: 'Excellent security headers (A+)' },
        'A': { severity: 'success', message: 'Great security headers (A)' },
        'B': { severity: 'info', message: 'Good security headers (B)' },
        'C': { severity: 'warning', message: 'Moderate security headers (C)' },
        'D': { severity: 'warning', message: 'Weak security headers (D)' },
        'E': { severity: 'critical', message: 'Poor security headers (E)' },
        'F': { severity: 'critical', message: 'Failed security headers (F)' },
      };

      const gradeInfo = gradeMap[grade] || {
        severity: 'info' as const,
        message: 'Security headers analyzed'
      };

      let recommendation = '';
      if (['A+', 'A'].includes(grade)) {
        recommendation = 'Your site has excellent security headers protecting against common web vulnerabilities. ';
      } else if (['B', 'C'].includes(grade)) {
        recommendation = 'Consider strengthening your security headers. ';
      } else if (['D', 'E', 'F'].includes(grade)) {
        recommendation = 'Your security headers need immediate attention. ';
      }

      if (issueCount > 0) {
        recommendation += `Missing ${issueCount} critical header(s). `;
      }

      if (data?.testUrl) {
        recommendation += 'View detailed report at securityheaders.com';
      }

      return {
        severity: gradeInfo.severity,
        message: gradeInfo.message,
        recommendation: recommendation || 'Visit securityheaders.com for detailed analysis.'
      };
    }

    default:
      return {
        severity: issueCount === 0 ? 'success' : 'warning',
        message: issueCount === 0 ? 'Check completed successfully' : `${issueCount} issue(s) found`,
        recommendation: issueCount === 0 ? 'No issues detected.' : 'Review the issues listed above for more details.'
      };
  }
};

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

export const SCANNERS: DomainScanner[] = [
  dnsScanner,
  emailAuthScanner,
  certificateScanner,
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
      const r = await withTimeout(
        scanner.run(trimmed),
        DEFAULT_SCANNER_TIMEOUT,
        scanner.label
      );
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
    const r = await withTimeout(
      scanner.run(domain.trim().toLowerCase()),
      DEFAULT_SCANNER_TIMEOUT,
      scanner.label
    );
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
