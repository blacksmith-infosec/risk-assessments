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

  it('calculates partial scores correctly', () => {
    const answers = { q1: 'a' }; // 10 points out of 15 max
    const result = computeScore(answers, questions);
    expect(result.total).toBe(10);
    expect(result.max).toBe(15);
    expect(result.percent).toBe(66.67);
  });

  it('handles empty answers', () => {
    const answers = {};
    const result = computeScore(answers, questions);
    expect(result.total).toBe(0);
    expect(result.max).toBe(15);
    expect(result.percent).toBe(0);
  });

  it('handles empty questions array', () => {
    const answers = { q1: 'a' };
    const result = computeScore(answers, []);
    expect(result.total).toBe(0);
    expect(result.max).toBe(0);
    expect(result.percent).toBe(0);
  });

  it('calculates category scores correctly', () => {
    const answers = { q1: 'a', q2: 'a' };
    const result = computeScore(answers, questions);

    expect(result.categories).toHaveLength(2);

    const cat1 = result.categories.find((c) => c.category === 'cat1');
    expect(cat1).toBeDefined();
    expect(cat1!.total).toBe(10);
    expect(cat1!.max).toBe(10);
    expect(cat1!.percent).toBe(100);

    const cat2 = result.categories.find((c) => c.category === 'cat2');
    expect(cat2).toBeDefined();
    expect(cat2!.total).toBe(5);
    expect(cat2!.max).toBe(5);
    expect(cat2!.percent).toBe(100);
  });

  it('calculates partial category scores', () => {
    const answers = { q1: 'b', q2: 'a' }; // cat1: 0/10, cat2: 5/5
    const result = computeScore(answers, questions);

    const cat1 = result.categories.find((c) => c.category === 'cat1');
    expect(cat1!.total).toBe(0);
    expect(cat1!.max).toBe(10);
    expect(cat1!.percent).toBe(0);

    const cat2 = result.categories.find((c) => c.category === 'cat2');
    expect(cat2!.total).toBe(5);
    expect(cat2!.max).toBe(5);
    expect(cat2!.percent).toBe(100);
  });

  it('handles multiple questions in same category', () => {
    const multiCatQuestions: Question[] = [
      {
        id: 'q1',
        text: 'Q1',
        category: 'Security',
        options: [
          { label: 'A', value: 'a', risk: 'r1', points: 10 },
          { label: 'B', value: 'b', risk: 'r2', points: 5 },
        ]
      },
      {
        id: 'q2',
        text: 'Q2',
        category: 'Security',
        options: [
          { label: 'A', value: 'a', risk: 'r1', points: 20 },
          { label: 'B', value: 'b', risk: 'r2', points: 10 },
        ]
      },
    ];

    const answers = { q1: 'a', q2: 'a' };
    const result = computeScore(answers, multiCatQuestions);

    expect(result.categories).toHaveLength(1);
    const security = result.categories[0];
    expect(security.category).toBe('Security');
    expect(security.total).toBe(30);
    expect(security.max).toBe(30);
    expect(security.percent).toBe(100);
  });

  it('handles invalid answer values gracefully', () => {
    const answers = { q1: 'invalid', q2: 'a' };
    const result = computeScore(answers, questions);
    expect(result.total).toBe(5); // Only q2 counted
    expect(result.max).toBe(15);
    expect(result.percent).toBe(33.33);
  });

  it('handles questions with negative points', () => {
    const negativeQuestions: Question[] = [
      {
        id: 'q1',
        text: 'Q1',
        category: 'cat1',
        options: [
          { label: 'A', value: 'a', risk: 'r1', points: 10 },
          { label: 'B', value: 'b', risk: 'r2', points: -5 },
        ]
      },
    ];

    const answers = { q1: 'b' };
    const result = computeScore(answers, negativeQuestions);
    expect(result.total).toBe(-5);
    expect(result.max).toBe(10);
  });

  it('rounds percentages to 2 decimal places', () => {
    const answers = { q1: 'b', q2: 'a' }; // 5 out of 15
    const result = computeScore(answers, questions);
    expect(result.percent).toBe(33.33); // Not 33.333333...

    const cat1 = result.categories.find((c) => c.category === 'cat1');
    expect(cat1!.percent).toBe(0); // 0/10
  });

  it('handles questions with varying point values', () => {
    const varyingQuestions: Question[] = [
      {
        id: 'q1',
        text: 'Q1',
        category: 'cat1',
        options: [
          { label: 'A', value: 'a', risk: 'r1', points: 100 },
          { label: 'B', value: 'b', risk: 'r2', points: 50 },
          { label: 'C', value: 'c', risk: 'r3', points: 0 },
        ]
      },
    ];

    const answers = { q1: 'b' };
    const result = computeScore(answers, varyingQuestions);
    expect(result.total).toBe(50);
    expect(result.max).toBe(100);
    expect(result.percent).toBe(50);
  });

  it('handles zero max score edge case', () => {
    const zeroMaxQuestions: Question[] = [
      {
        id: 'q1',
        text: 'Q1',
        category: 'cat1',
        options: [
          { label: 'A', value: 'a', risk: 'r1', points: 0 },
          { label: 'B', value: 'b', risk: 'r2', points: 0 },
        ]
      },
    ];

    const answers = { q1: 'a' };
    const result = computeScore(answers, zeroMaxQuestions);
    expect(result.total).toBe(0);
    expect(result.max).toBe(0);
    expect(result.percent).toBe(0); // Should not divide by zero

    const cat1 = result.categories[0];
    expect(cat1.percent).toBe(0); // Category should also handle zero max
  });

  it('maintains category order from questions', () => {
    const orderedQuestions: Question[] = [
      {
        id: 'q1',
        text: 'Q1',
        category: 'Zebra',
        options: [{ label: 'A', value: 'a', risk: 'r1', points: 10 }]
      },
      {
        id: 'q2',
        text: 'Q2',
        category: 'Apple',
        options: [{ label: 'A', value: 'a', risk: 'r1', points: 5 }]
      },
      {
        id: 'q3',
        text: 'Q3',
        category: 'Banana',
        options: [{ label: 'A', value: 'a', risk: 'r1', points: 3 }]
      },
    ];

    const answers = { q1: 'a', q2: 'a', q3: 'a' };
    const result = computeScore(answers, orderedQuestions);

    // Categories should appear in the order they're first encountered
    expect(result.categories[0].category).toBe('Zebra');
    expect(result.categories[1].category).toBe('Apple');
    expect(result.categories[2].category).toBe('Banana');
  });
});
