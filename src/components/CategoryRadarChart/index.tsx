import React, { useEffect, useState } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface CategoryScore {
  category: string;
  percent: number;
  total: number;
  max: number;
}

interface CategoryRadarChartProps {
  categories: CategoryScore[];
}

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

  // Transform data for recharts
  const chartData = categories.map((c) => ({
    category: c.category.replace(/ & /g, ' &\n').replace(/ Management/g, '\nMgmt'),
    score: c.percent,
    fullName: c.category
  }));

  const colors = {
    light: {
      stroke: '#44C8F5',
      fill: '#44C8F5',
      grid: '#E8E8E8',
      text: '#231F20'
    },
    dark: {
      stroke: '#44C8F5',
      fill: '#44C8F5',
      grid: '#3a3a3a',
      text: '#FFFFFF'
    }
  };

  const theme = darkMode ? colors.dark : colors.light;

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
