import React, { useEffect, useState } from 'react';
import { getChartTheme } from '../../utils/theme';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

export interface CategoryScore {
  category: string;
  percent: number;
  total: number;
  max: number;
}

interface CategoryRadarChartProps {
  categories: CategoryScore[];
}

// Exported for testability: transforms raw categories into chart-ready data.
export const buildChartData = (items: CategoryScore[]) => items.map((c) => ({
  category: c.category.replace(/ & /g, ' &\n').replace(/ Management/g, '\nMgmt'),
  score: c.percent,
  fullName: c.category,
}));

const CategoryRadarChart: React.FC<CategoryRadarChartProps> = ({ categories }) => {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    // Detect dark mode from DOM
    const checkDarkMode = () => {
      setDarkMode(document.documentElement.classList.contains('dark'));
    };

    checkDarkMode();

    // Watch for changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  const chartData = buildChartData(categories);

  // Chart theme derived from CSS variables so users can customize colors centrally.
  // To adjust the chart palette, override the following CSS variables in styles.css or a theme file:
  //  --accent (controls stroke/fill)
  //  --lightgray (grid lines)
  //  --text-primary (labels)
  // For dark mode, toggling the 'dark' class on <html> swaps the variable set.
  const baseTheme = getChartTheme();
  // For dark mode we may want to override grid/text if CSS variables provide distinct values.
  const theme = {
    ...baseTheme,
    // If dark mode ensure text uses current computed primary text color.
    text: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || baseTheme.text,
    grid: darkMode
      ? getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim() || baseTheme.grid
      : baseTheme.grid,
  };

  interface TooltipProps {
    active?: boolean;
    payload?: Array<{ payload: { fullName: string; score: number } }>;
  }

  const CustomTooltip: React.FC<TooltipProps> = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className='radar-tooltip'>
          <p className='radar-tooltip-title'>
            {payload[0].payload.fullName}
          </p>
          <p className='radar-tooltip-score'>
            {payload[0].payload.score}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className='radar-chart-container'>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={chartData}>
          <PolarGrid stroke={theme.grid} />
          <PolarAngleAxis
            dataKey="category"
            tick={{ fill: theme.text, fontSize: 12 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: theme.text, fontSize: 11 }}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke={theme.stroke}
            fill={theme.fill}
            fillOpacity={0.6}
            strokeWidth={2}
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CategoryRadarChart;
