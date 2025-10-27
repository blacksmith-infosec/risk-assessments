import React, { useState } from 'react';
import { useAppState } from '../../context/AppStateContext';
import { SCANNERS, interpretScannerResult } from '../../utils/domainScannerFramework';
import { TrackedButton } from '../TrackedButton';
import { TrackedLink } from '../TrackedLink';
import { trackFormSubmit } from '../../utils/analytics';
import Footer from '../Footer';

const DomainScanner = () => {
  const { runScanners, domainScanAggregate, scannerProgress } = useAppState();
  const [input, setInput] = useState(domainScanAggregate?.domain || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!input.trim()) { setError('Enter a domain'); return; }
    setLoading(true);
    trackFormSubmit('domain_scan', { domain: input });
    try {
      await runScanners(input);
    } catch (err) {
      setError('Scan failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='panel'>
      <h2>Domain Assessment</h2>
      <p>Run lightweight DNS / email auth / certificate / header checks using public sources.</p>
      <form onSubmit={onScan} className='domain-form'>
        <input
          type='text'
          placeholder='example.com'
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <TrackedButton type='submit' disabled={loading} trackingName='domain_scan_submit'>
          <span className='button-text-full'>{loading ? 'Scanning...' : 'Scan Domain'}</span>
          <span className='button-text-short'>{loading ? 'Scanning...' : 'Scan'}</span>
        </TrackedButton>
      </form>
      {error && <div className='error'>{error}</div>}
      <div className='modular-results'>
        <h3>Scanners</h3>
        <div className='error'>More scanners are coming soon!</div>
        <ul className='scanner-list'>
          {SCANNERS.map((s) => {
            const prog = scannerProgress.find((p) => p.id === s.id);
            const status = prog?.status || 'idle';
            const interpretation = prog ? interpretScannerResult(prog) : null;

            // Status icons
            const getStatusIcon = () => {
              switch (status) {
                case 'success':
                  return '✓';
                case 'error':
                  return '✕';
                case 'running':
                  return '⟳';
                default:
                  return '○';
              }
            };

            // Severity badge component
            const renderSeverityBadge = () => {
              if (!interpretation) return null;
              const severityClass = `severity-badge severity-${interpretation.severity}`;
              const severityLabel = {
                success: '✓ Good',
                info: 'ℹ Info',
                warning: '⚠ Warning',
                critical: '⚠ Critical',
                error: '✕ Error'
              }[interpretation.severity];

              return <span className={severityClass}>{severityLabel}</span>;
            };

            return (
              <li key={s.id} className={`scanner scanner-${status}`}>
                <div className='scanner-header'>
                  <div className='scanner-title'>
                    <span className={`status-icon status-icon-${status}`}>{getStatusIcon()}</span>
                    <strong>{s.label}</strong>
                    {renderSeverityBadge()}
                  </div>
                  <span className='status-text'>{status}</span>
                </div>
                <div className='scanner-description'>{s.description}</div>
                {prog && prog.summary && <div className='scanner-summary'>{prog.summary}</div>}

                {interpretation && (
                  <div className={`interpretation interpretation-${interpretation.severity}`}>
                    <div className='interpretation-message'>{interpretation.message}</div>
                    <div className='interpretation-recommendation'>{interpretation.recommendation}</div>
                    {s.id === 'securityHeaders' && prog?.data &&
                     (prog.data as { testUrl?: string }).testUrl ? (
                      <div className='external-link'>
                        <TrackedLink
                          href={(prog.data as { testUrl?: string }).testUrl!}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='btn-link'
                        >
                          📊 View Full Report on SecurityHeaders.com →
                        </TrackedLink>
                      </div>
                    ) : null}
                  </div>
                )}

                {prog && prog.status === 'error' && prog.error && (
                  <div className='error-detail'>Error: {prog.error}</div>
                )}
                {prog && prog.issues && prog.issues.length > 0 && (
                  <details className='issues-details'>
                    <summary>{prog.issues.length} issue(s) detected</summary>
                    <ul className='issues-list'>
                      {prog.issues.map((i, idx) => <li key={idx}>{i}</li>)}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
        {domainScanAggregate && (
          <div className='aggregate'>
            <h4>Aggregate Result</h4>
            <div className='aggregate-info'>
              <p><strong>Domain:</strong> {domainScanAggregate.domain}</p>
              <p><strong>Timestamp:</strong> {new Date(domainScanAggregate.timestamp).toLocaleString()}</p>
            </div>
            <h5>All Issues ({domainScanAggregate.issues.length})</h5>
            {domainScanAggregate.issues.length ? (
              <ul className='aggregate-issues'>
                {domainScanAggregate.issues.map((i, idx) => <li key={idx}>{i}</li>)}
              </ul>
            ) : (
              <p className='no-issues'>✓ No issues detected - Your domain configuration looks good!</p>
            )}
          </div>
        )}
      </div>
      <p className='disclaimer'>
        Disclaimer: Some checks (full SSL chain, exhaustive headers, breach data) require backend or API keys
        not included in this free static tool.
      </p>
      <Footer />
    </div>
  );
};

export default DomainScanner;
