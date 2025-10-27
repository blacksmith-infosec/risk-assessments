import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkDKIM,
  extractSPF,
  fetchDMARC,
  fetchDNS,
  fetchTXT,
  fetchCertificates,
  deriveIssues,
  runDomainAssessment,
} from './domainChecks';

// Mock fetch globally
global.fetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkDNS', () => {
  it('should return DNS records when API returns valid data', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Answer: [
          { data: '192.0.2.1' },
          { data: '192.0.2.2' },
        ],
      }),
    });

    const result = await fetchDNS('example.com', 'A');
    expect(result).toEqual({
      type: 'A',
      data: ['192.0.2.1', '192.0.2.2'],
    });
  });

  it('should return empty data array when no Answer field', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const result = await fetchDNS('example.com', 'A');
    expect(result).toEqual({
      type: 'A',
      data: [],
    });
  });

  it('should return null when API request fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
    });

    const result = await fetchDNS('example.com', 'A');
    expect(result).toBeNull();
  });

  it('should return null on fetch exception', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchDNS('example.com', 'A');
    expect(result).toBeNull();
  });

  it('should filter out empty data values', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Answer: [
          { data: '192.0.2.1' },
          { data: '' },
          { data: '192.0.2.2' },
        ],
      }),
    });

    const result = await fetchDNS('example.com', 'A');
    expect(result?.data).toEqual(['192.0.2.1', '192.0.2.2']);
  });
});

describe('fetchTXT', () => {
  it('should return TXT records', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Answer: [
          { data: 'v=spf1 include:_spf.example.com ~all' },
          { data: 'other-txt-record' },
        ],
      }),
    });

    const result = await fetchTXT('example.com');
    expect(result).toEqual(['v=spf1 include:_spf.example.com ~all', 'other-txt-record']);
  });

  it('should return empty array when no TXT records', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const result = await fetchTXT('example.com');
    expect(result).toEqual([]);
  });
});

describe('extractSPF', () => {
  it('should extract SPF record starting with v=spf1', () => {
    const records = [
      'some-other-record',
      'v=spf1 include:_spf.example.com ~all',
      'another-record',
    ];
    const result = extractSPF(records);
    expect(result).toBe('v=spf1 include:_spf.example.com ~all');
  });

  it('should be case-insensitive', () => {
    const records = ['V=SPF1 include:_spf.example.com ~all'];
    const result = extractSPF(records);
    expect(result).toBe('V=SPF1 include:_spf.example.com ~all');
  });

  it('should return undefined when no SPF record', () => {
    const records = ['other-record', 'another-record'];
    const result = extractSPF(records);
    expect(result).toBeUndefined();
  });

  it('should return first SPF record if multiple exist', () => {
    const records = [
      'v=spf1 first-record',
      'v=spf1 second-record',
    ];
    const result = extractSPF(records);
    expect(result).toBe('v=spf1 first-record');
  });
});

describe('fetchDMARC', () => {
  it('should return DMARC record', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Answer: [
          { data: 'v=DMARC1; p=reject; rua=mailto:dmarc@example.com' },
        ],
      }),
    });

    const result = await fetchDMARC('example.com');
    expect(result).toBe('v=DMARC1; p=reject; rua=mailto:dmarc@example.com');
  });

  it('should query _dmarc subdomain', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await fetchDMARC('example.com');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('_dmarc.example.com')
    );
  });

  it('should return undefined when no DMARC record', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const result = await fetchDMARC('example.com');
    expect(result).toBeUndefined();
  });
});

describe('checkDKIM', () => {
  it('should return found DKIM selectors', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Answer: [{ data: 'v=DKIM1; k=rsa; p=MIGfMA0...' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Answer: [{ data: 'v=DKIM1; k=rsa; p=MIGfMA0...' }],
        }),
      });

    const result = await checkDKIM('example.com');
    expect(result).toEqual(['default', 'selector2']);
  });

  it('should return empty array when no DKIM selectors found', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

    const result = await checkDKIM('example.com');
    expect(result).toEqual([]);
  });

  it('should check all default selectors', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await checkDKIM('example.com');
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('default._domainkey.example.com'));
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('selector1._domainkey.example.com'));
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('selector2._domainkey.example.com'));
  });
});

describe('fetchCertificates', () => {
  it('should return certificate data from crt.sh', async () => {
    const mockCerts = [
      { id: 1, name: 'example.com' },
      { id: 2, name: '*.example.com' },
    ];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCerts,
    });

    const result = await fetchCertificates('example.com');
    expect(result).toEqual(mockCerts);
  });

  it('should return undefined on fetch failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
    });

    const result = await fetchCertificates('example.com');
    expect(result).toBeUndefined();
  });

  it('should return undefined on exception', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchCertificates('example.com');
    expect(result).toBeUndefined();
  });
});

describe('deriveIssues', () => {
  it('should detect missing SPF', () => {
    const scan = { spf: undefined, dmarc: 'v=DMARC1', dkimSelectorsFound: ['default'] };
    const issues = deriveIssues(scan);
    expect(issues).toContain('Missing SPF record');
  });

  it('should detect missing DMARC', () => {
    const scan = { spf: 'v=spf1', dmarc: undefined, dkimSelectorsFound: ['default'] };
    const issues = deriveIssues(scan);
    expect(issues).toContain('Missing DMARC record');
  });

  it('should detect missing DKIM selectors', () => {
    const scan = { spf: 'v=spf1', dmarc: 'v=DMARC1', dkimSelectorsFound: [] };
    const issues = deriveIssues(scan);
    expect(issues).toContain('No DKIM selectors detected (heuristic)');
  });

  it('should return empty array when all checks pass', () => {
    const scan = {
      spf: 'v=spf1',
      dmarc: 'v=DMARC1',
      dkimSelectorsFound: ['default'],
    };
    const issues = deriveIssues(scan);
    expect(issues).toHaveLength(0);
  });
});

describe('runDomainAssessment', () => {
  it('should run full domain assessment', async () => {
    // Mock all DNS calls
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ // A record
        ok: true,
        json: async () => ({ Answer: [{ data: '192.0.2.1' }] }),
      })
      .mockResolvedValueOnce({ // AAAA record
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({ // MX record
        ok: true,
        json: async () => ({ Answer: [{ data: 'mail.example.com' }] }),
      })
      .mockResolvedValueOnce({ // TXT record
        ok: true,
        json: async () => ({ Answer: [{ data: 'v=spf1 ~all' }] }),
      })
      .mockResolvedValueOnce({ // CNAME record
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({ // DMARC
        ok: true,
        json: async () => ({ Answer: [{ data: 'v=DMARC1; p=reject' }] }),
      })
      .mockResolvedValueOnce({ // DKIM default
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({ // DKIM selector1
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({ // DKIM selector2
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({ // Certificates
        ok: true,
        json: async () => [{ id: 1, name: 'example.com' }],
      })
      .mockRejectedValueOnce(new Error('CORS')); // Security headers

    const result = await runDomainAssessment('Example.COM  ');

    expect(result.domain).toBe('example.com');
    expect(result.timestamp).toBeDefined();
    expect(result.dns).toBeDefined();
    expect(result.spf).toBe('v=spf1 ~all');
    expect(result.dmarc).toBe('v=DMARC1; p=reject');
    expect(result.dkimSelectorsFound).toEqual([]);
    expect(result.certificates).toBeDefined();
    expect(result.issues).toBeDefined();
  });

  it('should trim and lowercase domain', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const result = await runDomainAssessment('  EXAMPLE.COM  ');
    expect(result.domain).toBe('example.com');
  });
});
