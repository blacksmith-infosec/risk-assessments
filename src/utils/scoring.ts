import { Question } from '../types/questions';

export interface CategoryScore {
  category: string;
  total: number; // points earned
  max: number;   // maximum possible
  percent: number; // 0-100
}

export interface ScoreResult {
  total: number;
  max: number;
  percent: number;
  categories: CategoryScore[];
}

export const computeScore = (answers: Record<string, string>, questions: Question[]): ScoreResult => {
  let total = 0;
  let max = 0;
  const categoryScoreMap: Record<string, { total: number; max: number }> = {};

  for (const q of questions) {
    const questionMax = Math.max(...q.options.map((o) => o.points));
    max += questionMax;
    if (!categoryScoreMap[q.category]) categoryScoreMap[q.category] = { total: 0, max: 0 };
    categoryScoreMap[q.category].max += questionMax;

    const chosen = answers[q.id];
    if (chosen) {
      const opt = q.options.find((o) => o.value === chosen);
      if (opt) {
        total += opt.points;
        categoryScoreMap[q.category].total += opt.points;
      }
    }
  }

  const categories: CategoryScore[] = Object.entries(categoryScoreMap).map(([category, v]) => ({
    category,
    total: v.total,
    max: v.max,
    percent: v.max === 0 ? 0 : +(100 * v.total / v.max).toFixed(2)
  }));

  return {
    total,
    max,
    percent: max === 0 ? 0 : +(100 * total / max).toFixed(2),
    categories
  };
};
