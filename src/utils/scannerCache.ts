/**
 * Rate limiting and caching utilities for domain scanner
 * Prevents abuse and improves performance by caching scan results
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5; // Max 5 scans per minute

class ScannerCache {
  private readonly cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly rateLimits: Map<string, RateLimitEntry> = new Map();

  /**
   * Get cached scan result if available and not expired
   */
  get<T>(domain: string): T | null {
    const entry = this.cache.get(domain.toLowerCase());
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > CACHE_DURATION_MS) {
      // Cache expired, remove it
      this.cache.delete(domain.toLowerCase());
      return null;
    }

    return entry.data as T;
  }

  /**
   * Store scan result in cache
   */
  set<T>(domain: string, data: T): void {
    this.cache.set(domain.toLowerCase(), {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Check if request is rate limited
   * Returns { allowed: boolean, retryAfter?: number }
   */
  checkRateLimit(identifier: string = 'global'): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const entry = this.rateLimits.get(identifier);

    if (!entry || now >= entry.resetTime) {
      // First request or window expired, create new entry
      this.rateLimits.set(identifier, {
        count: 1,
        resetTime: now + RATE_LIMIT_WINDOW_MS
      });
      return { allowed: true };
    }

    if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // Increment counter
    entry.count++;
    return { allowed: true };
  }

  /**
   * Clear expired cache entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > CACHE_DURATION_MS) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache and rate limits
   */
  clear(): void {
    this.cache.clear();
    this.rateLimits.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; entries: Array<{ domain: string; age: number }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([domain, entry]) => ({
      domain,
      age: Math.floor((now - entry.timestamp) / 1000 / 60) // Age in minutes
    }));

    return {
      size: this.cache.size,
      entries
    };
  }
}

// Singleton instance
export const scannerCache = new ScannerCache();

// Auto-cleanup every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    scannerCache.cleanup();
  }, 5 * 60 * 1000);
}
