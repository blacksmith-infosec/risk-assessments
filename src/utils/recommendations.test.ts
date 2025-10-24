import { describe, it, expect } from 'vitest';
import { mapRisks } from './recommendations';
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

  it('should return empty array when no answers', () => {
    const result = mapRisks({}, questions);
    expect(result).toEqual([]);
  });

  it('should map single risk correctly', () => {
    const answers = { q1: 'high' };
    const result = mapRisks(answers, questions);
    expect(result).toContain('high-risk');
    expect(result.length).toBe(1);
  });

  it('should map multiple different risks', () => {
    const answers = { q1: 'high', q2: 'risky' };
    const result = mapRisks(answers, questions);
    expect(result).toContain('high-risk');
    expect(result).toContain('risky-option');
    expect(result.length).toBe(2);
  });

  it('should deduplicate same risk from multiple questions', () => {
    const answers = { q1: 'high', q3: 'a' }; // Both have 'high-risk'
    const result = mapRisks(answers, questions);
    expect(result).toContain('high-risk');
    expect(result.length).toBe(1);
  });

  it('should handle all questions answered', () => {
    const answers = { q1: 'low', q2: 'safe', q3: 'b' };
    const result = mapRisks(answers, questions);
    expect(result).toContain('low-risk');
    expect(result).toContain('safe-option');
    expect(result).toContain('medium-risk');
    expect(result.length).toBe(3);
  });

  it('should ignore invalid answer values', () => {
    const answers = { q1: 'invalid-value', q2: 'safe' };
    const result = mapRisks(answers, questions);
    expect(result).toContain('safe-option');
    expect(result.length).toBe(1);
  });

  it('should handle empty questions array', () => {
    const answers = { q1: 'high' };
    const result = mapRisks(answers, []);
    expect(result).toEqual([]);
  });
});
