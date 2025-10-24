const Home = () => (
  <div className='panel'>
    <h2>Welcome</h2>
    <p>
      This free assessment helps generate a quick view of security posture through a questionnaire and light domain
      checks. Use the navigation above to begin.
    </p>
    <ul>
      <li><strong>Questionnaire:</strong> Answer structured security questions.</li>
      <li><strong>Domain Scan:</strong> Pull DNS & email auth signals (client-side limitations apply).</li>
      <li><strong>Report:</strong> View risk score and remediation guidance; export results.</li>
      <li><strong>Import/Export:</strong> Restore or save assessment JSON.</li>
    </ul>
    <p className='small-note'>
      Data is stored locally in your browser (LocalStorage). No answers or scans are transmitted to a server.
    </p>
  </div>
);

export default Home;
