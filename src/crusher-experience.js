import {
  CRUSHER_TARGETS, CRUSHER_DIFFICULTIES, createCrusherState, selectCrusherTarget,
  feedCrusher, beginCrusherPressure, releaseCrusherPressure, cancelCrusherPressure,
  stepCrusher, getCrusherBand, getCrusherVisual, pauseCrusher, resumeCrusher,
  nextCrusher, replayCrusher,
} from './crusher-state.js';
import {createCrusherScene} from './crusher-scene.js';
import {createReleaseAudio} from './release-audio.js';

let mountId = 0;
const RUNNING = new Set(['feeding', 'charging', 'pressing', 'breaking', 'ejecting']);
const ICONS = {
  car: '<path d="M8 27h48v13H8zM18 27l6-12h18l9 12"/><path d="M27 17v10m13-10 4 10"/><circle cx="19" cy="40" r="6"/><circle cx="47" cy="40" r="6"/>',
  sofa: '<path d="M13 29V15q0-5 5-5h29q5 0 5 5v14M13 37h39v8H13zM23 18v18m19-18v18"/><path d="M7 26h10v16H7zM47 26h10v16H47zM15 45v5m35-5v5"/>',
  tv: '<rect x="10" y="15" width="46" height="32" rx="5"/><rect x="15" y="20" width="28" height="21" rx="4"/><path d="m24 5 9 10L43 5M17 47v4m31-4v4M23 29h3m7 0h3M27 35h6"/><circle cx="49" cy="25" r="2"/><path d="M47 33h4m-4 5h4"/>',
};
const objectName = target => target.id === 'car' ? '旧轿车' : target.name;

/** Mount inside the demolition hub; the host loads crusher.css once.
 * The returned cleanup is idempotent and is also called before onExit.
 */
export function mountCrusher(container, {
  difficulty = 'standard', onExit = () => {}, onAnnounce = () => {}, tripoAssets = {},
} = {}) {
  const doc = container.ownerDocument, win = doc.defaultView;
  const uid = `crusher-${++mountId}`;
  const abort = new AbortController();
  const audio = createReleaseAudio();
  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let state = createCrusherState({difficulty});
  let scene = null, observer = null, frame = 0, previousTime = null, disposed = false;
  let inputOwner = null, soundOn = false, soundPending = false, fallbackActive = false;
  let soundWanted = true;
  let lastSignature = '', lastPhase = '', lastSoundAttempt = 0, lastBandCue = 0;
  let tapMode = false;
  let carAssetStatus = 'local', carAssetName = '';
  const root = doc.createElement('section');
  root.className = 'experience-shell crusher-experience';
  root.setAttribute('aria-labelledby', `${uid}-title`);
  root.innerHTML = `
    <header class="crusher-heading">
      <div><p class="crusher-eyebrow"><span>CRUSHER / 小小解压工坊</span><i></i>让压力，变成一小块</p>
        <h1 id="${uid}-title" tabindex="-1">压一压工坊<span>。</span></h1>
        <p>送进去，蓄点力。松开的那一下，刚刚好。<br><span data-stat="asset" role="status" aria-live="polite">本地车型</span></p></div>
      <div class="crusher-modes" role="group" aria-label="工坊玩法">
        <button type="button" data-action="orders" aria-pressed="true">三件小订单</button>
        <button type="button" data-action="practice" aria-pressed="false">随心压</button>
      </div>
    </header>
    <div class="crusher-picks" role="group" aria-label="选择待压物件">
      ${CRUSHER_TARGETS.map((target, i) => `<button type="button" data-target="${target.id}" aria-pressed="${i === 0}">
        <svg viewBox="0 0 64 56" aria-hidden="true">${ICONS[target.id]}</svg>
        <span><strong>${objectName(target)}</strong><small>${target.material}</small></span>
        <em data-order="${target.id}" aria-hidden="true">0${i + 1}</em></button>`).join('')}
    </div>
    <div class="crusher-board">
      <div class="crusher-hud">
        <div><span data-stat="order-label">小订单</span><strong data-stat="orders">0 / 3</strong></div>
        <div><span>工坊积分</span><strong data-stat="score">0</strong></div>
        <span class="crusher-difficulty">${CRUSHER_DIFFICULTIES[state.difficulty].name}<b data-stat="stage">单次压实</b></span>
      </div>
      <div class="crusher-arena" tabindex="0" role="group" aria-label="液压机与传送带" aria-describedby="${uid}-instructions">
        <canvas class="crusher-canvas" aria-hidden="true"></canvas>
        <div class="crusher-fallback" aria-hidden="true" hidden>
          <span class="crusher-fallback-note">简化工坊 · 玩法完全相同</span>
          <div class="crusher-diagram">
            <div class="crusher-diagram-beam"></div><div class="crusher-diagram-columns"></div>
            <div class="crusher-diagram-ram"></div><div class="crusher-diagram-press"></div>
            <div class="crusher-diagram-belt"></div>
            <div class="crusher-diagram-load">
              <div class="crusher-toy-shape"><i></i><i></i><i></i><i></i><i></i></div>
              <div class="crusher-diagram-fragments"><i></i><i></i><i></i><i></i><i></i><i></i></div>
            </div>
            <span class="crusher-diagram-in">进料 →</span><span class="crusher-diagram-out">→ 出料</span>
          </div>
        </div>
        <div class="crusher-stage-mark" aria-hidden="true"><span>RELAXS HEAVY INDUSTRIES</span><b>01 / MINI PRESS</b></div>
        <div class="crusher-scene-caption"><span data-stat="phase">等待进料</span><span data-stat="damage">完整小物件</span></div>
        <div class="crusher-paused" hidden><span>TAKE YOUR TIME</span><h2>机器也歇一会。</h2>
          <p>进度已保留。回来后重新蓄力就好。</p><button type="button" data-action="resume">继续工坊 ↗</button></div>
      </div>
      <div class="crusher-console">
        <div class="crusher-pressure-heading"><div><span>液压蓄力</span><strong data-stat="pressure">0<small>%</small></strong></div>
          <p><span data-stat="material"></span><b data-stat="band"></b></p></div>
        <div class="crusher-meter" role="meter" aria-label="液压压力" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="crusher-meter-fill"></div><div class="crusher-meter-band"><span>松开区</span></div>
          <div class="crusher-meter-needle"></div>
        </div>
        <div class="crusher-scale" aria-hidden="true"><span>0</span><span>25</span><span>50</span><span>75</span><span>100%</span></div>
        <div class="crusher-control-row">
          <button type="button" class="crusher-feed" data-action="feed"><span>01</span>送上传送带 <b aria-hidden="true">→</b></button>
          <button type="button" class="crusher-press" data-action="press" disabled aria-describedby="${uid}-instructions">
            <span aria-hidden="true">↓</span><strong data-stat="press-label">按住蓄力 · 松开压下</strong><kbd>SPACE</kbd></button>
        </div>
        <p class="crusher-instructions" id="${uid}-instructions">先送上传送带，再按住蓄力；白线进入标记区时松开。空格可按住，Enter 可开始／停止。</p>
        <button type="button" class="crusher-input-mode" data-action="tap" aria-pressed="false">点按蓄力 / 再点压下：关</button>
      </div>
    </div>
    <div class="crusher-result" hidden>
      <div><span data-result="kicker">NICELY CRUSHED</span><h2 tabindex="-1"></h2><p data-result="copy"></p></div>
      <div><button type="button" data-action="next">下一件 ↗</button><button type="button" data-action="replay">全部重玩</button></div>
    </div>
    <div class="crusher-toolbar">
      <p class="crusher-status" role="status" aria-live="polite" aria-atomic="true"></p>
      <div><button type="button" data-action="pause">Ⅱ 暂停</button><button type="button" data-action="reset">↺ 重来</button>
        <button type="button" data-action="sound" aria-pressed="true">声音：开</button></div>
    </div>
    <details class="crusher-help"><summary>工坊手册 · 操作与小窍门 <span aria-hidden="true">＋</span></summary>
      <p>每件材料都有自己的松开区；压力不足或过高只会留下凹痕，等压头抬起后可以继续尝试，没有倒计时，也不扣分。三件订单完成后可以全部重玩，「随心压」能无限练习。</p>
      <p>挑战模式需要连续命中两道工序：先预压，再压实。每道工序的压力区不同；失误会回到第一道，材料上的凹痕仍会保留。轻松模式的松开区更宽。</p>
      <p>键盘：聚焦机器区域或蓄力按钮，按住空格蓄力，松开压下；P 暂停。读屏点击蓄力按钮可开始／停止。切换窗口会自动暂停，返回后点击继续。</p>
    </details>
    <footer class="crusher-footer"><span>一件一件来，今天不用赶工。</span><button type="button" data-action="exit">返回拆家大厅 ↗</button></footer>`;
  container.append(root);
  const $ = selector => root.querySelector(selector);
  const button = action => $(`[data-action="${action}"]`);
  const stat = name => $(`[data-stat="${name}"]`);
  const arena = $('.crusher-arena'), canvas = $('.crusher-canvas'), hold = button('press');
  const fallback = $('.crusher-fallback'), meter = $('.crusher-meter'), status = $('.crusher-status');
  const result = $('.crusher-result');
  const listen = (target, type, handler, options = {}) => target.addEventListener(type, handler, {...options, signal: abort.signal});
  const now = () => win.performance.now();
  const target = () => CRUSHER_TARGETS.find(item => item.id === state.target);
  const phaseLabels = {ready: '等待进料', feeding: '传送带运转中', armed: '压头就位',
    charging: '正在蓄力', pressing: '液压机下压', breaking: '咔嚓，散开了', ejecting: '碎片正在出料',
    result: '这一件，压好了', complete: '三件订单已完成'};

  function announce(message) {
    if (disposed || status.textContent === message) return;
    status.textContent = message;
    onAnnounce(message);
  }
  function syncSoundButton() {
    button('sound').setAttribute('aria-pressed', String(soundWanted));
    button('sound').textContent = soundWanted ? '声音：开' : '声音：关';
  }
  async function playGesture(note = 3, strength = .2) {
    if (disposed || !soundWanted || soundPending) return;
    if (!soundOn) {
      soundPending = true;
      // Called directly by feed / pointer / keyboard handlers, before awaiting
      // anything, so AudioContext creation/resume has browser user activation.
      try {soundOn = await audio.enable();} catch {soundOn = false;}
      soundPending = false;
      if (disposed) return;
      if (!soundWanted) {audio.disable(); soundOn = false; return;}
      if (!soundOn) {soundWanted = false; syncSoundButton();}
    }
    if (state.paused || doc.hidden) {audio.pause(); return;}
    if (soundOn) audio.hit(note, strength);
  }
  function clearInput() {
    const owner = inputOwner;
    inputOwner = null;
    if (typeof owner === 'number' && hold.hasPointerCapture?.(owner)) {
      try {hold.releasePointerCapture(owner);} catch { /* The browser may have already cancelled the pointer. */ }
    }
  }
  function stopLoop() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0; previousTime = null;
  }
  function syncTime(time = now()) {
    if (previousTime !== null && RUNNING.has(state.phase) && !state.paused) {
      state = stepCrusher(state, Math.max(0, (time - previousTime) / 1000));
    }
    previousTime = time;
  }
  function manageLoop() {
    if (disposed || state.paused || doc.hidden || !RUNNING.has(state.phase)) {stopLoop(); return;}
    if (!frame) {
      if (previousTime === null) previousTime = now();
      frame = win.requestAnimationFrame(tick);
    }
  }
  function useFallback() {
    if (disposed || fallbackActive) return;
    fallbackActive = true;
    fallback.hidden = false; canvas.hidden = true;
    root.classList.add('crusher-uses-fallback');
    const oldScene = scene; scene = null;
    oldScene?.dispose();
  }
  function drawFallback(view) {
    const diagram = $('.crusher-diagram');
    diagram.style.setProperty('--load-x', `${16 + view.feed * 33 + view.eject * 32}%`);
    diagram.style.setProperty('--squash', String(1 - view.damage * .78));
    diagram.style.setProperty('--spread', String(view.fracture));
    diagram.style.setProperty('--press-y', `${view.press * 87}px`);
    diagram.style.setProperty('--belt-offset', `${view.belt * 25}px`);
  }
  function guidance(zone) {
    const tap = tapMode || inputOwner === 'tap';
    if (state.paused) return '已暂停。点击继续后重新蓄力，进度会保留。';
    if (state.phase === 'ready') return '选好一个小物件，送上传送带。每件材料的松开区都不一样。';
    if (state.phase === 'feeding') return '传送带正在把小物件送到压头下，马上就好。';
    if (state.phase === 'charging') return zone === 'in' ? tap ? '进入目标区了，再点一下压下！' : '进入松开区了，现在松开！' :
      zone === 'over' ? tap ? '压力过高了，再点压下后可以重试。' : '压力过高了，松开后可以再试。下次早一点松开。' :
        tap ? '正在蓄力，等白线进入标记区时再点一下。' : '继续按住，等白线进入标记区时松开。';
    if (state.phase === 'pressing') return state.lastShot.matched ? '力度刚好。看压头把小物件慢慢压扁。' :
      state.lastShot.pressure < state.lastShot.band.min ? '压力不足，留下了一点凹痕。压头抬起后，再蓄力久一点。' :
        '压力过高，材料滑开了一点。压头抬起后，再试着早一点松开。';
    if (state.phase === 'armed') {
      if (state.lastShot && !state.lastShot.matched) return state.lastShot.pressure < state.lastShot.band.min ?
        '刚才压力不足；凹痕保留了，再按住久一点。' : '刚才压力过高；凹痕保留了，下次早一点松开。';
      return state.stage ? `预压完成！接下来是「${getCrusherBand(state).label}」，留意新的松开区。` :
        tap ? '压头就位。点一下蓄力，在标记区内再点压下。' : '压头就位。按住蓄力，在标记区内松开。';
    }
    if (state.phase === 'breaking') return '咔嚓！原来的零件散开了。';
    if (state.phase === 'ejecting') return '把碎片送到出料盘，再留一点空位给下一件。';
    return state.phase === 'complete' ? '三件订单全部完成。可以全部重玩，或者去随心压。' :
      `${objectName(target())}压好了。${state.mode === 'practice' ? '可以继续压同一件，也可以再选一个。' : '准备好下一件了吗。'}`;
  }
  function render() {
    if (disposed) return;
    const view = getCrusherVisual(state);
    try {scene?.render(state);} catch {useFallback();}
    if (fallbackActive) drawFallback(view);
    root.dataset.carAsset = fallbackActive ? 'fallback' : carAssetStatus;
    const assetLabel = fallbackActive ? '简化工坊' : state.target !== 'car' ? '本地工坊物件' :
      carAssetStatus === 'loaded' ? 'Tripo 汽车已载入' :
        carAssetStatus === 'loading' ? '汽车模型载入中 · 可先试玩' :
          carAssetStatus === 'failed' ? '汽车模型未载入 · 使用本地车型' : '本地车型';
    if (stat('asset').textContent !== assetLabel) stat('asset').textContent = assetLabel;
    stat('asset').setAttribute('title', carAssetStatus === 'loaded' && state.target === 'car' && !fallbackActive ? carAssetName : '');
    const band = getCrusherBand(state);
    const pressure = Math.round(state.pressure * 100);
    const zone = state.pressure > band.max ? 'over' : state.pressure >= band.min ? 'in' : 'under';
    root.dataset.phase = state.phase;
    root.dataset.target = state.target;
    root.dataset.paused = String(state.paused);
    root.dataset.mode = state.mode;
    root.dataset.zone = zone;
    meter.setAttribute('aria-valuenow', String(pressure));
    meter.setAttribute('aria-valuetext', `${pressure}%，${band.label}松开区 ${Math.round(band.min * 100)} 至 ${Math.round(band.max * 100)}%`);
    meter.style.setProperty('--pressure', `${pressure}%`);
    meter.style.setProperty('--band-start', `${band.min * 100}%`);
    meter.style.setProperty('--band-width', `${(band.max - band.min) * 100}%`);
    stat('pressure').textContent = `${pressure}%`;
    stat('damage').textContent = view.damage > .01 ? `变形 ${Math.round(view.damage * 100)}%` : '完整小物件';
    if (soundOn && !state.paused && state.phase === 'pressing' && state.phaseTime >= .37 && lastSoundAttempt !== state.attempts) {
      lastSoundAttempt = state.attempts; audio.hit(0, .8); audio.hit(2, .45);
    }
    if (soundOn && state.phase === 'charging' && zone === 'in' && lastBandCue !== state.attempts + 1) {
      lastBandCue = state.attempts + 1; audio.hit(1, .25);
    }
    const signature = [state.revision, state.phase, state.paused, state.target, state.mode, zone, tapMode].join('/');
    if (signature !== lastSignature) {
      lastSignature = signature;
      stat('orders').textContent = state.mode === 'practice' ? `${state.crushed} 件` : `${state.completed.length} / 3`;
      stat('order-label').textContent = state.mode === 'practice' ? '随心压' : '小订单';
      stat('score').textContent = String(state.score);
      stat('stage').textContent = band.cycles > 1 ? `工序 ${band.cycle} / ${band.cycles}` : '单次压实';
      stat('phase').textContent = state.paused ? '已暂停' : phaseLabels[state.phase];
      stat('material').textContent = band.label;
      stat('band').textContent = `松开区 ${Math.round(band.min * 100)}–${Math.round(band.max * 100)}%`;
      const tap = tapMode || inputOwner === 'tap';
      stat('press-label').textContent = state.phase === 'charging' ? zone === 'in' ? tap ? '就是现在 · 再点压下！' : '就是现在 · 松开！' :
        zone === 'over' ? tap ? '过高了 · 再点重试' : '过高了 · 松开再试' : '继续蓄力…' : tapMode ? '点按蓄力 · 再点压下' : '按住蓄力 · 松开压下';
      const disableHold = state.paused || !['armed', 'charging'].includes(state.phase);
      // Native buttons lose focus when disabled. Move only our own focused
      // pressure button, before disabling it, so a failed shot remains
      // keyboard-playable without reclaiming focus from elsewhere.
      if (disableHold && doc.activeElement === hold && !state.paused && !doc.hidden) {
        arena.focus({preventScroll: true});
      }
      hold.disabled = disableHold;
      hold.setAttribute('aria-pressed', String(state.phase === 'charging'));
      button('feed').disabled = state.paused || state.phase !== 'ready';
      button('pause').textContent = state.paused ? '▷ 继续' : 'Ⅱ 暂停';
      for (const pick of root.querySelectorAll('[data-target]')) {
        const id = pick.dataset.target, done = state.completed.includes(id);
        pick.disabled = state.paused || state.phase !== 'ready' || done;
        pick.setAttribute('aria-pressed', String(id === state.target));
        pick.setAttribute('aria-label', `${objectName(CRUSHER_TARGETS.find(item => item.id === id))}${done ? '，已完成' : ''}`);
        $(`[data-order="${id}"]`).textContent = done ? '✓' : `0${CRUSHER_TARGETS.findIndex(item => item.id === id) + 1}`;
      }
      button('orders').setAttribute('aria-pressed', String(state.mode === 'orders'));
      button('practice').setAttribute('aria-pressed', String(state.mode === 'practice'));
      $('.crusher-paused').hidden = !state.paused;
      const finished = ['result', 'complete'].includes(state.phase);
      result.hidden = !finished;
      if (finished) {
        $('[data-result="kicker"]').textContent = state.phase === 'complete' ? 'THREE LITTLE THINGS, DONE' : 'NICELY CRUSHED';
        result.querySelector('h2').textContent = state.phase === 'complete' ? '三件小事，都放下了。' : `${objectName(target())}，压好了。`;
        $('[data-result="copy"]').textContent = state.phase === 'complete' ?
          `${state.attempts} 次尝试 · ${state.score} 积分。想再来一轮，还是去随心压？` :
          `${state.objectAttempts} 次尝试 · +${state.lastShot.points} 积分。碎片已经整整齐齐送到出料盘。`;
        button('next').hidden = state.phase === 'complete';
        button('next').textContent = state.mode === 'practice' ? '再来一件 ↗' : '下一件 ↗';
        if (lastPhase !== state.phase) result.querySelector('h2').focus({preventScroll: true});
      }
      announce(guidance(zone));
    }
    lastPhase = state.phase;
  }
  function commit(next) {
    if (disposed) return;
    state = next;
    render();
    manageLoop();
  }
  function tick(time) {
    frame = 0;
    if (disposed) return;
    syncTime(time);
    render();
    manageLoop();
  }
  function startPressure(owner) {
    if (disposed || inputOwner !== null || state.paused || state.phase !== 'armed') return false;
    inputOwner = owner;
    void playGesture(3, .12);
    commit(beginCrusherPressure(state));
    return true;
  }
  function endPressure(owner, cancel = false) {
    if (disposed || inputOwner !== owner) return;
    syncTime();
    clearInput();
    commit(cancel ? cancelCrusherPressure(state) : releaseCrusherPressure(state));
  }
  function toggleTapPressure() {
    if (inputOwner === 'tap') endPressure('tap'); else startPressure('tap');
  }
  function setPaused(value) {
    if (disposed || state.paused === value || !value && doc.hidden) return;
    // Freeze immediately at the last visible pose. Do not infer a release.
    clearInput(); stopLoop();
    state = value ? pauseCrusher(state) : resumeCrusher(state);
    if (value) audio.pause(); else void audio.resume();
    commit(state);
    if (!value) arena.focus({preventScroll: true});
  }
  function reset(options = {}) {
    clearInput(); stopLoop();
    lastSignature = ''; lastSoundAttempt = lastBandCue = 0;
    state = replayCrusher(state, options);
    if (doc.hidden) state = pauseCrusher(state);
    else void audio.resume();
    commit(state);
  }
  function resize() {
    if (disposed) return;
    try {scene?.resize();} catch {useFallback();}
    render();
  }
  function cleanup() {
    if (disposed) return;
    clearInput(); stopLoop();
    state = cancelCrusherPressure(state);
    disposed = true;
    abort.abort();
    observer?.disconnect();
    scene?.dispose(); scene = null;
    audio.destroy();
    root.remove();
  }

  listen(hold, 'pointerdown', event => {
    if (tapMode || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    if (startPressure(event.pointerId)) {
      hold.focus({preventScroll: true});
      try {hold.setPointerCapture(event.pointerId);} catch {endPressure(event.pointerId, true);}
    }
  });
  listen(hold, 'pointerup', event => endPressure(event.pointerId));
  listen(hold, 'pointercancel', event => endPressure(event.pointerId, true));
  listen(hold, 'lostpointercapture', event => endPressure(event.pointerId, true));
  // Window delivery is a fallback for browsers which lose capture on resize.
  listen(win, 'pointerup', event => endPressure(event.pointerId));
  listen(root, 'keydown', event => {
    if (event.code === 'KeyP' && !event.repeat && !event.target.closest?.('input,textarea,select')) {
      event.preventDefault(); setPaused(!state.paused); return;
    }
    // After a shot focus lives on the arena, so Enter stays available there
    // as well as through the native pressure button's click behavior.
    if (event.code === 'Enter' && [root, arena].includes(event.target)) {
      event.preventDefault();
      if (!event.repeat) toggleTapPressure();
      return;
    }
    if (event.code !== 'Space' || ![root, arena, hold].includes(event.target)) return;
    event.preventDefault();
    if (!event.repeat) startPressure('keyboard');
  });
  const keyup = event => {
    if (event.code !== 'Space' || inputOwner !== 'keyboard') return;
    event.preventDefault(); endPressure('keyboard');
  };
  listen(root, 'keyup', keyup);
  listen(win, 'keyup', keyup);
  listen(root, 'click', async event => {
    const control = event.target.closest?.('button');
    if (!control || control.disabled || disposed) return;
    if (control.dataset.target) {commit(selectCrusherTarget(state, control.dataset.target)); return;}
    switch (control.dataset.action) {
      case 'feed':
        void playGesture();
        commit(feedCrusher(state)); arena.focus({preventScroll: true});
        break;
      case 'press':
        if (tapMode || event.detail === 0) toggleTapPressure();
        break;
      case 'pause': setPaused(!state.paused); break;
      case 'resume': setPaused(false); break;
      case 'reset': case 'replay': reset(); break;
      case 'orders': case 'practice': reset({mode: control.dataset.action}); break;
      case 'next':
        clearInput(); commit(nextCrusher(state)); button('feed').focus({preventScroll: true}); break;
      case 'tap':
        clearInput(); state = cancelCrusherPressure(state); tapMode = !tapMode;
        button('tap').setAttribute('aria-pressed', String(tapMode));
        button('tap').textContent = tapMode ? '点按蓄力 / 再点压下：开' : '点按蓄力 / 再点压下：关';
        commit(state); break;
      case 'sound':
        soundWanted = !soundWanted;
        if (!soundWanted) {audio.disable(); soundOn = false;}
        else if (!state.paused) void playGesture(1, .15);
        syncSoundButton();
        break;
      case 'exit': cleanup(); onExit(); break;
    }
  });
  listen(win, 'blur', () => setPaused(true));
  listen(doc, 'visibilitychange', () => {if (doc.hidden) setPaused(true);});
  listen(canvas, 'webglcontextlost', event => {event.preventDefault(); useFallback(); render();});
  listen(win, 'resize', resize);
  try {scene = createCrusherScene(canvas, {reducedMotion});} catch {useFallback();}
  if (win.ResizeObserver) {observer = new win.ResizeObserver(resize); observer.observe(arena);}
  if (doc.hidden) state = pauseCrusher(state);
  render();
  // Loading never blocks the current order. The scene swaps the actual active
  // target and poses it before resolving; only then may the UI claim Tripo.
  if (scene && tripoAssets?.car) {
    const loadingScene = scene;
    carAssetStatus = 'loading';
    render();
    void (async () => {
      try {
        const name = await loadingScene.loadTripoCar(tripoAssets.car);
        if (disposed || scene !== loadingScene || fallbackActive) return;
        carAssetName = name;
        carAssetStatus = 'loaded';
      } catch {
        if (disposed || scene !== loadingScene || fallbackActive) return;
        carAssetStatus = 'failed';
      }
      render();
    })();
  }
  return cleanup;
}
