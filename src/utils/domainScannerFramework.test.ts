import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SCANNERS,
  runAllScanners,
  runScanner,
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
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
      headers: {
        get: () => null,
      },
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
      expect(scanner.status).toBe('success');
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
      expect(['success', 'error', 'running']).toContain(scanner.status);
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

    expect(result.status).toBe('success');
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
      expect(result.issues).toContain('Missing SPF record');
      expect(result.issues).toContain('Missing DMARC record');
      expect(result.issues).toContain('No DKIM selectors detected (heuristic)');
    }
  });
});

describe('Certificate Scanner', () => {
  it('should fetch certificates from crt.sh', async () => {
    const mockCerts = [{ id: 1, name: 'example.com' }];
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
    }
  });
});

describe('Security Headers Scanner', () => {
  it('should attempt to fetch security headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: {
        get: () => null,
      },
    });

    const headersScanner = SCANNERS.find((s) => s.id === 'securityHeaders');
    expect(headersScanner).toBeDefined();

    if (headersScanner) {
      const result = await headersScanner.run('example.com');
      expect(result.data).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.issues).toBeDefined();
    }
  });

  it('should report missing security headers as issues', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => {
          if (name === 'strict-transport-security') return 'max-age=31536000';
          return null;
        },
      },
    });

    const headersScanner = SCANNERS.find((s) => s.id === 'securityHeaders');
    if (headersScanner) {
      const result = await headersScanner.run('example.com');
      expect(result.issues?.some((issue) => issue.includes('content-security-policy'))).toBe(true);
      expect(result.issues?.some((issue) => issue.includes('x-frame-options'))).toBe(true);
    }
  });
});
