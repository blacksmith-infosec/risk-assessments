import React from 'react';
import { useAppState } from '../../context/AppStateContext';

const Questionnaire: React.FC = () => {
  const { questions, answers, setAnswer, score } = useAppState();

  return (
    <div className='panel'>
      <h2>Risk Questionnaire</h2>
      <p>Answer each question below. Your risk score updates in real time.</p>
      <div className='score-banner'>Overall Score: {score.percent}% ({score.total}/{score.max})</div>
      <form className='question-list'>
        {questions.map((q) => (
          <div key={q.id} className='question-item'>
            <label htmlFor={q.id} className='question-text'>{q.text}</label>
            <select
              id={q.id}
              value={answers[q.id] || ''}
              onChange={(e) => setAnswer(q.id, e.target.value)}
            >
              <option value='' disabled>Select an answer...</option>
              {q.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        ))}
      </form>
      <div className='category-breakdown'>
        <h3>Category Breakdown</h3>
        <ul>
          {score.categories.map((c) => (
            <li key={c.category}><strong>{c.category}</strong>: {c.percent}% ({c.total}/{c.max})</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Questionnaire;
