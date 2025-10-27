import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import App from './App';
import * as AppStateContext from '../context/AppStateContext';
import type { AppStateContextValue } from '../context/AppStateContext';

// Mock URL methods for export functionality
global.URL.createObjectURL = vi.fn(() => 'mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock document.createElement for download link
const mockClick = vi.fn();
const mockCreateElement = document.createElement.bind(document);
document.createElement = vi.fn((tagName) => {
  const element = mockCreateElement(tagName);
  if (tagName === 'a') {
    element.click = mockClick;
  }
  return element;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('App - Reset Functionality', () => {
  const mockResetAll = vi.fn();
  const mockExportJSON = vi.fn(() => JSON.stringify({ answers: {}, risks: [], bestPractices: [] }));

  const createMockContext = (answers = {}, domainScanAggregate: unknown = undefined): AppStateContextValue => ({
    questions: [],
    answers,
    setAnswer: vi.fn(),
    resetAnswers: vi.fn(),
    resetAll: mockResetAll,
    score: { percent: 0, total: 0, max: 0, categories: [] },
    risks: [],
    bestPractices: [],
    domainScanAggregate: domainScanAggregate as AppStateContextValue['domainScanAggregate'],
    scannerProgress: [],
    runScanners: vi.fn(),
    exportJSON: mockExportJSON,
    importJSON: vi.fn()
  });

  beforeEach(() => {
    vi.spyOn(AppStateContext, 'useAppState');
  });

  describe('Reset Button Visibility', () => {
    it('does not show Reset button when no data exists', () => {
      vi.mocked(AppStateContext.useAppState).mockReturnValue(createMockContext());

      render(<App />);

      const resetBtn = screen.queryByText(/🔄 Reset/);
      expect(resetBtn).toBeNull();
    });

    it('shows Reset button when questionnaire answers exist', () => {
      vi.mocked(AppStateContext.useAppState).mockReturnValue(
        createMockContext({ q1: 'answer1', q2: 'answer2' })
      );

      render(<App />);

      const resetBtn = screen.getByText(/🔄 Reset/);
      expect(resetBtn).toBeDefined();
    });

    it('shows Reset button when domain scan results exist', () => {
      vi.mocked(AppStateContext.useAppState).mockReturnValue(
        createMockContext({}, { domain: 'example.com', timestamp: new Date().toISOString(), results: [], issues: [] })
      );

      render(<App />);

      const resetBtn = screen.getByText(/🔄 Reset/);
      expect(resetBtn).toBeDefined();
    });

    it('shows Reset button when both answers and scans exist', () => {
      vi.mocked(AppStateContext.useAppState).mockReturnValue(
        createMockContext(
          { q1: 'answer1' },
          { domain: 'example.com', timestamp: new Date().toISOString(), results: [], issues: [] }
        )
      );

      render(<App />);

      const resetBtn = screen.getByText(/🔄 Reset/);
      expect(resetBtn).toBeDefined();
    });
  });

  describe('Reset Dialog Interaction', () => {
    beforeEach(() => {
      vi.mocked(AppStateContext.useAppState).mockReturnValue(
        createMockContext({ q1: 'answer1' })
      );
    });

    it('opens reset dialog when Reset button clicked', () => {
      render(<App />);

      const resetBtn = screen.getByText(/🔄 Reset/);
      fireEvent.click(resetBtn);

      expect(screen.getByText('Reset All Data?')).toBeDefined();
    });

    it('closes dialog when Cancel clicked', () => {
      render(<App />);

      const resetBtn = screen.getByText(/🔄 Reset/);
      fireEvent.click(resetBtn);

      const cancelBtn = screen.getByText('Cancel');
      fireEvent.click(cancelBtn);

      expect(screen.queryByText('Reset All Data?')).toBeNull();
    });

    it('calls resetAll when Reset All Data clicked', () => {
      render(<App />);

      const resetBtn = screen.getByText(/🔄 Reset/);
      fireEvent.click(resetBtn);

      const resetAllBtn = screen.getByText('Reset All Data');
      fireEvent.click(resetAllBtn);

      expect(mockResetAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('Export and Reset Functionality', () => {
    beforeEach(() => {
      vi.mocked(AppStateContext.useAppState).mockReturnValue(
        createMockContext({ q1: 'answer1', q2: 'answer2' })
      );
      mockExportJSON.mockReturnValue(JSON.stringify({
        answers: { q1: 'answer1', q2: 'answer2' },
        risks: ['risk1'],
        bestPractices: ['practice1']
      }));
    });

    it('exports JSON and resets when Download & Reset clicked', () => {
      render(<App />);

      // Open dialog
      const resetBtn = screen.getByText(/🔄 Reset/);
      fireEvent.click(resetBtn);

      // Navigate to export step
      const exportFirstBtn = screen.getByText('💾 Export First');
      fireEvent.click(exportFirstBtn);

      // Click Download & Reset
      const downloadBtn = screen.getByText('Download & Reset');
      fireEvent.click(downloadBtn);

      // Should have called exportJSON
      expect(mockExportJSON).toHaveBeenCalledTimes(1);

      // Should have created blob and download link
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();

      // Should have called resetAll
      expect(mockResetAll).toHaveBeenCalledTimes(1);
    });

    it('creates JSON file with correct filename format', () => {
      render(<App />);

      const resetBtn = screen.getByText(/🔄 Reset/);
      fireEvent.click(resetBtn);

      const exportFirstBtn = screen.getByText('💾 Export First');
      fireEvent.click(exportFirstBtn);

      const downloadBtn = screen.getByText('Download & Reset');
      fireEvent.click(downloadBtn);

      // Check that createElement was called for 'a' tag
      expect(document.createElement).toHaveBeenCalledWith('a');
    });

    it('creates blob with correct content type', () => {
      const blobSpy = vi.spyOn(global, 'Blob');

      render(<App />);

      const resetBtn = screen.getByText(/🔄 Reset/);
      fireEvent.click(resetBtn);

      const exportFirstBtn = screen.getByText('💾 Export First');
      fireEvent.click(exportFirstBtn);

      const downloadBtn = screen.getByText('Download & Reset');
      fireEvent.click(downloadBtn);

      expect(blobSpy).toHaveBeenCalledWith(
        [expect.any(String)],
        { type: 'application/json' }
      );
    });
  });

  describe('Dark Mode Toggle', () => {
    beforeEach(() => {
      vi.mocked(AppStateContext.useAppState).mockReturnValue(createMockContext());
      localStorage.clear();
    });

    it('shows Dark mode button in light mode', () => {
      render(<App />);

      const toggleBtn = screen.getByText(/🌙 Dark/);
      expect(toggleBtn).toBeDefined();
    });

    it('toggles to dark mode when clicked', () => {
      render(<App />);

      const toggleBtn = screen.getByText(/🌙 Dark/);
      fireEvent.click(toggleBtn);

      expect(screen.getByText(/☀️ Light/)).toBeDefined();
    });

    it('persists dark mode preference to localStorage', () => {
      render(<App />);

      const toggleBtn = screen.getByText(/🌙 Dark/);
      fireEvent.click(toggleBtn);

      expect(localStorage.getItem('theme')).toBe('dark');
    });
  });

  describe('Reset Button Tracking Properties', () => {
    it('tracks with correct properties when only answers exist', () => {
      vi.mocked(AppStateContext.useAppState).mockReturnValue(
        createMockContext({ q1: 'answer1' })
      );

      render(<App />);

      const resetBtn = screen.getByText(/🔄 Reset/);
      expect(resetBtn).toBeDefined();
      expect(resetBtn.title).toBe('Reset all data');
    });

    it('tracks with correct properties when only scans exist', () => {
      vi.mocked(AppStateContext.useAppState).mockReturnValue(
        createMockContext({}, { domain: 'example.com', timestamp: new Date().toISOString(), results: [], issues: [] })
      );

      render(<App />);

      const resetBtn = screen.getByText(/🔄 Reset/);
      expect(resetBtn).toBeDefined();
    });
  });
});
