import type { ScoreResult } from './scoring';
import type { DomainScanAggregate } from '../types/domainScan';
import { interpretScannerResult } from './scanners';

interface ExportReportOptions {
  score: ScoreResult;
  risks: string[];
  bestPractices: string[];
  domainScanAggregate?: DomainScanAggregate;
  t: (key: string) => string; // Translation function (common namespace)
  tScanners: (key: string) => string; // Translation function (scanners namespace)
}

/**
 * Generates HTML content for Word export (.doc format)
 * Resolves CSS variables from document root for consistent styling
 */
export const generateWordHTML = (options: ExportReportOptions): string => {
  const { score, risks, domainScanAggregate, t, tScanners } = options;

  const scoreValue = score.percent;
  const scoreLabel = scoreValue >= 80 ? t('report.scoreExcellent') :
                    scoreValue >= 60 ? t('report.scoreGood') :
                    scoreValue >= 40 ? t('report.scoreFair') :
                    t('report.scorePoor');

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
  <title>${t('report.wordExport.title')}</title>
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
  <h1>${t('report.wordExport.title')}</h1>
  <div class="score-section">
    <h2>${t('report.wordExport.overallSecurityScore')}</h2>
    <div class="score-value" style="${getColorStyle(scoreValue)}">${scoreValue}%</div>
    <div class="score-label">${scoreLabel}</div>
  </div>
  <h2>${t('report.wordExport.categoryAnalysisTitle')}</h2>
  <p class="summary">
    ${score.categories.length} ${t('report.wordExport.categoriesEvaluated')}
    ${' | '}
    ${t('report.wordExport.average')} ${avgScore}%
  </p>`;

  // Add categories
  score.categories.forEach((cat) => {
    htmlContent += `
  <div class="category">
    <div class="category-name">${cat.category}</div>
    <div class="category-score" style="${getColorStyle(cat.percent)}">
      ${t('report.wordExport.score')} ${cat.percent}%
    </div>
  </div>
`;
  });

  // Modular Scanner Aggregate
  if (domainScanAggregate) {
    htmlContent += '\n  <div class="scanner-section">' +
      `\n    <h2>${t('report.wordExport.moduleScannerResults')} (${domainScanAggregate.domain})</h2>` +
      `\n    <p class="scanner-meta">${t('report.wordExport.executed')} ${domainScanAggregate.scanners.length} ` +
      `${t('report.wordExport.scannersAt')} ${new Date(domainScanAggregate.timestamp).toLocaleString()}.</p>`;
    domainScanAggregate.scanners.forEach((sc) => {
      const interpretation = interpretScannerResult(sc);
      const statusClass = `scanner-status-${sc.status}`;
      // Translate scanner label, status, and error messages
      const translatedLabel = tScanners(sc.label);
      const translatedStatus = tScanners(`common.status.${sc.status}`);
      htmlContent += '\n    <div class="scanner-item">' +
        `\n      <h4>${translatedLabel} <span class="${statusClass}">[${translatedStatus}]</span></h4>`;
      if (sc.id === 'rdap') {
        htmlContent += `\n      <p>${tScanners('rdap.report.whatItIs')}</p>` +
          `\n      <p>${tScanners('rdap.report.whyWeCheck')}</p>` +
          `\n      <p>${tScanners('rdap.report.howWeUseResults')}</p>`;
      }
      if (sc.summary) {
        htmlContent += `      <div><strong>${t('report.wordExport.summary')}</strong> ${sc.summary}</div>`;
      }
      if (interpretation) {
        // Translate any scanner label keys that appear in error messages
        let message = interpretation.message;
        let recommendation = interpretation.recommendation;
        // Replace any .label keys with their translations
        const labelKeyRegex = /(\w+)\.label/g;
        message = message.replace(labelKeyRegex, (match, key) => tScanners(`${key}.label`));
        recommendation = recommendation.replace(labelKeyRegex, (match, key) => tScanners(`${key}.label`));
        
        htmlContent += '      <div class="scanner-interpretation"><strong>' +
          `${message}</strong><br/>${recommendation}</div>`;
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
        htmlContent += `      <div class="ext-link">${t('report.wordExport.fullHeaderAnalysisLabel')} <a href="` +
          `${testUrl}">${testUrl}</a></div>`;
      }
      htmlContent += '    </div>';
    });
    if (domainScanAggregate.issues.length > 0) {
      htmlContent += `\n    <h3>${t('report.wordExport.aggregatedIssues')}</h3>\n    <ul>`;
      domainScanAggregate.issues.forEach((i) => {
        htmlContent += `      <li>${i}</li>`;
      });
      htmlContent += '    </ul>';
    } else {
      htmlContent += `\n    <p><em>${t('report.wordExport.noAggregatedIssues')}</em></p>`;
    }
    htmlContent += '\n  </div>';
  }

  // Identified Risks
  htmlContent += `\n  <h2>${t('report.identifiedRisks')}</h2>\n`;
  if (risks.length === 0) {
    htmlContent += `  <p><em>${t('report.noRisksYet')}</em></p>\n`;
  } else {
    htmlContent += '  <ul>\n';
    risks.forEach((risk) => {
      htmlContent += `    <li>${risk}</li>\n`;
    });
    htmlContent += '  </ul>\n';
  }

  // Best Practices Confirmed
  htmlContent += `\n  <h2>${t('report.bestPracticesConfirmed')}</h2>\n`;
  if (options.bestPractices.length === 0) {
    htmlContent += `  <p><em>${t('report.noBestPracticesYet')}</em></p>\n`;
  } else {
    htmlContent += '  <ul>\n';
    options.bestPractices.forEach((bp) => {
      htmlContent += `    <li>${bp}</li>\n`;
    });
    htmlContent += '  </ul>\n';
  }

  // Limitations
  htmlContent += '\n  <div class="limitations">' +
    `\n    <h2>${t('report.limitations')}</h2>` +
    `\n    <p>${t('report.limitationsText')}</p>` +
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
