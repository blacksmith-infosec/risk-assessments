import { describe, it, expect } from 'vitest';
import { validateDomain } from './domainValidation';

describe('domainValidation', () => {
  describe('validateDomain', () => {
    it('validates simple domain', () => {
      const result = validateDomain('example.com');
      expect(result.isValid).toBe(true);
      expect(result.normalizedDomain).toBe('example.com');
    });

    it('validates domain with subdomain', () => {
      const result = validateDomain('www.example.com');
      expect(result.isValid).toBe(true);
      expect(result.normalizedDomain).toBe('www.example.com');
    });

    it('validates domain with multiple subdomains', () => {
      const result = validateDomain('api.v2.example.com');
      expect(result.isValid).toBe(true);
      expect(result.normalizedDomain).toBe('api.v2.example.com');
    });

    it('normalizes domain with https protocol', () => {
      const result = validateDomain('https://example.com');
      expect(result.isValid).toBe(true);
      expect(result.normalizedDomain).toBe('example.com');
    });

    it('normalizes domain with http protocol', () => {
      const result = validateDomain('http://example.com');
      expect(result.isValid).toBe(true);
      expect(result.normalizedDomain).toBe('example.com');
    });

    it('normalizes domain with trailing slash', () => {
      const result = validateDomain('example.com/');
      expect(result.isValid).toBe(true);
      expect(result.normalizedDomain).toBe('example.com');
    });

    it('normalizes domain with path', () => {
      const result = validateDomain('example.com/path/to/page');
      expect(result.isValid).toBe(true);
      expect(result.normalizedDomain).toBe('example.com');
    });

    it('normalizes domain to lowercase', () => {
      const result = validateDomain('EXAMPLE.COM');
      expect(result.isValid).toBe(true);
      expect(result.normalizedDomain).toBe('example.com');
    });

    it('removes trailing dot from domain', () => {
      const result = validateDomain('example.com.');
      expect(result.isValid).toBe(true);
      expect(result.normalizedDomain).toBe('example.com');
    });

    it('validates domain with hyphens', () => {
      const result = validateDomain('my-domain.com');
      expect(result.isValid).toBe(true);
      expect(result.normalizedDomain).toBe('my-domain.com');
    });

    it('validates domain with numbers', () => {
      const result = validateDomain('example123.com');
      expect(result.isValid).toBe(true);
      expect(result.normalizedDomain).toBe('example123.com');
    });

    it('rejects empty string', () => {
      const result = validateDomain('');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Domain is required');
    });

    it('rejects whitespace only', () => {
      const result = validateDomain('   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('rejects localhost', () => {
      const result = validateDomain('localhost');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Localhost');
    });

    it('rejects 127.0.0.1', () => {
      const result = validateDomain('127.0.0.1');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('loopback');
    });

    it('rejects 0.0.0.0', () => {
      const result = validateDomain('0.0.0.0');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('loopback');
    });

    it('rejects private IP 10.x.x.x', () => {
      const result = validateDomain('10.0.0.1');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Private IP');
    });

    it('rejects private IP 192.168.x.x', () => {
      const result = validateDomain('192.168.1.1');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Private IP');
    });

    it('rejects private IP 172.16-31.x.x', () => {
      const result = validateDomain('172.16.0.1');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Private IP');
    });

    it('rejects link-local IP 169.254.x.x', () => {
      const result = validateDomain('169.254.1.1');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Private IP');
    });

    it('rejects domain with HTML tags', () => {
      const result = validateDomain('<script>alert(1)</script>');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid characters');
    });

    it('rejects domain starting with hyphen', () => {
      const result = validateDomain('-example.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects domain ending with hyphen', () => {
      const result = validateDomain('example-.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects domain with label too long', () => {
      const longLabel = 'a'.repeat(64);
      const result = validateDomain(`${longLabel}.com`);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('label too long');
    });

    it('rejects domain name too long', () => {
      const longDomain = 'a'.repeat(250) + '.com';
      const result = validateDomain(longDomain);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('rejects null input', () => {
      const result = validateDomain(null as unknown as string);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Domain is required');
    });

    it('rejects undefined input', () => {
      const result = validateDomain(undefined as unknown as string);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Domain is required');
    });

    it('handles domain with port number', () => {
      const result = validateDomain('example.com:8080');
      expect(result.isValid).toBe(true);
      expect(result.normalizedDomain).toBe('example.com');
    });

    it('validates international domains (punycode)', () => {
      const result = validateDomain('münchen.de');
      expect(result.isValid).toBe(true);
    });
  });
});
