export function createMemoryState(random = Math.random, difficulty = 'easy') {
  const [totalPairs, maxTurns] = {easy: [6, Infinity], standard: [8, 20], hard: [12, 28]}[difficulty] || [6, Infinity];
  const values = Array.from({length: totalPairs * 2}, (_, index) => index % totalPairs);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return {cards: values.map(value => ({value, matched: false})), totalPairs, maxTurns, open: [], pairs: 0, turns: 0, paused: false, complete: false, failed: false};
}

export function flipMemoryCard(state, index) {
  if (!Number.isInteger(index) || !state.cards[index] || state.paused || state.complete || state.failed ||
      state.open.length >= 2 || state.open.includes(index) || state.cards[index].matched) return false;
  state.open.push(index);
  if (state.open.length === 2) state.turns++;
  return true;
}

export function settleMemoryTurn(state) {
  if (state.open.length !== 2 || state.paused) return false;
  const [a, b] = state.open.map(index => state.cards[index]);
  const matched = a.value === b.value;
  if (matched) { a.matched = true; b.matched = true; state.pairs++; }
  state.open = [];
  state.complete = state.pairs === state.totalPairs;
  state.failed = !state.complete && state.turns >= state.maxTurns;
  return matched;
}
