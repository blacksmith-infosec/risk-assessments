import { generateWordHTML, exportToWord } from './exportReport';
import type { ScoreResult } from './scoring';
import type { DomainScanAggregate } from '../types/domainScan';
import { createInstance } from 'i18next';
import englishScanners from '../i18n/locales/en/scanners.json';
import spanishScanners from '../i18n/locales/es/scanners.json';

const rdapExplanationKeys = ['rdap.report.whatItIs', 'rdap.report.whyWeCheck', 'rdap.report.howWeUseResults'];

// Mock translation function
const mockT = (key: string): string => {
  const translations: Record<string, string> = {
    'report.scoreExcellent': 'Excellent Security Posture',
    'report.scoreGood': 'Good Security Posture',
    'report.scoreFair': 'Fair - Improvements Needed',
    'report.scorePoor': 'Critical - Immediate Action Required',
    'report.wordExport.title': 'Security Risk Assessment Report',
    'report.wordExport.overallSecurityScore': 'Overall Security Score',
    'report.wordExport.categoryAnalysisTitle': 'Category Analysis',
    'report.wordExport.categoriesEvaluated': 'security categories evaluated',
    'report.wordExport.average': 'Average:',
    'report.wordExport.score': 'Score:',
    'report.wordExport.moduleScannerResults': 'Modular Scanner Results',
    'report.wordExport.executed': 'Executed',
    'report.wordExport.scannersAt': 'scanners at',
    'report.wordExport.summary': 'Summary:',
    'report.wordExport.aggregatedIssues': 'Aggregated Issues',
    'report.wordExport.noAggregatedIssues': 'No aggregated issues detected.',
    'report.wordExport.fullHeaderAnalysisLabel': 'Full header analysis:',
    'report.identifiedRisks': 'Identified Risks',
    'report.noRisksYet': 'No risks yet. Complete questionnaire or run domain scan.',
    'report.bestPracticesConfirmed': 'Best Practices Confirmed',
    'report.noBestPracticesYet': 'No best practices confirmed yet.',
    'report.limitations': 'Limitations',
    // eslint-disable-next-line max-len
    'report.limitationsText': 'This static tool performs only client-side checks using public unauthenticated sources. Some deeper assessments (full SSL chain validation, comprehensive breach analysis, exhaustive security header audit, port exposure) require server-side or authenticated APIs.'
  };
  return translations[key] || key;
};

// Mock scanners translation function
const mockTScanners = (key: string): string => {
  const translations: Record<string, string> = {
    'dns.label': 'DNS Records',
    'emailAuth.label': 'Email Authentication',
    'certificates.label': 'SSL/TLS Certificates',
    'rdap.label': 'Domain Registration (RDAP)',
    'sslLabs.label': 'SSL/TLS Configuration',
    'securityHeaders.label': 'Security Headers',
    'common.errors.timeout': '{{label}} timed out after {{timeout}}ms',
    'common.errors.scannerFailed': 'Scanner failed to execute',
    // eslint-disable-next-line max-len
    'common.errors.retryMessage': 'This check could not be completed. Please try again or check your network connection.'
  };
  // Simple interpolation for testing
  let result = translations[key] || key;
  if (key === 'common.errors.timeout') {
    result = result.replace('{{label}}', 'Test Scanner').replace('{{timeout}}', '30000');
  }
  return result;
};

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
        bestPractices: [],
        t: mockT,
        tScanners: mockTScanners,
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
        bestPractices: [],
        t: mockT,
        tScanners: mockTScanners,
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
        bestPractices: ['Follow best practice A', 'Implement best practice B'],
        t: mockT,
        tScanners: mockTScanners,
      });

      expect(html).toContain('Identified Risks');
      expect(html).toContain('Risk 1: High severity issue');
      expect(html).toContain('Risk 2: Medium severity issue');
      expect(html).toContain('Best Practices');
      expect(html).toContain('Follow best practice A');
      expect(html).toContain('Implement best practice B');
    });

    it('shows empty state message when no risks', () => {
      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: [],
        t: mockT,
        tScanners: mockTScanners,
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
            status: 'complete',
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
        domainScanAggregate: aggregate,
        t: mockT,
        tScanners: mockTScanners,
      });

      expect(html).toContain('Modular Scanner Results');
      expect(html).toContain('test.com');
      expect(html).toContain('DNS Records');
      expect(html).toContain('5 record types queried');
    });

    it.each([
      { language: 'en', translations: englishScanners },
      { language: 'es', translations: spanishScanners },
    ])('explains RDAP before its results in the $language Word report', async ({ language, translations }) => {
      const scannersTranslator = createInstance();
      await scannersTranslator.init({
        lng: language,
        fallbackLng: false,
        defaultNS: 'scanners',
        resources: { [language]: { scanners: translations } },
      });
      const tScanners = (key: string): string => scannersTranslator.t(key);
      const aggregate: DomainScanAggregate = {
        domain: 'example.com',
        timestamp: '2026-10-14T12:00:00.000Z',
        scanners: [{
          id: 'rdap',
          label: 'rdap.label',
          status: 'complete',
          startedAt: '2026-10-14T12:00:00.000Z',
          summary: 'Domain: example.com, Status: active',
          data: { status: ['active'], dnssecEnabled: true },
          issues: [],
        }],
        issues: [],
      };

      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: [],
        domainScanAggregate: aggregate,
        t: mockT,
        tScanners,
      });
      const reportDocument = new DOMParser().parseFromString(html, 'text/html');
      const scannerItem = reportDocument.querySelector('.scanner-item');

      expect(scannerItem).not.toBeNull();
      expect(scannerItem?.textContent).toContain('Registration Data Access Protocol');
      const explanationParagraphs = Array.from(scannerItem!.querySelectorAll('p'));
      expect(explanationParagraphs).toHaveLength(3);
      rdapExplanationKeys.forEach((key, index) => {
        const explanation = tScanners(key);
        expect(explanation.trim()).not.toBe('');
        expect(explanation).not.toBe(key);
        expect(explanationParagraphs[index].textContent).toBe(explanation);
      });
      expect(explanationParagraphs[0].previousElementSibling?.tagName).toBe('H4');
      expect(explanationParagraphs[2].nextElementSibling?.textContent).toContain(aggregate.scanners[0].summary);
      expect(explanationParagraphs[1].textContent).toMatch(/expir|venc|caduc/i);
      expect(explanationParagraphs[1].textContent).toMatch(/disrupt|interrump|interrup/i);
      expect(explanationParagraphs[2].textContent).toMatch(/flag|señal|identific|marc/i);
      expect(explanationParagraphs[2].textContent).toMatch(/recommend|recomend/i);
      expect(explanationParagraphs[2].textContent).toMatch(/do not change your questionnaire score|no.*cuestionario/i);
    });

    it('omits the RDAP explanation from other scanner results', () => {
      const aggregate: DomainScanAggregate = {
        domain: 'example.com',
        timestamp: '2026-10-14T12:00:00.000Z',
        scanners: [{
          id: 'dns',
          label: 'dns.label',
          status: 'complete',
          startedAt: '2026-10-14T12:00:00.000Z',
          summary: '5 record types queried',
          issues: [],
        }],
        issues: [],
      };

      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: [],
        domainScanAggregate: aggregate,
        t: mockT,
        tScanners: mockTScanners,
      });

      expect(html).toContain('5 record types queried');
      expect(html).not.toContain('Registration Data Access Protocol');
      rdapExplanationKeys.forEach((key) => expect(html).not.toContain(key));
    });

    it('includes scanner issues when present', () => {
      const aggregate: DomainScanAggregate = {
        domain: 'test.com',
        timestamp: new Date().toISOString(),
        scanners: [
          {
            id: 'emailAuth',
            label: 'Email Authentication',
            status: 'complete',
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
        domainScanAggregate: aggregate,
        t: mockT,
        tScanners: mockTScanners,
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
            status: 'complete',
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
        domainScanAggregate: aggregate,
        t: mockT,
        tScanners: mockTScanners,
      });

      expect(html).toContain('https://securityheaders.com/?q=test.com');
      expect(html).toContain('Full header analysis');
    });

    it('includes limitations section', () => {
      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: [],
        t: mockT,
        tScanners: mockTScanners,
      });

      expect(html).toContain('Limitations');
      expect(html).toContain('client-side checks');
      expect(html).toContain('public unauthenticated sources');
    });

    it('uses CSS variables from computed styles', () => {
      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: [],
        t: mockT,
        tScanners: mockTScanners,
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
        bestPractices: [],
        t: mockT,
        tScanners: mockTScanners,
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
        bestPractices: [],
        t: mockT,
        tScanners: mockTScanners,
      });

      expect(html).toContain('30%');
      expect(html).toContain('Critical - Immediate Action Required');
    });
  });

  describe('exportToWord', () => {
    let mockCreateObjectURL: ReturnType<typeof vi.fn>;
    let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
    let mockClick: ReturnType<typeof vi.fn>;
    let BlobConstructorSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockCreateObjectURL = vi.fn(() => 'mock-url');
      mockRevokeObjectURL = vi.fn();
      mockClick = vi.fn();

      // Create a mock Blob class
      BlobConstructorSpy = vi.fn();
      class MockBlob {
        constructor(parts: unknown[], options?: { type?: string }) {
          new BlobConstructorSpy(parts, options);
          return { parts, options, type: options?.type } as unknown as Blob;
        }
      }

      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;
      global.Blob = MockBlob as unknown as typeof Blob;

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
        bestPractices: [],
        t: mockT,
        tScanners: mockTScanners,
      });

      expect(BlobConstructorSpy).toHaveBeenCalledWith(
        expect.arrayContaining(['\ufeff', expect.any(String)]),
        { type: 'application/msword' }
      );
    });

    it('creates download link with correct filename', () => {
      exportToWord({
        score: sampleScore,
        risks: [],
        bestPractices: [],
        t: mockT,
        tScanners: mockTScanners,
      });

      expect(mockClick).toHaveBeenCalled();
    });

    it('creates and revokes object URL', () => {
      exportToWord({
        score: sampleScore,
        risks: [],
        bestPractices: [],
        t: mockT,
        tScanners: mockTScanners,
      });

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('mock-url');
    });

    it('triggers download by clicking anchor element', () => {
      exportToWord({
        score: sampleScore,
        risks: [],
        bestPractices: [],
        t: mockT,
        tScanners: mockTScanners,
      });

      expect(mockClick).toHaveBeenCalledTimes(1);
    });
  });
});
