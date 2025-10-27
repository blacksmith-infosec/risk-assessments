import { computeScore } from './scoring';
import type { Question } from '../types/questions';

describe('computeScore', () => {
  const questions: Question[] = [
    {
      id: 'q1',
      text: 'Q1',
      category: 'cat1',
      options: [
        {
          label: 'A',
          value: 'a',
          risk: 'risk1',
          points: 10,
        },
        {
          label: 'B',
          value: 'b',
          risk: 'risk1',
          points: 0,
        },
      ]
    },
    {
      id: 'q2',
      text: 'Q2',
      category: 'cat2',
      options: [
        {
          label: 'A',
          value: 'a',
          risk: 'risk1',
          points: 5,
        },
        {
          label: 'B',
          value: 'b',
          risk: 'risk1',
          points: 0
        }
      ],
    },
  ];

  it('calculates totals correctly', () => {
    const answers = { q1: 'a', q2: 'a' };
    const result = computeScore(answers, questions);
    expect(result.total).toBe(15);
    expect(result.max).toBe(15);
    expect(result.percent).toBe(100);
  });

  it('handles unanswered questions', () => {
    const answers = { q1: 'b' }; // 0 points selected
    const result = computeScore(answers, questions);
    expect(result.total).toBe(0);
    expect(result.max).toBe(15);
    expect(result.percent).toBe(0);
  });
});
