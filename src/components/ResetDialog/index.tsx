/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, { useState, useEffect } from 'react';

interface ResetDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onReset: () => void;
  onExportAndReset: () => void;
  hasData: boolean;
}

const ResetDialog: React.FC<ResetDialogProps> = ({
  isOpen,
  onCancel,
  onReset,
  onExportAndReset,
  hasData
}) => {
  const [step, setStep] = useState<'confirm' | 'export'>('confirm');

  // Reset to confirm step when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setStep('confirm');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    onCancel();
  };

  const handleExportAndReset = () => {
    onExportAndReset();
    handleClose();
  };

  const handleResetWithoutExport = () => {
    onReset();
    handleClose();
  };

  return (
    <dialog open className='modal-overlay' onClick={handleClose}>
      <div className='modal-content' onClick={(e) => e.stopPropagation()}>
        {step === 'confirm' && (
          <>
            <h3>Reset All Data?</h3>
            <p>
              This will permanently clear <strong>all</strong> of your data including:
            </p>
            <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
              <li>All questionnaire answers</li>
              <li>All domain scan results</li>
              <li>Your security risk score</li>
            </ul>
            <p>
              <strong>This action cannot be undone.</strong>
            </p>
            {hasData && (
              <p style={{ marginTop: '1rem', color: 'var(--yellow)' }}>
                💾 <strong>Tip:</strong> Export your data first to save your progress.
              </p>
            )}
            <div className='modal-actions'>
              <button className='btn-secondary' onClick={handleClose}>
                Cancel
              </button>
              {hasData && (
                <button
                  className='toggle-btn'
                  onClick={() => setStep('export')}
                  style={{ background: 'var(--blue)' }}
                >
                  💾 Export First
                </button>
              )}
              <button className='btn-danger' onClick={handleResetWithoutExport}>
                Reset All Data
              </button>
            </div>
          </>
        )}

        {step === 'export' && (
          <>
            <h3>Export Before Reset</h3>
            <p>
              Your data will be downloaded as a JSON file. You can import it later to restore your progress.
            </p>
            <p style={{ marginTop: '1rem' }}>
              After the download completes, all local data will be cleared.
            </p>
            <div className='modal-actions'>
              <button className='btn-secondary' onClick={() => setStep('confirm')}>
                Back
              </button>
              <button
                className='btn-danger'
                onClick={handleExportAndReset}
              >
                Download & Reset
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
};

export default ResetDialog;
