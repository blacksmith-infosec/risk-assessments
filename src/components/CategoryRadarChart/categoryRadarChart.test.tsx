// NOTE: Requires @testing-library/react dev dependency. Install via:
//   npm install -D @testing-library/react
import React from 'react';
import { render, screen } from '@testing-library/react';
import CategoryRadarChart, { buildChartData, CustomTooltip } from './index';
import { getChartTheme } from '../../utils/theme';

// Suppress Recharts dimension warnings in test environment
// eslint-disable-next-line no-console
const originalError = console.error;
beforeAll(() => {
  // eslint-disable-next-line no-console
  console.error = (...args: unknown[]) => {
    const message = String(args[0]);
    if (message.includes('width') && message.includes('height') && message.includes('chart')) {
      return; // Suppress Recharts dimension warnings
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  // eslint-disable-next-line no-console
  console.error = originalError;
});

// Mock Recharts to avoid dimension warnings in tests
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 400, height: 300 }}>{children}</div>
    ),
  };
});

// Minimal mock for ResizeObserver which Recharts may use internally in ResponsiveContainer.
class ResizeObserverMock {
  observe() { /* noop */ }
  unobserve() { /* noop */ }
  disconnect() { /* noop */ }
}
// Assign mock to global while preserving type expectations
(global as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;

describe('CategoryRadarChart', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('style');
  });

  const sampleCategories = [
    { category: 'Access Management', percent: 75, total: 15, max: 20 },
    { category: 'Network Security', percent: 60, total: 12, max: 20 },
    { category: 'Data Protection', percent: 90, total: 18, max: 20 },
  ];

  it('renders the radar chart container', () => {
    render(<CategoryRadarChart categories={sampleCategories} />);
    const container = document.querySelector('.radar-chart-container');
    expect(container).toBeTruthy();
  });

  it('transforms category labels (adds newline and Mgmt abbreviation)', () => {
    const data = buildChartData(sampleCategories);
  const transformed = data.find((d) => d.fullName === 'Access Management');
    expect(transformed).toBeDefined();
    if (transformed) {
      expect(transformed.category).toMatch(/Mgmt/);
      expect(transformed.category).toMatch(/\n/);
    }
  });

  it('uses CSS variable based theme (accent applied)', () => {
    document.documentElement.style.setProperty('--accent', '#ff00aa');
    render(<CategoryRadarChart categories={sampleCategories} />);
    const theme = getChartTheme();
    expect(theme.stroke).toBe('#ff00aa');
    expect(theme.fill).toBe('#ff00aa');
  });

  it('reacts to dark mode class toggle (text color variable)', () => {
    document.documentElement.classList.add('dark');
    document.documentElement.style.setProperty('--text-primary', '#ffffff');
    render(<CategoryRadarChart categories={sampleCategories} />);
    const theme = getChartTheme();
    expect(theme.text).toBe('#ffffff');
  });

  it('renders gracefully with empty categories array', () => {
    render(<CategoryRadarChart categories={[]} />);
    // Should still render container without throwing
    const container = document.querySelector('.radar-chart-container');
    expect(container).toBeTruthy();
  });

  describe('Custom Tooltip', () => {
    it('renders tooltip with category name and score when active', () => {
      const mockPayload = [
        {
          payload: {
            fullName: 'Access Management',
            score: 75
          }
        }
      ];

      render(<CustomTooltip active={true} payload={mockPayload} />);

      expect(screen.getByText('Access Management')).toBeDefined();
      expect(screen.getByText('75%')).toBeDefined();
    });

    it('renders null when not active', () => {
      const mockPayload = [
        {
          payload: {
            fullName: 'Network Security',
            score: 60
          }
        }
      ];

      const { container } = render(<CustomTooltip active={false} payload={mockPayload} />);

      expect(container.firstChild).toBeNull();
    });

    it('renders null when payload is empty', () => {
      const { container } = render(<CustomTooltip active={true} payload={[]} />);

      expect(container.firstChild).toBeNull();
    });

    it('renders null when payload is undefined', () => {
      const { container } = render(<CustomTooltip active={true} payload={undefined} />);

      expect(container.firstChild).toBeNull();
    });

    it('uses correct CSS classes for styling', () => {
      const mockPayload = [
        {
          payload: {
            fullName: 'Data Protection',
            score: 90
          }
        }
      ];

      const { container } = render(<CustomTooltip active={true} payload={mockPayload} />);

      expect(container.querySelector('.radar-tooltip')).toBeTruthy();
      expect(container.querySelector('.radar-tooltip-title')).toBeTruthy();
      expect(container.querySelector('.radar-tooltip-score')).toBeTruthy();
    });

    it('formats score with percentage symbol', () => {
      const mockPayload = [
        {
          payload: {
            fullName: 'Test Category',
            score: 42
          }
        }
      ];

      render(<CustomTooltip active={true} payload={mockPayload} />);

      const scoreElement = screen.getByText('42%');
      expect(scoreElement).toBeDefined();
    });

    it('buildChartData preserves fullName for tooltip', () => {
      const data = buildChartData(sampleCategories);

      // Verify each item has the fullName preserved for tooltip display
      expect(data[0].fullName).toBe('Access Management');
      expect(data[1].fullName).toBe('Network Security');
      expect(data[2].fullName).toBe('Data Protection');
    });

    it('buildChartData includes score for tooltip percentage', () => {
      const data = buildChartData(sampleCategories);

      // Verify scores match the input percentages
      expect(data[0].score).toBe(75);
      expect(data[1].score).toBe(60);
      expect(data[2].score).toBe(90);
    });

    it('buildChartData transforms category names with line breaks', () => {
      const testCategories = [
        { category: 'Access & Identity Management', percent: 80, total: 16, max: 20 },
      ];
      const data = buildChartData(testCategories);

      // Should replace " & " with " &\n" and " Management" with "\nMgmt"
      expect(data[0].category).toBe('Access &\nIdentity\nMgmt');
      expect(data[0].fullName).toBe('Access & Identity Management');
    });
  });
});
