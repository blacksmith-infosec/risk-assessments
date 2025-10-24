import { useState } from 'react';
import { useAppState } from '../../context/AppStateContext';

const ImportExport = () => {
  const { importJSON, exportJSON } = useAppState();
  const [raw, setRaw] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const onImport = () => {
    const ok = importJSON(raw);
    setStatus(ok ? 'Import successful' : 'Invalid JSON');
  };

  const onDownload = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'risk-assessment.json';
    a.click();
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
        <button onClick={onImport}>Import JSON</button>
        <button onClick={onDownload}>Download Current JSON</button>
      </div>
      {status && <div className='status'>{status}</div>}
    </div>
  );
};

export default ImportExport;
