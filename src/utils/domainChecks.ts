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

export const deriveIssues = (scan: Partial<DomainScanResult>): string[] => {
  const issues: string[] = [];
  if (scan.spf === undefined) issues.push('Missing SPF record');
  if (scan.dmarc === undefined) issues.push('Missing DMARC record');
  if ((scan.dkimSelectorsFound || []).length === 0) issues.push('No DKIM selectors detected (heuristic)');
  return issues;
};
