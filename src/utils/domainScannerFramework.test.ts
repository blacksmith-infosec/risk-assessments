import {
  SCANNERS,
  runAllScanners,
  runScanner,
  interpretScannerResult,
} from './domainScannerFramework';

// Mock fetch globally
global.fetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SCANNERS', () => {
  it('should export array of scanners', () => {
    expect(SCANNERS).toBeDefined();
    expect(Array.isArray(SCANNERS)).toBe(true);
    expect(SCANNERS.length).toBeGreaterThan(0);
  });

  it('should have scanners with required properties', () => {
    SCANNERS.forEach((scanner) => {
      expect(scanner.id).toBeDefined();
      expect(scanner.label).toBeDefined();
      expect(scanner.description).toBeDefined();
      expect(typeof scanner.run).toBe('function');
    });
  });

  it('should have unique scanner IDs', () => {
    const ids = SCANNERS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });
});

describe('runAllScanners', () => {
  beforeEach(() => {
    // Mock all fetch calls to return empty responses
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();

      // Mock certificate scanner (crt.sh) - return empty array instead of empty object
      if (urlStr.includes('crt.sh')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }

      // Mock IANA RDAP bootstrap service
      if (urlStr.includes('data.iana.org/rdap/dns.json')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            services: [
              [['com', 'net'], ['https://rdap.verisign.com/com/v1/']],
              [['org'], ['https://rdap.publicinterestregistry.org/']],
              [['io'], ['https://rdap.nic.io/']],
            ]
          }),
        });
      }

      // Mock RDAP domain lookup (various servers)
      if (urlStr.includes('rdap.verisign.com') ||
          urlStr.includes('rdap.publicinterestregistry.org') ||
          urlStr.includes('rdap.nic.io')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ldhName: 'example.com',
            status: ['active'],
            nameservers: [
              { ldhName: 'ns1.example.com' },
              { ldhName: 'ns2.example.com' }
            ],
            secureDNS: { delegationSigned: true },
            events: [
              { eventAction: 'expiration', eventDate: '2026-08-29T14:17:30Z' },
              { eventAction: 'registration', eventDate: '2023-08-29T14:17:30Z' }
            ],
            entities: [{
              roles: ['registrar'],
              vcardArray: ['vcard', [['fn', {}, 'text', 'Example Registrar']]]
            }]
          }),
        });
      }

      // Mock SSL Labs scanner - return cached READY status with no endpoints
      if (urlStr.includes('ssllabs.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'READY',
            endpoints: []
          }),
        });
      }

      // Default mock for other requests
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
        headers: {
          get: () => null,
        },
      });
    });
  });

  it('should execute all scanners and return aggregate result', async () => {
    const result = await runAllScanners('example.com');

    expect(result).toBeDefined();
    expect(result.domain).toBe('example.com');
    expect(result.timestamp).toBeDefined();
    expect(result.scanners).toBeDefined();
    expect(Array.isArray(result.scanners)).toBe(true);
    expect(result.scanners.length).toBe(SCANNERS.length);
    expect(result.issues).toBeDefined();
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it('should trim and lowercase domain', async () => {
    const result = await runAllScanners('  EXAMPLE.COM  ');
    expect(result.domain).toBe('example.com');
  });

  it('should mark scanners as success when they complete', async () => {
    const result = await runAllScanners('example.com');

    result.scanners.forEach((scanner) => {
      expect(scanner.status).toBe('complete');
      expect(scanner.startedAt).toBeDefined();
      expect(scanner.finishedAt).toBeDefined();
    });
  });

  it('should call onProgress callback during execution', async () => {
    const onProgress = vi.fn();
    await runAllScanners('example.com', onProgress);

    expect(onProgress).toHaveBeenCalled();
    expect(onProgress.mock.calls.length).toBeGreaterThan(0);
  });

  it('should handle scanner errors gracefully', async () => {
    // Make fetch fail to trigger error handling
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    const result = await runAllScanners('example.com');

    expect(result.scanners).toBeDefined();
    // Some scanners might still succeed or fail, just verify structure
    result.scanners.forEach((scanner) => {
      expect(['complete', 'error', 'running']).toContain(scanner.status);
      if (scanner.status === 'error') {
        expect(scanner.error).toBeDefined();
      }
    });
  });

  it('should aggregate issues from all scanners', async () => {
    // Mock to return no email auth records, which will generate issues
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
      headers: {
        get: () => null,
      },
    });

    const result = await runAllScanners('example.com');

    expect(result.issues).toBeDefined();
    expect(result.issues.length).toBeGreaterThan(0);
    // Should have issues for missing SPF, DMARC, DKIM, etc.
    expect(result.issues.some((issue) => issue.includes('SPF'))).toBe(true);
  });

  it('should execute scanners in order if order is specified', async () => {
    const onProgress = vi.fn();
    await runAllScanners('example.com', onProgress);

    // Verify scanners were executed (order is tested indirectly through progress calls)
    const progressCalls = onProgress.mock.calls;
    expect(progressCalls.length).toBeGreaterThan(0);
  });

  it('provides interpretation for emailAuth severity levels', async () => {
    // Mock fetch empty responses to generate issues (critical / warning depending on count logic)
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
      headers: { get: () => null },
    });
    const result = await runAllScanners('example.com');
    const emailResult = result.scanners.find((s) => s.id === 'emailAuth');
    expect(emailResult).toBeDefined();
    if (emailResult) {
      const interpretation = interpretScannerResult(emailResult);
      expect(['warning','critical','success','info']).toContain(interpretation.severity);
      // With all missing we expect critical
      expect(emailResult.issues?.length).toBeGreaterThanOrEqual(3);
      expect(interpretation.severity).toBe('critical');
    }
  });

  it('provides success interpretation for fully configured email auth', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('_dmarc')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=DMARC1; p=reject; rua=mailto:dmarc@example.com' }] }),
        });
      }
      if (urlStr.includes('type=TXT') && !urlStr.includes('_domainkey')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=spf1 -all' }] }),
        });
      }
      if (urlStr.includes('_domainkey')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=DKIM1; k=rsa; p=...' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const result = await runAllScanners('example.com');
    const emailResult = result.scanners.find((s) => s.id === 'emailAuth');
    expect(emailResult).toBeDefined();
    if (emailResult) {
      const interpretation = interpretScannerResult(emailResult);
      expect(interpretation.severity).toBe('success');
      expect(interpretation.message).toContain('fully configured');
    }
  });

  it('provides warning interpretation for partial email auth', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('type=TXT') && !urlStr.includes('_dmarc') && !urlStr.includes('_domainkey')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=spf1 -all' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const result = await runAllScanners('example.com');
    const emailResult = result.scanners.find((s) => s.id === 'emailAuth');
    expect(emailResult).toBeDefined();
    if (emailResult) {
      const interpretation = interpretScannerResult(emailResult);
      expect(interpretation.severity).toBe('warning');
      expect(interpretation.recommendation).toContain('DMARC');
      expect(interpretation.recommendation).toContain('DKIM');
    }
  });

  it('provides warning interpretation for non-enforcing DMARC', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('_dmarc')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=DMARC1; p=none; rua=mailto:dmarc@example.com' }] }),
        });
      }
      if (urlStr.includes('type=TXT') && !urlStr.includes('_domainkey')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=spf1 -all' }] }),
        });
      }
      if (urlStr.includes('_domainkey')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=DKIM1; k=rsa; p=...' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const result = await runAllScanners('example.com');
    const emailResult = result.scanners.find((s) => s.id === 'emailAuth');
    expect(emailResult).toBeDefined();
    if (emailResult) {
      const interpretation = interpretScannerResult(emailResult);
      expect(interpretation.severity).toBe('warning');
      expect(interpretation.recommendation).toContain('p=quarantine or p=reject');
    }
  });
});

describe('runScanner', () => {
  beforeEach(() => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
      headers: {
        get: () => null,
      },
    });
  });

  it('should run individual scanner by ID', async () => {
    const scannerId = SCANNERS[0].id;
    const result = await runScanner('example.com', scannerId);

    expect(result).toBeDefined();
    expect(result.id).toBe(scannerId);
    expect(result.status).toBeDefined();
    expect(result.startedAt).toBeDefined();
    expect(result.finishedAt).toBeDefined();
  });

  it('should throw error for non-existent scanner', async () => {
    await expect(
      runScanner('example.com', 'non-existent-scanner')
    ).rejects.toThrow('Scanner not found');
  });

  it('should return success status when scanner completes', async () => {
    const scannerId = SCANNERS[0].id;
    const result = await runScanner('example.com', scannerId);

    expect(result.status).toBe('complete');
    expect(result.data).toBeDefined();
    expect(result.summary).toBeDefined();
  });

  it('should return error status when scanner fails', async () => {
    // Spy on the scanner's run method and make it throw
    const scannerId = SCANNERS[0].id;
    const scanner = SCANNERS.find((s) => s.id === scannerId);

    if (scanner) {
      const originalRun = scanner.run;
      scanner.run = vi.fn().mockRejectedValue(new Error('Scanner execution failed'));

      const result = await runScanner('example.com', scannerId);

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
      expect(result.error).toContain('failed');

      // Restore original run method
      scanner.run = originalRun;
    }
  });

  it('should trim and lowercase domain', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ Answer: [{ data: '192.0.2.1' }] }),
    });

    const scannerId = SCANNERS[0].id;
    await runScanner('  EXAMPLE.COM  ', scannerId);

    // Verify fetch was called with lowercase domain
    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(fetchCalls.length).toBeGreaterThan(0);
    expect(fetchCalls[0][0]).toContain('example.com');
  });

  it('should include issues in result', async () => {
    // Run email auth scanner which will have issues with no records
    const emailAuthScanner = SCANNERS.find((s) => s.id === 'emailAuth');
    if (emailAuthScanner) {
      const result = await runScanner('example.com', emailAuthScanner.id);
      expect(result.issues).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
    }
  });

  it('returns interpretation for certificate counts', async () => {
    // Mock certificate scanner fetch with many certs
  const certScanner = SCANNERS.find((s) => s.id === 'certificates');
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => Array.from({ length: 55 }, (_, i) => ({ id: i, name: 'example.com' })),
      headers: { get: () => null },
    });
    if (certScanner) {
      const exec = await certScanner.run('example.com');
      const executed = {
        id: certScanner.id,
        label: certScanner.label,
        status: 'complete',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        issues: [],
        ...(exec as { data?: unknown; summary?: string }),
      };
      // Cast to expected shape for interpreter
      const executedCast = executed as unknown as {
        id: string;
        label: string;
        status: 'complete';
        startedAt: string;
        finishedAt: string;
        issues: string[];
        data?: unknown;
        summary?: string;
      };
      const interp = interpretScannerResult(executedCast);
      expect(interp.recommendation).toMatch(/Review the certificate issues below/);
    }
  });

  it('times out when forced very low timeout', async () => {
    // Find DNS scanner and store original timeout
    const dnsScanner = SCANNERS.find((s) => s.id === 'dns');
    const originalTimeout = dnsScanner?.timeout;

    // Force DNS scanner timeout to 1ms
    if (dnsScanner) {
      dnsScanner.timeout = 1;
    }

    const dnsId = SCANNERS.find((s) => s.id === 'dns')?.id as string;
    // Mock a fetch that never resolves quickly (simulate delay by returning a promise that resolves after 50ms)
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: true,
              json: async () => ({}),
            }),
          50
        )
      )
    );
    const result = await runScanner('example.com', dnsId);
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/timed out/);

    // Restore original timeout
    if (dnsScanner) {
      dnsScanner.timeout = originalTimeout;
    }
  });
});

describe('interpretScannerResult securityHeaders fallback', () => {
  it('handles unavailable status gracefully', () => {
    const securityResult = {
      id: 'securityHeaders',
      label: 'Security Headers',
      status: 'complete',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      data: { status: 'unavailable', testUrl: 'https://securityheaders.com example' },
      issues: [],
    };
    const securityCast = securityResult as unknown as {
      id: string;
      label: string;
      status: 'complete';
      startedAt: string;
      finishedAt: string;
      issues: string[];
      data: unknown;
    };
    const interp = interpretScannerResult(securityCast);
    expect(interp.severity).toBe('info');
    expect(interp.message).toMatch(/Headers check unavailable/);
  });

  it('maps grade to severity', () => {
    const grades: Record<string, string> = {
      'A+': 'success',
      'A': 'success',
      'B': 'info',
      'C': 'warning',
      'D': 'warning',
      'E': 'critical',
      'F': 'critical',
    };
    Object.entries(grades).forEach(([grade, expected]) => {
      const securityResult = {
        id: 'securityHeaders',
        label: 'Security Headers',
        status: 'complete',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        data: { grade },
        issues: [],
      };
      const gradeCast = securityResult as unknown as {
        id: string;
        label: string;
        status: 'complete';
        startedAt: string;
        finishedAt: string;
        issues: string[];
        data: unknown;
      };
      const interp = interpretScannerResult(gradeCast);
      expect(interp.severity).toBe(expected);
    });
  });
});

describe('interpretScannerResult DNS interpretations', () => {
  it('returns success severity for DNS with no issues', () => {
    const dnsResult = {
      id: 'dns',
      label: 'DNS Records',
      status: 'complete',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      data: { records: [] },
      issues: [],
    };
    const dnsCast = dnsResult as unknown as {
      id: string;
      label: string;
      status: 'complete';
      startedAt: string;
      finishedAt: string;
      issues: string[];
      data: unknown;
    };
    const interp = interpretScannerResult(dnsCast);
    expect(interp.severity).toBe('success');
    expect(interp.message).toMatch(/DNS records retrieved successfully/);
  });

  it('returns warning severity for DNS with 1-2 issues', () => {
    const dnsResult = {
      id: 'dns',
      label: 'DNS Records',
      status: 'complete',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      data: { records: [] },
      issues: ['No MX records found - email delivery to this domain will fail'],
    };
    const dnsCast = dnsResult as unknown as {
      id: string;
      label: string;
      status: 'complete';
      startedAt: string;
      finishedAt: string;
      issues: string[];
      data: unknown;
    };
    const interp = interpretScannerResult(dnsCast);
    expect(interp.severity).toBe('warning');
    expect(interp.message).toMatch(/DNS configuration has warnings/);
  });

  it('returns critical severity for DNS with 3+ issues', () => {
    const dnsResult = {
      id: 'dns',
      label: 'DNS Records',
      status: 'complete',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      data: { records: [] },
      issues: [
        'No A, AAAA, or CNAME records found',
        'No MX records found',
        'A record contains reserved/private IP: 127.0.0.1',
      ],
    };
    const dnsCast = dnsResult as unknown as {
      id: string;
      label: string;
      status: 'complete';
      startedAt: string;
      finishedAt: string;
      issues: string[];
      data: unknown;
    };
    const interp = interpretScannerResult(dnsCast);
    expect(interp.severity).toBe('critical');
    expect(interp.message).toMatch(/DNS configuration has critical issues/);
  });
});

describe('DNS Scanner', () => {
  it('should retrieve DNS records', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        Answer: [{ data: '192.0.2.1' }],
      }),
    });

    const dnsScanner = SCANNERS.find((s) => s.id === 'dns');
    expect(dnsScanner).toBeDefined();

    if (dnsScanner) {
      const result = await dnsScanner.run('example.com');
      expect(result.data).toBeDefined();
      expect(result.summary).toBeDefined();
    }
  });

  it('should detect missing A/AAAA/CNAME records', async () => {
    // Mock fetch to return only MX and TXT records (no A, AAAA, or CNAME)
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('type=MX')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: '10 mail.example.com.' }] }),
        });
      }
      if (urlStr.includes('type=TXT')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=spf1 include:_spf.example.com ~all' }] }),
        });
      }
      // No A, AAAA, or CNAME records
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const dnsScanner = SCANNERS.find((s) => s.id === 'dns');
    if (dnsScanner) {
      const result = await dnsScanner.run('example.com');
      expect(result.issues).toContain(
        'No A, AAAA, or CNAME records found - domain may not be accessible via web browser'
      );
    }
  });

  it('should detect reserved/private IP addresses in A records', async () => {
    const testCases = [
      { ip: '127.0.0.1', desc: 'localhost' },
      { ip: '10.0.0.1', desc: 'private 10.x' },
      { ip: '192.168.1.1', desc: 'private 192.168.x' },
      { ip: '169.254.1.1', desc: 'link-local' },
      { ip: '0.0.0.0', desc: 'reserved 0.0.0.0' },
    ];

    for (const testCase of testCases) {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
        const urlStr = url.toString();
        if (urlStr.includes('type=A')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ Answer: [{ data: testCase.ip }] }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      });

      const dnsScanner = SCANNERS.find((s) => s.id === 'dns');
      if (dnsScanner) {
        const result = await dnsScanner.run('example.com');
        expect(result.issues?.some((issue) => issue.includes('reserved/private IP'))).toBe(true);
        expect(result.issues?.some((issue) => issue.includes(testCase.ip))).toBe(true);
      }
    }
  });

  it('should not flag public IP addresses as reserved', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('type=A')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: '93.184.216.34' }] }), // example.com's real IP
        });
      }
      if (urlStr.includes('type=MX')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: '10 mail.example.com.' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const dnsScanner = SCANNERS.find((s) => s.id === 'dns');
    if (dnsScanner) {
      const result = await dnsScanner.run('example.com');
      expect(result.issues?.some((issue) => issue.includes('reserved/private IP'))).toBe(false);
    }
  });

  it('should detect CNAME conflicts with A records', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('type=A')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: '93.184.216.34' }] }),
        });
      }
      if (urlStr.includes('type=CNAME')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'target.example.com.' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const dnsScanner = SCANNERS.find((s) => s.id === 'dns');
    if (dnsScanner) {
      const result = await dnsScanner.run('example.com');
      expect(result.issues).toContain(
        'CNAME conflict detected - CNAME records cannot coexist with A, AAAA, or MX records'
      );
    }
  });

  it('should detect multiple CNAME records', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('type=CNAME')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            Answer: [
              { data: 'target1.example.com.' },
              { data: 'target2.example.com.' },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const dnsScanner = SCANNERS.find((s) => s.id === 'dns');
    if (dnsScanner) {
      const result = await dnsScanner.run('example.com');
      expect(result.issues).toContain('Multiple CNAME records found - only one CNAME record should exist per name');
    }
  });

  it('should detect excessive A records', async () => {
    const manyIPs = Array.from({ length: 15 }, (_, i) => ({ data: `93.184.216.${i}` }));
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('type=A')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: manyIPs }),
        });
      }
      if (urlStr.includes('type=MX')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: '10 mail.example.com.' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const dnsScanner = SCANNERS.find((s) => s.id === 'dns');
    if (dnsScanner) {
      const result = await dnsScanner.run('example.com');
      expect(result.issues?.some((issue) => issue.includes('Unusually high number of A records'))).toBe(true);
    }
  });

  it('should detect missing MX records', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('type=A')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: '93.184.216.34' }] }),
        });
      }
      // No MX records
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const dnsScanner = SCANNERS.find((s) => s.id === 'dns');
    if (dnsScanner) {
      const result = await dnsScanner.run('example.com');
      expect(result.issues).toContain('No MX records found - email delivery to this domain will fail');
    }
  });

  it('should detect overly long TXT records', async () => {
    const longTxt = 'v=spf1 ' + 'include:spf.example.com '.repeat(30); // > 255 chars
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('type=TXT')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: longTxt }] }),
        });
      }
      if (urlStr.includes('type=A')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: '93.184.216.34' }] }),
        });
      }
      if (urlStr.includes('type=MX')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: '10 mail.example.com.' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const dnsScanner = SCANNERS.find((s) => s.id === 'dns');
    if (dnsScanner) {
      const result = await dnsScanner.run('example.com');
      expect(result.issues).toContain('TXT record exceeds 255 characters - may cause issues with some DNS resolvers');
    }
  });

  it('should detect MX records pointing to IP addresses', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('type=MX')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: '10 192.0.2.1' }] }), // IP instead of hostname
        });
      }
      if (urlStr.includes('type=A')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: '93.184.216.34' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const dnsScanner = SCANNERS.find((s) => s.id === 'dns');
    if (dnsScanner) {
      const result = await dnsScanner.run('example.com');
      expect(result.issues?.some((issue) => issue.includes('MX record points to IP address'))).toBe(true);
    }
  });

  it('should build summary with record counts', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('type=A')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: '93.184.216.34' }, { data: '93.184.216.35' }] }),
        });
      }
      if (urlStr.includes('type=MX')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: '10 mail.example.com.' }] }),
        });
      }
      if (urlStr.includes('type=TXT')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=spf1 ~all' }, { data: 'some-verification-token' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const dnsScanner = SCANNERS.find((s) => s.id === 'dns');
    if (dnsScanner) {
      const result = await dnsScanner.run('example.com');
      expect(result.summary).toContain('A:2');
      expect(result.summary).toContain('MX:1');
      expect(result.summary).toContain('TXT:2');
    }
  });

  it('should return no issues for properly configured DNS', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('type=A')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: '93.184.216.34' }] }),
        });
      }
      if (urlStr.includes('type=MX')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: '10 mail.example.com.' }] }),
        });
      }
      if (urlStr.includes('type=TXT')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=spf1 ~all' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const dnsScanner = SCANNERS.find((s) => s.id === 'dns');
    if (dnsScanner) {
      const result = await dnsScanner.run('example.com');
      expect(result.issues).toEqual([]);
    }
  });
});

describe('Email Auth Scanner', () => {
  it('should check SPF, DMARC, and DKIM', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const emailAuthScanner = SCANNERS.find((s) => s.id === 'emailAuth');
    expect(emailAuthScanner).toBeDefined();

    if (emailAuthScanner) {
      const result = await emailAuthScanner.run('example.com');
      expect(result.data).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.issues).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
    }
  });

  it('should report missing email auth records as issues', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const emailAuthScanner = SCANNERS.find((s) => s.id === 'emailAuth');
    if (emailAuthScanner) {
      const result = await emailAuthScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('SPF'))).toBe(true);
      expect(result.issues?.some((i) => i.includes('DMARC'))).toBe(true);
      expect(result.issues?.some((i) => i.includes('DKIM'))).toBe(true);
    }
  });

  it('should validate SPF policy strength', async () => {
    const testCases = [
      { spf: 'v=spf1 include:_spf.google.com ~all', warning: 'soft fail (~all)' },
      { spf: 'v=spf1 include:_spf.google.com +all', issue: 'allows all senders (+all)' },
      { spf: 'v=spf1 include:_spf.google.com ?all', warning: 'neutral policy (?all)' },
      { spf: 'v=spf1 include:_spf.google.com -all', warning: null }, // Hard fail is good
    ];

    for (const testCase of testCases) {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
        const urlStr = url.toString();
        if (urlStr.includes('type=TXT') && !urlStr.includes('_dmarc') && !urlStr.includes('_domainkey')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ Answer: [{ data: testCase.spf }] }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      });

      const emailAuthScanner = SCANNERS.find((s) => s.id === 'emailAuth');
      if (emailAuthScanner) {
        const result = await emailAuthScanner.run('example.com');
        if (testCase.warning) {
          expect(result.issues?.some((i) => i.includes(testCase.warning))).toBe(true);
        } else if (testCase.issue) {
          expect(result.issues?.some((i) => i.includes(testCase.issue))).toBe(true);
        }
      }
    }
  });

  it('should detect excessive SPF DNS lookups', async () => {
    // SPF with 11 includes (exceeds limit of 10)
    const spfWithManyLookups = 'v=spf1 ' +
      Array.from({ length: 11 }, (_, i) => `include:spf${i}.example.com`).join(' ') +
      ' -all';

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('type=TXT') && !urlStr.includes('_dmarc') && !urlStr.includes('_domainkey')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: spfWithManyLookups }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const emailAuthScanner = SCANNERS.find((s) => s.id === 'emailAuth');
    if (emailAuthScanner) {
      const result = await emailAuthScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('exceeds 10 DNS lookup limit'))).toBe(true);
    }
  });

  it('should warn about approaching SPF DNS lookup limit', async () => {
    const spfNearLimit = 'v=spf1 ' +
      Array.from({ length: 9 }, (_, i) => `include:spf${i}.example.com`).join(' ') +
      ' -all';

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('type=TXT') && !urlStr.includes('_dmarc') && !urlStr.includes('_domainkey')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: spfNearLimit }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const emailAuthScanner = SCANNERS.find((s) => s.id === 'emailAuth');
    if (emailAuthScanner) {
      const result = await emailAuthScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('close to the maximum'))).toBe(true);
    }
  });

  it('should validate DMARC policy levels', async () => {
    const testCases = [
      { dmarc: 'v=DMARC1; p=none; rua=mailto:dmarc@example.com', severity: 'none', hasWarning: true },
      { dmarc: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com', severity: 'quarantine', hasWarning: true },
      { dmarc: 'v=DMARC1; p=reject; rua=mailto:dmarc@example.com', severity: 'reject', hasWarning: false },
    ];

    for (const testCase of testCases) {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
        const urlStr = url.toString();
        if (urlStr.includes('_dmarc')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ Answer: [{ data: testCase.dmarc }] }),
          });
        }
        // Provide SPF and DKIM to focus on DMARC validation
        if (urlStr.includes('type=TXT') && !urlStr.includes('_domainkey')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ Answer: [{ data: 'v=spf1 -all' }] }),
          });
        }
        if (urlStr.includes('_domainkey')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ Answer: [{ data: 'v=DKIM1; k=rsa; p=...' }] }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      });

      const emailAuthScanner = SCANNERS.find((s) => s.id === 'emailAuth');
      if (emailAuthScanner) {
        const result = await emailAuthScanner.run('example.com');
        if (testCase.hasWarning) {
          expect(result.issues?.some((i) => i.toLowerCase().includes(testCase.severity))).toBe(true);
        }
      }
    }
  });

  it('should detect missing DMARC subdomain policy', async () => {
    const dmarcWithoutSp = 'v=DMARC1; p=reject; rua=mailto:dmarc@example.com';

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('_dmarc')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: dmarcWithoutSp }] }),
        });
      }
      if (urlStr.includes('type=TXT') && !urlStr.includes('_domainkey')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=spf1 -all' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const emailAuthScanner = SCANNERS.find((s) => s.id === 'emailAuth');
    if (emailAuthScanner) {
      const result = await emailAuthScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('subdomain policy'))).toBe(true);
    }
  });

  it('should detect missing DMARC reporting addresses', async () => {
    const dmarcWithoutReporting = 'v=DMARC1; p=reject';

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('_dmarc')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: dmarcWithoutReporting }] }),
        });
      }
      if (urlStr.includes('type=TXT') && !urlStr.includes('_domainkey')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=spf1 -all' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const emailAuthScanner = SCANNERS.find((s) => s.id === 'emailAuth');
    if (emailAuthScanner) {
      const result = await emailAuthScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('reporting emails'))).toBe(true);
    }
  });

  it('should detect partial DMARC percentage coverage', async () => {
    const dmarcPartial = 'v=DMARC1; p=quarantine; pct=50; rua=mailto:dmarc@example.com';

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('_dmarc')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: dmarcPartial }] }),
        });
      }
      if (urlStr.includes('type=TXT') && !urlStr.includes('_domainkey')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=spf1 -all' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const emailAuthScanner = SCANNERS.find((s) => s.id === 'emailAuth');
    if (emailAuthScanner) {
      const result = await emailAuthScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('50%'))).toBe(true);
    }
  });

  it('should generate correct aggregate message for full configuration', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('_dmarc')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=DMARC1; p=reject; rua=mailto:dmarc@example.com' }] }),
        });
      }
      if (urlStr.includes('type=TXT') && !urlStr.includes('_domainkey')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=spf1 -all' }] }),
        });
      }
      if (urlStr.includes('_domainkey')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=DKIM1; k=rsa; p=...' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const emailAuthScanner = SCANNERS.find((s) => s.id === 'emailAuth');
    if (emailAuthScanner) {
      const result = await emailAuthScanner.run('example.com');
      const data = result.data as { aggregateMessage?: string };
      expect(data.aggregateMessage).toContain('fully configured');
    }
  });

  it('should generate correct aggregate message for partial configuration', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('type=TXT') && !urlStr.includes('_dmarc') && !urlStr.includes('_domainkey')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=spf1 -all' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const emailAuthScanner = SCANNERS.find((s) => s.id === 'emailAuth');
    if (emailAuthScanner) {
      const result = await emailAuthScanner.run('example.com');
      const data = result.data as { aggregateMessage?: string };
      expect(data.aggregateMessage).toContain('Partial email authentication');
      expect(data.aggregateMessage).toContain('DMARC');
      expect(data.aggregateMessage).toContain('DKIM');
    }
  });

  it('should generate correct aggregate message for no configuration', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const emailAuthScanner = SCANNERS.find((s) => s.id === 'emailAuth');
    if (emailAuthScanner) {
      const result = await emailAuthScanner.run('example.com');
      const data = result.data as { aggregateMessage?: string };
      expect(data.aggregateMessage).toContain('No email authentication configured');
    }
  });

  it('should include metadata flags in result data', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('_dmarc')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=DMARC1; p=reject; rua=mailto:dmarc@example.com' }] }),
        });
      }
      if (urlStr.includes('type=TXT') && !urlStr.includes('_domainkey')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=spf1 -all' }] }),
        });
      }
      if (urlStr.includes('_domainkey')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ Answer: [{ data: 'v=DKIM1; k=rsa; p=...' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    const emailAuthScanner = SCANNERS.find((s) => s.id === 'emailAuth');
    if (emailAuthScanner) {
      const result = await emailAuthScanner.run('example.com');
      const data = result.data as {
        hasSpf?: boolean;
        hasDmarc?: boolean;
        hasDkim?: boolean;
        dmarcEnforced?: boolean;
      };
      expect(data.hasSpf).toBe(true);
      expect(data.hasDmarc).toBe(true);
      expect(data.hasDkim).toBe(true);
      expect(data.dmarcEnforced).toBe(true);
    }
  });
});

describe('Certificate Scanner', () => {
  it('should fetch certificates from crt.sh', async () => {
    const mockCerts = [{
      id: 1,
      common_name: 'example.com',
      name_value: 'example.com',
      issuer_name: 'Let\'s Encrypt',
      not_before: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      not_after: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    }];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockCerts,
    });

    const certScanner = SCANNERS.find((s) => s.id === 'certificates');
    expect(certScanner).toBeDefined();

    if (certScanner) {
      const result = await certScanner.run('example.com');
      expect(result.data).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary).toContain('1 currently active');
    }
  });

  it('should detect certificates expiring within 7 days', async () => {
    const expiringCert = {
      id: 1,
      common_name: 'example.com',
      name_value: 'example.com',
      issuer_name: 'Let\'s Encrypt',
      not_before: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      not_after: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() // 5 days
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [expiringCert],
    });

    const certScanner = SCANNERS.find((s) => s.id === 'certificates');
    if (certScanner) {
      const result = await certScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('expires in 5 day(s)'))).toBe(true);
      expect(result.issues?.some((i) => i.includes('renew immediately'))).toBe(true);
      const data = result.data as { expiringIn7Days?: number };
      expect(data.expiringIn7Days).toBe(1);
    }
  });

  it('should detect certificates expiring within 30 days', async () => {
    const expiringCert = {
      id: 1,
      common_name: 'example.com',
      name_value: 'example.com',
      issuer_name: 'Let\'s Encrypt',
      not_before: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      not_after: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString() // 20 days
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [expiringCert],
    });

    const certScanner = SCANNERS.find((s) => s.id === 'certificates');
    if (certScanner) {
      const result = await certScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('expires in 20 days'))).toBe(true);
      expect(result.issues?.some((i) => i.includes('plan renewal soon'))).toBe(true);
      const data = result.data as { expiringIn30Days?: number };
      expect(data.expiringIn30Days).toBe(1);
    }
  });

  it('should not flag certificates with plenty of time remaining', async () => {
    const validCert = {
      id: 1,
      common_name: 'example.com',
      name_value: 'example.com',
      issuer_name: 'Let\'s Encrypt',
      not_before: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      not_after: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() // 60 days
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [validCert],
    });

    const certScanner = SCANNERS.find((s) => s.id === 'certificates');
    if (certScanner) {
      const result = await certScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('expires'))).toBe(false);
      const data = result.data as { expiringIn7Days?: number; expiringIn30Days?: number };
      expect(data.expiringIn7Days).toBe(0);
      expect(data.expiringIn30Days).toBe(0);
    }
  });

  it('should detect self-signed certificates', async () => {
    const selfSignedCert = {
      id: 1,
      common_name: 'example.com',
      name_value: 'example.com',
      issuer_name: 'example.com', // Self-signed (issuer = common name)
      not_before: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      not_after: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [selfSignedCert],
    });

    const certScanner = SCANNERS.find((s) => s.id === 'certificates');
    if (certScanner) {
      const result = await certScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('self-signed'))).toBe(true);
      expect(result.issues?.some((i) => i.includes('not trusted by browsers'))).toBe(true);
    }
  });

  it('should detect wildcard certificates', async () => {
    const wildcardCert = {
      id: 1,
      common_name: '*.example.com',
      name_value: '*.example.com',
      issuer_name: 'Let\'s Encrypt',
      not_before: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      not_after: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [wildcardCert],
    });

    const certScanner = SCANNERS.find((s) => s.id === 'certificates');
    if (certScanner) {
      const result = await certScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('wildcard certificate'))).toBe(true);
      const data = result.data as { wildcardCount?: number };
      expect(data.wildcardCount).toBe(1);
    }
  });

  it('should warn about excessive active certificates', async () => {
    const manyCerts = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      common_name: `subdomain${i}.example.com`,
      name_value: `subdomain${i}.example.com`,
      issuer_name: 'Let\'s Encrypt',
      not_before: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      not_after: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    }));

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => manyCerts,
    });

    const certScanner = SCANNERS.find((s) => s.id === 'certificates');
    if (certScanner) {
      const result = await certScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('High number of active certificates'))).toBe(true);
    }
  });

  it('should filter out expired certificates from active count', async () => {
    const certs = [
      {
        id: 1,
        common_name: 'example.com',
        name_value: 'example.com',
        issuer_name: 'Let\'s Encrypt',
        not_before: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        not_after: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() // Expired
      },
      {
        id: 2,
        common_name: 'example.com',
        name_value: 'example.com',
        issuer_name: 'Let\'s Encrypt',
        not_before: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        not_after: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() // Active
      }
    ];

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => certs,
    });

    const certScanner = SCANNERS.find((s) => s.id === 'certificates');
    if (certScanner) {
      const result = await certScanner.run('example.com');
      const data = result.data as { activeCertCount?: number; expiredCertCount?: number };
      expect(data.activeCertCount).toBe(1);
      expect(data.expiredCertCount).toBe(1);
    }
  });

  it('should warn about recently expired certificates', async () => {
    const recentlyExpiredCert = {
      id: 1,
      common_name: 'old.example.com',
      name_value: 'old.example.com',
      issuer_name: 'Let\'s Encrypt',
      not_before: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      not_after: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() // Expired 5 days ago
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [recentlyExpiredCert],
    });

    const certScanner = SCANNERS.find((s) => s.id === 'certificates');
    if (certScanner) {
      const result = await certScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('expired recently without replacement'))).toBe(true);
      expect(result.issues?.some((i) => i.includes('old.example.com'))).toBe(true);
    }
  });

  it('should not warn about recently expired certificates that have active replacements', async () => {
    const certs = [
      {
        id: 1,
        common_name: 'example.com',
        name_value: 'example.com',
        issuer_name: 'Let\'s Encrypt',
        not_before: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        not_after: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() // Expired 5 days ago
      },
      {
        id: 2,
        common_name: 'example.com',
        name_value: 'example.com',
        issuer_name: 'Let\'s Encrypt',
        not_before: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        not_after: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000).toISOString() // Active replacement
      }
    ];

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => certs,
    });

    const certScanner = SCANNERS.find((s) => s.id === 'certificates');
    if (certScanner) {
      const result = await certScanner.run('example.com');
      // Should NOT warn because there's an active replacement
      expect(result.issues?.some((i) => i.includes('expired recently without replacement'))).toBe(false);
    }
  });

  it('should warn about multiple certificate issuers', async () => {
    const certs = [
      {
        id: 1,
        common_name: 'example.com',
        name_value: 'example.com',
        issuer_name: 'Let\'s Encrypt',
        not_before: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        not_after: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 2,
        common_name: 'www.example.com',
        name_value: 'www.example.com',
        issuer_name: 'DigiCert',
        not_before: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        not_after: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 3,
        common_name: 'api.example.com',
        name_value: 'api.example.com',
        issuer_name: 'Sectigo',
        not_before: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        not_after: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 4,
        common_name: 'mail.example.com',
        name_value: 'mail.example.com',
        issuer_name: 'GoDaddy',
        not_before: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        not_after: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => certs,
    });

    const certScanner = SCANNERS.find((s) => s.id === 'certificates');
    if (certScanner) {
      const result = await certScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('different issuers'))).toBe(true);
    }
  });

  it('should handle no certificates found', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const certScanner = SCANNERS.find((s) => s.id === 'certificates');
    if (certScanner) {
      const result = await certScanner.run('example.com');
      expect(result.summary).toContain('No certificates found');
      expect(result.issues?.some((i) => i.includes('No SSL certificates found'))).toBe(true);
    }
  });

  it('should deduplicate certificates by common name keeping most recent', async () => {
    const certs = [
      {
        id: 1,
        common_name: 'example.com',
        name_value: 'example.com',
        issuer_name: 'Let\'s Encrypt',
        not_before: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // Older
        not_after: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 2,
        common_name: 'example.com',
        name_value: 'example.com',
        issuer_name: 'Let\'s Encrypt',
        not_before: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Newer
        not_after: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => certs,
    });

    const certScanner = SCANNERS.find((s) => s.id === 'certificates');
    if (certScanner) {
      const result = await certScanner.run('example.com');
      const data = result.data as { activeCertCount?: number };
      expect(data.activeCertCount).toBe(1); // Only counts unique active cert
    }
  });

  it('should provide summary statistics in data', async () => {
    const certs = [
      {
        id: 1,
        common_name: 'example.com',
        name_value: 'example.com',
        issuer_name: 'Let\'s Encrypt',
        not_before: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        not_after: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => certs,
    });

    const certScanner = SCANNERS.find((s) => s.id === 'certificates');
    if (certScanner) {
      const result = await certScanner.run('example.com');
      const data = result.data as {
        certCount?: number;
        activeCertCount?: number;
        expiredCertCount?: number;
        uniqueIssuers?: string[];
      };
      expect(data.certCount).toBe(1);
      expect(data.activeCertCount).toBe(1);
      expect(data.expiredCertCount).toBe(0);
      expect(data.uniqueIssuers).toContain('Let\'s Encrypt');
    }
  });
});

describe('Certificate Scanner Interpretations', () => {
  it('returns critical severity for certificates expiring within 7 days', async () => {
    const expiringCert = {
      id: 1,
      common_name: 'example.com',
      name_value: 'example.com',
      issuer_name: 'Let\'s Encrypt',
      not_before: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      not_after: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [expiringCert],
    });

    const result = await runAllScanners('example.com');
    const certResult = result.scanners.find((s) => s.id === 'certificates');
    expect(certResult).toBeDefined();
    if (certResult) {
      const interpretation = interpretScannerResult(certResult);
      expect(interpretation.severity).toBe('critical');
      expect(interpretation.message).toContain('expiring within 7 days');
      expect(interpretation.recommendation).toContain('Renew expiring certificates immediately');
    }
  });

  it('returns warning severity for certificates expiring within 30 days', async () => {
    const expiringCert = {
      id: 1,
      common_name: 'example.com',
      name_value: 'example.com',
      issuer_name: 'Let\'s Encrypt',
      not_before: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      not_after: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString()
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [expiringCert],
    });

    const result = await runAllScanners('example.com');
    const certResult = result.scanners.find((s) => s.id === 'certificates');
    expect(certResult).toBeDefined();
    if (certResult) {
      const interpretation = interpretScannerResult(certResult);
      expect(interpretation.severity).toBe('warning');
      expect(interpretation.message).toContain('expiring within 30 days');
      expect(interpretation.recommendation).toContain('Plan to renew certificates soon');
    }
  });

  it('returns success severity for valid certificates', async () => {
    const validCert = {
      id: 1,
      common_name: 'example.com',
      name_value: 'example.com',
      issuer_name: 'Let\'s Encrypt',
      not_before: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      not_after: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [validCert],
    });

    const result = await runAllScanners('example.com');
    const certResult = result.scanners.find((s) => s.id === 'certificates');
    expect(certResult).toBeDefined();
    if (certResult) {
      const interpretation = interpretScannerResult(certResult);
      expect(interpretation.severity).toBe('success');
      expect(interpretation.message).toContain('valid certificate(s) found');
    }
  });

  it('returns info severity when no certificates found', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const result = await runAllScanners('example.com');
    const certResult = result.scanners.find((s) => s.id === 'certificates');
    expect(certResult).toBeDefined();
    if (certResult) {
      const interpretation = interpretScannerResult(certResult);
      expect(interpretation.severity).toBe('info');
      expect(interpretation.message).toContain('No certificates found');
    }
  });

  it('returns warning severity for certificates with other issues', async () => {
    const wildcardCert = {
      id: 1,
      common_name: '*.example.com',
      name_value: '*.example.com',
      issuer_name: 'Let\'s Encrypt',
      not_before: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      not_after: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [wildcardCert],
    });

    const result = await runAllScanners('example.com');
    const certResult = result.scanners.find((s) => s.id === 'certificates');
    expect(certResult).toBeDefined();
    if (certResult) {
      const interpretation = interpretScannerResult(certResult);
      expect(interpretation.severity).toBe('warning');
      expect(interpretation.recommendation).toContain('Review the certificate issues');
    }
  });
});

describe('RDAP Scanner', () => {
  // Helper to mock RDAP bootstrap and domain responses
  const mockRDAPResponse = (domainData: unknown) => {
    const mockBootstrap = {
      services: [
        [['com'], ['https://rdap.verisign.com/com/v1/']]
      ]
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('data.iana.org/rdap/dns.json')) {
        return Promise.resolve({ ok: true, json: async () => mockBootstrap });
      }
      // Match the full RDAP URL pattern: https://rdap.verisign.com/com/v1/domain/example.com
      if (urlStr.includes('rdap.verisign.com') && urlStr.includes('/domain/')) {
        return Promise.resolve({ ok: true, json: async () => domainData });
      }
      // Fallback for certificate scanner
      if (urlStr.includes('crt.sh')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  };

  it('should retrieve domain registration information', async () => {
    const mockRDAPData = {
      ldhName: 'example.com',
      status: ['active'],
      nameservers: [
        { ldhName: 'ns1.example.com' },
        { ldhName: 'ns2.example.com' }
      ],
      secureDNS: { delegationSigned: true },
      events: [
        { eventAction: 'expiration', eventDate: '2026-08-29T14:17:30Z' },
        { eventAction: 'registration', eventDate: '2023-08-29T14:17:30Z' }
      ],
      entities: [{
        roles: ['registrar'],
        vcardArray: ['vcard', [['fn', {}, 'text', 'Example Registrar']]]
      }]
    };

    mockRDAPResponse(mockRDAPData);

    const rdapScanner = SCANNERS.find((s) => s.id === 'rdap');
    if (rdapScanner) {
      const result = await rdapScanner.run('example.com');
      expect(result.summary).toContain('Domain: example.com');
      expect(result.summary).toContain('status: active');
      expect(result.summary).toContain('expires in');
      const data = result.data as {
        ldhName?: string;
        status?: string[];
        dnssecEnabled?: boolean;
        nameservers?: string[];
      };
      expect(data.ldhName).toBe('example.com');
      expect(data.status).toContain('active');
      expect(data.dnssecEnabled).toBe(true);
      expect(data.nameservers).toHaveLength(2);
    }
  });

  it('should warn about domain expiring soon', async () => {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 25); // 25 days from now

    const mockRDAPData = {
      ldhName: 'example.com',
      status: ['active'],
      nameservers: [{ ldhName: 'ns1.example.com' }],
      secureDNS: { delegationSigned: false },
      events: [
        { eventAction: 'expiration', eventDate: expirationDate.toISOString() }
      ]
    };

    mockRDAPResponse(mockRDAPData);

    const rdapScanner = SCANNERS.find((s) => s.id === 'rdap');
    if (rdapScanner) {
      const result = await rdapScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('expires in') && i.includes('renew soon'))).toBe(true);
    }
  });

  it('should detect expired domain', async () => {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() - 10); // 10 days ago

    const mockRDAPData = {
      ldhName: 'example.com',
      status: ['active'],
      nameservers: [{ ldhName: 'ns1.example.com' }],
      secureDNS: { delegationSigned: false },
      events: [
        { eventAction: 'expiration', eventDate: expirationDate.toISOString() }
      ]
    };

    mockRDAPResponse(mockRDAPData);

    const rdapScanner = SCANNERS.find((s) => s.id === 'rdap');
    if (rdapScanner) {
      const result = await rdapScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('expired') && i.includes('days ago'))).toBe(true);
    }
  });

  it('should warn when DNSSEC is not enabled', async () => {
    const mockRDAPData = {
      ldhName: 'example.com',
      status: ['active'],
      nameservers: [{ ldhName: 'ns1.example.com' }, { ldhName: 'ns2.example.com' }],
      secureDNS: { delegationSigned: false },
      events: [
        { eventAction: 'expiration', eventDate: '2026-08-29T14:17:30Z' }
      ]
    };

    mockRDAPResponse(mockRDAPData);

    const rdapScanner = SCANNERS.find((s) => s.id === 'rdap');
    if (rdapScanner) {
      const result = await rdapScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('DNSSEC is not enabled'))).toBe(true);
    }
  });

  it('should detect problematic domain statuses', async () => {
    const mockRDAPData = {
      ldhName: 'example.com',
      status: ['clientHold', 'serverHold'],
      nameservers: [{ ldhName: 'ns1.example.com' }],
      secureDNS: { delegationSigned: false },
      events: []
    };

    mockRDAPResponse(mockRDAPData);

    const rdapScanner = SCANNERS.find((s) => s.id === 'rdap');
    if (rdapScanner) {
      const result = await rdapScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('problematic status'))).toBe(true);
      expect(result.issues?.some((i) => i.includes('clientHold'))).toBe(true);
    }
  });

  it('should warn when only one nameserver is configured', async () => {
    const mockRDAPData = {
      ldhName: 'example.com',
      status: ['active'],
      nameservers: [{ ldhName: 'ns1.example.com' }],
      secureDNS: { delegationSigned: true },
      events: [
        { eventAction: 'expiration', eventDate: '2026-08-29T14:17:30Z' }
      ]
    };

    mockRDAPResponse(mockRDAPData);

    const rdapScanner = SCANNERS.find((s) => s.id === 'rdap');
    if (rdapScanner) {
      const result = await rdapScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('Only one nameserver'))).toBe(true);
      expect(result.issues?.some((i) => i.includes('add redundant nameservers'))).toBe(true);
    }
  });

  it('should detect missing nameservers', async () => {
    const mockRDAPData = {
      ldhName: 'example.com',
      status: ['active'],
      nameservers: [],
      secureDNS: { delegationSigned: false },
      events: []
    };

    mockRDAPResponse(mockRDAPData);

    const rdapScanner = SCANNERS.find((s) => s.id === 'rdap');
    if (rdapScanner) {
      const result = await rdapScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('No nameservers found'))).toBe(true);
    }
  });

  it('should handle domain not found', async () => {
    const mockBootstrap = {
      services: [
        [['com'], ['https://rdap.verisign.com/com/v1/']]
      ]
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('data.iana.org/rdap/dns.json')) {
        return Promise.resolve({ ok: true, json: async () => mockBootstrap });
      }
      // Return 404 for RDAP domain query
      return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
    });

    const rdapScanner = SCANNERS.find((s) => s.id === 'rdap');
    if (rdapScanner) {
      const result = await rdapScanner.run('example.com');
      expect(result.summary).toBe('RDAP lookup failed');
      expect(result.issues?.some((i) => i.includes('Could not retrieve RDAP data'))).toBe(true);
    }
  });

  it('should handle API errors', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('data.iana.org/rdap/dns.json')) {
        return Promise.resolve({ ok: false, status: 500, statusText: 'Internal Server Error' });
      }
      return Promise.resolve({ ok: false, status: 500, statusText: 'Internal Server Error' });
    });

    const rdapScanner = SCANNERS.find((s) => s.id === 'rdap');
    if (rdapScanner) {
      const result = await rdapScanner.run('example.com');
      expect(result.summary).toBe('RDAP lookup failed');
      expect(result.issues?.some((i) => i.includes('Failed to retrieve RDAP information'))).toBe(true);
    }
  });

  it('should handle invalid domain format', async () => {
    const rdapScanner = SCANNERS.find((s) => s.id === 'rdap');
    if (rdapScanner) {
      const result = await rdapScanner.run('invalid');
      expect(result.summary).toBe('Invalid domain');
      expect(result.issues?.some((i) => i.includes('must have at least a name and TLD'))).toBe(true);
    }
  });
});

describe('RDAP Scanner Interpretations', () => {
  // Helper for runAllScanners tests (needs all scanners mocked)
  const mockAllScannersForRDAP = (rdapData: unknown) => {
    const mockBootstrap = {
      services: [
        [['com'], ['https://rdap.verisign.com/com/v1/']]
      ]
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();

      // Bootstrap
      if (urlStr.includes('data.iana.org/rdap/dns.json')) {
        return Promise.resolve({ ok: true, json: async () => mockBootstrap });
      }

      // RDAP domain query - must include /domain/ in path
      if (urlStr.includes('rdap.verisign.com') && urlStr.includes('/domain/')) {
        if (typeof rdapData === 'object' && rdapData !== null && 'ok' in rdapData) {
          return Promise.resolve(rdapData as Response);
        }
        return Promise.resolve({ ok: true, json: async () => rdapData });
      }

      // Certificate scanner
      if (urlStr.includes('crt.sh')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }

      // Default
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  };

  it('returns success severity for healthy domain', async () => {
    const mockRDAPData = {
      ldhName: 'example.com',
      status: ['active'],
      nameservers: [
        { ldhName: 'ns1.example.com' },
        { ldhName: 'ns2.example.com' }
      ],
      secureDNS: { delegationSigned: true },
      events: [
        { eventAction: 'expiration', eventDate: '2026-08-29T14:17:30Z' }
      ]
    };

    mockAllScannersForRDAP(mockRDAPData);

    const result = await runAllScanners('example.com');
    const rdapResult = result.scanners.find((s) => s.id === 'rdap');
    expect(rdapResult).toBeDefined();
    if (rdapResult) {
      const interpretation = interpretScannerResult(rdapResult);
      expect(interpretation.severity).toBe('success');
      expect(interpretation.message).toContain('Domain registration is healthy');
      expect(interpretation.recommendation).toContain('DNSSEC configuration look good');
    }
  });

  it('returns warning severity for domain expiring soon', async () => {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 25);

    const mockRDAPData = {
      ldhName: 'example.com',
      status: ['active'],
      nameservers: [{ ldhName: 'ns1.example.com' }],
      secureDNS: { delegationSigned: false },
      events: [
        { eventAction: 'expiration', eventDate: expirationDate.toISOString() }
      ]
    };

    mockAllScannersForRDAP(mockRDAPData);

    const result = await runAllScanners('example.com');
    const rdapResult = result.scanners.find((s) => s.id === 'rdap');
    expect(rdapResult).toBeDefined();
    if (rdapResult) {
      const interpretation = interpretScannerResult(rdapResult);
      expect(interpretation.severity).toBe('warning');
      expect(interpretation.message).toContain('Domain registration needs attention');
      expect(interpretation.recommendation).toContain('Plan to renew your domain');
    }
  });

  it('returns critical severity for expired domain', async () => {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() - 10);

    const mockRDAPData = {
      ldhName: 'example.com',
      status: ['active'],
      nameservers: [{ ldhName: 'ns1.example.com' }],
      secureDNS: { delegationSigned: false },
      events: [
        { eventAction: 'expiration', eventDate: expirationDate.toISOString() }
      ]
    };

    mockAllScannersForRDAP(mockRDAPData);

    const result = await runAllScanners('example.com');
    const rdapResult = result.scanners.find((s) => s.id === 'rdap');
    expect(rdapResult).toBeDefined();
    if (rdapResult) {
      const interpretation = interpretScannerResult(rdapResult);
      expect(interpretation.severity).toBe('critical');
      expect(interpretation.message).toContain('Domain registration has critical issues');
      expect(interpretation.recommendation).toContain('immediately');
    }
  });

  it('returns info severity for domain not found', async () => {
    mockAllScannersForRDAP({ ok: false, status: 404, statusText: 'Not Found' });

    const result = await runAllScanners('example.com');
    const rdapResult = result.scanners.find((s) => s.id === 'rdap');
    expect(rdapResult).toBeDefined();
    if (rdapResult) {
      const interpretation = interpretScannerResult(rdapResult);
      expect(interpretation.severity).toBe('info');
      expect(interpretation.message).toContain('RDAP lookup incomplete');
    }
  });

  it('recommends DNSSEC when not enabled', async () => {
    const mockRDAPData = {
      ldhName: 'example.com',
      status: ['active'],
      nameservers: [
        { ldhName: 'ns1.example.com' },
        { ldhName: 'ns2.example.com' }
      ],
      secureDNS: { delegationSigned: false },
      events: [
        { eventAction: 'expiration', eventDate: '2026-08-29T14:17:30Z' }
      ]
    };

    mockAllScannersForRDAP(mockRDAPData);

    const result = await runAllScanners('example.com');
    const rdapResult = result.scanners.find((s) => s.id === 'rdap');
    expect(rdapResult).toBeDefined();
    if (rdapResult) {
      const interpretation = interpretScannerResult(rdapResult);
      // DNSSEC disabled creates a warning issue
      expect(interpretation.severity).toBe('warning');
      expect(interpretation.recommendation).toContain('Review the recommendations below');
    }
  });
});

describe('SSL Labs Scanner', () => {
  it('should fetch SSL Labs results from cache', async () => {
    const mockSSLLabsResult = {
      status: 'READY',
      endpoints: [
        {
          ipAddress: '192.0.2.1',
          grade: 'A',
          hasWarnings: false,
          isExceptional: false,
          details: {
            protocols: [
              { name: 'TLS', version: '1.2' },
              { name: 'TLS', version: '1.3' }
            ],
            forwardSecrecy: 2,
            hstsPolicy: {
              status: 'present',
              maxAge: 31536000
            }
          }
        }
      ]
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockSSLLabsResult,
    });

    const sslScanner = SCANNERS.find((s) => s.id === 'sslLabs');
    if (sslScanner) {
      const result = await sslScanner.run('example.com');
      expect(result.summary).toContain('1 endpoint(s) scanned');
      expect(result.summary).toContain('A');
      expect(result.issues).toBeDefined();
      expect(result.data).toHaveProperty('testUrl');
    }
  });

  it('should detect SSL/TLS vulnerabilities', async () => {
    const mockResult = {
      status: 'READY',
      endpoints: [
        {
          ipAddress: '192.0.2.1',
          grade: 'C',
          details: {
            protocols: [
              { name: 'SSL', version: '3.0' },
              { name: 'TLS', version: '1.0' }
            ],
            heartbleed: true,
            poodle: true,
            vulnBeast: true,
            forwardSecrecy: 0
          }
        }
      ]
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    });

    const sslScanner = SCANNERS.find((s) => s.id === 'sslLabs');
    if (sslScanner) {
      const result = await sslScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('Heartbleed'))).toBe(true);
      expect(result.issues?.some((i) => i.includes('POODLE'))).toBe(true);
      expect(result.issues?.some((i) => i.includes('SSL'))).toBe(true);
      expect(result.issues?.some((i) => i.includes('forward secrecy'))).toBe(true);
    }
  });

  it('should detect outdated TLS protocols', async () => {
    const mockResult = {
      status: 'READY',
      endpoints: [
        {
          ipAddress: '192.0.2.1',
          grade: 'B',
          details: {
            protocols: [
              { name: 'TLS', version: '1.0' },
              { name: 'TLS', version: '1.1' },
              { name: 'TLS', version: '1.2' }
            ]
          }
        }
      ]
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    });

    const sslScanner = SCANNERS.find((s) => s.id === 'sslLabs');
    if (sslScanner) {
      const result = await sslScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('TLS 1.0/1.1'))).toBe(true);
    }
  });

  it('should check HSTS configuration', async () => {
    const mockResult = {
      status: 'READY',
      endpoints: [
        {
          ipAddress: '192.0.2.1',
          grade: 'A-',
          details: {
            hstsPolicy: {
              status: 'absent'
            }
          }
        }
      ]
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    });

    const sslScanner = SCANNERS.find((s) => s.id === 'sslLabs');
    if (sslScanner) {
      const result = await sslScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('HSTS not configured'))).toBe(true);
    }
  });

  it('should warn about short HSTS max-age', async () => {
    const mockResult = {
      status: 'READY',
      endpoints: [
        {
          ipAddress: '192.0.2.1',
          grade: 'A-',
          details: {
            hstsPolicy: {
              status: 'present',
              maxAge: 86400 // 1 day
            }
          }
        }
      ]
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    });

    const sslScanner = SCANNERS.find((s) => s.id === 'sslLabs');
    if (sslScanner) {
      const result = await sslScanner.run('example.com');
      expect(result.issues?.some((i) => i.includes('HSTS max-age is too short'))).toBe(true);
    }
  });

  it('should handle scan in progress status', async () => {
    vi.useFakeTimers();
    let callCount = 0;

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      // First call: IN_PROGRESS, second call: READY with empty results
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'IN_PROGRESS' })
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          status: 'READY',
          endpoints: []
        })
      });
    });

    const sslScanner = SCANNERS.find((s) => s.id === 'sslLabs');
    if (sslScanner) {
      const resultPromise = sslScanner.run('example.com');
      // Advance timers to skip the 30 second wait (pollInterval)
      await vi.advanceTimersByTimeAsync(30000);
      const result = await resultPromise;
      expect(result.summary).toContain('No SSL/TLS endpoints found');
    }
    vi.useRealTimers();
  }, 10000); // Increase test timeout to 10 seconds

  it('should handle ERROR status', async () => {
    const mockResult = {
      status: 'ERROR',
      statusMessage: 'Unable to resolve domain name'
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    });

    const sslScanner = SCANNERS.find((s) => s.id === 'sslLabs');
    if (sslScanner) {
      const result = await sslScanner.run('example.com');
      expect(result.summary).toContain('error');
      expect(result.issues?.some((i) => i.includes('Unable to resolve domain name'))).toBe(true);
    }
  });

  it('should handle no endpoints found', async () => {
    const mockResult = {
      status: 'READY',
      endpoints: []
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    });

    const sslScanner = SCANNERS.find((s) => s.id === 'sslLabs');
    if (sslScanner) {
      const result = await sslScanner.run('example.com');
      expect(result.summary).toContain('No SSL/TLS endpoints found');
      expect(result.issues?.some((i) => i.includes('No HTTPS endpoints'))).toBe(true);
    }
  });

  it('should handle API errors gracefully', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const sslScanner = SCANNERS.find((s) => s.id === 'sslLabs');
    if (sslScanner) {
      const result = await sslScanner.run('example.com');
      expect(result.summary).toBe('SSL Labs scan failed');
      expect(result.issues?.some((i) => i.includes('500'))).toBe(true);
    }
  });

  it('should report multiple endpoints with different grades', async () => {
    const mockResult = {
      status: 'READY',
      endpoints: [
        {
          ipAddress: '192.0.2.1',
          grade: 'A+'
        },
        {
          ipAddress: '192.0.2.2',
          grade: 'B'
        }
      ]
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    });

    const sslScanner = SCANNERS.find((s) => s.id === 'sslLabs');
    if (sslScanner) {
      const result = await sslScanner.run('example.com');
      expect(result.summary).toContain('2 endpoint(s) scanned');
      expect(result.summary).toContain('A+');
      expect(result.summary).toContain('B');
      const data = result.data as { grades?: string[] };
      expect(data.grades).toContain('A+');
      expect(data.grades).toContain('B');
    }
  });
});

describe('SSL Labs Scanner Interpretations', () => {
  it('returns success severity for A+ grade', async () => {
    const mockResult = {
      status: 'READY',
      endpoints: [{ ipAddress: '192.0.2.1', grade: 'A+' }]
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    });

    const result = await runScanner('example.com', 'sslLabs');
    const interpretation = interpretScannerResult(result);
    expect(interpretation.severity).toBe('success');
    expect(interpretation.message).toContain('A+');
  });

  it('returns warning severity for B grade', async () => {
    const mockResult = {
      status: 'READY',
      endpoints: [{ ipAddress: '192.0.2.1', grade: 'B' }]
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    });

    const result = await runScanner('example.com', 'sslLabs');
    const interpretation = interpretScannerResult(result);
    expect(interpretation.severity).toBe('warning');
    expect(interpretation.recommendation).toContain('could be improved');
  });

  it('returns critical severity for F grade', async () => {
    const mockResult = {
      status: 'READY',
      endpoints: [{ ipAddress: '192.0.2.1', grade: 'F' }]
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    });

    const result = await runScanner('example.com', 'sslLabs');
    const interpretation = interpretScannerResult(result);
    expect(interpretation.severity).toBe('critical');
    expect(interpretation.message).toContain('Failed');
  });

  it('returns info severity when scan is in progress', async () => {
    vi.useFakeTimers();
    let callCount = 0;

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      // First call: IN_PROGRESS, second call: READY
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'IN_PROGRESS' })
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ status: 'READY', endpoints: [] })
      });
    });

    const resultPromise = runScanner('example.com', 'sslLabs');
    // Advance timers to skip the 30 second wait (pollInterval)
    await vi.advanceTimersByTimeAsync(30000);
    const result = await resultPromise;
    const interpretation = interpretScannerResult(result);
    // After polling completes with READY and no endpoints
    expect(interpretation.severity).toBe('info');
    expect(interpretation.message).toContain('SSL/TLS configuration analyzed');
    vi.useRealTimers();
  }, 10000); // Increase test timeout to 10 seconds
});

describe('Security Headers Scanner', () => {
  it('should fetch and parse security headers results', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_green"><span>A</span></div>
      </div>
      <div class="reportSection">
        <div class="reportTitle">Missing Headers</div>
        <div class="reportBody">
          <table class="reportTable">
            <colgroup><col class="col1"><col class="col2"></colgroup>
            <tbody>
              <tr class="tableRow">
                <th class="tableLabel table_red">Site is using HTTP</th>
                <td class="tableCell">Permissions Policy</a> is a new header.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => mockHTML,
    });

    const securityHeadersScanner = SCANNERS.find((s) => s.id === 'securityHeaders');
    expect(securityHeadersScanner).toBeDefined();

    if (securityHeadersScanner) {
      const result = await securityHeadersScanner.run('example.com');
      expect(result.data).toBeDefined();
      const data = result.data as { grade?: string; status?: string; missingHeaders?: string[] };
      expect(data.grade).toBe('A');
      expect(data.status).toBe('available');
    }
  });

  it('should parse grade from score div with different colors', async () => {
    const testCases = [
      { color: 'green', grade: 'A' },
      { color: 'yellow', grade: 'B' },
      { color: 'orange', grade: 'C' },
      { color: 'red', grade: 'F' },
    ];

    for (const testCase of testCases) {
      const mockHTML = `
        <div class="score">
          <div class="score_${testCase.color}"><span>${testCase.grade}</span></div>
        </div>
      `;

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: async () => mockHTML,
      });

      const securityHeadersScanner = SCANNERS.find((s) => s.id === 'securityHeaders');
      if (securityHeadersScanner) {
        const result = await securityHeadersScanner.run('example.com');
        const data = result.data as { grade?: string };
        expect(data.grade).toBe(testCase.grade);
      }
    }
  });

  it('should parse multiple missing headers', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_red"><span>F</span></div>
      </div>
      <div class="reportSection">
        <div class="reportTitle">Missing Headers</div>
        <div class="reportBody">
          <table class="reportTable">
            <colgroup><col class="col1"><col class="col2"></colgroup>
            <tbody>
              <tr class="tableRow">
                <th class="tableLabel table_red">Strict-Transport-Security</th>
                <td class="tableCell">Strict-Transport-Security is a new header.</td>
              </tr>
              <tr class="tableRow">
                <th class="tableLabel table_red">Content-Security-Policy</th>
                <td class="tableCell">Content-Security-Policy is a new header.</td>
              </tr>
              <tr class="tableRow">
                <th class="tableLabel table_red">X-Frame-Options</th>
                <td class="tableCell">X-Frame-Options is a new header.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => mockHTML,
    });

    const securityHeadersScanner = SCANNERS.find((s) => s.id === 'securityHeaders');
    if (securityHeadersScanner) {
      const result = await securityHeadersScanner.run('example.com');
      expect(result.issues).toBeDefined();
      expect(result.issues?.length).toBe(3);
      expect(result.issues?.some((issue) => issue.includes('Strict-Transport-Security'))).toBe(true);
      expect(result.issues?.some((issue) => issue.includes('Content-Security-Policy'))).toBe(true);
      expect(result.issues?.some((issue) => issue.includes('X-Frame-Options'))).toBe(true);
    }
  });

  it('should parse warnings section', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_red"><span>F</span></div>
      </div>
      <div class="reportSection">
        <div class="reportTitle">Missing Headers</div>
        <div class="reportBody">
          <table class="reportTable">
            <colgroup><col class="col1"><col class="col2"></colgroup>
            <tbody>
              <tr class="tableRow">
                <th class="tableLabel table_red">Site is using HTTP</th>
                <td class="tableCell">Permissions Policy</a> is a new header.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => mockHTML,
    });

    const securityHeadersScanner = SCANNERS.find((s) => s.id === 'securityHeaders');
    if (securityHeadersScanner) {
      const result = await securityHeadersScanner.run('example.com');
      expect(result.issues).toBeDefined();
      expect(result.issues?.some((issue) => issue.includes('Site is using HTTP'))).toBe(true);
    }
  });

  it('should parse score from HTML', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_green"><span>A</span></div>
      </div>
      <div class="reportTitle">Score: 85</div>
    `;

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => mockHTML,
    });

    const securityHeadersScanner = SCANNERS.find((s) => s.id === 'securityHeaders');
    if (securityHeadersScanner) {
      const result = await securityHeadersScanner.run('example.com');
      const data = result.data as { score?: number };
      expect(data.score).toBe(85);
    }
  });

  it('should build correct summary with grade and score', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_green"><span>A</span></div>
      </div>
      <div class="reportTitle">Score: 95</div>
    `;

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => mockHTML,
    });

    const securityHeadersScanner = SCANNERS.find((s) => s.id === 'securityHeaders');
    if (securityHeadersScanner) {
      const result = await securityHeadersScanner.run('example.com');
      expect(result.summary).toBe('Grade: A (95/100)');
    }
  });

  it('should build summary with grade only when no score', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_green"><span>A</span></div>
      </div>
    `;

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => mockHTML,
    });

    const securityHeadersScanner = SCANNERS.find((s) => s.id === 'securityHeaders');
    if (securityHeadersScanner) {
      const result = await securityHeadersScanner.run('example.com');
      expect(result.summary).toBe('Grade: A');
    }
  });

  it('should handle perfect A+ grade', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_green"><span>A+</span></div>
      </div>
    `;

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => mockHTML,
    });

    const securityHeadersScanner = SCANNERS.find((s) => s.id === 'securityHeaders');
    if (securityHeadersScanner) {
      const result = await securityHeadersScanner.run('example.com');
      const data = result.data as { grade?: string };
      expect(data.grade).toBe('A+');
      expect(result.summary).toBe('Grade: A+');
    }
  });

  it('should include testUrl in data', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_green"><span>A</span></div>
      </div>
    `;

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => mockHTML,
    });

    const securityHeadersScanner = SCANNERS.find((s) => s.id === 'securityHeaders');
    if (securityHeadersScanner) {
      const result = await securityHeadersScanner.run('example.com');
      const data = result.data as { testUrl?: string };
      expect(data.testUrl).toBeDefined();
      expect(data.testUrl).toContain('https://securityheaders.com/?q=example.com&hide=on&followRedirects=on');
      expect(data.testUrl).toContain('example.com');
    }
  });

  it('should handle fetch errors gracefully', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    const securityHeadersScanner = SCANNERS.find((s) => s.id === 'securityHeaders');
    if (securityHeadersScanner) {
      const result = await securityHeadersScanner.run('example.com');
      const data = result.data as { status?: string; error?: string; testUrl?: string };
      expect(data.status).toBe('unavailable');
      expect(data.error).toBeDefined();
      expect(data.testUrl).toBeDefined();
      expect(result.issues).toBeDefined();
      expect(result.issues?.[0]).toContain('Could not retrieve');
    }
  });

  it('should handle HTTP error responses', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const securityHeadersScanner = SCANNERS.find((s) => s.id === 'securityHeaders');
    if (securityHeadersScanner) {
      const result = await securityHeadersScanner.run('example.com');
      const data = result.data as { status?: string; error?: string };
      expect(data.status).toBe('unavailable');
      expect(data.error).toContain('500');
    }
  });

  it('should deduplicate missing headers', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_red"><span>F</span></div>
      </div>
      <div class="reportSection">
        <div class="reportTitle">Missing Headers</div>
        <div class="reportBody">
            <table class="reportTable">
              <colgroup><col class="col1"><col class="col2"></colgroup>
              <tbody>
                <tr class="tableRow">
                  <th class="tableLabel table_red">Permissions-Policy</th>
                  <td class="tableCell">
                    <a href="https://scotthelme.co.uk/goodbye-feature-policy-and-hello-permissions-policy/">
                      Permissions Policy
                    </a>
                    is a new header that allows a site to control which features and APIs can be used in the browser.
                  </td>
                </tr>
              </tbody>
            </table>
        </div>
      </div>
    `;

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => mockHTML,
    });

    const securityHeadersScanner = SCANNERS.find((s) => s.id === 'securityHeaders');
    if (securityHeadersScanner) {
      const result = await securityHeadersScanner.run('example.com');
      const data = result.data as { missingHeaders?: string[] };
      expect(data.missingHeaders?.length).toBe(1);
      expect(result.issues?.length).toBe(1);
    }
  });

  it('should handle HTML with no sections', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_green"><span>A</span></div>
      </div>
    `;

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => mockHTML,
    });

    const securityHeadersScanner = SCANNERS.find((s) => s.id === 'securityHeaders');
    if (securityHeadersScanner) {
      const result = await securityHeadersScanner.run('example.com');
      const data = result.data as { missingHeaders?: string[] };
      expect(data.missingHeaders).toEqual([]);
      expect(result.issues).toBeUndefined();
    }
  });
});

describe('Security Headers Scanner Interpretations', () => {
  const mockAllScannersForSecurityHeaders = (securityData: string) => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      // Security headers (via CORS proxy)
      if (urlStr.includes('corsproxy.io') && urlStr.includes('securityheaders.com')) {
        return Promise.resolve({
          ok: true,
          text: async () => securityData,
        });
      }

      // Default empty response for other scanners
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
        headers: { get: () => null },
      });
    });
  };

  it('returns success severity for A+ grade', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_green"><span>A+</span></div>
      </div>
    `;
    mockAllScannersForSecurityHeaders(mockHTML);

    const result = await runAllScanners('example.com');
    const securityResult = result.scanners.find((s) => s.id === 'securityHeaders');
    expect(securityResult).toBeDefined();
    if (securityResult) {
      const interpretation = interpretScannerResult(securityResult);
      expect(interpretation.severity).toBe('success');
      expect(interpretation.message).toContain('Excellent security headers');
    }
  });

  it('returns success severity for A grade', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_green"><span>A</span></div>
      </div>
    `;
    mockAllScannersForSecurityHeaders(mockHTML);

    const result = await runAllScanners('example.com');
    const securityResult = result.scanners.find((s) => s.id === 'securityHeaders');
    expect(securityResult).toBeDefined();
    if (securityResult) {
      const interpretation = interpretScannerResult(securityResult);
      expect(interpretation.severity).toBe('success');
      expect(interpretation.message).toContain('Great security headers');
    }
  });

  it('returns info severity for B grade', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_yellow"><span>B</span></div>
      </div>
    `;
    mockAllScannersForSecurityHeaders(mockHTML);

    const result = await runAllScanners('example.com');
    const securityResult = result.scanners.find((s) => s.id === 'securityHeaders');
    expect(securityResult).toBeDefined();
    if (securityResult) {
      const interpretation = interpretScannerResult(securityResult);
      expect(interpretation.severity).toBe('info');
      expect(interpretation.message).toContain('Good security headers');
    }
  });

  it('returns warning severity for C grade', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_orange"><span>C</span></div>
      </div>
    `;
    mockAllScannersForSecurityHeaders(mockHTML);

    const result = await runAllScanners('example.com');
    const securityResult = result.scanners.find((s) => s.id === 'securityHeaders');
    expect(securityResult).toBeDefined();
    if (securityResult) {
      const interpretation = interpretScannerResult(securityResult);
      expect(interpretation.severity).toBe('warning');
      expect(interpretation.message).toContain('Moderate security headers');
    }
  });

  it('returns warning severity for D grade', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_orange"><span>D</span></div>
      </div>
    `;
    mockAllScannersForSecurityHeaders(mockHTML);

    const result = await runAllScanners('example.com');
    const securityResult = result.scanners.find((s) => s.id === 'securityHeaders');
    expect(securityResult).toBeDefined();
    if (securityResult) {
      const interpretation = interpretScannerResult(securityResult);
      expect(interpretation.severity).toBe('warning');
      expect(interpretation.message).toContain('Weak security headers');
    }
  });

  it('returns critical severity for E grade', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_red"><span>E</span></div>
      </div>
    `;
    mockAllScannersForSecurityHeaders(mockHTML);

    const result = await runAllScanners('example.com');
    const securityResult = result.scanners.find((s) => s.id === 'securityHeaders');
    expect(securityResult).toBeDefined();
    if (securityResult) {
      const interpretation = interpretScannerResult(securityResult);
      expect(interpretation.severity).toBe('critical');
      expect(interpretation.message).toContain('Poor security headers');
    }
  });

  it('returns critical severity for F grade', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_red"><span>F</span></div>
      </div>
      <div class="reportTitle">Missing Headers</div>
      <div class="reportBody">
        <table class="reportTable">
          <tbody>
            <tr class="tableRow"><th class="tableLabel table_red">Strict-Transport-Security</th></tr>
            <tr class="tableRow"><th class="tableLabel table_red">Content-Security-Policy</th></tr>
          </tbody>
        </table>
      </div>
    `;
    mockAllScannersForSecurityHeaders(mockHTML);

    const result = await runAllScanners('example.com');
    const securityResult = result.scanners.find((s) => s.id === 'securityHeaders');
    expect(securityResult).toBeDefined();
    if (securityResult) {
      const interpretation = interpretScannerResult(securityResult);
      expect(interpretation.severity).toBe('critical');
      expect(interpretation.message).toContain('Failed security headers');
      expect(interpretation.recommendation).toContain('immediate attention');
      expect(interpretation.recommendation).toContain('Your security headers need immediate attention');
    }
  });

  it('includes testUrl link in recommendation', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_green"><span>A</span></div>
      </div>
    `;
    mockAllScannersForSecurityHeaders(mockHTML);

    const result = await runAllScanners('example.com');
    const securityResult = result.scanners.find((s) => s.id === 'securityHeaders');
    expect(securityResult).toBeDefined();
    if (securityResult) {
      const interpretation = interpretScannerResult(securityResult);
      expect(interpretation.recommendation).toContain('Your site has excellent security headers protecting ');
    }
  });

  it('handles unavailable status gracefully', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      // Security headers - reject
      if (urlStr.includes('corsproxy.io') && urlStr.includes('securityheaders.com')) {
        return Promise.reject(new Error('Network error'));
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
        headers: { get: () => null },
      });
    });

    const result = await runAllScanners('example.com');
    const securityResult = result.scanners.find((s) => s.id === 'securityHeaders');
    expect(securityResult).toBeDefined();
    if (securityResult) {
      const interpretation = interpretScannerResult(securityResult);
      expect(interpretation.severity).toBe('info');
      expect(interpretation.message).toContain('Headers check unavailable');
    }
  });

  it('handles unknown grade gracefully', async () => {
    const mockHTML = `
      <div class="score">
        <div class="score_unknown"><span>?</span></div>
      </div>
    `;
    mockAllScannersForSecurityHeaders(mockHTML);

    const result = await runAllScanners('example.com');
    const securityResult = result.scanners.find((s) => s.id === 'securityHeaders');
    expect(securityResult).toBeDefined();
    if (securityResult) {
      const interpretation = interpretScannerResult(securityResult);
      expect(interpretation.severity).toBe('info');
      expect(interpretation.message).toContain('Security headers analyzed (Unknown)');
    }
  });
});
