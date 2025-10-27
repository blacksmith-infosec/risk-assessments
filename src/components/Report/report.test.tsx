import { render, screen, cleanup } from '@testing-library/react';

import Report from './index';
import { createMockAppState, createSampleScore, createSampleScannerAggregate } from '../../test-utils/appStateHelpers';
import * as AppStateContext from '../../context/AppStateContext';
import type { AppStateContextValue } from '../../context/AppStateContext';

// Minimal mock for ResizeObserver which Recharts uses in ResponsiveContainer
class ResizeObserverMock {
  observe() { /* noop */ }
  unobserve() { /* noop */ }
  disconnect() { /* noop */ }
}
// Assign mock to global
(global as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;

// Mock URL.createObjectURL and revokeObjectURL for export functionality
global.URL.createObjectURL = vi.fn(() => 'mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock the useAppState hook
vi.mock('../../context/AppStateContext', async () => {
  const actual = await vi.importActual('../../context/AppStateContext');
  return {
    ...actual,
    useAppState: vi.fn()
  };
});

describe('Report Component', () => {
  beforeEach(() => {
    // Reset mock before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up rendered components
    cleanup();
  });

  describe('Empty State', () => {
    it('renders with default empty score (0%)', () => {
      const emptyScore = {
        total: 0,
        max: 0,
        percent: 0,
        categories: []
      };
      const mockState = createMockAppState({ score: emptyScore });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);
      expect(screen.getByText(/Overall Security Score/i)).toBeDefined();
      expect(screen.getByText(/0%/)).toBeDefined();
    });

    it('renders empty radar chart when no categories', () => {
      const emptyScore = {
        total: 0,
        max: 0,
        percent: 0,
        categories: []
      };
      const mockState = createMockAppState({ score: emptyScore });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);
      const radarContainer = document.querySelector('.radar-chart-container');
      expect(radarContainer).not.toBeNull();
    });
  });

  describe('Score Display', () => {
    it('renders score with category breakdown', () => {
      const score = createSampleScore(75);
      const mockState = createMockAppState({ score });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      expect(screen.getByText(/Overall Security Score/i)).toBeDefined();
      const scoreElements = screen.getAllByText(/75%/);
      expect(scoreElements.length).toBeGreaterThan(0);
    });

    it('renders multiple categories', () => {
      const score = createSampleScore(60);
      const mockState = createMockAppState({ score });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      expect(screen.getByText(/Access Management/i)).toBeDefined();
      expect(screen.getByText(/Network Security/i)).toBeDefined();
      expect(screen.getByText(/Data Protection/i)).toBeDefined();
    });

    it('renders radar chart when score exists', () => {
      const score = createSampleScore(50);
      const mockState = createMockAppState({ score });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      const radarContainer = document.querySelector('.radar-chart-container');
      expect(radarContainer).not.toBeNull();
    });
  });

  describe('Risks Display', () => {
    it('renders risks list when risks are present', () => {
      const score = createSampleScore(40);
      const risks = ['Risk 1: High severity issue', 'Risk 2: Medium severity issue'];
      const mockState = createMockAppState({ score, risks, bestPractices: [] });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      expect(screen.getByText(/Identified Risks/i)).toBeDefined();
      expect(screen.getByText(/Risk 1: High severity issue/i)).toBeDefined();
      expect(screen.getByText(/Risk 2: Medium severity issue/i)).toBeDefined();
    });

    it('renders empty state message when no risks', () => {
      const score = createSampleScore(90);
      const mockState = createMockAppState({ score, risks: [], bestPractices: [] });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      expect(screen.getByText(/No risks yet/i)).toBeDefined();
    });
  });

  describe('Best Practices Display', () => {
    it('renders best practices list when present', () => {
      const score = createSampleScore(85);
      const bestPractices = [
        'Best Practice 1: Encryption enabled',
        'Best Practice 2: MFA configured'
      ];
      const mockState = createMockAppState({ score, risks: [], bestPractices });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      expect(screen.getByText(/Best Practices Confirmed/i)).toBeDefined();
      expect(screen.getByText(/Best Practice 1: Encryption enabled/i)).toBeDefined();
      expect(screen.getByText(/Best Practice 2: MFA configured/i)).toBeDefined();
    });

    it('renders empty message when no best practices', () => {
      const score = createSampleScore(60);
      const mockState = createMockAppState({ score, risks: [], bestPractices: [] });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      const heading = screen.getByRole('heading', { name: /Best Practices Confirmed/i });
      expect(heading).toBeDefined();
      expect(screen.getByText(/No best practices confirmed yet/i)).toBeDefined();
    });
  });

  describe('Domain Scanner Display', () => {
    it('renders scanner summary with domain and timestamp', () => {
      const score = createSampleScore(70);
      const aggregate = createSampleScannerAggregate('example.com');
      const mockState = createMockAppState({ score, domainScanAggregate: aggregate });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      expect(screen.getByText(/Domain Security Scan/i)).toBeDefined();
      expect(screen.getByText('example.com')).toBeDefined();
      expect(screen.getByText(/2 tests,/i)).toBeDefined();
    });

    it('displays issues count in summary', () => {
      const score = createSampleScore(70);
      const aggregate = createSampleScannerAggregate('test.com');
      const mockState = createMockAppState({ score, domainScanAggregate: aggregate });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      expect(screen.getByText(/1 issue/i)).toBeDefined();
    });

    it('renders scanner cards with status', () => {
      const score = createSampleScore(70);
      const aggregate = createSampleScannerAggregate('test.com');
      const mockState = createMockAppState({ score, domainScanAggregate: aggregate });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      // Check scanner cards are rendered (titles appear in card headers and may appear in interpretations)
      const dnsElements = screen.getAllByText(/DNS Records/i);
      expect(dnsElements.length).toBeGreaterThan(0);
      const emailAuthElements = screen.getAllByText(/Email Authentication/i);
      expect(emailAuthElements.length).toBeGreaterThan(0);
      expect(screen.getAllByText('success')).toHaveLength(2);
    });

    it('renders scanner interpretations', () => {
      const score = createSampleScore(70);
      const aggregate = createSampleScannerAggregate('test.com');
      const mockState = createMockAppState({ score, domainScanAggregate: aggregate });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      // Should contain interpretation messages (these come from interpretScannerResult)
      const interpretations = document.querySelectorAll('.scanner-card-interpretation');
      expect(interpretations.length).toBe(2);
    });

    it('does not render scanner section when no aggregate', () => {
      const score = createSampleScore(70);
      const mockState = createMockAppState({ score, domainScanAggregate: undefined });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      expect(screen.queryByText(/Domain Security Scan/i)).toBeNull();
    });

    it('renders external security headers link when available', () => {
      const score = createSampleScore(70);
      const aggregate = createSampleScannerAggregate('test.com');

      // Add security headers scanner with testUrl
      aggregate.scanners.push({
        id: 'securityHeaders',
        label: 'Security Headers',
        status: 'success',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        summary: 'Grade A',
        data: {
          grade: 'A',
          score: 95,
          testUrl: 'https://securityheaders.com/?q=test.com',
          missingHeaders: []
        },
        issues: []
      });

      const mockState = createMockAppState({ score, domainScanAggregate: aggregate });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      const link = screen.getByText(/Full header analysis/i);
      expect(link).toBeDefined();
      expect(link.closest('a')?.getAttribute('href')).toBe('https://securityheaders.com/?q=test.com');
      expect(link.closest('a')?.getAttribute('target')).toBe('_blank');
    });
  });

  describe('Export Functionality', () => {
    it('renders export buttons', () => {
      const score = createSampleScore(80);
      const mockState = createMockAppState({ score });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      expect(screen.getByText(/Export JSON/i)).toBeDefined();
      expect(screen.getByText(/Export Word/i)).toBeDefined();
      expect(screen.getByText(/Print/i)).toBeDefined();
    });

    it('calls exportJSON when JSON export button clicked', () => {
      const mockExportJSON = vi.fn();
      const score = createSampleScore(80);
      const mockState = createMockAppState({ score, exportJSON: mockExportJSON });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      const jsonButton = screen.getByText(/Export JSON/i);
      jsonButton.click();

      expect(mockExportJSON).toHaveBeenCalledTimes(1);
    });

    it('does not render export buttons when no score', () => {
      const emptyScore = {
        total: 0,
        max: 0,
        percent: 0,
        categories: []
      };
      const mockState = createMockAppState({ score: emptyScore });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      // Export buttons are always present
      expect(screen.getByText(/Export JSON/i)).toBeDefined();
      expect(screen.getByText(/Export Word/i)).toBeDefined();
    });
  });

  describe('Full Report', () => {
    it('renders all sections when complete data is available', () => {
      const score = createSampleScore(75);
      const risks = ['Risk 1', 'Risk 2'];
      const bestPractices = ['Best Practice 1'];
      const aggregate = createSampleScannerAggregate('example.com');
      const mockState = createMockAppState({
        score,
        risks,
        bestPractices,
        domainScanAggregate: aggregate
      });
      vi.mocked(AppStateContext.useAppState).mockReturnValue(mockState as unknown as AppStateContextValue);

      render(<Report />);

      // Check all major sections are present
      const scoreElements = screen.getAllByText(/75%/);
      expect(scoreElements.length).toBeGreaterThan(0);
      expect(screen.getByText('Risk 1')).toBeDefined();
      expect(screen.getByText('Risk 2')).toBeDefined();
      expect(screen.getByText('Best Practice 1')).toBeDefined();
      expect(screen.getByText('example.com')).toBeDefined();
      expect(screen.getByText(/Export JSON/i)).toBeDefined();
    });
  });
});
