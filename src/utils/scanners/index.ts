// Framework for composing individual domain scanners for independent execution.
// Each scanner is async and reports its own success/error state; results aggregated.

import i18next from 'i18next';
import {
  DomainScanner,
  ExecutedScannerResult,
  DomainScanAggregate,
  ScannerInterpretation,
} from '../../types/domainScan';

// Import new scanner types
import { ScannerResult } from './types';

// Import individual scanners
import { dnsScanner, interpretDnsResult } from './dnsScanner';
import { emailAuthScanner, interpretEmailAuthResult } from './emailAuthScanner';
import { certificateScanner, interpretCertificateResult } from './certificateScanner';
import { rdapScanner, interpretRdapResult } from './rdapScanner';
import { sslLabsScanner, interpretSslLabsResult } from './sslLabsScanner';
import { securityHeadersScanner, interpretSecurityHeadersResult } from './securityHeadersScanner';

// Import new Blacksmith scanners
import { runPortScanner } from './portScanner';
import { runSslChainScanner } from './sslChainScanner';
import { runReputationScanner } from './reputationScanner';
import { runUrlAnalysisScanner } from './urlAnalysisScanner';


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
      setTimeout(
        () => {
          // Translate the scanner label before interpolating into the error message
          const translatedLabel = i18next.t(scannerLabel, { ns: 'scanners' });
          reject(new Error(i18next.t('common.errors.timeout', {
            ns: 'scanners',
            label: translatedLabel,
            timeout: timeoutMs
          })));
        },
        timeoutMs
      )
    )
  ]);
};

// Array of all available scanners
export const SCANNERS: DomainScanner[] = [
  dnsScanner,
  emailAuthScanner,
  certificateScanner,
  rdapScanner,
  sslLabsScanner,
  securityHeadersScanner,
  // New Blacksmith scanners
  {
    id: 'portScanner',
    label: 'Port Scanner',
    run: runPortScanner,
    timeout: 10000,
    dataSource: {
      name: 'Shodan InternetDB',
      url: 'https://internetdb.shodan.io',
    },
  },
  {
    id: 'sslChainScanner',
    label: 'SSL Chain Scanner',
    run: runSslChainScanner,
    timeout: 30000,
    dataSource: {
      name: 'SSL Labs API',
      url: 'https://api.ssllabs.com',
    },
  },
  {
    id: 'reputationScanner',
    label: 'Reputation Scanner',
    run: runReputationScanner,
    timeout: 15000,
    dataSource: {
      name: 'VirusTotal API',
      url: 'https://www.virustotal.com',
    },
  },
  {
    id: 'urlAnalysisScanner',
    label: 'URL Analysis Scanner',
    run: runUrlAnalysisScanner,
    timeout: 30000,
    dataSource: {
      name: 'URLScan.io API',
      url: 'https://urlscan.io',
    },
  },
];

// Interpretation functions for new Blacksmith scanners
function interpretPortScannerResult(scanner: ExecutedScannerResult): ScannerInterpretation {
  const result = scanner.data as any;
  const hasHighRisk = result.highRiskPorts?.length > 0;
  const hasCves = result.cves?.length > 0;

  if (hasHighRisk || hasCves) {
    return {
      severity: 'critical',
      message: 'High-risk ports or vulnerabilities detected',
      recommendation: 'Investigate and remediate open ports and CVEs immediately'
    };
  }

  return {
    severity: 'success',
    message: 'No high-risk ports detected',
    recommendation: 'Port configuration appears secure'
  };
}

function interpretSslChainScannerResult(scanner: ExecutedScannerResult): ScannerInterpretation {
  const result = scanner.data as any;
  const grade = result.grade || 'F';
  const hasTrustIssues = result.trustIssues?.length > 0;

  if (grade === 'F' || grade === 'T' || grade === 'M' || hasTrustIssues) {
    return {
      severity: 'critical',
      message: `Poor SSL configuration (Grade: ${grade})`,
      recommendation: 'Immediate SSL certificate remediation required'
    };
  } else if (grade === 'A+' || grade === 'A') {
    return {
      severity: 'success',
      message: `Excellent SSL configuration (Grade: ${grade})`,
      recommendation: 'SSL configuration meets best practices'
    };
  }

  return {
    severity: 'warning',
    message: `SSL configuration needs improvement (Grade: ${grade})`,
    recommendation: 'Review SSL certificate chain and trust settings'
  };
}

function interpretReputationScannerResult(scanner: ExecutedScannerResult): ScannerInterpretation {
  const result = scanner.data as any;
  const malicious = result.malicious || false;

  if (malicious) {
    return {
      severity: 'critical',
      message: 'Domain flagged as malicious by security engines',
      recommendation: 'Block this domain immediately and investigate'
    };
  }

  return {
    severity: 'success',
    message: 'No malicious activity detected',
    recommendation: 'Domain reputation appears clean'
  };
}

function interpretUrlAnalysisScannerResult(scanner: ExecutedScannerResult): ScannerInterpretation {
  const result = scanner.data as any;
  const malicious = result.malicious || false;

  if (malicious) {
    return {
      severity: 'critical',
      message: 'URL contains malicious content',
      recommendation: 'Block this URL and investigate the source'
    };
  }

  return {
    severity: 'success',
    message: 'URL appears safe',
    recommendation: 'No security issues detected in URL analysis'
  };
}

// Interpret scanner results to provide user-friendly status and recommendations
export const interpretScannerResult = (scanner: ExecutedScannerResult): ScannerInterpretation => {
  if (scanner.status === 'error') {
    return {
      severity: 'error',
      message: scanner.error || i18next.t('common.errors.scannerFailed', { ns: 'scanners' }),
      recommendation: i18next.t('common.errors.retryMessage', { ns: 'scanners' })
    };
  }

  const issueCount = scanner.issues?.length || 0;

  // Delegate to scanner-specific interpretation functions
  switch (scanner.id) {
    case 'dns':
      return interpretDnsResult(scanner, issueCount);
    case 'emailAuth':
      return interpretEmailAuthResult(scanner, issueCount);
    case 'certificates':
      return interpretCertificateResult(scanner, issueCount);
    case 'rdap':
      return interpretRdapResult(scanner, issueCount);
    case 'sslLabs':
      return interpretSslLabsResult(scanner);
    case 'securityHeaders':
      return interpretSecurityHeadersResult(scanner);
    case 'portScanner':
      return interpretPortScannerResult(scanner);
    case 'sslChainScanner':
      return interpretSslChainScannerResult(scanner);
    case 'reputationScanner':
      return interpretReputationScannerResult(scanner);
    case 'urlAnalysisScanner':
      return interpretUrlAnalysisScannerResult(scanner);
    default:
      return {
        severity: issueCount === 0 ? 'success' : 'warning',
        message: issueCount === 0
          ? i18next.t('common.interpretation.checkCompleted', { ns: 'scanners' })
          : i18next.t('common.interpretation.issuesFound', { ns: 'scanners', count: issueCount }),
        recommendation: issueCount === 0
          ? i18next.t('common.interpretation.noIssuesDetected', { ns: 'scanners' })
          : i18next.t('common.interpretation.reviewIssues', { ns: 'scanners' })
      };
  }
};

// Execute all scanners in parallel for faster results.
export const runAllScanners = async (
  domain: string,
  onProgress?: (partial: ExecutedScannerResult[]) => void
): Promise<DomainScanAggregate> => {
  const trimmed = domain.trim().toLowerCase();
  const results: ExecutedScannerResult[] = [];

  // Initialize all scanner result objects
  const scannerPromises = SCANNERS.map((scanner) => {
    const start = new Date().toISOString();
    const base: ExecutedScannerResult = {
      id: scanner.id,
      label: scanner.label,
      status: 'running',
      startedAt: start,
      data: undefined,
      summary: undefined,
      issues: [],
      dataSource: scanner.dataSource,
    };
    results.push(base);

    // Run scanner with its specific timeout (or default)
    const timeoutMs = scanner.timeout ?? DEFAULT_SCANNER_TIMEOUT;

    return withTimeout(
      scanner.run(trimmed),
      timeoutMs,
      scanner.label
    )
      .then((r) => {
        const issues = r.issues || scanner.deriveIssues?.(r, trimmed) || [];
        Object.assign(base, r, { status: 'complete', issues, finishedAt: new Date().toISOString() });
        return base;
      })
      .catch((err: unknown) => {
        base.status = 'error';
        base.error = err instanceof Error ? err.message : 'Unknown error';
        base.finishedAt = new Date().toISOString();
        return base;
      });
  });


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
  const timeoutMs = scanner.timeout ?? DEFAULT_SCANNER_TIMEOUT;
  try {
    const r = await withTimeout(
      scanner.run(domain.trim().toLowerCase()),
      timeoutMs,
      scanner.label
    );
    return {
      id: scanner.id,
      label: scanner.label,
      status: 'complete',
      startedAt: start,
      finishedAt: new Date().toISOString(),
      ...r,
      issues: r.issues || scanner.deriveIssues?.(r, domain) || [],
      dataSource: scanner.dataSource,
    };
  } catch (err: unknown) {
    return {
      id: scanner.id,
      label: scanner.label,
      status: 'error',
      startedAt: start,
      finishedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : 'Unknown error',
      dataSource: scanner.dataSource,
    };
  }
};


// Export individual scanner functions for direct use
export {
  runPortScanner,
  runSslChainScanner,
  runReputationScanner,
  runUrlAnalysisScanner,
};
