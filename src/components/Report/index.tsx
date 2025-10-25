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

  const printScreen = () => {
    window.print();
  };

  const onExportDOCX = () => {
    if (!reportRef.current) return;

    try {
      // Build clean HTML content for Word
      const scoreValue = score.percent;
      const scoreLabel = scoreValue >= 80 ? 'Excellent Security Posture' :
                        scoreValue >= 60 ? 'Good Security Posture' :
                        scoreValue >= 40 ? 'Fair - Improvements Needed' :
                        'Critical - Immediate Action Required';

      const getColorStyle = (percent: number) => {
        if (percent >= 80) return 'color: #18BB9C;';
        if (percent >= 60) return 'color: #44C8F5;';
        if (percent >= 40) return 'color: #F39C11;';
        return 'color: #E84C3D;';
      };

      const avgScore = Math.round(score.categories.reduce((sum, c) => sum + c.percent, 0) / score.categories.length);

      // Build HTML content
      let htmlContent = `
<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>Security Risk Assessment Report</title>
  <style>
    body {
      font-family: Calibri, Arial, sans-serif;
      line-height: 1.6;
      color: #231F20;
      max-width: 800px;
      margin: 20px auto;
      padding: 20px;
    }
    h1 {
      color: #06233F;
      font-size: 28pt;
      text-align: center;
      border-bottom: 3px solid #44C8F5;
      padding-bottom: 10px;
      margin-bottom: 30px;
    }
    h2 {
      color: #06233F;
      font-size: 20pt;
      margin-top: 30px;
      margin-bottom: 15px;
    }
    h3 {
      color: #231F20;
      font-size: 16pt;
      margin-top: 20px;
      margin-bottom: 10px;
    }
    .score-section {
      text-align: center;
      background-color: #f8f9fa;
      padding: 30px;
      margin: 20px 0;
      border-left: 5px solid #44C8F5;
    }
    .score-value {
      font-size: 48pt;
      font-weight: bold;
      margin: 10px 0;
    }
    .score-label {
      font-size: 14pt;
      color: #666;
      margin-top: 10px;
    }
    .summary {
      text-align: center;
      font-style: italic;
      color: #666;
      margin: 20px 0;
    }
    .category {
      margin: 20px 0;
      padding: 15px;
      border: 1px solid #e0e0e0;
      background-color: #fafafa;
    }
    .category-name {
      font-weight: bold;
      font-size: 14pt;
      margin-bottom: 5px;
    }
    .category-score {
      font-weight: bold;
      font-size: 12pt;
    }
    ul {
      margin-left: 20px;
      line-height: 1.8;
    }
    li {
      margin-bottom: 8px;
    }
    .limitations {
      background-color: #fff9e6;
      border-left: 4px solid #F39C11;
      padding: 15px;
      margin-top: 30px;
      font-style: italic;
    }
  </style>
</head>
<body>
  <h1>Security Risk Assessment Report</h1>

  <div class="score-section">
    <h2>Overall Security Score</h2>
    <div class="score-value" style="${getColorStyle(scoreValue)}">${scoreValue}%</div>
    <div class="score-label">${scoreLabel}</div>
  </div>

  <h2>Category Analysis</h2>
  <p class="summary">${score.categories.length} security categories evaluated | Average: ${avgScore}%</p>

`;

      // Add categories
      score.categories.forEach((cat) => {
        htmlContent += `
  <div class="category">
    <div class="category-name">${cat.category}</div>
    <div class="category-score" style="${getColorStyle(cat.percent)}">Score: ${cat.percent}%</div>
  </div>
`;
      });

      // Domain Findings
      if (domainScan) {
        htmlContent += `
  <h2>Domain Findings (${domainScan.domain})</h2>
  <ul>
`;
        domainScan.issues.forEach((issue) => {
          htmlContent += `    <li>${issue}</li>\n`;
        });
        htmlContent += '  </ul>\n';
      }

      // Identified Risks
      htmlContent += '  <h2>Identified Risks</h2>\n';
      if (risks.length === 0) {
        htmlContent += '  <p><em>No risks yet. Complete questionnaire or run domain scan.</em></p>\n';
      } else {
        htmlContent += '  <ul>\n';
        risks.forEach((risk) => {
          htmlContent += `    <li>${risk}</li>\n`;
        });
        htmlContent += '  </ul>\n';
      }

      // Limitations
      htmlContent += `
  <div class="limitations">
    <h2>Limitations</h2>
    <p>This static tool performs only client-side checks using public unauthenticated sources.
    Some deeper assessments (full SSL chain validation, comprehensive breach analysis,
    exhaustive security header audit, port exposure) require server-side or authenticated APIs.</p>
  </div>
</body>
</html>`;

      // Create blob with HTML content
      const blob = new Blob(['\ufeff', htmlContent], {
        type: 'application/msword'
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'risk-assessment-report.doc';
      a.click();
      URL.revokeObjectURL(url);
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
        <button onClick={onExportDOCX}>Export Word</button>
        <button onClick={onExportJSON}>Export JSON</button>
        <button onClick={printScreen}>Print</button>
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
