import React, { useRef } from 'react';
import { useAppState } from '../../context/AppStateContext';

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

  return (
    <div className='panel'>
      <h2>Risk Report</h2>
      <div className='export-actions'>
        <button onClick={onExportJSON}>Export JSON</button>
      </div>
      <div ref={reportRef} className='report-content'>
        <section>
          <h3>Overall Score</h3>
          <p><strong>{score.percent}%</strong> ({score.total}/{score.max} points)</p>
          <ul>
            {score.categories.map((c) => (
              <li key={c.category}>{c.category}: {c.percent}% ({c.total}/{c.max})</li>
            ))}
          </ul>
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
          <h3>Risks</h3>
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
