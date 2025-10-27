import { describe, it, expect, beforeEach } from 'vitest';
import { getChartTheme, getChartThemeWith } from './theme';

// We simulate CSS variables by attaching them to document.documentElement style.
// Vitest + jsdom environment allows setProperty/getPropertyValue via style objects.

describe('theme utility', () => {
  beforeEach(() => {
    // Reset any previously set inline styles
    document.documentElement.removeAttribute('style');
  });

  it('falls back to default values when variables are absent', () => {
    const theme = getChartTheme();
    expect(theme.stroke).toBe('#44C8F5');
    expect(theme.fill).toBe('#44C8F5');
    expect(theme.grid).toBe('#E8E8E8');
    expect(theme.text).toBe('#231F20');
  });

  it('reads CSS variables when set', () => {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--accent', '#123456');
    rootStyle.setProperty('--lightgray', '#abcdef');
    rootStyle.setProperty('--text-primary', '#111111');

    const theme = getChartTheme();
    expect(theme.stroke).toBe('#123456');
    expect(theme.fill).toBe('#123456');
    expect(theme.grid).toBe('#abcdef');
    expect(theme.text).toBe('#111111');
  });

  it('applies transform via getChartThemeWith', () => {
    const transformed = getChartThemeWith((t) => ({ ...t, stroke: 'hotpink' }));
    expect(transformed.stroke).toBe('hotpink');
    // untouched values still fallback
    expect(transformed.fill).toBe('#44C8F5');
  });

  it('handles partial variable definitions gracefully', () => {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--accent', '#654321'); // Only accent defined
    const theme = getChartTheme();
    expect(theme.stroke).toBe('#654321');
    expect(theme.fill).toBe('#654321');
    // grid/text fall back
    expect(theme.grid).toBe('#E8E8E8');
    expect(theme.text).toBe('#231F20');
  });
});
