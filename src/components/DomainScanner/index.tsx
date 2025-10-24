import React, { useState } from 'react';
import { useAppState } from '../../context/AppStateContext';
import { SCANNERS } from '../../utils/domainScannerFramework';

const DomainScanner = () => {
  const { runScanners, domainScanAggregate, scannerProgress, domainScan } = useAppState();
  const [input, setInput] = useState(domainScanAggregate?.domain || domainScan?.domain || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!input.trim()) { setError('Enter a domain'); return; }
    setLoading(true);
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
        <button type='submit' disabled={loading}>{loading ? 'Scanning...' : 'Scan Domain'}</button>
      </form>
      {error && <div className='error'>{error}</div>}
      <div className='modular-results'>
        <h3>Scanners</h3>
        <ul className='scanner-list'>
          {SCANNERS.map((s) => {
            const prog = scannerProgress.find((p) => p.id === s.id);
            const status = prog?.status || 'idle';
            return (
              <li key={s.id} className={`scanner scanner-${status}`}>
                <strong>{s.label}</strong>{' '}
                <span className='status'>[{status}]</span>
                <div className='desc'>{s.description}</div>
                {prog && prog.summary && <div className='summary'>{prog.summary}</div>}
                {prog && prog.status === 'error' && <div className='error'>Error: {prog.error}</div>}
                {prog && prog.issues && prog.issues.length > 0 && (
                  <ul className='issues'>
                    {prog.issues.map((i) => <li key={i}>{i}</li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {domainScanAggregate && (
          <div className='aggregate'>
            <h4>Aggregate Result</h4>
            <p><em>Domain:</em> {domainScanAggregate.domain}</p>
            <p><em>Timestamp:</em> {new Date(domainScanAggregate.timestamp).toLocaleString()}</p>
            <h5>All Issues</h5>
            {domainScanAggregate.issues.length ? (
              <ul>
                {domainScanAggregate.issues.map((i) => <li key={i}>{i}</li>)}
              </ul>
            ) : <p>No issues detected.</p>}
          </div>
        )}
      </div>
      {!domainScanAggregate && domainScan && (
        <div className='legacy-results'>
          <h3>Legacy Combined Assessment</h3>
          <p>This view persists until a new modular scan is run.</p>
          <p><em>Domain:</em> {domainScan.domain}</p>
          <p><em>Timestamp:</em> {new Date(domainScan.timestamp).toLocaleString()}</p>
          <p><em>Issues:</em> {domainScan.issues.length}</p>
        </div>
      )}
      <p className='disclaimer'>
        Disclaimer: Some checks (full SSL chain, exhaustive headers, breach data) require backend or API keys
        not included in this free static tool.
      </p>
    </div>
  );
};

export default DomainScanner;
