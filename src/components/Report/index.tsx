import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppState } from '../../context/AppStateContext';
import CategoryRadarChart from '../CategoryRadarChart';
import { interpretScannerResult } from '../../utils/scanners';
import { exportToWord } from '../../utils/exportReport';
import { TrackedButton } from '../TrackedButton';
import { TrackedLink } from '../TrackedLink';
import { renderIssueWithLinks } from '../../utils/text';
import Footer from '../Footer';

const Report: React.FC = () => {
  const { t } = useTranslation('common');
  const { t: tScanners } = useTranslation('scanners');
  const { score, risks, bestPractices, domainScanAggregate, exportJSON } = useAppState();
  const reportRef = useRef<HTMLDivElement | null>(null);

  const onExportJSON = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'risk-assessment.json';
    a.click();
  };

  const printScreen = () => {
    window.print();
  };

  const onExportDOCX = () => {
    try {
      exportToWord({
        score,
        risks,
        bestPractices,
        domainScanAggregate,
        t,
        tScanners
      });
    } catch (error) {
      alert(t('report.exportWordError'));
    }
  };

  // Determine color based on score
  const getScoreColor = (percent: number) => {
    if (percent >= 80) return 'score-excellent';
    if (percent >= 60) return 'score-good';
    if (percent >= 40) return 'score-fair';
    return 'score-poor';
  };

  return (
    <div className='panel report-panel'>
      <h2>{t('report.title')}</h2>
      <div className='export-actions'>
        <TrackedButton trackingName='export_word' onClick={onExportDOCX}>
          {t('report.exportWord')}
        </TrackedButton>
        <TrackedButton trackingName='export_json' onClick={onExportJSON}>
          {t('report.exportJSON')}
        </TrackedButton>
        <TrackedButton trackingName='print_report' onClick={printScreen}>
          {t('report.print')}
        </TrackedButton>
      </div>
      <div ref={reportRef} className='report-content'>
        <section className='report-score-section'>
          <h3>{t('report.overallScore')}</h3>
          <div className={`report-score-display ${getScoreColor(score.percent)}`}>
            <div className='report-score-value'>{score.percent}%</div>
            <div className='report-score-label'>
              {score.percent >= 80 ? t('report.scoreExcellent') :
               score.percent >= 60 ? t('report.scoreGood') :
               score.percent >= 40 ? t('report.scoreFair') : t('report.scorePoor')}
            </div>
          </div>
        </section>

        <section className='report-categories-section'>
          <h3>{t('report.categoryAnalysis')}</h3>
          <CategoryRadarChart categories={score.categories} />

          <div className='category-details'>
            {score.categories.map((c) => (
              <div key={c.category} className='category-detail-card'>
                <div className='category-detail-header'>
                  <span className='category-name'>{c.category}</span>
                  <span className={`category-score ${getScoreColor(c.percent)}`}>{c.percent}%</span>
                </div>
                <div className='category-progress-bar'>
                  <div
                    className={`category-progress-fill ${getScoreColor(c.percent)}`}
                    style={{ '--progress-width': `${c.percent}%` } as React.CSSProperties}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {domainScanAggregate && (
          <section>
            <h3>{t('report.domainSecurityScan')}</h3>
            <div className='scanner-summary'>
              <p className='scanner-summary-line'>
                <strong>{domainScanAggregate.domain}</strong>
                {' — '}
                {domainScanAggregate.scanners.length} test{domainScanAggregate.scanners.length !== 1 ? 's' : ''},{' '}
                <span className={
                  domainScanAggregate.issues.length === 0 ? 'scanner-summary-success' : 'scanner-summary-warning'
                }>
                  {domainScanAggregate.issues.length} issue{domainScanAggregate.issues.length !== 1 ? 's' : ''}
                </span>
              </p>
              <p className='scanner-summary-timestamp'>
                {new Date(domainScanAggregate.timestamp).toLocaleString()}
              </p>
            </div>

            <h4>{t('report.scanResults')}</h4>
            <div className='scanner-results-grid'>
              {domainScanAggregate.scanners.map((sc) => {
                const interp = interpretScannerResult(sc);
                return (
                  <div key={sc.id} className={`scanner-card scanner-card-${sc.status}`}>
                    <div className='scanner-card-header'>
                      <span className='scanner-card-title'>{tScanners(sc.label)}</span>
                      <span className={`scanner-card-status scanner-card-status-${sc.status}`}>{sc.status}</span>
                    </div>
                    {sc.id === 'rdap' && (
                      <div className='scanner-description'>
                        <p>{tScanners('rdap.report.whatItIs')}</p>
                        <p>{tScanners('rdap.report.whyWeCheck')}</p>
                        <p>{tScanners('rdap.report.howWeUseResults')}</p>
                      </div>
                    )}
                    {sc.summary && <div className='scanner-card-summary'>{sc.summary}</div>}
                    <div className={`scanner-card-interpretation sev-${interp.severity}`}>
                      <strong>{interp.message}</strong>
                      <div className='scanner-card-recommendation'>{interp.recommendation}</div>
                    </div>
                    {sc.issues && sc.issues.length > 0 && (
                      <ul className='scanner-card-issues'>
                        {sc.issues.map((iss, idx) => renderIssueWithLinks(iss, idx))}
                      </ul>
                    )}
                    {sc.id === 'sslLabs' && sc.data && (sc.data as { testUrl?: string }).testUrl ? (
                      <div className='scanner-card-link'>
                        <TrackedLink
                          href={(sc.data as { testUrl?: string }).testUrl!}
                          target='_blank'
                          rel='noopener noreferrer'
                        >
                          {t('report.fullSslAnalysis')} ↗
                        </TrackedLink>
                      </div>
                    ) : null}
                    {sc.id === 'securityHeaders' && sc.data && (sc.data as { testUrl?: string }).testUrl ? (
                      <div className='scanner-card-link'>
                        <TrackedLink
                          href={(sc.data as { testUrl?: string }).testUrl!}
                          target='_blank'
                          rel='noopener noreferrer'
                        >
                          {t('report.fullHeaderAnalysis')} ↗
                        </TrackedLink>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        )}
        <section>
          <h3>{t('report.identifiedRisks')}</h3>
          {risks.length === 0 && <p>{t('report.noRisksYet')}</p>}
          {risks.length > 0 && (
            <ul className='risks'>
              {risks.map((r) => (
                <li key={r}>
                  <div>{r}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3>{t('report.bestPracticesConfirmed')}</h3>
          {bestPractices.length === 0 && <p>{t('report.noBestPracticesYet')}</p>}
          {bestPractices.length > 0 && (
            <ul className='best-practices'>
              {bestPractices.map((bp) => (
                <li key={bp}>
                  <div>{bp}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className='limitations'>
          <h3>{t('report.limitations')}</h3>
          <p>{t('report.limitationsText')}</p>
        </section>
      </div>
      <Footer />
    </div>
  );
};

export default Report;
