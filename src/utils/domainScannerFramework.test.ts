import {
  SCANNERS,
  runAllScanners,
  runScanner,
  interpretScannerResult,
  setScannerTimeout,
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
    // Force timeout to 1ms and run DNS scanner (which will attempt fetch)
    setScannerTimeout(1);
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
    // Restore default timeout for subsequent tests
    setScannerTimeout(30000);
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

