// Creator quizzes: an editor for the lab builders and a player for students after the experiment.
import { useState } from 'react';
import { api } from './api.js';

const MAX_QUESTIONS = 20, MAX_CHOICES = 6;
const blankQuestion = () => ({ q: '', choices: ['', ''], answer: 0, explain: '' });

export function QuizEditor({ quiz, onChange }) {
  const set = (i, patch) => onChange(quiz.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i, d) => { const next = quiz.slice(); [next[i], next[i + d]] = [next[i + d], next[i]]; onChange(next); };
  return <div className="quiz-editor">
    <h2>Quiz after the experiment</h2>
    <p>Students answer these once they have tried the lab. Answers stay on the server until a student submits, then each question shows your explanation. A quiz is optional.</p>
    {quiz.map((item, i) => <fieldset className="quiz-edit-item" key={i}>
      <legend>Question {i + 1}</legend>
      <label>Question<textarea value={item.q} rows={2} maxLength={300} onChange={e => set(i, { q: e.target.value })} placeholder="e.g. What happens to the current if you double the resistance?" /></label>
      <div className="quiz-edit-choices" role="radiogroup" aria-label={`Correct answer for question ${i + 1}`}>
        {item.choices.map((c, k) => <div className="quiz-edit-choice" key={k}>
          <input type="radio" name={`quiz-correct-${i}`} checked={item.answer === k} onChange={() => set(i, { answer: k })} aria-label={`Choice ${k + 1} is correct`} />
          <input value={c} maxLength={200} placeholder={`Choice ${k + 1}`} aria-label={`Question ${i + 1}, choice ${k + 1}`} onChange={e => set(i, { choices: item.choices.map((x, j) => (j === k ? e.target.value : x)) })} />
          {item.choices.length > 2 && <button type="button" className="platform-text" aria-label={`Remove choice ${k + 1}`} onClick={() => set(i, { choices: item.choices.filter((_, j) => j !== k), answer: item.answer === k ? 0 : item.answer > k ? item.answer - 1 : item.answer })}>Remove</button>}
        </div>)}
        {item.choices.length < MAX_CHOICES && <button type="button" className="platform-text" onClick={() => set(i, { choices: [...item.choices, ''] })}>+ Add a choice</button>}
        <small className="platform-help">Select the circle next to the correct answer.</small>
      </div>
      <label>Explanation shown after answering (optional)<textarea value={item.explain || ''} rows={2} maxLength={500} onChange={e => set(i, { explain: e.target.value })} /></label>
      <div className="quiz-edit-actions">
        <button type="button" className="platform-text" disabled={i === 0} onClick={() => move(i, -1)}>Move up</button>
        <button type="button" className="platform-text" disabled={i === quiz.length - 1} onClick={() => move(i, 1)}>Move down</button>
        <button type="button" className="platform-text danger" onClick={() => onChange(quiz.filter((_, j) => j !== i))}>Delete question</button>
      </div>
    </fieldset>)}
    {quiz.length < MAX_QUESTIONS && <button type="button" className="home-outline" onClick={() => onChange([...quiz, blankQuestion()])}>{quiz.length ? 'Add another question' : 'Add a quiz question'}</button>}
  </div>;
}

export function QuizPlayer({ lab, onDone }) {
  const quiz = lab.quiz || [];
  const [answers, setAnswers] = useState(() => quiz.map(() => null)), [result, setResult] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  if (!quiz.length) return null;
  const done = answers.filter(a => a !== null).length;
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try { const r = await api(`labs/${lab.id}/quiz`, 'POST', { answers }); setResult(r); onDone?.(r); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const retry = () => { setAnswers(quiz.map(() => null)); setResult(null); };
  return <form className="quiz-player" onSubmit={submit}>
    {result && <div className={'quiz-score' + (result.score === result.total ? ' perfect' : '')} role="status">
      <strong>{result.score} / {result.total}</strong>
      <span>{result.score === result.total ? 'Perfect. You understood this lab.' : result.score >= result.total / 2 ? 'Good work. Review the explanations below.' : 'Worth another look. Read the explanations, then try again.'}</span>
      <small>Best score {result.best} / {result.total} · {result.tries} {result.tries === 1 ? 'attempt' : 'attempts'}</small>
    </div>}
    <ol className="quiz-questions">{quiz.map((item, i) => {
      const r = result?.results[i];
      return <li key={i} className={r ? (r.correct ? 'right' : 'wrong') : ''}>
        <fieldset><legend>{item.q}</legend>
          {item.choices.map((c, k) => <label key={k} className={'quiz-choice' + (r && k === r.answer ? ' is-answer' : '') + (r && k === r.chosen && !r.correct ? ' is-wrong' : '')}>
            <input type="radio" name={`quiz-${lab.id}-${i}`} checked={answers[i] === k} disabled={!!result} onChange={() => setAnswers(a => a.map((x, j) => (j === i ? k : x)))} /> <span>{c}</span>
          </label>)}
          {r && <p className="quiz-feedback">{r.correct ? '✓ Correct.' : '✗ Not quite.'} {r.explain}</p>}
        </fieldset>
      </li>;
    })}</ol>
    {error && <div className="platform-error" role="alert">{error}</div>}
    {result ? <button type="button" className="home-outline" onClick={retry}>Try the quiz again</button>
      : <button className="home-primary" disabled={busy || done < quiz.length}>{busy ? 'Checking…' : done < quiz.length ? `Answer all questions (${done}/${quiz.length})` : 'Submit answers'}</button>}
  </form>;
}

// A modal wrapper used from inside the 3D labs.
export function QuizDialog({ lab, onClose }) {
  return <dialog className="platform-modal quiz-modal" ref={el => { if (el && !el.open) el.showModal(); }} onClose={onClose} onCancel={onClose}>
    <section className="platform-panel" role="dialog" aria-modal="true" aria-label="Lab quiz">
      <div className="quiz-modal-head"><div><div className="section-kicker">CHECK YOUR UNDERSTANDING</div><h2>{lab.title}</h2></div>
        <button type="button" className="home-outline" autoFocus onClick={onClose}>Back to experiment</button></div>
      <QuizPlayer lab={lab} />
    </section>
  </dialog>;
}
