import React, { useRef } from 'react';
import { useAppState } from '../../context/AppStateContext';
import CategoryRadarChart from '../CategoryRadarChart';

const Report: React.FC = () => {
  const { score, risks, domainScan, exportJSON } = useAppState();
  const reportRef = useRef<HTMLDivElement | null>(null);

  const onExportJSON = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'risk-assessment.json';
    a.click();
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
        <button onClick={onExportJSON}>Export JSON</button>
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

        {domainScan && (
          <section>
            <h3>Domain Findings ({domainScan.domain})</h3>
            <ul>
              {domainScan.issues.map((i) => <li key={i}>{i}</li>)}
            </ul>
          </section>
        )}
        <section>
          <h3>Identified Risks</h3>
          {risks.length === 0 && <p>No risks yet. Complete questionnaire or run domain scan.</p>}
          <ul className='risks'>
            {risks.map((r) => (
              <li key={r}>
                <div>{r}</div>
              </li>
            ))}
          </ul>
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
