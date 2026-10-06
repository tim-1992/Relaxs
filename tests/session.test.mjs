import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSession, resolveSessionRoute } from '../src/session.js';
import { makeTrials, scoreAssessment } from '../src/assessment-data.js';

function assessment(gameId = 'harbor', mistakes = 0) {
  return scoreAssessment({
    gameId, choices: ['unfinished-action', 'noise-body', 'message-support'],
    trials: makeTrials(gameId).map((t, i) => ({
      ...t, response: i < mistakes ? (t.target === 'left' ? 'right' : 'left') : t.target,
      rtMs: t.target === null ? null : 600,
    })),
  });
}
test('an improved task score is not presented as reduced stress', () => {
  const result = summarizeSession(assessment('harbor', 9), assessment());
  assert.equal(result.delta, 50);
  assert.equal(result.direction, 'higher');
  assert.doesNotMatch(result.title + result.detail, /压力降低|减压成功|治愈/);
});
test('equal and decreased task scores are represented truthfully', () => {
  assert.equal(summarizeSession(assessment(), assessment()).direction, 'same');
  assert.equal(summarizeSession(assessment(), assessment('harbor', 9)).direction, 'lower');
});
test('incomplete and different-task results cannot produce a comparison', () => {
  assert.equal(summarizeSession(null, assessment()).delta, null);
  assert.equal(summarizeSession(assessment(), assessment('lantern')).direction, 'unpaired');
});
test('a partial assessment or forged numeric score cannot bypass entry', () => {
  for (const before of [null, 7, { score: 90 }, { gameId: 'harbor', trials: [] }]) {
    for (const route of ['spaces', 'arcade', 'play/basketball', 'result', 'choose']) {
      assert.equal(resolveSessionRoute(route, { before, complete: false }), 'checkin');
    }
  }
});
test('unfinished sessions cannot show historical results, completed sessions require restart', () => {
  const before = assessment();
  assert.equal(resolveSessionRoute('result', { before, complete: false }), 'checkin-result');
  assert.equal(resolveSessionRoute('play/breath', { before, complete: false }), 'play/breath');
  assert.equal(resolveSessionRoute('play/basketball', { before, complete: true }), 'result');
  assert.equal(resolveSessionRoute('corner', { before, complete: true }), 'corner');
});
