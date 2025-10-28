import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Toast } from './index';

describe('Toast', () => {
  it('renders success toast with message', () => {
    render(<Toast message="Success!" type="success" onClose={() => {}} />);
    expect(screen.getByText('Success!')).toBeTruthy();
    expect(screen.getByRole('alert').className).toContain('toast-success');
  });

  it('renders error toast with message', () => {
    render(<Toast message="Error occurred" type="error" onClose={() => {}} />);
    expect(screen.getByText('Error occurred')).toBeTruthy();
    expect(screen.getByRole('alert').className).toContain('toast-error');
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<Toast message="Test" type="info" onClose={onClose} />);

    const closeButton = screen.getByLabelText('Close');
    closeButton.click();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-closes after duration', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();

    render(<Toast message="Test" type="info" onClose={onClose} duration={1000} />);

    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);

    expect(onClose).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
