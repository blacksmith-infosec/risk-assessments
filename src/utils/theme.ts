// Utility helpers for accessing CSS variable-driven theme values.
// This allows charts/components to derive their colors from the active stylesheet
// (including light/dark modes) instead of hardcoding hex codes.
// Customize by overriding the CSS variables in styles.css or a theme override.

export interface ChartTheme {
  stroke: string;
  fill: string;
  grid: string;
  text: string;
}

// Map CSS variable names to chart theme keys. Adjust variable names here if design changes.
const VAR_MAP: Record<keyof ChartTheme, string> = {
  stroke: '--accent',
  fill: '--accent',
  grid: '--lightgray',
  text: '--text-primary'
};

// Reads a CSS variable from :root (documentElement). Falls back to provided default.
const readVar = (varName: string, fallback: string): string => {
  if (typeof window === 'undefined' || !window.document?.documentElement) return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || fallback;
};

// Derive chart theme from CSS variables; provide sensible fallbacks mirroring existing defaults.
export const getChartTheme = (): ChartTheme => {
  return {
    stroke: readVar(VAR_MAP.stroke, '#44C8F5'),
    fill: readVar(VAR_MAP.fill, '#44C8F5'),
    grid: readVar(VAR_MAP.grid, '#E8E8E8'),
    text: readVar(VAR_MAP.text, '#231F20')
  };
};
