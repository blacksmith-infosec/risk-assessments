export interface RawOption {
  option?: string;
  risk?: string;
  points?: number;
}
export interface RawQuestion {
  id: string;
  text: string;
  category: string;
  recommendationMap?: Record<string, string[]>;
  options?: RawOption[];
}
export interface AnswerOption {
  label: string;
  value: string;
  risk: string;
  points: number; // Raw point contribution for this answer
}

export interface Question {
  id: string; // Unique stable id (snake_case recommended)
  text: string; // Human readable question text
  category: string; // Category grouping for breakdown (e.g. identity, network, email)
  options: AnswerOption[]; // Dropdown options
}

export interface QuestionnaireData {
  questions: Question[];
}
