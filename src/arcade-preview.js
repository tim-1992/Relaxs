import { mountArcade } from './arcade.js';
import { exercises } from './exercises.js';
import { icon } from './ui.js';

const games = exercises.filter(game => game.arcade);
const gameId = new URLSearchParams(location.search).get('game') || 'target';
const game = games.find(item => item.id === gameId);
const container = document.querySelector('#arcade-preview');
let cleanup = () => {};

document.querySelector('#preview-game-nav').innerHTML = games.map(item => {
  const href = item.id === 'basketball' ? '/hoops.html' : `/arcade.html?game=${item.id}`;
  return `<a href="${href}" ${item.id === gameId ? 'aria-current="page"' : ''}>${icon(item.id === 'target' ? 'focus' : item.id === 'prank' ? 'smile' : item.id === 'dodge' ? 'wind' : 'ball')}<span>${item.label.split(' · ').at(-1)}</span></a>`;
}).join('');
document.querySelector('#preview-title').textContent = game?.name || '暂时没有这个小游戏。';
document.title = `${game?.name || '动作游乐'} · Relaxs`;

function boot() {
  cleanup();
  cleanup = () => {};
  container.replaceChildren();
  if (game?.id === 'basketball') {
    location.replace('/hoops.html');
    return;
  }
  if (!game) {
    container.innerHTML = '<p>从上方选一款游戏，就能开始。</p>';
    return;
  }
  try {
    cleanup = mountArcade(game.id, container);
    const transport = container.querySelector('.arcade-transport');
    const tools = container.querySelector('.arcade-tools');
    if (transport && tools) tools.append(transport);
  } catch (error) {
    container.innerHTML = '<p>游戏暂时没能打开，请刷新重试，或从上方换一款游戏。</p>';
    console.error('Arcade preview failed to start', error);
  }
}

boot();
window.addEventListener('pagehide', () => cleanup());
window.addEventListener('pageshow', event => { if (event.persisted) boot(); });
