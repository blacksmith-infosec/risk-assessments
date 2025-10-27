import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ResetDialog from './index';

afterEach(() => {
  cleanup();
});

describe('ResetDialog', () => {
  const mockOnCancel = vi.fn();
  const mockOnReset = vi.fn();
  const mockOnExportAndReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Visibility', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <ResetDialog
          isOpen={false}
          onCancel={mockOnCancel}
          onReset={mockOnReset}
          onExportAndReset={mockOnExportAndReset}
          hasData={true}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('renders dialog when isOpen is true', () => {
      render(
        <ResetDialog
          isOpen={true}
          onCancel={mockOnCancel}
          onReset={mockOnReset}
          onExportAndReset={mockOnExportAndReset}
          hasData={true}
        />
      );

      expect(screen.getByText('Reset All Data?')).toBeDefined();
    });
  });

  describe('Confirm Step - With Data', () => {
    beforeEach(() => {
      render(
        <ResetDialog
          isOpen={true}
          onCancel={mockOnCancel}
          onReset={mockOnReset}
          onExportAndReset={mockOnExportAndReset}
          hasData={true}
        />
      );
    });

    it('displays warning about data loss', () => {
      expect(screen.getByText('Reset All Data?')).toBeDefined();
      expect(screen.getByText(/This will permanently clear/)).toBeDefined();
      expect(screen.getByText(/All questionnaire answers/)).toBeDefined();
      expect(screen.getByText(/All domain scan results/)).toBeDefined();
      expect(screen.getByText(/Your security risk score/)).toBeDefined();
    });

    it('shows export tip when user has data', () => {
      expect(screen.getByText(/Export your data first/)).toBeDefined();
    });

    it('shows Cancel button', () => {
      const cancelBtn = screen.getByText('Cancel');
      expect(cancelBtn).toBeDefined();
    });

    it('shows Export First button when hasData is true', () => {
      const exportBtn = screen.getByText('💾 Export First');
      expect(exportBtn).toBeDefined();
    });

    it('shows Reset All Data button', () => {
      const resetBtn = screen.getByText('Reset All Data');
      expect(resetBtn).toBeDefined();
    });

    it('calls onCancel when Cancel button clicked', () => {
      const cancelBtn = screen.getByText('Cancel');
      fireEvent.click(cancelBtn);

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
      expect(mockOnReset).not.toHaveBeenCalled();
      expect(mockOnExportAndReset).not.toHaveBeenCalled();
    });

    it('calls onReset when Reset All Data button clicked', () => {
      const resetBtn = screen.getByText('Reset All Data');
      fireEvent.click(resetBtn);

      expect(mockOnReset).toHaveBeenCalledTimes(1);
      expect(mockOnCancel).toHaveBeenCalledTimes(1); // Called during close
      expect(mockOnExportAndReset).not.toHaveBeenCalled();
    });

    it('navigates to export step when Export First clicked', () => {
      const exportBtn = screen.getByText('💾 Export First');
      fireEvent.click(exportBtn);

      // Should now show export step
      expect(screen.getByText('Export Before Reset')).toBeDefined();
      expect(screen.getByText(/Your data will be downloaded/)).toBeDefined();
    });
  });

  describe('Confirm Step - Without Data', () => {
    beforeEach(() => {
      render(
        <ResetDialog
          isOpen={true}
          onCancel={mockOnCancel}
          onReset={mockOnReset}
          onExportAndReset={mockOnExportAndReset}
          hasData={false}
        />
      );
    });

    it('does not show export tip when hasData is false', () => {
      const exportTip = screen.queryByText(/Export your data first/);
      expect(exportTip).toBeNull();
    });

    it('does not show Export First button when hasData is false', () => {
      const exportBtn = screen.queryByText('💾 Export First');
      expect(exportBtn).toBeNull();
    });

    it('still shows Cancel and Reset buttons', () => {
      expect(screen.getByText('Cancel')).toBeDefined();
      expect(screen.getByText('Reset All Data')).toBeDefined();
    });
  });

  describe('Export Step', () => {
    beforeEach(() => {
      render(
        <ResetDialog
          isOpen={true}
          onCancel={mockOnCancel}
          onReset={mockOnReset}
          onExportAndReset={mockOnExportAndReset}
          hasData={true}
        />
      );

      // Navigate to export step
      const exportBtn = screen.getByText('💾 Export First');
      fireEvent.click(exportBtn);
    });

    it('displays export confirmation message', () => {
      expect(screen.getByText('Export Before Reset')).toBeDefined();
      expect(screen.getByText(/Your data will be downloaded as a JSON file/)).toBeDefined();
      expect(screen.getByText(/After the download completes, all local data will be cleared/)).toBeDefined();
    });

    it('shows Back button', () => {
      const backBtn = screen.getByText('Back');
      expect(backBtn).toBeDefined();
    });

    it('shows Download & Reset button', () => {
      const downloadBtn = screen.getByText('Download & Reset');
      expect(downloadBtn).toBeDefined();
    });

    it('returns to confirm step when Back clicked', () => {
      const backBtn = screen.getByText('Back');
      fireEvent.click(backBtn);

      // Should be back to confirm step
      expect(screen.getByText('Reset All Data?')).toBeDefined();
      expect(screen.queryByText('Export Before Reset')).toBeNull();
    });

    it('calls onExportAndReset when Download & Reset clicked', () => {
      const downloadBtn = screen.getByText('Download & Reset');
      fireEvent.click(downloadBtn);

      expect(mockOnExportAndReset).toHaveBeenCalledTimes(1);
      expect(mockOnCancel).toHaveBeenCalledTimes(1); // Called during close
      expect(mockOnReset).not.toHaveBeenCalled();
    });
  });

  describe('Dialog Interactions', () => {
    it('calls onCancel when overlay is clicked', () => {
      const { container } = render(
        <ResetDialog
          isOpen={true}
          onCancel={mockOnCancel}
          onReset={mockOnReset}
          onExportAndReset={mockOnExportAndReset}
          hasData={true}
        />
      );

      const overlay = container.querySelector('.modal-overlay');
      expect(overlay).toBeDefined();

      if (overlay) {
        fireEvent.click(overlay);
        expect(mockOnCancel).toHaveBeenCalledTimes(1);
      }
    });

    it('does not close when modal content is clicked', () => {
      const { container } = render(
        <ResetDialog
          isOpen={true}
          onCancel={mockOnCancel}
          onReset={mockOnReset}
          onExportAndReset={mockOnExportAndReset}
          hasData={true}
        />
      );

      const content = container.querySelector('.modal-content');
      expect(content).toBeDefined();

      if (content) {
        fireEvent.click(content);
        expect(mockOnCancel).not.toHaveBeenCalled();
      }
    });
  });

  describe('Step State Management', () => {
    it('resets to confirm step when dialog closes and reopens', () => {
      const { rerender } = render(
        <ResetDialog
          isOpen={true}
          onCancel={mockOnCancel}
          onReset={mockOnReset}
          onExportAndReset={mockOnExportAndReset}
          hasData={true}
        />
      );

      // Navigate to export step
      const exportBtn = screen.getByText('💾 Export First');
      fireEvent.click(exportBtn);
      expect(screen.getByText('Export Before Reset')).toBeDefined();

      // Close dialog
      rerender(
        <ResetDialog
          isOpen={false}
          onCancel={mockOnCancel}
          onReset={mockOnReset}
          onExportAndReset={mockOnExportAndReset}
          hasData={true}
        />
      );

      // Reopen dialog
      rerender(
        <ResetDialog
          isOpen={true}
          onCancel={mockOnCancel}
          onReset={mockOnReset}
          onExportAndReset={mockOnExportAndReset}
          hasData={true}
        />
      );

      // Should be back to confirm step
      expect(screen.getByText('Reset All Data?')).toBeDefined();
      expect(screen.queryByText('Export Before Reset')).toBeNull();
    });
  });

  describe('Button Styling', () => {
    it('applies danger class to Reset All Data button', () => {
      render(
        <ResetDialog
          isOpen={true}
          onCancel={mockOnCancel}
          onReset={mockOnReset}
          onExportAndReset={mockOnExportAndReset}
          hasData={true}
        />
      );

      const resetBtn = screen.getByText('Reset All Data');
      expect(resetBtn.className).toContain('btn-danger');
    });

    it('applies secondary class to Cancel button', () => {
      render(
        <ResetDialog
          isOpen={true}
          onCancel={mockOnCancel}
          onReset={mockOnReset}
          onExportAndReset={mockOnExportAndReset}
          hasData={true}
        />
      );

      const cancelBtn = screen.getByText('Cancel');
      expect(cancelBtn.className).toContain('btn-secondary');
    });
  });
});
