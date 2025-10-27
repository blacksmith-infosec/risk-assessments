import { describe, it, expect } from 'vitest';
import { mapRisks, RiskMappingResult } from './recommendations';
import { Question } from '../types/questions';

describe('mapRisks', () => {
  const questions: Question[] = [
    {
      id: 'q1',
      text: 'Question 1',
      category: 'category1',
      options: [
        { label: 'Low Risk', value: 'low', risk: 'low-risk', points: 0 },
        { label: 'High Risk', value: 'high', risk: 'high-risk', points: 10 },
      ],
    },
    {
      id: 'q2',
      text: 'Question 2',
      category: 'category1',
      options: [
        { label: 'Safe', value: 'safe', risk: 'safe-option', points: 0 },
        { label: 'Risky', value: 'risky', risk: 'risky-option', points: 5 },
      ],
    },
    {
      id: 'q3',
      text: 'Question 3',
      category: 'category2',
      options: [
        { label: 'Option A', value: 'a', risk: 'high-risk', points: 8 },
        { label: 'Option B', value: 'b', risk: 'medium-risk', points: 3 },
      ],
    },
  ];

  it('should return empty risks and bestPractices when no answers', () => {
    const result: RiskMappingResult = mapRisks({}, questions);
    expect(result.risks).toEqual([]);
    expect(result.bestPractices).toEqual([]);
  });

  it('should map single risk correctly (non-max points -> risk)', () => {
    const answers = { q2: 'risky' }; // max points for q2 is 5, selected option has 5 so it becomes best practice if risk string present
    const result = mapRisks(answers, questions);
    // For q2 options: safe(0), risky(5) -> selected is max so goes to bestPractices
    expect(result.risks).toEqual([]);
    expect(result.bestPractices).toContain('risky-option');
  });

  it('should separate bestPractices and risks appropriately', () => {
    const answers = { q1: 'high', q3: 'b' }; // q1 max points option (10) bestPractice; q3 option b has 3 vs max 8 so risk
    const result = mapRisks(answers, questions);
    expect(result.bestPractices).toContain('high-risk');
    expect(result.risks).toContain('medium-risk');
  });

  it('deduplicates bestPractices when multiple max-point answers share same risk text', () => {
    const extendedQuestions: Question[] = [
      ...questions,
      {
        id: 'q4',
        text: 'Question 4',
        category: 'category3',
        options: [
          { label: 'Good', value: 'good', risk: 'high-risk', points: 10 },
          { label: 'Bad', value: 'bad', risk: 'other-risk', points: 0 },
        ],
      },
    ];
    const answers = { q1: 'high', q4: 'good' }; // Both high-risk with max points
    const result = mapRisks(answers, extendedQuestions);
  expect(result.bestPractices.filter((r) => r === 'high-risk').length).toBe(1);
    expect(result.risks).toEqual([]);
  });

  it('should handle mixture of bestPractices and risks when all questions answered', () => {
    const answers = { q1: 'high', q2: 'safe', q3: 'b' }; // q1 high -> bestPractice, q2 safe not max -> risk (safe-option), q3 b not max -> risk
    const result = mapRisks(answers, questions);
    expect(result.bestPractices).toContain('high-risk');
    expect(result.risks).toContain('safe-option');
    expect(result.risks).toContain('medium-risk');
  });

  it('should ignore invalid answer values', () => {
    const answers = { q1: 'invalid-value', q2: 'safe' };
    const result = mapRisks(answers, questions);
    expect(result.risks).toContain('safe-option');
    expect(result.bestPractices).toEqual([]);
  });

  it('should handle empty questions array', () => {
    const answers = { q1: 'high' };
    const result = mapRisks(answers, []);
    expect(result.risks).toEqual([]);
    expect(result.bestPractices).toEqual([]);
  });

  it('should not treat max points answer with empty risk string as best practice', () => {
    const customQuestions: Question[] = [
      {
        id: 'q5',
        text: 'Question 5',
        category: 'category4',
        options: [
          { label: 'Max Empty', value: 'max', risk: '', points: 5 },
          { label: 'Lower', value: 'low', risk: 'some-risk', points: 1 },
        ],
      },
    ];
    const answers = { q5: 'max' };
    const result = mapRisks(answers, customQuestions);
    expect(result.bestPractices).toEqual([]);
    expect(result.risks).toEqual([]);
  });
});
