import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryState, flipMemoryCard, settleMemoryTurn} from '../src/memory-state.js';

test('difficulty expands the real memory deck and sets a finite turn budget', () => {
  for (const [difficulty, pairs, turns] of [['easy', 6, Infinity], ['standard', 8, 20], ['hard', 12, 28]]) {
    const state = createMemoryState(() => .99, difficulty);
    assert.equal(state.cards.length, pairs * 2);
    assert.equal(state.totalPairs, pairs);
    assert.equal(state.maxTurns, turns);
    for (let value = 0; value < pairs; value++) assert.equal(state.cards.filter(c => c.value === value).length, 2);
  }
});

test('exhausting the turn budget ends a round only after its second card is settled', () => {
  const state = createMemoryState(() => .99, 'standard');
  for (let i = 0; i < 20; i++) {
    assert.equal(flipMemoryCard(state, 0), true);
    assert.equal(flipMemoryCard(state, 1), true);
    assert.equal(state.failed, false);
    settleMemoryTurn(state);
  }
  assert.equal(state.failed, true);
  assert.equal(state.complete, false);
  assert.equal(flipMemoryCard(state, 2), false);
  assert.equal(state.turns, 20);
});

test('a last-turn final match wins instead of failing', () => {
  const state = createMemoryState(() => .99, 'hard');
  for (let value = 0; value < 11; value++) {
    state.cards.flatMap((c, i) => c.value === value ? [i] : []).forEach(i => flipMemoryCard(state, i));
    settleMemoryTurn(state);
  }
  state.turns = state.maxTurns - 1;
  state.cards.flatMap((c, i) => c.value === 11 ? [i] : []).forEach(i => flipMemoryCard(state, i));
  settleMemoryTurn(state);
  assert.equal(state.complete, true);
  assert.equal(state.failed, false);
  assert.equal(state.turns, 28);
});
