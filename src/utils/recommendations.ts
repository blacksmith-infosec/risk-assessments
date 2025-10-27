import { Question } from '../types/questions';

export interface RiskMappingResult {
  risks: string[];
  bestPractices: string[];
}

/**
 * Maps selected answers to either risk statements or best-practice confirmations.
 * Logic:
 *  - For each question, find selected option.
 *  - Determine highest point value among the question's options.
 *  - If selected option has the max points and has a non-empty risk string, treat it as a best practice followed.
 *    (We record the risk text into bestPractices list instead of risks.)
 *  - Otherwise add its risk string to risks (if non-empty).
 *  - Empty risk strings are ignored entirely.
 */
export const mapRisks = (answers: Record<string, string>, questions: Question[]): RiskMappingResult => {
  const risks = new Set<string>();
  const bestPractices = new Set<string>();
  for (const q of questions) {
    const selectedValue = answers[q.id];
    if (!selectedValue) continue;
    // Determine max points for this question.
    const maxPoints = q.options.reduce((m, o) => Math.max(m, o.points || 0), 0);
    const selectedOption = q.options.find((o) => o.value === selectedValue);
    if (!selectedOption) continue;
    const riskText = (selectedOption.risk || '').trim();
    if (!riskText) continue;
    const selectedPoints = selectedOption.points || 0;
    if (selectedPoints === maxPoints) {
      bestPractices.add(riskText);
    } else {
      risks.add(riskText);
    }
  }
  return { risks: Array.from(risks), bestPractices: Array.from(bestPractices) };
};
