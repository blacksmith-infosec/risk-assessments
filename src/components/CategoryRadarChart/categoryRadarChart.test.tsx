// NOTE: Requires @testing-library/react dev dependency. Install via:
//   npm install -D @testing-library/react
import React from 'react';
import { render } from '@testing-library/react';
import CategoryRadarChart, { buildChartData } from './index';
import { getChartTheme } from '../../utils/theme';

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
});
