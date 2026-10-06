import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryState, flipMemoryCard, settleMemoryTurn} from '../src/memory-state.js';

test('a new deck has six distinct pairs and no exposed cards', () => {
  const state = createMemoryState();
  assert.equal(state.cards.length, 12);
  for (let value = 0; value < 6; value++) assert.equal(state.cards.filter(card => card.value === value).length, 2);
  assert.deepEqual(state.open, []);
  assert.equal(state.complete, false);
});

test('mismatched cards block a third selection and can be turned back over', () => {
  const state = createMemoryState(() => .99);
  assert.equal(flipMemoryCard(state, 0), true);
  assert.equal(flipMemoryCard(state, 0), false);
  flipMemoryCard(state, 1);
  assert.equal(flipMemoryCard(state, 2), false);
  assert.equal(state.turns, 1);
  settleMemoryTurn(state);
  assert.deepEqual(state.open, []);
  assert.equal(state.pairs, 0);
});

test('all six pairs complete a round; matched cards and paused games ignore input', () => {
  const state = createMemoryState(() => .99);
  state.paused = true;
  assert.equal(flipMemoryCard(state, 0), false);
  state.paused = false;
  for (let value = 0; value < 6; value++) {
    const indices = state.cards.flatMap((card, index) => card.value === value ? [index] : []);
    indices.forEach(index => flipMemoryCard(state, index));
    settleMemoryTurn(state);
    assert.equal(flipMemoryCard(state, indices[0]), false);
  }
  assert.equal(state.pairs, 6);
  assert.equal(state.turns, 6);
  assert.equal(state.complete, true);
});
