import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateWordHTML, exportToWord } from './exportReport';
import type { ScoreResult } from './scoring';
import type { DomainScanAggregate } from '../types/domainScan';

// Mock getComputedStyle
const mockGetComputedStyle = vi.fn(() => ({
  getPropertyValue: vi.fn((prop: string) => {
    const colorMap: Record<string, string> = {
      '--green': '#18BB9C',
      '--blue': '#44C8F5',
      '--yellow': '#F39C11',
      '--red': '#E84C3D',
      '--text-primary': '#231F20',
      '--text-secondary': '#06233F',
      '--accent': '#44C8F5',
      '--panel-bg': '#FFFFFF',
      '--page-bg': '#F5F5F5'
    };
    return colorMap[prop] || '';
  })
}));

global.getComputedStyle = mockGetComputedStyle as unknown as typeof getComputedStyle;

describe('exportReport', () => {
  const sampleScore: ScoreResult = {
    total: 75,
    max: 100,
    percent: 75,
    categories: [
      { category: 'Access Management', total: 15, max: 20, percent: 75 },
      { category: 'Network Security', total: 30, max: 40, percent: 75 },
      { category: 'Data Protection', total: 30, max: 40, percent: 75 }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateWordHTML', () => {
    it('generates HTML with score section', () => {
      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: []
      });

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Security Risk Assessment Report');
      expect(html).toContain('Overall Security Score');
      expect(html).toContain('75%');
      expect(html).toContain('Good Security Posture');
    });

    it('includes all categories with their scores', () => {
      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: []
      });

      expect(html).toContain('Access Management');
      expect(html).toContain('Network Security');
      expect(html).toContain('Data Protection');
      expect(html).toContain('Score: 75%');
    });

    it('includes risks when provided', () => {
      const risks = ['Risk 1: High severity issue', 'Risk 2: Medium severity issue'];
      const html = generateWordHTML({
        score: sampleScore,
        risks,
        bestPractices: []
      });

      expect(html).toContain('Identified Risks');
      expect(html).toContain('Risk 1: High severity issue');
      expect(html).toContain('Risk 2: Medium severity issue');
    });

    it('shows empty state message when no risks', () => {
      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: []
      });

      expect(html).toContain('Identified Risks');
      expect(html).toContain('No risks yet');
    });

    it('includes scanner aggregate when provided', () => {
      const aggregate: DomainScanAggregate = {
        domain: 'test.com',
        timestamp: new Date().toISOString(),
        scanners: [
          {
            id: 'dns',
            label: 'DNS Records',
            status: 'success',
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            summary: '5 record types queried',
            issues: []
          }
        ],
        issues: []
      };

      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: [],
        domainScanAggregate: aggregate
      });

      expect(html).toContain('Modular Scanner Results');
      expect(html).toContain('test.com');
      expect(html).toContain('DNS Records');
      expect(html).toContain('5 record types queried');
    });

    it('includes scanner issues when present', () => {
      const aggregate: DomainScanAggregate = {
        domain: 'test.com',
        timestamp: new Date().toISOString(),
        scanners: [
          {
            id: 'emailAuth',
            label: 'Email Authentication',
            status: 'success',
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            summary: 'SPF found, DMARC missing',
            issues: ['Missing DMARC record']
          }
        ],
        issues: ['Missing DMARC record']
      };

      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: [],
        domainScanAggregate: aggregate
      });

      expect(html).toContain('Missing DMARC record');
      expect(html).toContain('Aggregated Issues');
    });

    it('includes security headers external link when present', () => {
      const aggregate: DomainScanAggregate = {
        domain: 'test.com',
        timestamp: new Date().toISOString(),
        scanners: [
          {
            id: 'securityHeaders',
            label: 'Security Headers',
            status: 'success',
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            summary: 'Grade A',
            data: {
              grade: 'A',
              testUrl: 'https://securityheaders.com/?q=test.com'
            },
            issues: []
          }
        ],
        issues: []
      };

      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: [],
        domainScanAggregate: aggregate
      });

      expect(html).toContain('https://securityheaders.com/?q=test.com');
      expect(html).toContain('Full header analysis');
    });

    it('includes limitations section', () => {
      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: []
      });

      expect(html).toContain('Limitations');
      expect(html).toContain('client-side checks');
      expect(html).toContain('public unauthenticated sources');
    });

    it('uses CSS variables from computed styles', () => {
      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: []
      });

      expect(mockGetComputedStyle).toHaveBeenCalled();
      expect(html).toContain('#18BB9C'); // green
      expect(html).toContain('#44C8F5'); // blue/accent
      expect(html).toContain('#F39C11'); // yellow
      expect(html).toContain('#E84C3D'); // red
    });

    it('generates correct score color for excellent score', () => {
      const excellentScore: ScoreResult = {
        total: 90,
        max: 100,
        percent: 90,
        categories: []
      };

      const html = generateWordHTML({
        score: excellentScore,
        risks: [],
        bestPractices: []
      });

      expect(html).toContain('90%');
      expect(html).toContain('Excellent Security Posture');
    });

    it('generates correct score color for poor score', () => {
      const poorScore: ScoreResult = {
        total: 30,
        max: 100,
        percent: 30,
        categories: []
      };

      const html = generateWordHTML({
        score: poorScore,
        risks: [],
        bestPractices: []
      });

      expect(html).toContain('30%');
      expect(html).toContain('Critical - Immediate Action Required');
    });
  });

  describe('exportToWord', () => {
    let mockCreateObjectURL: ReturnType<typeof vi.fn>;
    let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
    let mockClick: ReturnType<typeof vi.fn>;
    let mockBlob: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockCreateObjectURL = vi.fn(() => 'mock-url');
      mockRevokeObjectURL = vi.fn();
      mockClick = vi.fn();
      mockBlob = vi.fn((parts, options) => ({ parts, options, type: options?.type }));

      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;
      global.Blob = mockBlob as unknown as typeof Blob;

      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          return {
            click: mockClick,
            href: '',
            download: ''
          } as unknown as HTMLAnchorElement;
        }
        return document.createElement(tagName);
      });
    });

    it('creates a blob with correct content type', () => {
      exportToWord({
        score: sampleScore,
        risks: [],
        bestPractices: []
      });

      expect(mockBlob).toHaveBeenCalledWith(
        expect.arrayContaining(['\ufeff', expect.any(String)]),
        { type: 'application/msword' }
      );
    });

    it('creates download link with correct filename', () => {
      exportToWord({
        score: sampleScore,
        risks: [],
        bestPractices: []
      });

      expect(mockClick).toHaveBeenCalled();
    });

    it('creates and revokes object URL', () => {
      exportToWord({
        score: sampleScore,
        risks: [],
        bestPractices: []
      });

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('mock-url');
    });

    it('triggers download by clicking anchor element', () => {
      exportToWord({
        score: sampleScore,
        risks: [],
        bestPractices: []
      });

      expect(mockClick).toHaveBeenCalledTimes(1);
    });
  });
});
