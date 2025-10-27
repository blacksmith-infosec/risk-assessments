import React from 'react';
import { TrackedLink } from '../TrackedLink';

const Home = () => (
  <section className='home-panel modern-home'>
    <header className='home-header'>
      <h1>
        Blacksmith Risk Assessment
      </h1>
      <p className='subtitle'>Free, private, and fast security posture check</p>
    </header>
    <main className='home-main'>
      <div className='feature-grid'>
        <div className='feature-card'>
          <span className='feature-icon'>📝</span>
          <h2>Questionnaire</h2>
          <p>Answer structured security questions for a quick baseline.</p>
        </div>
        <div className='feature-card'>
          <span className='feature-icon'>🔍</span>
          <h2>Domain Scan</h2>
          <p>Run automated DNS, email, and certificate checks.</p>
        </div>
        <div className='feature-card'>
          <span className='feature-icon'>📊</span>
          <h2>Report</h2>
          <p>View risk score, remediation guidance, and export results.</p>
        </div>
        <div className='feature-card'>
          <span className='feature-icon'>⏎</span>
          <h2>Import</h2>
          <p>Restore a saved assessment securely.</p>
        </div>
      </div>
      <div className='home-notes'>
        <div className='note'>
          <span className='note-icon'>🔒</span>
          <span>Data is stored locally in your browser. No answers or scans are transmitted to a server.</span>
        </div>
        <div className='note'>
          <span className='note-icon'>💡</span>
          <span>
            This tool is provided free of charge and without warranty by{' '}
            <TrackedLink
              href='https://blacksmithinfosec.com/?utm_source=risk-assessment-tool'
              target='_blank'
              rel='noopener noreferrer'
              referrerPolicy='origin'
            >
              Blacksmith InfoSec
            </TrackedLink>. Suggestions, bug reports, or feedback? Report on{' '}
            <TrackedLink
              href='https://github.com/blacksmithinfosec/risk-assessments/issues'
              target='_blank'
              rel='noopener noreferrer'
            >
              GitHub
            </TrackedLink>.
            You are also welcome to fork this repo to create your own customized / personalized assessment tool.
          </span>
        </div>
      </div>
    </main>
  </section>
);

export default Home;
