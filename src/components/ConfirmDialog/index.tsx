import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TrackedButton } from '../TrackedButton';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'primary';
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'primary',
}) => {
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

  // Handle ESC key and backdrop click (both handled natively by <dialog>)
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

  const dialogContent = (
    <dialog ref={dialogRef} className='modal-content' aria-labelledby='dialog-title'>
      <h3 id='dialog-title'>{title}</h3>
      <p>{message}</p>
      <div className='modal-actions'>
        <TrackedButton
          className='btn-secondary'
          trackingName='dialog_cancel'
          trackingProperties={{ dialog: title }}
          onClick={onCancel}
          type='button'
        >
          {cancelLabel}
        </TrackedButton>
        <TrackedButton
          className={variant === 'danger' ? 'btn-danger' : 'btn-primary'}
          trackingName='dialog_confirm'
          trackingProperties={{ dialog: title, variant }}
          onClick={onConfirm}
          type='button'
        >
          {confirmLabel}
        </TrackedButton>
      </div>
    </dialog>
  );

  return createPortal(dialogContent, document.body);
};

export default ConfirmDialog;
