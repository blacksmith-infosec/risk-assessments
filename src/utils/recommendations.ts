import { Question } from '../types/questions';

export const mapRisks = (answers: Record<string, string>, questions: Question[]): string[] => {
  const risks = new Set<string>();
  for (const q of questions) {
    const value = answers[q.id];
    for (const option of q.options) {
      if (option.value === value) {
        risks.add(option.risk);
      }
    }
  }
  return Array.from(risks);
};
