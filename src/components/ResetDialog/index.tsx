import React, { useState, useEffect, useRef } from 'react';

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
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Open/close the dialog using the native dialog API
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Reset to confirm step when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setStep('confirm');
    }
  }, [isOpen]);

  // Handle ESC key and backdrop click
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault(); // Prevent default close behavior
      onCancel();
    };

    const handleClick = (e: MouseEvent) => {
      // Close when clicking the backdrop
      const rect = dialog.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        onCancel();
      }
    };

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleClick);

    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
    };
  }, [onCancel]);

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
    <dialog ref={dialogRef} className='modal-content' aria-labelledby='dialog-title'>
      {step === 'confirm' && (
        <>
          <h3 id='dialog-title'>Reset All Data?</h3>
          <p>
            This will permanently clear <strong>all</strong> of your data including:
          </p>
          <ul>
            <li>All questionnaire answers</li>
            <li>All domain scan results</li>
            <li>Your security risk score</li>
          </ul>
          <p>
            <strong>This action cannot be undone.</strong>
          </p>
          {hasData && (
            <p className='warning'>
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
          <h3 id='dialog-title'>Export Before Reset</h3>
          <p>
            Your data will be downloaded as a JSON file. You can import it later to restore your progress.
          </p>
          <p>
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
    </dialog>
  );
};

export default ResetDialog;
