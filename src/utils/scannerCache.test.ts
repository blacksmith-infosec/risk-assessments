import { describe, it, expect, beforeEach, vi } from 'vitest';
import { scannerCache } from './scannerCache';

describe('scannerCache', () => {
  beforeEach(() => {
    scannerCache.clear();
  });

  describe('caching', () => {
    it('stores and retrieves cached data', () => {
      const domain = 'example.com';
      const data = { result: 'test data' };

      scannerCache.set(domain, data);
      const retrieved = scannerCache.get(domain);

      expect(retrieved).toEqual(data);
    });

    it('returns null for non-existent cache', () => {
      const retrieved = scannerCache.get('nonexistent.com');
      expect(retrieved).toBeNull();
    });

    it('normalizes domain to lowercase', () => {
      const data = { result: 'test' };
      scannerCache.set('EXAMPLE.COM', data);

      expect(scannerCache.get('example.com')).toEqual(data);
      expect(scannerCache.get('Example.Com')).toEqual(data);
    });

    it('expires cache after 30 minutes', () => {
      const domain = 'example.com';
      const data = { result: 'test' };

      scannerCache.set(domain, data);

      // Fast-forward time by 31 minutes
      vi.useFakeTimers();
      vi.advanceTimersByTime(31 * 60 * 1000);

      const retrieved = scannerCache.get(domain);
      expect(retrieved).toBeNull();

      vi.useRealTimers();
    });

    it('does not expire cache before 30 minutes', () => {
      const domain = 'example.com';
      const data = { result: 'test' };

      scannerCache.set(domain, data);

      // Fast-forward time by 29 minutes
      vi.useFakeTimers();
      vi.advanceTimersByTime(29 * 60 * 1000);

      const retrieved = scannerCache.get(domain);
      expect(retrieved).toEqual(data);

      vi.useRealTimers();
    });

    it('handles complex data structures', () => {
      const domain = 'example.com';
      const data = {
        scanners: [{ id: 'dns', status: 'complete' }],
        issues: ['Issue 1', 'Issue 2'],
        timestamp: new Date().toISOString()
      };

      scannerCache.set(domain, data);
      const retrieved = scannerCache.get(domain);

      expect(retrieved).toEqual(data);
    });
  });

  describe('rate limiting', () => {
    it('allows first request', () => {
      const result = scannerCache.checkRateLimit();
      expect(result.allowed).toBe(true);
    });

    it('allows requests within limit', () => {
      for (let i = 0; i < 5; i++) {
        const result = scannerCache.checkRateLimit();
        expect(result.allowed).toBe(true);
      }
    });

    it('blocks requests exceeding limit', () => {
      // Make 5 requests (the limit)
      for (let i = 0; i < 5; i++) {
        scannerCache.checkRateLimit();
      }

      // 6th request should be blocked
      const result = scannerCache.checkRateLimit();
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('resets limit after window expires', () => {
      vi.useFakeTimers();

      // Make 5 requests (the limit)
      for (let i = 0; i < 5; i++) {
        scannerCache.checkRateLimit();
      }

      // 6th request should be blocked
      expect(scannerCache.checkRateLimit().allowed).toBe(false);

      // Fast-forward past the 1 minute window
      vi.advanceTimersByTime(61 * 1000);

      // Should be allowed again
      const result = scannerCache.checkRateLimit();
      expect(result.allowed).toBe(true);

      vi.useRealTimers();
    });

    it('supports different identifiers', () => {
      // Max out 'user1'
      for (let i = 0; i < 5; i++) {
        scannerCache.checkRateLimit('user1');
      }

      expect(scannerCache.checkRateLimit('user1').allowed).toBe(false);

      // 'user2' should still be allowed
      expect(scannerCache.checkRateLimit('user2').allowed).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('removes expired entries', () => {
      vi.useFakeTimers();

      scannerCache.set('old.com', { data: 'old' });
      vi.advanceTimersByTime(31 * 60 * 1000); // Expire

      scannerCache.set('new.com', { data: 'new' });

      scannerCache.cleanup();

      expect(scannerCache.get('old.com')).toBeNull();
      expect(scannerCache.get('new.com')).toEqual({ data: 'new' });

      vi.useRealTimers();
    });

    it('keeps non-expired entries', () => {
      scannerCache.set('domain1.com', { data: 'test1' });
      scannerCache.set('domain2.com', { data: 'test2' });

      scannerCache.cleanup();

      expect(scannerCache.get('domain1.com')).toEqual({ data: 'test1' });
      expect(scannerCache.get('domain2.com')).toEqual({ data: 'test2' });
    });
  });

  describe('clear', () => {
    it('removes all cache entries', () => {
      scannerCache.set('domain1.com', { data: 'test1' });
      scannerCache.set('domain2.com', { data: 'test2' });

      scannerCache.clear();

      expect(scannerCache.get('domain1.com')).toBeNull();
      expect(scannerCache.get('domain2.com')).toBeNull();
    });
  });

  describe('getStats', () => {
    it('returns cache statistics', () => {
      scannerCache.set('example.com', { data: 'test' });
      scannerCache.set('test.com', { data: 'test2' });

      const stats = scannerCache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.entries).toHaveLength(2);
      expect(stats.entries[0]).toHaveProperty('domain');
      expect(stats.entries[0]).toHaveProperty('age');
    });

    it('calculates age in minutes', () => {
      vi.useFakeTimers();

      scannerCache.set('example.com', { data: 'test' });
      vi.advanceTimersByTime(5 * 60 * 1000); // 5 minutes

      const stats = scannerCache.getStats();
      expect(stats.entries[0].age).toBe(5);

      vi.useRealTimers();
    });
  });
});
