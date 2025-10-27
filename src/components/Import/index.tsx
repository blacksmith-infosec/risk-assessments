import { useState } from 'react';
import { useAppState } from '../../context/AppStateContext';
import { TrackedButton } from '../TrackedButton';
import { trackImport } from '../../utils/analytics';
import Footer from '../Footer';

const Import = () => {
  const { importJSON } = useAppState();
  const [raw, setRaw] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const onImport = () => {
    const ok = importJSON(raw);
    setStatus(ok ? 'Import successful' : 'Invalid JSON');
    trackImport('json', ok);
  };

  return (
    <div className='panel'>
      <h2>Data Import / Export</h2>
      <p>Use this section to restore a previous assessment or download current results.</p>
      <textarea
        rows={8}
        placeholder='Paste exported JSON here to import'
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      <div className='actions'>
        <TrackedButton trackingName='import_json' onClick={onImport}>
          Import JSON
        </TrackedButton>
      </div>
      {status && <div className='status'>{status}</div>}
      <Footer />
    </div>
  );
};

export default Import;
