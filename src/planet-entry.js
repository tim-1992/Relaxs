import {planets, readPlanetRoute, stepPlanet, planetShortcut} from './planet-state.js';
import {createPlanetScene} from './planet-scene.js';
import {gameCatalog, mountGameLibrary} from './game-library.js';
import {mountDestruction} from './destruction-hub.js';
import {mountMoles} from './moles-experience.js';
import {mountMemory} from './memory-game.js';
import {mountHoops} from './hoops.js';
import {mountCalm} from './calm-experience.js';
import {mountRelease} from './slice-experience.js';
import {mountDifficulty} from './game-difficulty.js';
import {mountRide} from './ride-experience.js';
import {mountDive} from './dive-experience.js';
import {loadTripoAsset} from './tripo-assets.js';

const $ = id => document.getElementById(id);
const host = $('experience-mount');
let route = readPlanetRoute(location.hash);
let scene = null, cleanupExperience = null, disposed = false;
let sceneCanvas = null, canvasUsed = false, recoveryTimer = 0, recoveryAttempts = 0;
const originalKeyboardHint = $('keyboard-hint').innerHTML;
const announce = text => { $('planet-announcement').textContent = text; };
const difficulties = new Map();

function disposeScene() {
  clearTimeout(recoveryTimer); recoveryTimer = 0;
  // Detach before deliberately releasing a context, so teardown cannot retry.
  sceneCanvas?.removeEventListener('webglcontextlost', contextLost);
  sceneCanvas = null;
  const previous = scene; scene = null;
  previous?.dispose();
}

function retryScene() {
  if (disposed || route.view !== 'orbit' || recoveryTimer || recoveryAttempts >= 2) return;
  recoveryAttempts++;
  recoveryTimer = setTimeout(() => {
    recoveryTimer = 0;
    initScene();
  }, recoveryAttempts * 450);
}

function contextLost(event) {
  event.preventDefault();
  disposeScene();
  document.body.classList.add('no-webgl');
  $('render-notice').hidden = route.view !== 'orbit';
  retryScene();
}

function initScene() {
  if (scene || disposed || route.view !== 'orbit' || document.hidden) return;
  // A disposed/lost WebGL canvas must not be reused for a new renderer.
  let canvas = $('planet-canvas');
  if (canvasUsed) {
    const fresh = canvas.cloneNode(false);
    canvas.replaceWith(fresh);
    canvas = fresh;
  }
  canvasUsed = true;
  try {
    scene = createPlanetScene(canvas);
    sceneCanvas = canvas;
    canvas.addEventListener('webglcontextlost', contextLost);
    scene.select(route.planet, true);
    document.body.classList.remove('no-webgl');
    $('render-notice').hidden = true;
  } catch (error) {
    disposeScene();
    console.warn('3D lobby interrupted; retrying with a fresh canvas.', error);
    document.body.classList.add('no-webgl');
    $('render-notice').hidden = false;
    retryScene();
  }
}

function back() {
  location.hash = route.game ? `#planet/${route.planet}` : `#orbit/${route.planet}`;
}

function mountHoopsGame(difficulty,tripoCharacter,tripoTree) {
  const shell = document.createElement('section');
  shell.className = 'experience-shell embedded-game';
  host.append(shell);
  const heading = document.createElement('h1');
  heading.className = 'sr-only'; heading.tabIndex = -1; heading.textContent = '落日投篮';
  shell.append(heading);
  const dispose = mountHoops(shell, {onExit: back, embedded: true, difficulty,tripoCharacter,tripoTree});
  return () => { dispose(); shell.remove(); };
}

function mountExperience() {
  const options = {onExit: back, onAnnounce: announce};
  if (!route.game) return mountGameLibrary(host,route.planet);
  if (route.game === 'breath') return mountCalm(host, options);
  const difficulty = difficulties.get(route.game) || 'standard';
  const disposeSelector = route.game==='dive'?()=>{}:mountDifficulty(host, difficulty, next => {
    difficulties.set(route.game, next);
    render();
    host.querySelector(`[data-difficulty="${next}"]`)?.focus({preventScroll: true});
    announce('难度已切换，新的一轮开始了。');
  }, {timed: ['moles','ride'].includes(route.game)});
  const game=route.game;
  const ids={demolition:['sofa','tv','vase','car'],hoops:['player','pine'],moles:['monster'],ride:['motorcycle','pine','rider'],dive:['turtle','coral','manta','dolphin','clownfish','angelfish','seafan','tablecoral','anemone'],memory:[],slice:['orange']}[game]||[];
  let active=true,disposeGame=null;
  const loading=document.createElement('section');
  loading.className='experience-loading';
  loading.innerHTML='<span class="loading-orbit" aria-hidden="true"></span><h1 tabindex="-1">正在点亮小世界</h1><p>模型与光影，正在就位。</p>';
  host.append(loading);
  Promise.allSettled(ids.map(id=>loadTripoAsset(id))).then(results=>{
    if(!active)return;
    const assets=Object.fromEntries(ids.map((id,i)=>[id,results[i].status==='fulfilled'?results[i].value:null]));
    loading.remove();
    try {
      disposeGame=game==='demolition'?mountDestruction(host,{...options,difficulty,tripoAssets:{vase:assets.vase,screen:assets.tv,sofa:assets.sofa,car:assets.car}})
        :game==='hoops'?mountHoopsGame(difficulty,assets.player,assets.pine)
        :game==='memory'?mountMemory(host,{...options,difficulty})
        :game==='moles'?mountMoles(host,{...options,difficulty,initialCharacter:assets.monster})
        :game==='ride'?mountRide(host,{...options,difficulty,tripoVehicle:assets.motorcycle,tripoTree:assets.pine,tripoRider:assets.rider})
        :game==='dive'?mountDive(host,{...options,tripoAssets:assets})
        :mountRelease(host,{...options,difficulty,tripoAsset:assets.orange});
      if(results.some(result=>result.status==='rejected'))announce('部分模型未能读取，可以返回后重试。');
    }catch(error){
      console.error('Experience could not start',error);
      loading.innerHTML='<h1 tabindex="-1">小世界暂时没准备好</h1><p>请返回后重试。</p>';host.append(loading);
    }
  });
  return () => {active=false;disposeGame?.();loading.remove();disposeSelector();};
}

function render({initial = false} = {}) {
  cleanupExperience?.();
  cleanupExperience = null;
  host.replaceChildren();
  const planet = planets.find(item => item.id === route.planet);
  const entered = route.view === 'planet';
  const game = gameCatalog.find(item => item.id === route.game);
  document.body.dataset.planet = planet.id;
  document.body.dataset.view = route.view;
  document.body.dataset.game = route.game || '';
  document.documentElement.style.setProperty('--accent', planet.color);
  document.title = entered ? `${game?.title || planet.name} · Relaxs` : 'Relaxs · 你的片刻小宇宙';
  for (const id of ['lobby-heading', 'planet-stage', 'planet-info']) $(id).hidden = entered;
  $('back-to-orbit').hidden = !entered;
  $('back-to-orbit').innerHTML = `<span aria-hidden="true">↖</span> ${route.game ? '返回游戏' : '返回星球'}`;
  document.querySelector('.header-note').hidden = entered;
  host.hidden = !entered;
  $('keyboard-hint').innerHTML = entered ? `<span>${route.game ? '玩好了，就换一个小世界' : '随时可以，回到星球'}</span>` : originalKeyboardHint;
  const skip = document.querySelector('.skip-link');
  skip.href = entered ? '#experience-mount' : '#planet-info';
  skip.textContent = entered ? '跳到当前体验' : '跳到星球选择';
  if (entered) {
    disposeScene();
    recoveryAttempts = 0;
    cleanupExperience = mountExperience();
    host.querySelector('h1')?.focus({preventScroll: true});
    window.scrollTo({top: 0, behavior: 'instant'});
  } else {
    initScene();
    scene?.setActive(true);
    $('planet-number').textContent = String(planets.indexOf(planet) + 1).padStart(2, '0');
    $('planet-english').textContent = planet.english;
    $('planet-name').textContent = planet.name;
    $('planet-description').textContent = planet.description;
    $('enter-label').textContent = planet.invitation;
    $('selected-planet').setAttribute('aria-label', `进入${planet.name}`);
    for (const [button, direction] of [[$('previous-planet'), -1], [$('next-planet'), 1]]) {
      const neighbor = planets.find(item => item.id === stepPlanet(planet.id, direction));
      button.setAttribute('aria-label', `选择${neighbor.name}星球`);
      button.querySelector('.neighbor-label').textContent = neighbor.name;
    }
    document.querySelectorAll('[data-select]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.select === planet.id)));
    scene?.leave();
    scene?.select(planet.id, initial);
    if (!initial) $('enter-planet').focus({preventScroll: true});
  }
  $('render-notice').hidden = entered || Boolean(scene);
  if (!initial) announce(`${entered ? '已进入' : '已选择'}${game?.title || planet.name}。`);
}

function choose(id) {
  if (route.view !== 'orbit' || !planets.some(planet => planet.id === id)) return;
  route = {view: 'orbit', planet: id};
  history.replaceState(null, '', `#orbit/${id}`);
  render();
}
function step(direction) { choose(stepPlanet(route.planet, direction)); }
function enter() { if (route.view === 'orbit') location.hash = `planet/${route.planet}`; }

const events = new AbortController();
const on = (target, type, handler) => target.addEventListener(type, handler, {signal: events.signal});
on($('previous-arrow'), 'click', () => step(-1));
on($('next-arrow'), 'click', () => step(1));
on($('previous-planet'), 'click', () => step(-1));
on($('next-planet'), 'click', () => step(1));
on($('selected-planet'), 'click', enter);
on($('enter-planet'), 'click', enter);
on($('back-to-orbit'), 'click', back);
document.querySelectorAll('[data-select]').forEach(button => on(button, 'click', () => choose(button.dataset.select)));
on(document.querySelector('.skip-link'), 'click', event => {
  event.preventDefault();
  const target = route.view === 'planet' ? host.querySelector('h1') : $('planet-info');
  target?.focus();
  target?.scrollIntoView({block: 'nearest'});
});
on(document, 'keydown', event => {
  if (document.querySelector('dialog[open]')) return;
  const action = planetShortcut(event, route.view);
  if (!action) return;
  event.preventDefault();
  if (action === 'previous') step(-1);
  if (action === 'next') step(1);
  if (action === 'enter') enter();
  if (action === 'back') back();
});
on(window, 'hashchange', () => { route = readPlanetRoute(location.hash); render(); });
on($('retry-planets'), 'click', () => {
  disposeScene(); recoveryAttempts = 0; initScene();
});
on(document, 'visibilitychange', () => {
  if (!document.hidden && !scene && route.view === 'orbit' && !disposed) {
    clearTimeout(recoveryTimer); recoveryTimer = 0;
    recoveryAttempts = 0; initScene();
  }
});
on(window, 'pagehide', () => {
  disposed = true;
  cleanupExperience?.(); cleanupExperience = null;
  disposeScene();
});
on(window, 'pageshow', event => {
  if (!event.persisted || !disposed) return;
  disposed = false; recoveryAttempts = 0;
  route = readPlanetRoute(location.hash); render({initial: true});
});
render({initial: true});
