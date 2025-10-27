import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ConfirmDialog from './index';

describe('ConfirmDialog', () => {
  const defaultProps = {
    isOpen: true,
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Clean up any portal dialogs from previous tests
    document.body.innerHTML = '';
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when isOpen is false', () => {
    render(<ConfirmDialog {...defaultProps} isOpen={false} />);
    const dialog = screen.queryByRole('dialog');
    expect(dialog).toBeNull();
  });

  it('renders dialog when isOpen is true', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByText('Confirm Action')).toBeTruthy();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeTruthy();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const confirmBtn = screen.getByText('Confirm');
    fireEvent.click(confirmBtn);
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses custom button labels when provided', () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        confirmLabel="Yes, delete it"
        cancelLabel="No, keep it"
      />
    );
    expect(screen.getByText('Yes, delete it')).toBeTruthy();
    expect(screen.getByText('No, keep it')).toBeTruthy();
  });

  it('applies danger variant class when specified', () => {
    render(<ConfirmDialog {...defaultProps} variant="danger" />);
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn.className).toContain('btn-danger');
  });

  it('applies primary variant class by default', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn.className).toContain('btn-primary');
  });

  it('closes dialog when ESC key is pressed', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not close on ESC when dialog is not open', () => {
    render(<ConfirmDialog {...defaultProps} isOpen={false} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onCancel).not.toHaveBeenCalled();
  });

  it('closes when clicking overlay background', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const overlay = document.querySelector('.modal-overlay');
    expect(overlay).toBeTruthy();
    if (overlay) {
      fireEvent.click(overlay);
      expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    }
  });

  it('does not close when clicking modal content', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const content = document.querySelector('.modal-content');
    expect(content).toBeTruthy();
    if (content) {
      fireEvent.click(content);
      expect(defaultProps.onCancel).not.toHaveBeenCalled();
    }
  });

  it('renders dialog as portal to document.body', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const overlay = document.querySelector('.modal-overlay');
    expect(overlay).toBeTruthy();
    // Verify it's appended to body, not in the react root
    if (overlay) {
      expect(overlay.parentElement).toBe(document.body);
    }
  });

  it('has proper ARIA attributes', () => {
    render(<ConfirmDialog {...defaultProps} />);
    // Dialog is portaled to document.body, not in the container
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('dialog-title');
    const title = document.getElementById('dialog-title');
    expect(title).toBeTruthy();
    expect(title?.textContent).toBe('Confirm Action');
  });
});
