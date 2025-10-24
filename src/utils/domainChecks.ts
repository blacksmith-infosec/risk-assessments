// Client-side domain assessment utilities relying on public APIs.
// NOTE: Some checks (full SSL chain, security headers via direct fetch) are limited by CORS in a static site.

export interface DNSRecordResult {
  type: string;
  data: string[];
}

export interface DomainScanResult {
  domain: string;
  timestamp: string;
  dns: DNSRecordResult[];
  spf?: string;
  dmarc?: string;
  dkimSelectorsFound: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  certificates?: any[]; // Raw crt.sh JSON rows
  securityHeaders?: { status: 'unavailable' | 'fetched'; headers?: Record<string, string>; note?: string };
  issues: string[]; // Derived issue strings
}

export const fetchDNS = async (domain: string, rrtype: string): Promise<DNSRecordResult | null> => {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${rrtype}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.Answer) return { type: rrtype, data: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = json.Answer.map((a: any) => a.data).filter((d: string) => !!d);
    return { type: rrtype, data };
  } catch {
    return null;
  }
};

export const fetchTXT = async (domain: string): Promise<string[]> => {
  const rec = await fetchDNS(domain, 'TXT');
  return rec?.data || [];
};

export const extractSPF = (txtRecords: string[]): string | undefined => {
  return txtRecords.find((r) => r.toLowerCase().startsWith('v=spf1'));
};

export const fetchDMARC = async (domain: string): Promise<string | undefined> => {
  const name = `_dmarc.${domain}`;
  const txt = await fetchTXT(name);
  return txt.find((t) => t.toLowerCase().includes('v=dmarc'));
};

export const checkDKIM = async (domain: string): Promise<string[]> => {
  const selectors = ['default', 'selector1', 'selector2'];
  const found: string[] = [];
  for (const sel of selectors) {
    const name = `${sel}._domainkey.${domain}`;
    const txt = await fetchTXT(name);
    if (txt.some((t) => t.includes('v=DKIM1'))) found.push(sel);
  }
  return found;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetchCertificates = async (domain: string): Promise<any[] | undefined> => {
  try {
    const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`);
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
};

export const attemptSecurityHeaders = async (
  domain: string
): Promise<{
  status: 'unavailable' | 'fetched';
  headers?: Record<string, string>;
  note?: string;
}> => {
  try {
    const res = await fetch(`https://${domain}`, { method: 'HEAD' });
    const headerNames = [
      'content-security-policy',
      'strict-transport-security',
      'x-frame-options',
      'x-content-type-options',
      'referrer-policy',
      'permissions-policy',
    ];
    const headers: Record<string, string> = {};
    for (const h of headerNames) {
      const v = res.headers.get(h);
      if (v) headers[h] = v;
    }
    if (Object.keys(headers).length === 0) {
      return {
        status: 'unavailable',
        note: 'Direct header inspection limited by CORS. Use https://securityheaders.com/?q=' + domain
      };
    }
    return { status: 'fetched', headers };
  } catch {
    return { status: 'unavailable', note: 'Unable to fetch headers (likely CORS). Use securityheaders.com.' };
  }
};

export const deriveIssues = (scan: Partial<DomainScanResult>): string[] => {
  const issues: string[] = [];
  if (scan.spf === undefined) issues.push('Missing SPF record');
  if (scan.dmarc === undefined) issues.push('Missing DMARC record');
  if ((scan.dkimSelectorsFound || []).length === 0) issues.push('No DKIM selectors detected (heuristic)');
  const h = scan.securityHeaders;
  if (h?.status === 'fetched') {
    const required = ['strict-transport-security', 'content-security-policy', 'x-frame-options'];
    for (const r of required) {
      if (!h.headers || !h.headers[r]) issues.push(`Header likely missing: ${r}`);
    }
  } else {
    issues.push('Security headers not validated client-side');
  }
  return issues;
};

export const runDomainAssessment = async (domain: string): Promise<DomainScanResult> => {
  const trimmed = domain.trim().toLowerCase();
  const dnsTypes = ['A', 'AAAA', 'MX', 'TXT', 'CNAME'];
  const dnsResults: DNSRecordResult[] = [];
  for (const t of dnsTypes) {
    const r = await fetchDNS(trimmed, t);
    if (r) dnsResults.push(r);
  }
  const txtRecords = dnsResults.find((d) => d.type === 'TXT')?.data || [];
  const spf = extractSPF(txtRecords);
  const dmarc = await fetchDMARC(trimmed);
  const dkimSelectorsFound = await checkDKIM(trimmed);
  const certificates = await fetchCertificates(trimmed);
  const securityHeaders = await attemptSecurityHeaders(trimmed);
  const partial: Partial<DomainScanResult> = {
    domain: trimmed,
    timestamp: new Date().toISOString(),
    dns: dnsResults,
    spf,
    dmarc,
    dkimSelectorsFound,
    certificates,
    securityHeaders
  };
  const issues = deriveIssues(partial);
  return { ...(partial as DomainScanResult), issues };
};
