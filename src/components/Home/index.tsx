import React from 'react';
import Footer from '../Footer';

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
      </div>
    </main>
    <Footer />
  </section>
);

export default Home;
