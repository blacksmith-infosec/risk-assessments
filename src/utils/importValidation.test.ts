import { describe, it, expect } from 'vitest';
import { validateJSONComplexity, validateImportJSON } from './importValidation';

describe('importValidation', () => {
  describe('validateJSONComplexity', () => {
    it('validates simple objects', () => {
      const obj = { key: 'value', number: 42 };
      const result = validateJSONComplexity(obj);
      expect(result.isValid).toBe(true);
    });

    it('validates nested objects within depth limit', () => {
      const obj = { a: { b: { c: { d: { e: 'value' } } } } };
      const result = validateJSONComplexity(obj);
      expect(result.isValid).toBe(true);
    });

    it('rejects objects exceeding depth limit', () => {
      let obj: Record<string, unknown> = { value: 'end' };
      for (let i = 0; i < 15; i++) {
        obj = { nested: obj };
      }
      const result = validateJSONComplexity(obj);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too deep');
    });

    it('validates arrays within limits', () => {
      const obj = { items: [1, 2, 3, 4, 5] };
      const result = validateJSONComplexity(obj);
      expect(result.isValid).toBe(true);
    });

    it('rejects arrays that are too large', () => {
      const obj = { items: Array(1001).fill('item') };
      const result = validateJSONComplexity(obj);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Array too large');
    });

    it('rejects objects with too many keys', () => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < 101; i++) {
        obj[`key${i}`] = 'value';
      }
      const result = validateJSONComplexity(obj);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too many keys');
    });

    it('rejects keys that are too long', () => {
      const longKey = 'a'.repeat(101);
      const obj = { [longKey]: 'value' };
      const result = validateJSONComplexity(obj);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('key too long');
    });

    it('handles null values', () => {
      const obj = { nullValue: null };
      const result = validateJSONComplexity(obj);
      expect(result.isValid).toBe(true);
    });

    it('handles primitives', () => {
      expect(validateJSONComplexity('string').isValid).toBe(true);
      expect(validateJSONComplexity(42).isValid).toBe(true);
      expect(validateJSONComplexity(true).isValid).toBe(true);
      expect(validateJSONComplexity(null).isValid).toBe(true);
    });
  });

  describe('validateImportJSON', () => {
    it('validates valid answers JSON', () => {
      const json = JSON.stringify({
        answers: { q1: 'a', q2: 'b' }
      });
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(true);
    });

    it('validates valid domainScanAggregate JSON', () => {
      const json = JSON.stringify({
        domainScanAggregate: {
          domain: 'example.com',
          timestamp: new Date().toISOString(),
          scanners: [],
          issues: []
        }
      });
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(true);
    });

    it('validates JSON with both answers and domainScanAggregate', () => {
      const json = JSON.stringify({
        answers: { q1: 'a' },
        domainScanAggregate: {
          domain: 'example.com',
          timestamp: new Date().toISOString(),
          scanners: [],
          issues: []
        }
      });
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(true);
    });

    it('rejects invalid JSON syntax', () => {
      const json = '{ invalid json }';
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid JSON format');
    });

    it('rejects JSON that is not an object', () => {
      const json = JSON.stringify(['array']);
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('must be an object');
    });

    it('rejects JSON with no valid data', () => {
      const json = JSON.stringify({ random: 'data' });
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('must contain either answers or domainScanAggregate');
    });

    it('rejects answers that are not objects', () => {
      const json = JSON.stringify({ answers: ['array'] });
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid answers format');
    });

    it('rejects answers with non-string values', () => {
      const json = JSON.stringify({ answers: { q1: 42 } });
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('string key-value pairs');
    });

    it('rejects too many answers', () => {
      const answers: Record<string, string> = {};
      for (let i = 0; i < 101; i++) {
        answers[`q${i}`] = 'answer';
      }
      const json = JSON.stringify({ answers });
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Object has too many keys (max 100 per object)');
    });

    it('rejects answers with keys/values that are too long', () => {
      const json = JSON.stringify({
        answers: { q1: 'a'.repeat(501) }
      });
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('rejects domainScanAggregate without required fields', () => {
      const json = JSON.stringify({
        domainScanAggregate: { domain: 'example.com' }
      });
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('timestamp');
    });

    it('rejects domainScanAggregate with invalid domain', () => {
      const json = JSON.stringify({
        domainScanAggregate: {
          domain: 'a'.repeat(254),
          timestamp: new Date().toISOString(),
          scanners: [],
          issues: []
        }
      });
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Domain name too long');
    });

    it('rejects domainScanAggregate with invalid timestamp', () => {
      const json = JSON.stringify({
        domainScanAggregate: {
          domain: 'example.com',
          timestamp: 'invalid-date',
          scanners: [],
          issues: []
        }
      });
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid timestamp');
    });

    it('rejects domainScanAggregate with too many scanners', () => {
      const json = JSON.stringify({
        domainScanAggregate: {
          domain: 'example.com',
          timestamp: new Date().toISOString(),
          scanners: Array(51).fill({}),
          issues: []
        }
      });
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Too many scanners');
    });

    it('rejects domainScanAggregate with too many issues', () => {
      const json = JSON.stringify({
        domainScanAggregate: {
          domain: 'example.com',
          timestamp: new Date().toISOString(),
          scanners: [],
          issues: Array(1001).fill('issue')
        }
      });
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Array too large (max 1000 items)');
    });

    it('rejects JSON files that are too large', () => {
      const largeData = { answers: {} as Record<string, string> };
      for (let i = 0; i < 10000; i++) {
        largeData.answers[`q${i}`] = 'a'.repeat(500);
      }
      const json = JSON.stringify(largeData);
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Object has too many keys (max 100 per object)');
    });

    it('rejects deeply nested JSON', () => {
      let nested: Record<string, unknown> = { answers: { q1: 'a' } };
      for (let i = 0; i < 15; i++) {
        nested = { nested };
      }
      const json = JSON.stringify(nested);
      const result = validateImportJSON(json);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too deep');
    });
  });
});
