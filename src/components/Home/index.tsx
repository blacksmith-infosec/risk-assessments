import { useNavigate } from 'react-router-dom';
import Footer from '../Footer';

const Home = () => {
  const navigate = useNavigate();

  return (
    <section className='home-panel modern-home'>
      <header className='home-header'>
        <h1>
          Risk Assessment
        </h1>
        <p className='subtitle'>Free, private, and fast security posture check</p>
      </header>
      <main className='home-main'>
        <div className='feature-grid'>
          <button className='feature-card' onClick={() => navigate('/questionnaire')}>
            <span className='feature-icon'>📝</span>
            <h2>Questionnaire</h2>
            <p>Answer structured security questions for a quick baseline.</p>
          </button>
          <button className='feature-card' onClick={() => navigate('/domain')}>
            <span className='feature-icon'>🔍</span>
            <h2>Domain Scan</h2>
            <p>Run automated DNS, email, and certificate checks.</p>
          </button>
          <button className='feature-card' onClick={() => navigate('/report')}>
            <span className='feature-icon'>📊</span>
            <h2>Report</h2>
            <p>View risk score, remediation guidance, and export results.</p>
          </button>
          <button className='feature-card' onClick={() => navigate('/data')}>
            <span className='feature-icon'>⏎</span>
            <h2>Import</h2>
            <p>Restore a saved assessment securely.</p>
          </button>
        </div>
        <div className='home-notes'>
          <div className='note'>
            <span className='note-icon'>🔒</span>
            <span className='note-text'>
              Data is stored locally in your browser. No answers or scans are transmitted to a server.
            </span>
          </div>
        </div>
      </main>
      <Footer />
    </section>
  );
};

export default Home;
