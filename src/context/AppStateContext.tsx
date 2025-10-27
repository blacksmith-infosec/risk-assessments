import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import questionsData from '../data/questions.json';
import { Question, RawOption, RawQuestion } from '../types/questions';
import { computeScore, ScoreResult } from '../utils/scoring';
import { mapRisks, RiskMappingResult } from '../utils/recommendations';
import { runDomainAssessment, DomainScanResult } from '../utils/domainChecks';
import { runAllScanners } from '../utils/domainScannerFramework';
import { DomainScanAggregate } from '../types/domainScan';
import { ExecutedScannerResult } from '../types/domainScan';
import { APP_CONFIG } from '../config/appConfig';
import * as amplitude from '@amplitude/analytics-browser';

interface AppStateContextValue {
  questions: Question[];
  answers: Record<string, string>;
  setAnswer: (id: string, value: string) => void;
  resetAnswers: () => void;
  score: ScoreResult;
  risks: string[];
  bestPractices: string[];
  domainScan?: DomainScanResult;
  // New aggregated scanner state
  domainScanAggregate?: DomainScanAggregate;
  scannerProgress: ExecutedScannerResult[];
  scanDomain: (domain: string) => Promise<void>;
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
  const [domainScan, setDomainScan] = useState<DomainScanResult | undefined>(
    () => loadStored<DomainScanResult>(DOMAIN_KEY)
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
      amplitude.logEvent('answer_set', { id, value });
      return updated;
    });
  };

  const resetAnswers = () => {
    setAnswers({});
    persist(ANSWERS_KEY, {});
    amplitude.logEvent('answers_reset');
  };

  const score = useMemo(() => computeScore(answers, questions), [answers, questions]);
  const { risks, bestPractices }: RiskMappingResult = useMemo(() => mapRisks(answers, questions), [answers, questions]);

  const scanDomain = async (domain: string) => {
    // Legacy single-pass assessment for backward compatibility
    const result = await runDomainAssessment(domain);
    setDomainScan(result);
    persist(DOMAIN_KEY, result);
    amplitude.logEvent('domain_scanned', { domain: result.domain, issues: result.issues.length });
  };

  const runScanners = async (domain: string) => {
    setScannerProgress([]);
    const agg = await runAllScanners(domain, (partial) => {
      setScannerProgress(partial);
    });
    setDomainScanAggregate(agg);
    persist(DOMAIN_AGG_KEY, agg);
    amplitude.logEvent('domain_scanned_modular', { domain: agg.domain, issues: agg.issues.length });
  };

  const exportJSON = () => JSON.stringify({ answers, risks, bestPractices, domainScan, domainScanAggregate }, null, 2);

  const importJSON = (json: string): boolean => {
    try {
      const obj = JSON.parse(json);
      if (obj.answers && typeof obj.answers === 'object') setAnswers(obj.answers);
      if (obj.domainScan && typeof obj.domainScan === 'object') setDomainScan(obj.domainScan);
      if (obj.domainScanAggregate && typeof obj.domainScanAggregate === 'object') {
        setDomainScanAggregate(obj.domainScanAggregate);
      }
      amplitude.logEvent('data_imported');
      return true;
    } catch {
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
        score,
  risks,
  bestPractices,
        domainScan,
        domainScanAggregate,
        scannerProgress,
        scanDomain,
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
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
};
