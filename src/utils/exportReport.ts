import type { ScoreResult } from './scoring';
import type { DomainScanAggregate } from '../types/domainScan';
import { interpretScannerResult } from './domainScannerFramework';

interface ExportReportOptions {
  score: ScoreResult;
  risks: string[];
  bestPractices: string[];
  domainScanAggregate?: DomainScanAggregate;
}

/**
 * Generates HTML content for Word export (.doc format)
 * Resolves CSS variables from document root for consistent styling
 */
export const generateWordHTML = (options: ExportReportOptions): string => {
  const { score, risks, domainScanAggregate } = options;

  const scoreValue = score.percent;
  const scoreLabel = scoreValue >= 80 ? 'Excellent Security Posture' :
                    scoreValue >= 60 ? 'Good Security Posture' :
                    scoreValue >= 40 ? 'Fair - Improvements Needed' :
                    'Critical - Immediate Action Required';

  // Resolve CSS variable colors from the root so user customization flows into export.
  const rootStyles = getComputedStyle(document.documentElement);
  const colorExcellent = rootStyles.getPropertyValue('--green').trim() || '#18BB9C';
  const colorGood = rootStyles.getPropertyValue('--blue').trim() || '#44C8F5';
  const colorFair = rootStyles.getPropertyValue('--yellow').trim() || '#F39C11';
  const colorPoor = rootStyles.getPropertyValue('--red').trim() || '#E84C3D';
  const colorTextPrimary = rootStyles.getPropertyValue('--text-primary').trim() || '#231F20';
  const colorTextSecondary = rootStyles.getPropertyValue('--text-secondary').trim() || '#06233F';
  const colorAccent = rootStyles.getPropertyValue('--accent').trim() || '#44C8F5';
  const panelBg = rootStyles.getPropertyValue('--panel-bg').trim() || '#FFFFFF';
  const pageBg = rootStyles.getPropertyValue('--page-bg').trim() || '#F5F5F5';

  const getColorStyle = (percent: number) => {
    if (percent >= 80) return `color: ${colorExcellent};`;
    if (percent >= 60) return `color: ${colorGood};`;
    if (percent >= 40) return `color: ${colorFair};`;
    return `color: ${colorPoor};`;
  };

  const avgScore = Math.round(score.categories.reduce((sum, c) => sum + c.percent, 0) / score.categories.length);

  // Build HTML content
  let htmlContent = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>Security Risk Assessment Report</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; line-height:1.6; color:${colorTextPrimary};
           max-width:800px; margin:20px auto; padding:20px; background:${pageBg}; }
    h1 { color:${colorTextSecondary}; font-size:28pt; text-align:center;
         border-bottom:3px solid ${colorAccent}; padding-bottom:10px; margin-bottom:30px; }
    h2 { color:${colorTextSecondary}; font-size:20pt; margin-top:30px; margin-bottom:15px; }
    h3 { color:${colorTextPrimary}; font-size:16pt; margin-top:20px; margin-bottom:10px; }
    .score-section { text-align:center; background:${panelBg}; padding:30px; margin:20px 0;
                     border-left:5px solid ${colorAccent}; box-shadow:0 2px 6px rgba(0,0,0,0.06); border-radius:6px; }
    .score-value { font-size:48pt; font-weight:bold; margin:10px 0; }
    .score-label { font-size:14pt; color:#666; margin-top:10px; }
    .summary { text-align:center; font-style:italic; color:#666; margin:20px 0; }
    .category { margin:20px 0; padding:15px; border:1px solid #e0e0e0; background:${panelBg};
                border-radius:6px; }
    .category-name { font-weight:bold; font-size:14pt; margin-bottom:5px; }
    .category-score { font-weight:bold; font-size:12pt; }
    ul { margin-left:20px; line-height:1.8; }
    li { margin-bottom:8px; }
    .limitations { background:${panelBg}; border-left:4px solid ${colorFair}; padding:15px; margin-top:30px;
                   font-style:italic; border-radius:6px; }
    .scanner-section { margin:30px 0; padding:20px; background:${panelBg};
                       border:1px solid ${colorAccent}; border-radius:8px; }
    .scanner-item { margin:15px 0; padding:12px; border:1px solid #ddd; border-radius:6px; }
    .scanner-item h4 { margin:0 0 6px; font-size:13pt; color:${colorTextSecondary}; }
    .scanner-status-running { color:${colorGood}; }
    .scanner-status-success { color:${colorExcellent}; }
    .scanner-status-error { color:${colorPoor}; }
    .scanner-status-idle { color:#666; }
    .scanner-interpretation { font-size:10pt; margin-top:4px; }
    .issues-list { margin:8px 0 0 18px; }
    .issues-list li { font-size:10pt; }
    .scanner-meta { font-size:9pt; color:#666; }
    .ext-link { font-size:9pt; margin-top:4px; }
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
  <p class="summary">${score.categories.length} security categories evaluated | Average: ${avgScore}%</p>`;

  // Add categories
  score.categories.forEach((cat) => {
    htmlContent += `
  <div class="category">
    <div class="category-name">${cat.category}</div>
    <div class="category-score" style="${getColorStyle(cat.percent)}">Score: ${cat.percent}%</div>
  </div>
`;
  });

  // Modular Scanner Aggregate
  if (domainScanAggregate) {
    htmlContent += '\n  <div class="scanner-section">' +
      `\n    <h2>Modular Scanner Results (${domainScanAggregate.domain})</h2>` +
      `\n    <p class="scanner-meta">Executed ${domainScanAggregate.scanners.length} scanners at ` +
      `${new Date(domainScanAggregate.timestamp).toLocaleString()}.</p>`;
    domainScanAggregate.scanners.forEach((sc) => {
      const interpretation = interpretScannerResult(sc);
      const statusClass = `scanner-status-${sc.status}`;
      htmlContent += '\n    <div class="scanner-item">' +
        `\n      <h4>${sc.label} <span class="${statusClass}">[${sc.status}]</span></h4>`;
      if (sc.summary) {
        htmlContent += `      <div><strong>Summary:</strong> ${sc.summary}</div>`;
      }
      if (interpretation) {
        htmlContent += '      <div class="scanner-interpretation"><strong>' +
          `${interpretation.message}</strong><br/>${interpretation.recommendation}</div>`;
      }
      if (sc.issues && sc.issues.length > 0) {
        htmlContent += '      <ul class="issues-list">';
        sc.issues.forEach((iss) => {
          htmlContent += `        <li>${iss}</li>`;
        });
        htmlContent += '      </ul>';
      }
      // External link for security headers if present
      if (sc.id === 'securityHeaders' && sc.data && (sc.data as { testUrl?: string }).testUrl) {
        const testUrl = (sc.data as { testUrl?: string }).testUrl;
        htmlContent += '      <div class="ext-link">Full header analysis: <a href="' +
          `${testUrl}">${testUrl}</a></div>`;
      }
      htmlContent += '    </div>';
    });
    if (domainScanAggregate.issues.length > 0) {
      htmlContent += '\n    <h3>Aggregated Issues</h3>\n    <ul>';
      domainScanAggregate.issues.forEach((i) => {
        htmlContent += `      <li>${i}</li>`;
      });
      htmlContent += '    </ul>';
    } else {
      htmlContent += '\n    <p><em>No aggregated issues detected.</em></p>';
    }
    htmlContent += '\n  </div>';
  }

  // Identified Risks
  htmlContent += '\n  <h2>Identified Risks</h2>\n';
  if (risks.length === 0) {
    htmlContent += '  <p><em>No risks yet. Complete questionnaire or run domain scan.</em></p>\n';
  } else {
    htmlContent += '  <ul>\n';
    risks.forEach((risk) => {
      htmlContent += `    <li>${risk}</li>\n`;
    });
    htmlContent += '  </ul>\n';
  }

  // Best Practices Confirmed
  htmlContent += '\n  <h2>Best Practices Confirmed</h2>\n';
  if (options.bestPractices.length === 0) {
    htmlContent += '  <p><em>No best practices confirmed yet.</em></p>\n';
  } else {
    htmlContent += '  <ul>\n';
    options.bestPractices.forEach((bp) => {
      htmlContent += `    <li>${bp}</li>\n`;
    });
    htmlContent += '  </ul>\n';
  }

  // Limitations
  htmlContent += '\n  <div class="limitations">' +
    '\n    <h2>Limitations</h2>' +
    '\n    <p>This static tool performs only client-side checks using public unauthenticated sources. ' +
    'Some deeper assessments (full SSL chain validation, comprehensive breach analysis, ' +
    'exhaustive security header audit, port exposure) require server-side or authenticated APIs.</p>' +
    '\n  </div>\n</body>\n</html>';

  return htmlContent;
};

/**
 * Exports report data as a Word document (.doc format)
 * Creates a blob and triggers download
 */
export const exportToWord = (options: ExportReportOptions): void => {
  const htmlContent = generateWordHTML(options);

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
};
