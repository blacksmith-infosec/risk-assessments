// RDAP Scanner: fetches domain registration data via RDAP protocol

import i18next from 'i18next';
import { DomainScanner, ExecutedScannerResult, ScannerInterpretation, SeverityLevel } from '../../types/domainScan';

export const rdapScanner: DomainScanner = {
  id: 'rdap',
  label: 'rdap.label',
  description: 'rdap.description',
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
          summary: i18next.t('rdap.summary.invalid', { ns: 'scanners' }),
          issues: [i18next.t('rdap.issues.invalidDomain', { ns: 'scanners' })]
        };
      } else if (parts.length > 2) {
        domain = parts.slice(-2).join('.');
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
          summary: i18next.t('rdap.summary.unavailable', { ns: 'scanners' }),
          issues: [
            i18next.t('rdap.issues.noRDAPServer', { ns: 'scanners', tld }),
            i18next.t('rdap.issues.legacyWhois', { ns: 'scanners' })
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
          summary: i18next.t('rdap.summary.failed', { ns: 'scanners' }),
          issues: [
            i18next.t('rdap.issues.notFound', { ns: 'scanners', error: lastError || 'Domain not found' }),
            i18next.t('rdap.issues.notRegistered', { ns: 'scanners' })
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
        issues.push(i18next.t('rdap.issues.problemStatus', { ns: 'scanners', statuses: problemStatusList.join(', ') }));
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
          issues.push(i18next.t('rdap.issues.expired', { ns: 'scanners', days: Math.abs(daysUntilExpiration) }));
        } else if (daysUntilExpiration <= 30) {
          issues.push(i18next.t('rdap.issues.expiringSoon', { ns: 'scanners', days: daysUntilExpiration }));
        } else if (daysUntilExpiration <= 60) {
          warnings.push(i18next.t('rdap.issues.expiringWarning', { ns: 'scanners', days: daysUntilExpiration }));
        }
      }

      // Check DNSSEC
      const secureDNS = data.secureDNS;
      if (secureDNS) {
        if (secureDNS.delegationSigned === false) {
          warnings.push(i18next.t('rdap.issues.noDNSSEC', { ns: 'scanners' }));
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
      const activeStatus = statuses.length > 0 ? (statuses.includes('active') ? 'active' : statuses[0]) : 'unknown';
      const summary = i18next.t('rdap.summary.found', { ns: 'scanners', domain: ldhName, status: activeStatus });

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
        summary: i18next.t('rdap.summary.failed', { ns: 'scanners' }),
        issues: [i18next.t('rdap.issues.notFound', { ns: 'scanners', error: errorMessage })]
      };
    }
  }
};

// Interpretation function for RDAP scanner results
export const interpretRdapResult = (
  scanner: ExecutedScannerResult,
  issueCount: number
): ScannerInterpretation => {
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
      message: i18next.t('rdap.interpretation.incomplete.message', { ns: 'scanners' }),
      recommendation: i18next.t('rdap.interpretation.incomplete.recommendation', { ns: 'scanners' })
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
    message = i18next.t('rdap.interpretation.critical.message', { ns: 'scanners' });
    recommendation = i18next.t('rdap.interpretation.critical.recommendation', { ns: 'scanners' });
  } else if (hasExpirationWarning) {
    severity = 'warning';
    message = i18next.t('rdap.interpretation.warning.message', { ns: 'scanners' });
    recommendation = i18next.t('rdap.interpretation.warning.recommendation', { ns: 'scanners' });
  } else if (issueCount > 0) {
    severity = 'warning';
    message = i18next.t('rdap.interpretation.recommendations.message', { ns: 'scanners' });
    recommendation = i18next.t('rdap.interpretation.recommendations.recommendation', { ns: 'scanners' });
  } else {
    severity = 'success';
    message = i18next.t('rdap.interpretation.healthy.message', { ns: 'scanners' });
    recommendation = data?.dnssecEnabled
      ? i18next.t('rdap.interpretation.healthy.recommendation', { ns: 'scanners' })
      : i18next.t('rdap.interpretation.healthyNoDnssec.recommendation', { ns: 'scanners' });
  }

  return {
    severity,
    message,
    recommendation
  };
};
