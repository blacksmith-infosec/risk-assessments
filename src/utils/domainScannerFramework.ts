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
        message: `Security headers analyzed (${grade})`
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

      return {
        severity: gradeInfo.severity,
        message: gradeInfo.message,
        recommendation: recommendation || 'Visit securityheaders.com for detailed analysis.'
      };
    }

    case 'rdap': {
      const data = scanner.data as {
        status?: string[];
        dnssecEnabled?: boolean;
        error?: string;
        expirationDate?: string;
        registrationDate?: string;
        nameservers?: string[];
      };

      if (data?.error) {
        return {
          severity: 'info',
          message: 'RDAP lookup incomplete',
          recommendation: data.error.includes('not found')
            ? 'Domain not found in RDAP. This may be normal for some TLDs or private registrations.'
            : 'RDAP lookup failed. This doesn\'t affect domain functionality.'
        };
      }

      // Check for critical issues
      const hasCriticalIssues = scanner.issues?.some((issue) =>
        issue.toLowerCase().includes('expired') ||
        issue.toLowerCase().includes('no nameservers')
      );

      const hasExpirationWarning = scanner.issues?.some((issue) =>
        issue.toLowerCase().includes('expires in') && issue.toLowerCase().includes('days')
      );

      let severity: SeverityLevel;
      let message: string;
      let recommendation: string;

      if (hasCriticalIssues) {
        severity = 'critical';
        message = 'Domain registration has critical issues';
        recommendation = 'Address domain registration issues immediately to prevent service disruption. ' +
          'Check expiration date and nameserver configuration.';
      } else if (hasExpirationWarning) {
        severity = 'warning';
        message = 'Domain registration needs attention';
        recommendation = 'Plan to renew your domain before expiration. Set up auto-renewal if available.';
      } else if (issueCount > 0) {
        severity = 'warning';
        message = 'Domain registration has recommendations';
        recommendation = 'Review the recommendations below to improve domain security and reliability.';
      } else {
        severity = 'success';
        message = 'Domain registration is healthy';
        recommendation = data?.dnssecEnabled
          ? 'Domain registration and DNSSEC configuration look good.'
          : 'Consider enabling DNSSEC for additional security against DNS spoofing.';
      }

      return {
        severity,
        message,
        recommendation
      };
    }
    case 'sslLabs': {
      const data = scanner.data as {
        status?: string;
        grades?: string[];
        lowestGrade?: string;
        endpoints?: unknown[];
        testUrl?: string;
        error?: string;
      };

      if (data?.status === 'ERROR') {
        return {
          severity: 'error',
          message: 'SSL Labs could not scan this domain',
          recommendation: 'The domain may not support HTTPS or SSL Labs cannot reach it. ' +
            'Verify the domain is accessible.'
        };
      }

      if (data?.status !== 'READY') {
        return {
          severity: 'info',
          message: 'SSL Labs scan in progress',
          recommendation: data?.testUrl
            ? `Visit ${data.testUrl} to see the scan progress and full results.`
            : 'Try scanning again in a few minutes for complete results.'
        };
      }

      const lowestGrade = data?.lowestGrade;
      const gradeMap: Record<string, { severity: SeverityLevel; message: string }> = {
        'A+': { severity: 'success', message: 'Excellent SSL/TLS configuration (A+)' },
        'A': { severity: 'success', message: 'Excellent SSL/TLS configuration (A)' },
        'A-': { severity: 'success', message: 'Good SSL/TLS configuration (A-)' },
        'B': { severity: 'warning', message: 'Acceptable SSL/TLS configuration (B)' },
        'C': { severity: 'warning', message: 'Mediocre SSL/TLS configuration (C)' },
        'D': { severity: 'critical', message: 'Weak SSL/TLS configuration (D)' },
        'E': { severity: 'critical', message: 'Poor SSL/TLS configuration (E)' },
        'F': { severity: 'critical', message: 'Failed SSL/TLS configuration (F)' },
        'T': { severity: 'critical', message: 'Certificate trust issues (T)' },
        'M': { severity: 'critical', message: 'Certificate name mismatch (M)' }
      };

      const gradeInfo = (lowestGrade && gradeMap[lowestGrade]) || {
        severity: 'info' as SeverityLevel,
        message: 'SSL/TLS configuration analyzed'
      };

      let recommendation = '';
      if (lowestGrade && ['A+', 'A', 'A-'].includes(lowestGrade)) {
        recommendation = 'Your SSL/TLS configuration follows security best practices. ';
      } else if (lowestGrade && ['B', 'C'].includes(lowestGrade)) {
        recommendation = 'Your SSL/TLS configuration could be improved. Consider upgrading cipher suites, ' +
          'disabling older protocols, and enabling HSTS. ';
      } else if (lowestGrade && ['D', 'E', 'F', 'T', 'M'].includes(lowestGrade)) {
        recommendation = 'Your SSL/TLS configuration has serious issues that need immediate attention. ' +
          'Update your TLS configuration, disable weak ciphers and outdated protocols. ';
      }

      if (issueCount > 0) {
        recommendation += `${issueCount} specific issue(s) detected - review them below. `;
      }

      if (data?.testUrl) {
        recommendation += 'View the complete SSL Labs report for detailed recommendations.';
      }

      return {
        severity: gradeInfo.severity,
        message: gradeInfo.message,
        recommendation: recommendation || 'SSL/TLS configuration analyzed. Review any issues detected.'
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
  timeout: 5000, // 5 seconds - DNS should be fast
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
  timeout: 10000, // 10 seconds - multiple DNS lookups
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
  timeout: 15000, // 15 seconds - external API call
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

// RDAP scanner: Domain registration and DNSSEC information
const rdapScanner: DomainScanner = {
  id: 'rdap',
  label: 'Domain Registration (RDAP)',
  description: 'Retrieves domain registration and DNSSEC information via RDAP',
  timeout: 10000, // 10 seconds - bootstrap lookup + RDAP query
  dataSource: {
    name: 'RDAP',
    url: 'https://about.rdap.org/',
  },
  run: async (domain) => {
    const issues: string[] = [];
    const warnings: string[] = [];

    try {
      // Extract TLD from domain
      const parts = domain.split('.');
      if (parts.length < 2) {
        return {
          data: { error: 'Invalid domain format' },
          summary: 'Invalid domain',
          issues: ['Domain must have at least a name and TLD (e.g., example.com)']
        };
      }

      const tld = parts[parts.length - 1];

      // Step 1: Query IANA RDAP bootstrap service to find the correct RDAP server for this TLD
      const bootstrapUrl = 'https://data.iana.org/rdap/dns.json';
      const bootstrapResponse = await fetch(bootstrapUrl);

      if (!bootstrapResponse.ok) {
        throw new Error(`Failed to fetch RDAP bootstrap data: ${bootstrapResponse.status}`);
      }

      const bootstrapData = await bootstrapResponse.json();

      // Find the RDAP server(s) for this TLD
      let rdapServers: string[] = [];
      if (bootstrapData.services) {
        for (const service of bootstrapData.services) {
          const [tlds, servers] = service;
          if (tlds.includes(tld.toLowerCase())) {
            rdapServers = servers;
            break;
          }
        }
      }

      if (rdapServers.length === 0) {
        return {
          data: {
            error: `No RDAP server found for .${tld} TLD`,
            tld
          },
          summary: 'RDAP not available for this TLD',
          issues: [
            `No RDAP service available for .${tld} domains.`,
            'This TLD may not support RDAP or uses legacy WHOIS only.'
          ]
        };
      }

      // Step 2: Query the RDAP server for domain information
      // Try each server until one succeeds
      let rdapData = null;
      let lastError = null;

      for (const server of rdapServers) {
        try {
          const rdapUrl = `${server}domain/${domain}`;
          const response = await fetch(rdapUrl);

          if (response.ok) {
            rdapData = await response.json();
            break;
          } else if (response.status === 404) {
            lastError = 'Domain not found';
            continue;
          } else {
            lastError = `Server returned ${response.status}`;
            continue;
          }
        } catch (err) {
          lastError = err instanceof Error ? err.message : 'Unknown error';
          continue;
        }
      }

      if (!rdapData) {
        return {
          data: {
            error: lastError || 'Domain not found in RDAP',
            rdapServers
          },
          summary: 'RDAP lookup failed',
          issues: [
            `Could not retrieve RDAP data: ${lastError || 'Domain not found'}`,
            'Domain may not be registered or RDAP server may be unavailable.'
          ]
        };
      }

      // Step 3: Analyze RDAP response
      const data = rdapData;

      // Check domain status
      const statuses = data.status || [];
      const ldhName = data.ldhName || domain;

      // Check for problematic statuses
      const problemStatuses = ['clientHold', 'serverHold', 'redemptionPeriod', 'pendingDelete'];
      const hasProblems = statuses.some((s: string) =>
        problemStatuses.some((ps) => s.toLowerCase().includes(ps.toLowerCase()))
      );

      if (hasProblems) {
        const problemStatusList = statuses.filter((s: string) =>
          problemStatuses.some((ps) => s.toLowerCase().includes(ps.toLowerCase()))
        );
        issues.push(`Domain has problematic status: ${problemStatusList.join(', ')}`);
      }

      // Check expiration
      const events = data.events || [];
      const expirationEvent = events.find((e: { eventAction: string }) =>
        e.eventAction === 'expiration'
      );

      if (expirationEvent) {
        const expirationDate = new Date(expirationEvent.eventDate);
        const now = new Date();
        const daysUntilExpiration = Math.floor(
          (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilExpiration < 0) {
          issues.push(`Domain expired ${Math.abs(daysUntilExpiration)} days ago`);
        } else if (daysUntilExpiration <= 30) {
          issues.push(`Domain expires in ${daysUntilExpiration} days - renew soon!`);
        } else if (daysUntilExpiration <= 60) {
          warnings.push(`Domain expires in ${daysUntilExpiration} days - plan renewal`);
        }
      }

      // Check DNSSEC
      const secureDNS = data.secureDNS;
      if (secureDNS) {
        if (secureDNS.delegationSigned === false) {
          warnings.push('DNSSEC is not enabled - domain is vulnerable to DNS spoofing attacks');
        }
      }

      // Check nameservers
      const nameservers = data.nameservers || [];
      if (nameservers.length === 0) {
        issues.push('No nameservers found - domain cannot resolve');
      } else if (nameservers.length < 2) {
        warnings.push('Only one nameserver configured - add redundant nameservers for reliability');
      }

      // Build summary
      let summary = `Domain: ${ldhName}`;
      if (statuses.length > 0) {
        const activeStatus = statuses.includes('active') ? 'active' : statuses[0];
        summary += `, status: ${activeStatus}`;
      }
      if (expirationEvent) {
        const expirationDate = new Date(expirationEvent.eventDate);
        const daysUntilExpiration = Math.floor(
          (expirationDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        );
        summary += `, expires in ${daysUntilExpiration} days`;
      }

      const allIssues = [...issues, ...warnings];

      return {
        summary,
        issues: allIssues.length > 0 ? allIssues : undefined,
        data: {
          ldhName,
          status: statuses,
          nameservers: nameservers.map((ns: { ldhName: string }) => ns.ldhName),
          dnssecEnabled: secureDNS?.delegationSigned || false,
          expirationDate: expirationEvent?.eventDate,
          registrationDate: events.find((e: { eventAction: string }) =>
            e.eventAction === 'registration'
          )?.eventDate,
          registrar: data.entities?.find((e: { roles: string[] }) =>
            e.roles?.includes('registrar')
          )?.vcardArray?.[1]?.find((v: string[]) => v[0] === 'fn')?.[3],
        },
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        data: { error: errorMessage },
        summary: 'RDAP lookup failed',
        issues: [`Failed to retrieve RDAP information: ${errorMessage}`]
      };
    }
  }
};

// SSL Labs scanner: TLS/SSL configuration analysis using SSLLabs API
// Note: This scanner uses polling since SSL Labs processes scans asynchronously
const sslLabsScanner: DomainScanner = {
  id: 'sslLabs',
  label: 'SSL/TLS Configuration',
  description: 'Analyzes SSL/TLS configuration using Qualys SSL Labs (may take several minutes)',
  timeout: 600000, // 10 minutes - SSL Labs can take a while with polling
  dataSource: {
    name: 'Qualys SSL Labs',
    url: 'https://www.ssllabs.com/ssltest/',
  },
  run: async (domain) => {
    const warnings: string[] = [];
    const issues: string[] = [];

    // Type definitions for SSL Labs API responses
    interface SSLLabsProtocol {
      name: string;
      version: string;
    }

    interface SSLLabsCertChain {
      issues?: number;
    }

    interface SSLLabsEndpointDetails {
      protocols?: SSLLabsProtocol[];
      vulnBeast?: boolean;
      poodle?: boolean;
      heartbleed?: boolean;
      freak?: boolean;
      logjam?: boolean;
      drownVulnerable?: boolean;
      certChains?: SSLLabsCertChain[];
      forwardSecrecy?: number;
      hstsPolicy?: {
        status: string;
        maxAge?: number;
      };
    }

    interface SSLLabsEndpoint {
      ipAddress: string;
      grade?: string;
      statusMessage?: string;
      hasWarnings?: boolean;
      isExceptional?: boolean;
      details?: SSLLabsEndpointDetails;
    }

    interface SSLLabsResult {
      status: string;
      statusMessage?: string;
      endpoints?: SSLLabsEndpoint[];
    }

    // Helper function to fetch analysis status
    const fetchAnalysis = async (fromCache: boolean = true, startNew: boolean = false) => {
      // Build the SSL Labs API URL
      const sslLabsUrl = new URL('https://api.ssllabs.com/api/v3/analyze');
      sslLabsUrl.searchParams.append('host', domain);
      sslLabsUrl.searchParams.append('fromCache', fromCache ? 'on' : 'off');
      sslLabsUrl.searchParams.append('all', 'done');
      if (startNew) {
        sslLabsUrl.searchParams.append('startNew', 'on');
      }

      // Build the CORS proxy URL with key first, then url parameter
      // We use corsproxy.io to proxy requests that we can't make directly from the browser. Normally, we would not use
      // a commercial proxy service for production code. However, since all of these data are publicly available, we are
      // using this service for convenience in this open source project. If you are forking this code for your own use,
      // consider hosting your own CORS proxy or making server-side requests instead.
      const proxyUrl = new URL('https://corsproxy.io/');
      // TODO: Currently, the API documentation for CORS Proxy says a key is required from a non-localhost domain.
      // However, when the key is provided, their API returns a 403 error with a bad URL, which suggests they are
      // parsing the querystring incorrectly. For now, we will omit the key to allow things to work, but we expect that
      // the API will be fixed in the future and this key will be required again.
      // proxyUrl.searchParams.set('key', '54aed9d2');
      proxyUrl.searchParams.set('url', sslLabsUrl.toString());

      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`SSL Labs API returned ${response.status}: ${response.statusText}`);
      }

      return await response.json() as SSLLabsResult;
    };

    try {
      // First, try to get cached results
      let result: SSLLabsResult = await fetchAnalysis(true, false);

      // If no cached results or scan in progress, we may need to poll
      const maxPolls = 20; // Maximum 20 polls (10 minutes at 30 second intervals)
      const pollInterval = 30000; // 30 seconds
      let pollCount = 0;

      while (result.status !== 'READY' && result.status !== 'ERROR' && pollCount < maxPolls) {
        // If status is DNS, IN_PROGRESS, wait and poll again
        if (result.status === 'DNS' || result.status === 'IN_PROGRESS') {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          result = await fetchAnalysis(true, false);
          pollCount++;
        } else {
          // For other statuses, break
          break;
        }
      }

      // Handle different result statuses
      if (result.status === 'ERROR') {
        return {
          data: { status: result.status, statusMessage: result.statusMessage },
          summary: `SSL Labs scan error: ${result.statusMessage || 'Unknown error'}`,
          issues: [`SSL Labs could not scan this domain: ${result.statusMessage || 'Unknown error'}`]
        };
      }

      if (result.status !== 'READY') {
        return {
          data: { status: result.status },
          summary: `SSL Labs scan still in progress (status: ${result.status})`,
          issues: ['Scan timed out or is still processing. Try again later or visit ssllabs.com for full results.']
        };
      }

      // Process READY results
      const endpoints = result.endpoints || [];

      if (endpoints.length === 0) {
        return {
          data: { status: result.status, endpoints: [] },
          summary: 'No SSL/TLS endpoints found',
          issues: ['No HTTPS endpoints detected for this domain']
        };
      }

      // Analyze each endpoint
      const grades: string[] = [];
      let lowestGradeValue = 100;
      const gradeMap: Record<string, number> = {
        'A+': 100, 'A': 95, 'A-': 90, 'B': 80, 'C': 70, 'D': 60, 'E': 50, 'F': 40, 'T': 30, 'M': 20
      };

      endpoints.forEach((endpoint: SSLLabsEndpoint) => {
        if (endpoint.grade) {
          grades.push(endpoint.grade);
          const gradeValue = gradeMap[endpoint.grade] || 0;
          lowestGradeValue = Math.min(lowestGradeValue, gradeValue);
        }

        // Check for specific issues
        if (endpoint.statusMessage && endpoint.statusMessage !== 'Ready') {
          warnings.push(`Endpoint ${endpoint.ipAddress}: ${endpoint.statusMessage}`);
        }

        // Analyze protocol support
        if (endpoint.details) {
          const details = endpoint.details;

          // Check for outdated protocols
          if (details.protocols) {
            const hasSSLv2 = details.protocols.some((p: SSLLabsProtocol) =>
              p.name === 'SSL' && p.version === '2.0');
            const hasSSLv3 = details.protocols.some((p: SSLLabsProtocol) =>
              p.name === 'SSL' && p.version === '3.0');
            const hasTLS10 = details.protocols.some((p: SSLLabsProtocol) =>
              p.name === 'TLS' && p.version === '1.0');
            const hasTLS11 = details.protocols.some((p: SSLLabsProtocol) =>
              p.name === 'TLS' && p.version === '1.1');

            if (hasSSLv2 || hasSSLv3) {
              issues.push(`Endpoint ${endpoint.ipAddress}: Supports deprecated SSL protocols (SSLv2/SSLv3)`);
            }
            if (hasTLS10 || hasTLS11) {
              warnings.push(`Endpoint ${endpoint.ipAddress}: Supports outdated TLS 1.0/1.1 protocols`);
            }
          }

          // Check for vulnerabilities
          if (details.vulnBeast) {
            warnings.push(`Endpoint ${endpoint.ipAddress}: Vulnerable to BEAST attack`);
          }
          if (details.poodle) {
            issues.push(`Endpoint ${endpoint.ipAddress}: Vulnerable to POODLE attack`);
          }
          if (details.heartbleed) {
            issues.push(`Endpoint ${endpoint.ipAddress}: Vulnerable to Heartbleed`);
          }
          if (details.freak) {
            issues.push(`Endpoint ${endpoint.ipAddress}: Vulnerable to FREAK attack`);
          }
          if (details.logjam) {
            warnings.push(`Endpoint ${endpoint.ipAddress}: Vulnerable to Logjam attack`);
          }
          if (details.drownVulnerable) {
            issues.push(`Endpoint ${endpoint.ipAddress}: Vulnerable to DROWN attack`);
          }

          // Check certificate issues
          if (details.certChains) {
            details.certChains.forEach((chain: SSLLabsCertChain, idx: number) => {
              if (chain.issues) {
                if (chain.issues & 1) {
                  warnings.push(`Endpoint ${endpoint.ipAddress}: Certificate chain ${idx + 1} has issues`);
                }
              }
            });
          }

          // Check for forward secrecy
          if (details.forwardSecrecy === 0) {
            warnings.push(`Endpoint ${endpoint.ipAddress}: Does not support forward secrecy`);
          } else if (details.forwardSecrecy === 1) {
            warnings.push(`Endpoint ${endpoint.ipAddress}: Forward secrecy with some browsers only`);
          }

          // Check for HSTS
          if (!details.hstsPolicy || details.hstsPolicy.status === 'absent') {
            warnings.push(`Endpoint ${endpoint.ipAddress}: HSTS not configured`);
          } else if (details.hstsPolicy.status === 'present' &&
                     details.hstsPolicy.maxAge &&
                     details.hstsPolicy.maxAge < 15768000) {
            warnings.push(`Endpoint ${endpoint.ipAddress}: HSTS max-age is too short (should be 6+ months)`);
          }
        }
      });

      // Build summary
      const uniqueGrades = [...new Set(grades)].sort();
      const gradeText = uniqueGrades.length > 0 ? uniqueGrades.join(', ') : 'No grade';
      const allIssues = [...issues, ...warnings];

      let summary = `${endpoints.length} endpoint(s) scanned`;
      if (uniqueGrades.length > 0) {
        summary += `, grade(s): ${gradeText}`;
      }

      // Add data for UI
      const data = {
        status: result.status,
        endpoints: endpoints.map((ep: SSLLabsEndpoint) => ({
          ipAddress: ep.ipAddress,
          grade: ep.grade,
          hasWarnings: ep.hasWarnings,
          isExceptional: ep.isExceptional,
        })),
        grades: uniqueGrades,
        lowestGrade: uniqueGrades[uniqueGrades.length - 1] || null,
        testUrl: `https://www.ssllabs.com/ssltest/analyze.html?d=${encodeURIComponent(domain)}`,
      };

      return {
        data,
        summary,
        issues: allIssues
      };

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        data: { error: errorMessage },
        summary: 'SSL Labs scan failed',
        issues: [`Failed to scan SSL/TLS configuration: ${errorMessage}`]
      };
    }
  }
};

// Security Headers scanner: Fetches and parses results from securityheaders.com
const securityHeadersScanner: DomainScanner = {
  id: 'securityHeaders',
  label: 'Security Headers',
  description: 'Analyzes HTTP security headers using securityheaders.com',
  timeout: 15000, // 15 seconds - external service
  dataSource: {
    name: 'securityheaders.com',
    url: 'https://securityheaders.com',
  },
  run: async (domain) => {
    const issues: string[] = [];
    const warnings: string[] = [];

    try {
      // Build the securityheaders.com URL
      const testUrl = `https://securityheaders.com/?q=${encodeURIComponent(domain)}&hide=on&followRedirects=on`;

      // Build the CORS proxy URL
      // We use corsproxy.io to proxy requests that we can't make directly from the browser. Normally, we would not use
      // a commercial proxy service for production code. However, since all of these data are publicly available, we are
      // using this service for convenience in this open source project. If you are forking this code for your own use,
      // consider hosting your own CORS proxy or making server-side requests instead.
      const proxyUrl = new URL('https://corsproxy.io/');
      proxyUrl.searchParams.set('url', testUrl);

      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`securityheaders.com returned ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();

      // Parse the grade from the HTML
      // The grade appears in a div with class "score" containing a div with class "score_*" and a span
      // Example: <div class="score"><div class="score_yellow"><span>B</span></div></div>
      const gradeMatch = html.match(
        /<div\s+class="score">\s*<div\s+class="score_[^"]*">\s*<span>([A-F][+-]?)<\/span>/i
      );
      const grade = gradeMatch ? gradeMatch[1] : null;

      // Parse the score from the HTML
      // The score appears in the reportTitle div
      // Example: <div class="reportTitle">...Score: 85...</div>
      const scoreMatch = html.match(/Score:\s*(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

      // Parse missing headers from the "Missing Headers" section
      // Missing headers appear in a reportSection with reportTitle "Missing Headers"
      // Example: <th class="tableLabel table_red">Permissions-Policy</th>
      const missingHeadersSection = html.match(
        /<div class="reportTitle">Missing Headers<\/div>[\s\S]*?<div class="reportBody">([\s\S]*?)<\/div>\s*<\/div>/i
      );
      const missingHeaders: string[] = [];
      if (missingHeadersSection) {
        const headerMatches = missingHeadersSection[1].matchAll(
          /<th\s+class="tableLabel table_red">([^<]+)<\/th>/gi
        );
        for (const match of headerMatches) {
          const headerName = match[1].trim();
          if (headerName && !missingHeaders.includes(headerName)) {
            missingHeaders.push(headerName);
            issues.push(`Missing security header: ${headerName}`);
          }
        }
      }

      // Parse warnings from the "Warnings" section
      // Warnings appear in a reportSection with reportTitle "Warnings"
      // Example: <th class="tableLabel table_orange">Site is using HTTP</th>
      const warningsSection = html.match(
        /<div class="reportTitle">Warnings<\/div>[\s\S]*?<div class="reportBody">([\s\S]*?)<\/div>\s*<\/div>/i
      );
      if (warningsSection) {
        const warningMatches = warningsSection[1].matchAll(
          /<th\s+class="tableLabel table_orange">([^<]+)<\/th>/gi
        );
        for (const match of warningMatches) {
          const warningText = match[1].trim();
          if (warningText) {
            warnings.push(warningText);
          }
        }
      }

      // Parse present headers (if needed for data)
      // These would be in a different section, similar pattern
      const presentHeaders: string[] = [];
      // Note: We may not need to parse present headers if the grade/score is sufficient

      // Build summary
      let summary = '';
      if (grade) {
        summary = `Grade: ${grade}`;
        if (score !== null) {
          summary += ` (${score}/100)`;
        }
      } else if (score !== null) {
        summary = `Score: ${score}/100`;
      } else {
        summary = 'Security headers analyzed';
      }

      const data = {
        status: 'available',
        grade,
        score,
        testUrl,
        missingHeaders,
        presentHeaders,
      };

      const allIssues = [...issues, ...warnings];

      return {
        data,
        summary,
        issues: allIssues.length > 0 ? allIssues : undefined,
      };

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      // If we can't reach the service, provide a fallback
      const testUrl = `https://securityheaders.com/?q=${encodeURIComponent(domain)}&hide=on&followRedirects=on`;

      return {
        data: {
          status: 'unavailable',
          error: errorMessage,
          testUrl
        },
        summary: 'Security headers check unavailable',
        issues: [`Could not retrieve security headers analysis: ${errorMessage}`]
      };
    }
  }
};

export const SCANNERS: DomainScanner[] = [
  dnsScanner,
  emailAuthScanner,
  certificateScanner,
  rdapScanner,
  sslLabsScanner,
  securityHeadersScanner,
];

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
        onProgress?.([...results]); // Notify on completion
        return base;
      })
      .catch((err: unknown) => {
        base.status = 'error';
        base.error = err instanceof Error ? err.message : 'Unknown error';
        base.finishedAt = new Date().toISOString();
        onProgress?.([...results]); // Notify on error
        return base;
      });
  });

  // Initial progress callback with all scanners in "running" state
  onProgress?.([...results]);

  // Wait for all scanners to complete (or fail)
  await Promise.allSettled(scannerPromises);

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
