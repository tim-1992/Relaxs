export const GAME_DIFFICULTIES = [
  {id: 'easy', label: '轻松', note: '先熟悉玩法'},
  {id: 'standard', label: '挑战', note: '想好再行动'},
  {id: 'hard', label: '进阶', note: '多想一步'},
];

export function mountDifficulty(container, selected, onChange, {timed = false} = {}) {
  const root = document.createElement('details');
  root.className = 'game-difficulty experience-shell';
  root.innerHTML = `<summary>难度 · ${GAME_DIFFICULTIES.find(item=>item.id===selected)?.label||'挑战'} <span>⌄</span></summary><div class="difficulty-caption"><p>切换难度会重新开始。</p></div>
    <div class="difficulty-options" role="group" aria-label="游戏难度">${GAME_DIFFICULTIES.map(item => `<button type="button" data-difficulty="${item.id}" aria-pressed="${item.id === selected}"><strong>${item.label}</strong><small>${item.note}</small></button>`).join('')}</div>`;
  const click = event => {
    const button = event.target.closest('[data-difficulty]');
    if (button && button.dataset.difficulty !== selected) onChange(button.dataset.difficulty);
  };
  root.addEventListener('click', click);
  container.append(root);
  return () => { root.removeEventListener('click', click); root.remove(); };
}
