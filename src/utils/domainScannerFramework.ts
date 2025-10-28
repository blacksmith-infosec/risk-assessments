// Framework composing individual domain scanners for independent execution.
// Each scanner is async and reports its own success/error state; results aggregated.
// Adding a new scanner:
// 1. Define const myScanner: DomainScanner = { id, label, description, run }
// 2. Implement run(domain) returning BaseScannerResult (data, summary, issues?).
// 3. Push scanner into SCANNERS array below.
// 4. UI auto-renders scanner with status; no additional wiring needed.
// 5. Optionally add deriveIssues if issues not computed within run.

import {
  DomainScanner,
  ExecutedScannerResult,
  DomainScanAggregate,
  ScannerInterpretation,
  SeverityLevel
} from '../types/domainScan';
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
    case 'dns': {
      if (issueCount === 0) {
        return {
          severity: 'success',
          message: 'DNS records retrieved successfully',
          recommendation: 'Your domain\'s DNS configuration is accessible and responding normally.'
        };
      } else if (issueCount <= 2) {
        return {
          severity: 'warning',
          message: 'DNS configuration has warnings',
          recommendation: 'Review the DNS issues detected. These may indicate misconfigurations that could affect ' +
            'website accessibility or email delivery.'
        };
      } else {
        return {
          severity: 'critical',
          message: 'DNS configuration has critical issues',
          recommendation: 'Multiple DNS problems detected. These issues may prevent your domain from functioning ' +
            'correctly. Review and fix DNS records immediately.'
        };
      }
    }

    case 'emailAuth': {
      const data = scanner.data as {
        hasSpf?: boolean;
        hasDmarc?: boolean;
        hasDkim?: boolean;
        dmarcEnforced?: boolean;
        aggregateMessage?: string;
      };

      // Use the aggregate message from the scanner for consistent messaging
      const message = data?.aggregateMessage ||
        (issueCount === 0 ? 'Email authentication configured' : 'Email authentication issues detected');

      // Determine severity based on what's configured
      let severity: SeverityLevel;
      if (data?.hasSpf && data?.hasDmarc && data?.hasDkim && data?.dmarcEnforced) {
        severity = 'success';
      } else if (data?.hasSpf && data?.hasDmarc && data?.hasDkim) {
        severity = 'warning'; // Has all three but DMARC not enforcing
      } else if ((data?.hasSpf || data?.hasDmarc || data?.hasDkim)) {
        severity = 'warning'; // Partial configuration
      } else {
        severity = 'critical'; // Nothing configured
      }

      // Build recommendation based on what's missing/weak
      let recommendation = '';
      if (data?.hasSpf && data?.hasDmarc && data?.hasDkim && data?.dmarcEnforced) {
        recommendation =
          'Excellent! Your domain has complete email authentication protecting against spoofing and phishing.';
      } else {
        const missing = [];
        if (!data?.hasSpf) missing.push('SPF');
        if (!data?.hasDmarc) missing.push('DMARC');
        if (!data?.hasDkim) missing.push('DKIM');

        if (missing.length > 0) {
          recommendation = `Configure ${missing.join(', ')} to protect your domain from email spoofing. `;
        }

        if (data?.hasDmarc && !data?.dmarcEnforced) {
          recommendation += 'Upgrade your DMARC policy from p=none to p=quarantine or p=reject for enforcement. ';
        }

        recommendation += 'Review the issues below for specific configuration improvements.';
      }

      return {
        severity,
        message,
        recommendation
      };
    }

    case 'certificates': {
      const data = scanner.data as {
        certCount?: number;
        activeCertCount?: number;
        expiredCertCount?: number;
        expiringIn7Days?: number;
        expiringIn30Days?: number;
      };

      const certCount = data?.certCount || 0;
      const activeCertCount = data?.activeCertCount || 0;
      const expiringIn7Days = data?.expiringIn7Days || 0;
      const expiringIn30Days = data?.expiringIn30Days || 0;

      // Determine severity based on certificate status
      let severity: SeverityLevel;
      let message: string;
      let recommendation: string;

      if (certCount === 0) {
        severity = 'info';
        message = 'No certificates found';
        recommendation = 'No SSL certificates found in public certificate transparency logs. ' +
          'If you use HTTPS, this might indicate a very new certificate or the certificate is not yet logged.';
      } else if (expiringIn7Days > 0) {
        severity = 'critical';
        message = `${expiringIn7Days} certificate(s) expiring within 7 days!`;
        recommendation = 'Renew expiring certificates immediately to avoid service disruption. ' +
          'Consider setting up automated renewal (e.g., using Let\'s Encrypt with auto-renewal).';
      } else if (expiringIn30Days > 0) {
        severity = 'warning';
        message = `${expiringIn30Days} certificate(s) expiring within 30 days`;
        recommendation = 'Plan to renew certificates soon to avoid last-minute issues. ' +
          'Set up monitoring alerts for certificate expiration.';
      } else if (issueCount > 0) {
        severity = 'warning';
        message = `${activeCertCount} active certificate(s), ${issueCount} issue(s) detected`;
        recommendation = 'Review the certificate issues below. Consider cleaning up expired certificates ' +
          'and standardizing on a single Certificate Authority.';
      } else {
        severity = 'success';
        message = `${activeCertCount} valid certificate(s) found`;
        recommendation = activeCertCount > 50
          ? 'Large number of certificates found. Regularly review and remove unnecessary certificates.'
          : 'Certificate transparency logs show your domain has valid SSL certificates with no immediate issues.';
      }

      return {
        severity,
        message,
        recommendation
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

// DNS Scanner: collects common record types and validates configuration.
const dnsScanner: DomainScanner = {
  id: 'dns',
  label: 'DNS Records',
  description: 'Retrieves A, AAAA, MX, TXT, CNAME records and validates configuration',
  dataSource: {
    name: 'Google Public DNS',
    url: 'https://dns.google',
  },
  run: async (domain) => {
    const types = ['A', 'AAAA', 'MX', 'TXT', 'CNAME'];
    const records = [] as { type: string; data: string[] }[];
    for (const t of types) {
      const r = await fetchDNS(domain, t);
      if (r) records.push(r);
    }

    // Validate DNS configuration and detect issues
    const issues: string[] = [];
    const aRecords = records.find((r) => r.type === 'A')?.data || [];
    const aaaaRecords = records.find((r) => r.type === 'AAAA')?.data || [];
    const mxRecords = records.find((r) => r.type === 'MX')?.data || [];
    const cnameRecords = records.find((r) => r.type === 'CNAME')?.data || [];
    const txtRecords = records.find((r) => r.type === 'TXT')?.data || [];

    // Critical: No A or AAAA records means the domain won't resolve
    if (aRecords.length === 0 && aaaaRecords.length === 0 && cnameRecords.length === 0) {
      issues.push('No A, AAAA, or CNAME records found - domain may not be accessible via web browser');
    }

    // Check for reserved/private IP addresses in A records
    const reservedIPs = ['127.', '0.0.0.0', '10.', '172.16.', '192.168.', '169.254.'];
    aRecords.forEach((ip) => {
      if (reservedIPs.some((reserved) => ip.startsWith(reserved))) {
        issues.push(`A record contains reserved/private IP: ${ip} - should be a public IP`);
      }
    });

    // CNAME conflicts: CNAME cannot coexist with other record types at the same name
    if (cnameRecords.length > 0) {
      if (aRecords.length > 0 || aaaaRecords.length > 0 || mxRecords.length > 0) {
        issues.push('CNAME conflict detected - CNAME records cannot coexist with A, AAAA, or MX records');
      }
      if (cnameRecords.length > 1) {
        issues.push('Multiple CNAME records found - only one CNAME record should exist per name');
      }
    }

    // Excessive A records might indicate misconfiguration or compromise
    if (aRecords.length > 10) {
      issues.push(`Unusually high number of A records (${aRecords.length}) - verify this is intentional`);
    }

    // No MX records means email won't work for this domain
    if (mxRecords.length === 0) {
      issues.push('No MX records found - email delivery to this domain will fail');
    }

    // Check for overly long TXT records (SPF/DKIM often have this issue)
    txtRecords.forEach((txt) => {
      if (txt.length > 255) {
        // Note: DNS can split these, but it's a common misconfiguration point
        issues.push('TXT record exceeds 255 characters - may cause issues with some DNS resolvers');
      }
    });

    // Check if MX records point to IP addresses (should be hostnames)
    mxRecords.forEach((mx) => {
      // MX format is "priority hostname" e.g., "10 mail.example.com."
      const parts = mx.split(' ');
      const hostname = parts[1] || parts[0];
      // Simple IP detection (contains only digits and dots)
      if (/^\d+\.\d+\.\d+\.\d+\.?$/.test(hostname)) {
        issues.push(`MX record points to IP address (${hostname}) - should point to a hostname`);
      }
    });

    // Build summary with record counts
    const recordCounts = records.map((r) => `${r.type}:${r.data.length}`).join(', ');
    const summary = records.length > 0
      ? `Found ${recordCounts}`
      : 'No DNS records found';

    return {
      data: { records },
      summary,
      issues,
    };
  }
};

// Email Auth scanner: SPF / DMARC / DKIM with detailed policy validation.
const emailAuthScanner: DomainScanner = {
  id: 'emailAuth',
  label: 'Email Authentication',
  description: 'Validates SPF, DMARC, and DKIM configuration for email security',
  dataSource: {
    name: 'Google Public DNS',
    url: 'https://dns.google',
  },
  run: async (domain) => {
    const txtRec = await fetchDNS(domain, 'TXT');
    const txtRecords = txtRec?.data || [];
    const spf = extractSPF(txtRecords);
    const dmarc = await fetchDMARC(domain);
    const dkimSelectorsFound = await checkDKIM(domain);

    const issues: string[] = [];
    const warnings: string[] = [];

    // SPF Validation
    if (!spf) {
      issues.push('No SPF record found - your domain is vulnerable to email spoofing');
    } else {
      // Check SPF policy strength
      if (spf.includes('~all')) {
        warnings.push('SPF uses soft fail (~all) - consider upgrading to hard fail (-all) for better protection');
      } else if (spf.includes('+all')) {
        issues.push('SPF allows all senders (+all) - this provides no protection against spoofing');
      } else if (spf.includes('?all')) {
        warnings.push('SPF uses neutral policy (?all) - consider using -all or ~all for protection');
      }
      // Check for too many DNS lookups (SPF limit is 10)
      const includeCount = (spf.match(/include:/g) || []).length;
      const redirectCount = (spf.match(/redirect=/g) || []).length;
      const lookupCount = includeCount + redirectCount;
      if (lookupCount > 10) {
        issues.push(`SPF exceeds 10 DNS lookup limit (${lookupCount} found) - will cause validation failures`);
      } else if (lookupCount > 8) {
        warnings.push(`SPF has ${lookupCount} DNS lookups - limit is 10, you're close to the maximum`);
      }
    }

    // DMARC Validation
    if (!dmarc) {
      issues.push('No DMARC record found - email spoofing protection is incomplete');
    } else {
      const dmarcLower = dmarc.toLowerCase();

      // Check DMARC policy
      if (dmarcLower.includes('p=none')) {
        warnings.push('DMARC policy is "none" - monitoring only, no enforcement against spoofed emails');
      } else if (dmarcLower.includes('p=quarantine')) {
        // Quarantine is good, but reject is better
        warnings.push('DMARC policy is "quarantine" - consider upgrading to "reject" for maximum protection');
      } else if (dmarcLower.includes('p=reject')) {
        // Perfect! No warning needed
      } else {
        warnings.push('DMARC policy not clearly defined - ensure p=quarantine or p=reject is set');
      }

      // Check for subdomain policy
      if (!dmarcLower.includes('sp=')) {
        warnings.push('DMARC missing subdomain policy (sp=) - subdomains may not be protected');
      }

      // Check for reporting
      const hasRua = dmarcLower.includes('rua=');
      const hasRuf = dmarcLower.includes('ruf=');
      if (!hasRua && !hasRuf) {
        warnings.push('DMARC has no reporting emails (rua/ruf) - you won\'t receive abuse reports');
      }

      // Check percentage
      if (dmarcLower.includes('pct=') && !dmarcLower.includes('pct=100')) {
        const pctMatch = dmarcLower.match(/pct=(\d+)/);
        const pct = pctMatch ? pctMatch[1] : 'unknown';
        warnings.push(`DMARC applies to only ${pct}% of emails - consider increasing to pct=100`);
      }
    }

    // DKIM Validation
    if (dkimSelectorsFound.length === 0) {
      issues.push('No DKIM selectors detected - emails cannot be cryptographically verified');
      warnings.push(
        'Note: DKIM selector detection is heuristic (checks common selectors: default, selector1, selector2)'
      );
    }

    // Aggregate assessment
    const hasSpf = !!spf;
    const hasDmarc = !!dmarc;
    const hasDkim = dkimSelectorsFound.length > 0;
    const dmarcEnforced = dmarc && (dmarc.toLowerCase().includes('p=quarantine') ||
                                     dmarc.toLowerCase().includes('p=reject'));

    // Build aggregate message
    let aggregateMessage = '';
    if (hasSpf && hasDmarc && hasDkim && dmarcEnforced) {
      aggregateMessage = '✓ Email authentication fully configured with enforcement';
    } else if (hasSpf && hasDmarc && hasDkim) {
      aggregateMessage = '⚠ Email authentication configured but DMARC not enforcing (p=none)';
    } else if (hasSpf || hasDmarc || hasDkim) {
      const missing = [];
      if (!hasSpf) missing.push('SPF');
      if (!hasDmarc) missing.push('DMARC');
      if (!hasDkim) missing.push('DKIM');
      aggregateMessage = `⚠ Partial email authentication - missing: ${missing.join(', ')}`;
    } else {
      aggregateMessage = '✗ No email authentication configured - domain is vulnerable to spoofing';
    }

    // Combine issues and warnings
    const allIssues = [...issues, ...warnings];

    const data = {
      spf,
      dmarc,
      dkimSelectorsFound,
      aggregateMessage,
      hasSpf,
      hasDmarc,
      hasDkim,
      dmarcEnforced
    };

    const summary = aggregateMessage;

    return {
      data,
      summary,
      issues: allIssues
    };
  }
};

// Certificate enumeration scanner using crt.sh with security analysis
const certificateScanner: DomainScanner = {
  id: 'certificates',
  label: 'SSL/TLS Certificates',
  description: 'Analyzes SSL certificates from public certificate transparency logs',
  dataSource: {
    name: 'crt.sh',
    url: 'https://crt.sh',
  },
  run: async (domain) => {
    const certificates = await fetchCertificates(domain);

    if (!certificates || certificates.length === 0) {
      return {
        data: { certificates: [], certCount: 0 },
        summary: 'No certificates found in transparency logs',
        issues: ['No SSL certificates found - if you use HTTPS, this might indicate a very new certificate']
      };
    }

    const issues: string[] = [];
    const warnings: string[] = [];
    const now = new Date();

    // Parse and analyze certificates
    interface CertInfo {
      commonName: string;
      issuer: string;
      notBefore: Date;
      notAfter: Date;
      isExpired: boolean;
      daysUntilExpiry: number;
      id: number;
    }

    const parsedCerts: CertInfo[] = certificates.map((cert) => {
      const notBefore = new Date(cert.not_before);
      const notAfter = new Date(cert.not_after);
      const daysUntilExpiry = Math.floor((notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      return {
        commonName: cert.common_name || cert.name_value || 'Unknown',
        issuer: cert.issuer_name || 'Unknown',
        notBefore,
        notAfter,
        isExpired: notAfter < now,
        daysUntilExpiry,
        id: cert.id
      };
    });

    // Get unique, non-expired certificates (most recent per common name)
    const certsByName = new Map<string, CertInfo>();
    parsedCerts
      .filter((cert) => !cert.isExpired)
      .sort((a, b) => b.notBefore.getTime() - a.notBefore.getTime()) // Most recent first
      .forEach((cert) => {
        if (!certsByName.has(cert.commonName)) {
          certsByName.set(cert.commonName, cert);
        }
      });

    const activeCerts = Array.from(certsByName.values());
    const expiredCerts = parsedCerts.filter((cert) => cert.isExpired);

    // Analysis 1: Check for expiring certificates
    const expiringIn30Days = activeCerts.filter((cert) => cert.daysUntilExpiry <= 30 && cert.daysUntilExpiry > 0);
    const expiringIn7Days = activeCerts.filter((cert) => cert.daysUntilExpiry <= 7 && cert.daysUntilExpiry > 0);

    if (expiringIn7Days.length > 0) {
      expiringIn7Days.forEach((cert) => {
        issues.push(
          `Certificate for ${cert.commonName} expires in ${cert.daysUntilExpiry} day(s) - renew immediately!`
        );
      });
    } else if (expiringIn30Days.length > 0) {
      expiringIn30Days.forEach((cert) => {
        warnings.push(
          `Certificate for ${cert.commonName} expires in ${cert.daysUntilExpiry} days - plan renewal soon`
        );
      });
    }

    // Analysis 2: Check certificate issuers (identify Let's Encrypt, self-signed, etc.)
    const selfSignedCerts = activeCerts.filter((cert) =>
      cert.issuer.toLowerCase().includes('self-signed') ||
      cert.commonName === cert.issuer
    );

    if (selfSignedCerts.length > 0) {
      issues.push(
        `${selfSignedCerts.length} self-signed certificate(s) detected - not trusted by browsers`
      );
    }

    // Analysis 3: Check for wildcard certificates
    const wildcardCerts = activeCerts.filter((cert) => cert.commonName.startsWith('*.'));
    if (wildcardCerts.length > 0) {
      warnings.push(
        `${wildcardCerts.length} wildcard certificate(s) found - ensure proper security controls`
      );
    }

    // Analysis 4: Detect unusual number of active certificates
    if (activeCerts.length > 10) {
      warnings.push(
        `High number of active certificates (${activeCerts.length}) - review for unnecessary or duplicate certs`
      );
    }

    // Analysis 5: Check for recent expired certificates (potential renewal issues)
    const recentlyExpired = expiredCerts.filter((cert) => {
      const daysSinceExpiry = Math.floor((now.getTime() - cert.notAfter.getTime()) / (1000 * 60 * 60 * 24));
      return daysSinceExpiry <= 30;
    });

    // Only warn about recently expired certs that don't have an active replacement
    const expiredWithoutReplacement = recentlyExpired.filter((expired) => {
      // Check if there's an active cert for the same common name
      return !activeCerts.some((active) => active.commonName === expired.commonName);
    });

    if (expiredWithoutReplacement.length > 0) {
      const certNames = expiredWithoutReplacement.map((cert) => cert.commonName).join(', ');
      warnings.push(
        `${expiredWithoutReplacement.length} certificate(s) expired recently without replacement: ${certNames}`
      );
    }

    // Analysis 6: Check issuer diversity (too many different CAs might indicate issues)
    const uniqueIssuers = new Set(activeCerts.map((cert) => cert.issuer));
    if (uniqueIssuers.size > 3) {
      warnings.push(
        `Certificates from ${uniqueIssuers.size} different issuers - consider standardizing on fewer CAs`
      );
    }

    // Build summary
    const allIssues = [...issues, ...warnings];
    let summary = `Found ${certificates.length} total certificates`;
    if (activeCerts.length > 0) {
      summary += `, ${activeCerts.length} currently active`;
    }
    if (expiredCerts.length > 0) {
      summary += `, ${expiredCerts.length} expired`;
    }

    // Add data for UI display
    const data = {
      certificates,
      certCount: certificates.length,
      activeCertCount: activeCerts.length,
      expiredCertCount: expiredCerts.length,
      activeCerts: activeCerts.slice(0, 10), // Limit for display
      expiringIn30Days: expiringIn30Days.length,
      expiringIn7Days: expiringIn7Days.length,
      wildcardCount: wildcardCerts.length,
      uniqueIssuers: Array.from(uniqueIssuers).slice(0, 5), // Top 5 issuers
      expiredWithoutReplacement: expiredWithoutReplacement.map((cert) => cert.commonName),
    };

    return {
      data,
      summary,
      issues: allIssues
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
      dataSource: scanner.dataSource,
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
      Object.assign(base, r, { status: 'complete', issues, finishedAt: new Date().toISOString() });
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
