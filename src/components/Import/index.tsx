import { useState, useRef, ChangeEvent } from 'react';
import { useAppState } from '../../context/AppStateContext';
import { TrackedButton } from '../TrackedButton';
import { trackImport } from '../../utils/analytics';
import Footer from '../Footer';
import { Toast, ToastType } from '../Toast';

interface ToastState {
  message: string;
  type: ToastType;
}

const Import = () => {
  const { importJSON } = useAppState();
  const [raw, setRaw] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  const onImport = () => {
    const ok = importJSON(raw);
    showToast(
      ok ? '✓ Import successful!' : '✕ Invalid JSON format',
      ok ? 'success' : 'error'
    );
    trackImport('json', ok);
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.json')) {
      showToast('Please select a JSON file', 'error');
      return;
    }

    // Validate file size (e.g., max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      showToast('File is too large (max 5MB)', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setRaw(content);
      const ok = importJSON(content);
      showToast(
        ok ? '✓ File imported successfully!' : '✕ Invalid JSON format',
        ok ? 'success' : 'error'
      );
      trackImport('json', ok);
    };
    reader.onerror = () => {
      showToast('Error reading file', 'error');
    };
    reader.readAsText(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className='panel'>
      <h2>Data Import / Export</h2>
      <p>Use this section to restore a previous assessment or download current results.</p>

      <div className='import-methods'>
        <div className='file-upload'>
          <label htmlFor='file-input'>
            <TrackedButton
              trackingName='upload_json_file'
              onClick={() => fileInputRef.current?.click()}
            >
              Upload JSON File
            </TrackedButton>
          </label>
          <input
            ref={fileInputRef}
            id='file-input'
            type='file'
            accept='.json,application/json'
            onChange={handleFileUpload}
            className='hidden-file-input'
          />
        </div>

        <p className='import-divider'>or</p>

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
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <Footer />
    </div>
  );
};

export default Import;
