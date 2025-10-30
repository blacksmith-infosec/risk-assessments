import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { AppStateProvider, useAppState } from './AppStateContext';
import * as amplitude from '@amplitude/analytics-browser';
import { DomainScanAggregate } from '../types/domainScan';
import { runAllScanners } from '../utils/domainScannerFramework';

// Mock amplitude
vi.mock('@amplitude/analytics-browser', () => ({
  init: vi.fn(),
  logEvent: vi.fn()
}));

// Mock the questions data
vi.mock('../data/questions.json', () => ({
  default: {
    questions: [
      {
        id: 'q1',
        text: 'Test Question 1',
        category: 'Test Category',
        options: [
          { option: 'Low', risk: 'high', points: 0 },
          { option: 'Medium', risk: 'medium', points: 5 },
          { option: 'High', risk: 'low', points: 10 }
        ]
      },
      {
        id: 'q2',
        text: 'Test Question 2',
        category: 'Test Category',
        recommendationMap: {
          'Low': ['rec1'],
          'High': ['rec2']
        },
        options: [
          { option: 'Low', risk: 'high', points: 0 },
          { option: 'High', risk: 'low', points: 10 }
        ]
      }
    ]
  }
}));

// Mock domainScannerFramework
vi.mock('../utils/domainScannerFramework', () => ({
  SCANNERS: [{ id: 'dns', label: 'DNS', run: vi.fn() }],
  runAllScanners: vi.fn()
}));

describe('AppStateContext', () => {
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => localStorageMock[key] || null),
        setItem: vi.fn((key: string, value: string) => { localStorageMock[key] = value; }),
        removeItem: vi.fn((key: string) => { delete localStorageMock[key]; }),
        clear: vi.fn(() => { localStorageMock = {}; })
      },
      writable: true,
      configurable: true
    });
  });

  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <AppStateProvider>{children}</AppStateProvider>
  );

  describe('Initialization', () => {
    it('should initialize with empty answers and default score', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      expect(result.current.answers).toEqual({});
      expect(result.current.questions).toHaveLength(2);
      expect(result.current.score.total).toBe(0);
    });

    it('should load answers from localStorage', () => {
      const savedAnswers = { q1: 'Medium', q2: 'High' };
      localStorageMock['risk_answers_v1'] = JSON.stringify(savedAnswers);
      const { result } = renderHook(() => useAppState(), { wrapper });
      expect(result.current.answers).toEqual(savedAnswers);
    });

    it('should load domain scan aggregate from localStorage', () => {
      const savedScan: DomainScanAggregate = {
        domain: 'example.com', timestamp: '2025-10-27T00:00:00.000Z', scanners: [], issues: []
      };
      localStorageMock['risk_domain_scan_agg_v1'] = JSON.stringify(savedScan);
      const { result } = renderHook(() => useAppState(), { wrapper });
      expect(result.current.domainScanAggregate).toEqual(savedScan);
    });

    it('should handle corrupted localStorage data gracefully', () => {
      localStorageMock['risk_answers_v1'] = 'invalid json{';
      const { result } = renderHook(() => useAppState(), { wrapper });
      expect(result.current.answers).toEqual({});
    });
  });

  describe('setAnswer', () => {
    it('should update answer and persist to localStorage', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      act(() => {
        result.current.setAnswer('q1', 'Medium');
      });
      expect(result.current.answers).toEqual({ q1: 'Medium' });
      expect(localStorage.setItem).toHaveBeenCalledWith('risk_answers_v1', JSON.stringify({ q1: 'Medium' }));
    });

    it('should track analytics event', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      act(() => {
        result.current.setAnswer('q1', 'High');
      });
      expect(amplitude.logEvent).toHaveBeenCalledWith('answer_set', { question_id: 'q1', value: 'High' });
    });
  });

  describe('resetAnswers', () => {
    it('should clear all answers and remove from localStorage', () => {
      localStorageMock['risk_answers_v1'] = JSON.stringify({ q1: 'Medium' });
      const { result } = renderHook(() => useAppState(), { wrapper });
      act(() => {
        result.current.resetAnswers();
      });
      expect(result.current.answers).toEqual({});
      expect(localStorage.removeItem).toHaveBeenCalledWith('risk_answers_v1');
    });

    it('should track analytics event', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      act(() => {
        result.current.resetAnswers();
      });
      expect(amplitude.logEvent).toHaveBeenCalledWith('answers_reset', undefined);
    });
  });

  describe('resetAll', () => {
    it('should clear all state and localStorage', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      act(() => {
        result.current.resetAll();
      });
      expect(result.current.answers).toEqual({});
      expect(result.current.domainScanAggregate).toBeUndefined();
      expect(localStorage.removeItem).toHaveBeenCalledWith('risk_answers_v1');
      expect(localStorage.removeItem).toHaveBeenCalledWith('risk_domain_scan_agg_v1');
    });

    it('should track analytics event', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      act(() => {
        result.current.resetAll();
      });
      expect(amplitude.logEvent).toHaveBeenCalledWith('reset_all', undefined);
    });
  });

  describe('score computation', () => {
    it('should compute score based on answers', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      act(() => {
        result.current.setAnswer('q1', 'Medium'); // 5 points
      });
      expect(result.current.score.total).toBe(5);
      act(() => {
        result.current.setAnswer('q2', 'High'); // 10 points
      });
      expect(result.current.score.total).toBe(15);
    });
  });

  describe('runScanners', () => {
    it('should run domain scanners and update state', async () => {
      const mockAggregate: DomainScanAggregate = {
        domain: 'example.com', timestamp: '2025-10-27T00:00:00.000Z', scanners: [], issues: []
      };
      vi.mocked(runAllScanners).mockResolvedValue(mockAggregate);
      const { result } = renderHook(() => useAppState(), { wrapper });

      await act(async () => {
        await result.current.runScanners('example.com');
      });

      expect(runAllScanners).toHaveBeenCalledWith('example.com', expect.any(Function));
      expect(result.current.domainScanAggregate).toEqual(mockAggregate);
      expect(localStorage.setItem).toHaveBeenCalledWith('risk_domain_scan_agg_v1', JSON.stringify(mockAggregate));
      expect(result.current.scannerProgress).toEqual([]);
    });
  });

  describe('exportJSON', () => {
    it('should export current state as a valid JSON string', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      act(() => {
        result.current.setAnswer('q1', 'Medium');
      });
      const exported = result.current.exportJSON();
      const parsed = JSON.parse(exported);
      expect(parsed.answers).toEqual({ q1: 'Medium' });
      expect(() => JSON.parse(exported)).not.toThrow();
    });
  });

  describe('importJSON', () => {
    it('should import valid data and update state', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      const importData = JSON.stringify({ answers: { q1: 'High', q2: 'Low' } });
      let importResult: { success: boolean; error?: string } = { success: false };
      act(() => {
        importResult = result.current.importJSON(importData);
      });
      expect(importResult.success).toBe(true);
      expect(result.current.answers).toEqual({ q1: 'High', q2: 'Low' });
      expect(localStorage.setItem).toHaveBeenCalledWith('risk_answers_v1', JSON.stringify({ q1: 'High', q2: 'Low' }));
    });

    it('should handle invalid JSON', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      let importResult: { success: boolean; error?: string } = { success: true };
      act(() => {
        importResult = result.current.importJSON('invalid json{');
      });
      expect(importResult.success).toBe(false);
      expect(importResult.error).toBeDefined();
    });

    it('should reject non-object JSON (array)', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      let importResult: { success: boolean; error?: string } = { success: true };
      act(() => {
        importResult = result.current.importJSON('[]');
      });
      expect(importResult.success).toBe(false);
      expect(importResult.error).toContain('must be an object');
    });

    it('should reject non-object JSON (null)', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      let importResult: { success: boolean; error?: string } = { success: true };
      act(() => {
        importResult = result.current.importJSON('null');
      });
      expect(importResult.success).toBe(false);
      expect(importResult.error).toContain('must be an object');
    });

    it('should reject non-object JSON (string)', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      let importResult: { success: boolean; error?: string } = { success: true };
      act(() => {
        importResult = result.current.importJSON('"just a string"');
      });
      expect(importResult.success).toBe(false);
      expect(importResult.error).toContain('must be an object');
    });

    it('should reject empty object with no valid data', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      let importResult: { success: boolean; error?: string } = { success: true };
      act(() => {
        importResult = result.current.importJSON('{}');
      });
      expect(importResult.success).toBe(false);
      expect(importResult.error).toContain('must contain either answers or domainScanAggregate');
    });

    it('should reject answers that are not objects', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      let importResult: { success: boolean; error?: string } = { success: true };
      act(() => {
        importResult = result.current.importJSON(JSON.stringify({ answers: 'not an object' }));
      });
      expect(importResult.success).toBe(false);
      expect(importResult.error).toContain('Invalid answers format');
    });

    it('should reject answers that are arrays', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      let importResult: { success: boolean; error?: string } = { success: true };
      act(() => {
        importResult = result.current.importJSON(JSON.stringify({ answers: ['q1', 'q2'] }));
      });
      expect(importResult.success).toBe(false);
      expect(importResult.error).toContain('Invalid answers format');
    });

    it('should reject answers with non-string values', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      let importResult: { success: boolean; error?: string } = { success: true };
      act(() => {
        importResult = result.current.importJSON(JSON.stringify({ answers: { q1: 123 } }));
      });
      expect(importResult.success).toBe(false);
      expect(importResult.error).toContain('string key-value pairs');
    });

    it('should import valid domain scan aggregate', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      const mockAggregate: DomainScanAggregate = {
        domain: 'example.com',
        timestamp: '2025-10-27T00:00:00.000Z',
        scanners: [],
        issues: []
      };
      const importData = JSON.stringify({ domainScanAggregate: mockAggregate });
      let importResult: { success: boolean; error?: string } = { success: false };
      act(() => {
        importResult = result.current.importJSON(importData);
      });
      expect(importResult.success).toBe(true);
      expect(result.current.domainScanAggregate).toEqual(mockAggregate);
      expect(localStorage.setItem).toHaveBeenCalledWith('risk_domain_scan_agg_v1', JSON.stringify(mockAggregate));
    });

    it('should reject domain scan aggregate with missing required fields', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      let importResult: { success: boolean; error?: string } = { success: true };
      act(() => {
        importResult = result.current.importJSON(JSON.stringify({
          domainScanAggregate: { domain: 'example.com' } // missing timestamp, scanners, issues
        }));
      });
      expect(importResult.success).toBe(false);
      expect(importResult.error).toBeDefined();
    });

    it('should reject domain scan aggregate that is an array', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      let importResult: { success: boolean; error?: string } = { success: true };
      act(() => {
        importResult = result.current.importJSON(JSON.stringify({ domainScanAggregate: [] }));
      });
      expect(importResult.success).toBe(false);
      expect(importResult.error).toContain('Invalid domainScanAggregate format');
    });

    it('should import both answers and domain scan aggregate', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      const mockAggregate: DomainScanAggregate = {
        domain: 'example.com',
        timestamp: '2025-10-27T00:00:00.000Z',
        scanners: [],
        issues: []
      };
      const importData = JSON.stringify({
        answers: { q1: 'High' },
        domainScanAggregate: mockAggregate
      });
      let importResult: { success: boolean; error?: string } = { success: false };
      act(() => {
        importResult = result.current.importJSON(importData);
      });
      expect(importResult.success).toBe(true);
      expect(result.current.answers).toEqual({ q1: 'High' });
      expect(result.current.domainScanAggregate).toEqual(mockAggregate);
    });

    it('should track successful import', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      const importData = JSON.stringify({ answers: { q1: 'Medium' } });
      act(() => {
        result.current.importJSON(importData);
      });
      expect(amplitude.logEvent).toHaveBeenCalledWith('import', {
        import_type: 'json',
        success: true
      });
    });

    it('should track failed import for invalid JSON', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      act(() => {
        result.current.importJSON('invalid');
      });
      expect(amplitude.logEvent).toHaveBeenCalled();
      const lastCall = (amplitude.logEvent as ReturnType<typeof vi.fn>).mock.calls[
        (amplitude.logEvent as ReturnType<typeof vi.fn>).mock.calls.length - 1
      ];
      expect(lastCall[0]).toBe('import');
      expect(lastCall[1]).toMatchObject({
        import_type: 'json',
        success: false
      });
    });

    it('should track failed import for empty object', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      act(() => {
        result.current.importJSON('{}');
      });
      expect(amplitude.logEvent).toHaveBeenCalled();
      const lastCall = (amplitude.logEvent as ReturnType<typeof vi.fn>).mock.calls[
        (amplitude.logEvent as ReturnType<typeof vi.fn>).mock.calls.length - 1
      ];
      expect(lastCall[0]).toBe('import');
      expect(lastCall[1]).toMatchObject({
        import_type: 'json',
        success: false
      });
    });
  });

  describe('useAppState hook', () => {
    it('should throw error when used outside provider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => renderHook(() => useAppState())).toThrow('useAppState must be used within an AppStateProvider');
      consoleSpy.mockRestore();
    });
  });
});
