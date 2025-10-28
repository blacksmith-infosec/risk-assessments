// Test utilities for wrapping components in AppStateProvider with mock data.
// Use these helpers to test components that depend on useAppState hook.

import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { AppStateProvider } from '../context/AppStateContext';
import { Question } from '../types/questions';
import { ScoreResult } from '../utils/scoring';
import { DomainScanResult } from '../utils/domainChecks';
import { DomainScanAggregate, ExecutedScannerResult } from '../types/domainScan';

// Mock AppStateContext module to allow custom provider values
export interface MockAppStateValue {
  questions?: Question[];
  answers?: Record<string, string>;
  setAnswer?: (id: string, value: string) => void;
  resetAnswers?: () => void;
  score?: ScoreResult;
  risks?: string[];
  bestPractices?: string[];
  domainScan?: DomainScanResult;
  domainScanAggregate?: DomainScanAggregate;
  scannerProgress?: ExecutedScannerResult[];
  runScanners?: (domain: string) => Promise<void>;
  exportJSON?: () => string;
  importJSON?: (json: string) => boolean;
}

// Default mock values for testing
export const createMockAppState = (overrides: Partial<MockAppStateValue> = {}): MockAppStateValue => {
  const defaultScore: ScoreResult = {
    total: 0,
    max: 100,
    percent: 0,
    categories: []
  };

  return {
    questions: [],
    answers: {},
    setAnswer: () => {},
    resetAnswers: () => {},
    score: defaultScore,
    risks: [],
    bestPractices: [],
    scannerProgress: [],
    runScanners: async () => {},
    exportJSON: () => '{}',
    importJSON: () => true,
    ...overrides
  };
};

// Sample data generators for common test scenarios
export const createSampleScore = (percent: number = 75): ScoreResult => ({
  total: 75,
  max: 100,
  percent,
  categories: [
    { category: 'Access Management', total: 15, max: 20, percent: 75 },
    { category: 'Network Security', total: 12, max: 20, percent: 60 },
    { category: 'Data Protection', total: 18, max: 20, percent: 90 },
  ]
});

export const createSampleDomainScan = (domain: string = 'example.com'): DomainScanResult => ({
  domain,
  timestamp: new Date().toISOString(),
  dns: [
    { type: 'A', data: ['192.0.2.1'] },
    { type: 'MX', data: ['mail.example.com'] }
  ],
  spf: 'v=spf1 include:_spf.example.com ~all',
  dkimSelectorsFound: ['default'],
  issues: ['Missing DMARC record']
});

export const createSampleScannerAggregate = (domain: string = 'example.com'): DomainScanAggregate => ({
  domain,
  timestamp: new Date().toISOString(),
  scanners: [
    {
      id: 'dns',
      label: 'DNS Records',
      status: 'complete',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      summary: '5 record types queried',
      data: { records: [] },
      issues: []
    },
    {
      id: 'emailAuth',
      label: 'Email Authentication',
      status: 'complete',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      summary: 'SPF found, DMARC missing',
      data: {},
      issues: ['Missing DMARC record']
    }
  ],
  issues: ['Missing DMARC record']
});

// Custom render function that wraps component with AppStateProvider
// For full integration tests using real provider
export const renderWithAppState = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <AppStateProvider>{children}</AppStateProvider>
  );
  return render(ui, { wrapper: Wrapper, ...options });
};

// For tests that need mocked context values without full provider logic
// Use vi.mock('../context/AppStateContext') and provide mock implementation
export const createMockUseAppState = (mockState: Partial<MockAppStateValue> = {}) => {
  return createMockAppState(mockState);
};
