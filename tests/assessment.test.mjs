import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTrials, scoreAssessment, isAssessment } from '../src/assessment-data.js';

const choices = ['unfinished-action', 'noise-body', 'message-support'];
const payload = (gameId, respond) => ({
  gameId, choices,
  trials: makeTrials(gameId, {random: () => 0.5}).map((t, i) => {
    const response = respond(t, i);
    return {...t, response, rtMs: response === null ? null : 400 + i * 10};
  }),
});
test('fresh orders retain matching difficulty and balanced directions for retests', () => {
  const first = makeTrials('harbor', {random: () => 0.2});
  const second = makeTrials('harbor', {random: () => 0.8});
  assert.equal(first.length, 18);
  assert.equal(first.filter(t => t.kind === 'conflict').length, 9);
  assert.equal(second.filter(t => t.target === 'left').length, 9);
  assert.notDeepEqual(first, second);
  assert.equal(makeTrials('lantern').filter(t => t.kind === 'stop').length, 6);
  assert.equal(makeTrials('harbor', {practice:true}).length, 4);
});
test('harbor counts wrong directions and omissions without speed bonuses', () => {
  const input = payload('harbor', (t, i) => i < 9 ? t.target : null);
  const result = scoreAssessment(input);
  assert.equal(result.score, 50);
  assert.equal(result.correct, 9);
  assert.equal(result.missed, 9);
  assert.equal(result.medianRt, 440);
  assert.equal(isAssessment(result), true);
  const fast = scoreAssessment({...input, trials:input.trials.map(t => ({...t, rtMs:t.response ? 150 : null}))});
  assert.equal(fast.score, result.score);
});
test('tapping every lantern cannot exploit the larger number of go targets', () => {
  const result = scoreAssessment(payload('lantern', () => 'tap'));
  assert.equal(result.correct, 12);
  assert.equal(result.falseAlarms, 6);
  assert.equal(result.score, 50);
  assert.equal(scoreAssessment(payload('lantern', t => t.target)).score, 100);
});
test('missing interaction, incomplete trials and mismatched story answers have no score', () => {
  const input = payload('harbor', t => t.target);
  assert.equal(scoreAssessment(payload('lantern', () => null)), null);
  assert.equal(scoreAssessment({...input, trials:input.trials.slice(0, 17)}), null);
  assert.equal(scoreAssessment({...input, choices:[]}), null);
  assert.equal(scoreAssessment({...input, choices:['bad', ...choices.slice(1)]}), null);
  assert.equal(isAssessment({score:100}), false);
  assert.equal(isAssessment(null), false);
});
test('malformed or late response times cannot silently enter results', () => {
  const input = payload('harbor', t => t.target);
  for (const rtMs of [NaN, Infinity, -1, 2000, null]) {
    assert.equal(scoreAssessment({...input,trials:input.trials.map((t,i)=>i===0?{...t,rtMs}:t)}), null);
  }
});
test('holes in an eighteen-slot array do not count as completed trials', () => {
  const input = payload('harbor', t => t.target);
  input.trials.forEach((t,i)=>{
    if(t.kind==='congruent' && t.target==='right') delete input.trials[i];
  });
  assert.equal(scoreAssessment(input), null);
});
test('a valid zero score remains a completed assessment', () => {
  const result = scoreAssessment(payload('harbor', t => t.target === 'left' ? 'right' : 'left'));
  assert.equal(result.score, 0);
  assert.equal(result.medianRt, null);
  assert.equal(isAssessment(result), true);
});
test('recommendations follow selected needs and are not altered by game mistakes', () => {
  const input = payload('harbor', t => t.target);
  input.choices = ['unfinished-action', 'noise-action', 'message-support'];
  const perfect = scoreAssessment(input);
  const wrong = scoreAssessment({...input, trials:input.trials.map(t=>({...t,response:t.target==='left'?'right':'left'}))});
  assert.equal(perfect.recommendation.category, 'action');
  assert.deepEqual(perfect.recommendation, wrong.recommendation);
});
