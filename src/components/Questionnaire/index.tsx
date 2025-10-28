import React, { useMemo } from 'react';
import { useAppState } from '../../context/AppStateContext';
import CategoryRadarChart from '../CategoryRadarChart';
import Footer from '../Footer';

const Questionnaire: React.FC = () => {
  const { questions, answers, setAnswer, score } = useAppState();

  // Calculate progress metrics
  const answeredCount = useMemo(() => {
    return Object.keys(answers).filter((key) => answers[key] !== '').length;
  }, [answers]);

  const totalQuestions = questions.length;
  const progressPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  // Determine color based on score
  const getScoreColor = (percent: number) => {
    if (percent >= 80) return 'score-excellent';
    if (percent >= 60) return 'score-good';
    if (percent >= 40) return 'score-fair';
    return 'score-poor';
  };

  return (
    <div className='panel questionnaire-panel'>
      <div className='questionnaire-header'>
        <div className='questionnaire-header-content'>
          <h2>Security Risk Assessment</h2>
        </div>
        <p className='questionnaire-subtitle'>
          Answer each question below to evaluate your security posture. Your risk score updates in real time.
        </p>
      </div>

      {/* Progress Section */}
      <div className='progress-section'>
        <div className='progress-stats'>
          <div className='stat-card'>
            <div className='stat-label'>Questions Answered</div>
            <div className='stat-value'>{answeredCount} / {totalQuestions}</div>
            <div className='stat-subtitle'>{progressPercent}% Complete</div>
          </div>
          <div className={`stat-card score-card ${getScoreColor(score.percent)}`}>
            <div className='stat-label'>Overall Security Score</div>
            <div className='stat-value-large'>{score.percent}%</div>
            <div className='stat-subtitle'>
              {score.percent >= 80 ? 'Excellent' :
               score.percent >= 60 ? 'Good' :
               score.percent >= 40 ? 'Fair' : 'Needs Improvement'}
            </div>
          </div>
        </div>
        <div className='progress-bar-container'>
          <div className='progress-bar' style={{ '--progress-width': `${progressPercent}%` } as React.CSSProperties} />
        </div>
      </div>

      {/* Questions */}
      <form className='question-list'>
        {questions.map((q, index) => (
          <div key={q.id} className='question-item-modern'>
            <div className='question-header'>
              <span className='question-number'>Q{index + 1}</span>
              <label htmlFor={q.id} className='question-text'>{q.text}</label>
            </div>
            <select
              id={q.id}
              value={answers[q.id] || ''}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              className={answers[q.id] ? 'answered' : ''}
            >
              <option value='' disabled>Select an answer...</option>
              {q.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        ))}
      </form>

      {/* Category Breakdown with Radar Chart */}
      <div className='category-breakdown-modern'>
        <h3>Category Analysis</h3>
        <p className='section-subtitle'>
          Visual breakdown of your security posture across key domains
        </p>
        <CategoryRadarChart categories={score.categories} />

        <div className='category-details'>
          {score.categories.map((c) => (
            <div key={c.category} className='category-detail-card'>
              <div className='category-detail-header'>
                <span className='category-name'>{c.category}</span>
                <span className={`category-score ${getScoreColor(c.percent)}`}>{c.percent}%</span>
              </div>
              <div className='category-progress-bar'>
                <div
                  className={`category-progress-fill ${getScoreColor(c.percent)}`}
                  style={{ '--progress-width': `${c.percent}%` } as React.CSSProperties}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Questionnaire;
