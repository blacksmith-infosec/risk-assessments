import React, { useRef } from 'react';
import { useAppState } from '../../context/AppStateContext';
import CategoryRadarChart from '../CategoryRadarChart';
import { interpretScannerResult } from '../../utils/domainScannerFramework';
import { exportToWord } from '../../utils/exportReport';
import { TrackedButton } from '../TrackedButton';
import { TrackedLink } from '../TrackedLink';

const Report: React.FC = () => {
  const { score, risks, bestPractices, domainScan, domainScanAggregate, exportJSON } = useAppState();
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
        domainScanAggregate
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error exporting to Word:', error);
      alert('Failed to export to Word document. Please try the PDF export instead.');
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
      <h2>Security Risk Report</h2>
      <div className='export-actions'>
        <TrackedButton trackingName='export_word' onClick={onExportDOCX}>
          Export Word
        </TrackedButton>
        <TrackedButton trackingName='export_json' onClick={onExportJSON}>
          Export JSON
        </TrackedButton>
        <TrackedButton trackingName='print_report' onClick={printScreen}>
          Print
        </TrackedButton>
      </div>
      <div ref={reportRef} className='report-content'>
        <section className='report-score-section'>
          <h3>Overall Security Score</h3>
          <div className={`report-score-display ${getScoreColor(score.percent)}`}>
            <div className='report-score-value'>{score.percent}%</div>
            <div className='report-score-label'>
              {score.percent >= 80 ? 'Excellent Security Posture' :
               score.percent >= 60 ? 'Good Security Posture' :
               score.percent >= 40 ? 'Fair - Improvements Needed' : 'Critical - Immediate Action Required'}
            </div>
          </div>
        </section>

        <section className='report-categories-section'>
          <h3>Category Analysis</h3>
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
                    data-width={c.percent}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {domainScan && !domainScanAggregate && (
          <section>
            <h3>Domain Findings ({domainScan.domain})</h3>
            <ul>
              {domainScan.issues.map((i) => <li key={i}>{i}</li>)}
            </ul>
          </section>
        )}
        {domainScanAggregate && (
          <section>
            <h3>Domain Security Scan</h3>
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

            <h4>Scan Results</h4>
            <div className='scanner-results-grid'>
              {domainScanAggregate.scanners.map((sc) => {
                const interp = interpretScannerResult(sc);
                return (
                  <div key={sc.id} className={`scanner-card scanner-card-${sc.status}`}>
                    <div className='scanner-card-header'>
                      <span className='scanner-card-title'>{sc.label}</span>
                      <span className={`scanner-card-status scanner-card-status-${sc.status}`}>{sc.status}</span>
                    </div>
                    {sc.summary && <div className='scanner-card-summary'>{sc.summary}</div>}
                    <div className={`scanner-card-interpretation sev-${interp.severity}`}>
                      <strong>{interp.message}</strong>
                      <div className='scanner-card-recommendation'>{interp.recommendation}</div>
                    </div>
                    {sc.issues && sc.issues.length > 0 && (
                      <ul className='scanner-card-issues'>
                        {sc.issues.map((iss) => <li key={iss}>{iss}</li>)}
                      </ul>
                    )}
                    {sc.id === 'securityHeaders' && sc.data && (sc.data as { testUrl?: string }).testUrl ? (
                      <div className='scanner-card-link'>
                        <TrackedLink
                          href={(sc.data as { testUrl?: string }).testUrl!}
                          target='_blank'
                          rel='noopener noreferrer'
                        >
                          Full header analysis ↗
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
          <h3>Identified Risks</h3>
          {risks.length === 0 && <p>No risks yet. Complete questionnaire or run domain scan.</p>}
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
          <h3>Best Practices Confirmed</h3>
          {bestPractices.length === 0 && <p>No best practices confirmed yet.</p>}
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
          <h3>Limitations</h3>
          <p>
            This static tool performs only client-side checks using public unauthenticated sources. Some deeper
            assessments (full SSL chain validation, comprehensive breach analysis, exhaustive security header audit,
            port exposure) require server-side or authenticated APIs.
          </p>
        </section>
      </div>
    </div>
  );
};

export default Report;
