import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import questionsData from '../data/questions.json';
import { Question, RawOption, RawQuestion } from '../types/questions';
import { computeScore, ScoreResult } from '../utils/scoring';
import { mapRisks, RiskMappingResult } from '../utils/recommendations';
import { DomainScanResult } from '../utils/domainChecks';
import { runAllScanners } from '../utils/domainScannerFramework';
import { DomainScanAggregate } from '../types/domainScan';
import { ExecutedScannerResult } from '../types/domainScan';
import { APP_CONFIG } from '../config/appConfig';
import * as amplitude from '@amplitude/analytics-browser';
import { trackEvent, trackImport } from '../utils/analytics';

interface AppStateContextValue {
  questions: Question[];
  answers: Record<string, string>;
  setAnswer: (id: string, value: string) => void;
  resetAnswers: () => void;
  resetAll: () => void;
  score: ScoreResult;
  risks: string[];
  bestPractices: string[];
  domainScan?: DomainScanResult;
  // New aggregated scanner state
  domainScanAggregate?: DomainScanAggregate;
  scannerProgress: ExecutedScannerResult[];
  runScanners: (domain: string) => Promise<void>;
  exportJSON: () => string;
  importJSON: (json: string) => boolean;
}

export type { AppStateContextValue };

const AppStateContext = createContext<AppStateContextValue | undefined>(undefined);

const ANSWERS_KEY = 'risk_answers_v1';
const DOMAIN_KEY = 'risk_domain_scan_v1';
const DOMAIN_AGG_KEY = 'risk_domain_scan_agg_v1';

const loadStored = <T,>(key: string): T | undefined => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : undefined;
  } catch {
    return undefined;
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const persist = (key: string, value: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // TODO: handle storage errors
  }
};

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [questions] = useState<Question[]>(() => {
    const raw = (questionsData as { questions: RawQuestion[] }).questions;
    return raw.map((q) => ({
      id: q.id,
      text: q.text,
      category: q.category,
      recommendationMap: q.recommendationMap,
      options: (q.options || [])
        .sort((a: RawOption, b: RawOption) => ((a?.points || 0) - (b?.points || 0)))
        .map((o) => ({
          label: o.option || '',
          value: o.option || '',
          risk: o.risk || '',
          points: o.points ?? 0
        }))
    }));
  });

  const [answers, setAnswers] = useState<Record<string, string>>(
    () => loadStored<Record<string, string>>(ANSWERS_KEY) || {}
  );
  const [domainScanAggregate, setDomainScanAggregate] = useState<DomainScanAggregate | undefined>(
    () => loadStored<DomainScanAggregate>(DOMAIN_AGG_KEY)
  );
  const [scannerProgress, setScannerProgress] = useState<ExecutedScannerResult[]>([]);

  useEffect(() => {
    if (APP_CONFIG.amplitudeApiKey) {
      amplitude.init(APP_CONFIG.amplitudeApiKey, undefined, { defaultTracking: true });
      // amplitude.setUserProperties({
      //   host: window.location.host,
      //   isFork: window.location.host !== APP_CONFIG.officialDomain
      // });
    }
  }, []);

  const setAnswer = (id: string, value: string) => {
    setAnswers((prev) => {
      const updated = { ...prev, [id]: value };
      persist(ANSWERS_KEY, updated);
      trackEvent('answer_set', { question_id: id, value });
      return updated;
    });
  };

  const resetAnswers = () => {
    setAnswers({});
    localStorage.removeItem(ANSWERS_KEY);
    trackEvent('answers_reset');
  };

  const resetAll = () => {
    setAnswers({});
    setDomainScanAggregate(undefined);
    setScannerProgress([]);
    localStorage.removeItem(ANSWERS_KEY);
    localStorage.removeItem(DOMAIN_KEY);
    localStorage.removeItem(DOMAIN_AGG_KEY);
    trackEvent('reset_all');
  };

  const score = useMemo(() => computeScore(answers, questions), [answers, questions]);
  const { risks, bestPractices }: RiskMappingResult = useMemo(() => mapRisks(answers, questions), [answers, questions]);

  const runScanners = async (domain: string) => {
    setScannerProgress([]);
    const agg = await runAllScanners(domain, (partial) => {
      setScannerProgress(partial);
    });
    setDomainScanAggregate(agg);
    persist(DOMAIN_AGG_KEY, agg);
    trackEvent('domain_scanned_modular', { domain: agg.domain, issues_count: agg.issues.length });
  };

  const exportJSON = () => JSON.stringify({ answers, risks, bestPractices, domainScanAggregate }, null, 2);

  const importJSON = (json: string): boolean => {
    try {
      const obj = JSON.parse(json);

      // Validate that obj is an object and not null or array
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        trackImport('json', false);
        return false;
      }

      let hasValidData = false;

      // Validate and import answers
      if (obj.answers && typeof obj.answers === 'object' && !Array.isArray(obj.answers)) {
        // Validate that all keys are strings and values are strings
        const isValidAnswers = Object.entries(obj.answers).every(
          ([key, value]) => typeof key === 'string' && typeof value === 'string'
        );

        if (isValidAnswers) {
          setAnswers(obj.answers);
          persist(ANSWERS_KEY, obj.answers);
          hasValidData = true;
        }
      }

      // Validate and import domain scan aggregate
      if (
        obj.domainScanAggregate &&
        typeof obj.domainScanAggregate === 'object' &&
        !Array.isArray(obj.domainScanAggregate)
      ) {
        // Validate required fields
        const scan = obj.domainScanAggregate;
        if (
          typeof scan.domain === 'string' &&
          typeof scan.timestamp === 'string' &&
          Array.isArray(scan.scanners) &&
          Array.isArray(scan.issues)
        ) {
          setDomainScanAggregate(obj.domainScanAggregate);
          persist(DOMAIN_AGG_KEY, obj.domainScanAggregate);
          hasValidData = true;
        }
      }

      // Only track as successful if we actually imported some valid data
      if (hasValidData) {
        trackImport('json', true);
        return true;
      } else {
        trackImport('json', false);
        return false;
      }
    } catch {
      trackImport('json', false);
      return false;
    }
  };

  return (
    <AppStateContext.Provider
      value={{
        questions,
        answers,
        setAnswer,
        resetAnswers,
        resetAll,
        score,
        risks,
        bestPractices,
        domainScanAggregate,
        scannerProgress,
        runScanners,
        exportJSON,
        importJSON
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
};

export const useAppState = () => {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within an AppStateProvider');
  return ctx;
};
