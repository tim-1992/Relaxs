import {
  SLICE_LEVELS, SLICE_COLORS, createSliceState, startSlice, stepSlice,
  beginSlice, moveSlice, endSlice, pauseSlice, resumeSlice, resizeSlice, drainSliceEvents,
} from './slice-state.js';
import {createSliceScene} from './slice-scene.js';
import {createReleaseAudio} from './release-audio.js';
import {mountWorryNote} from './worry-note.js';
import {pointOnSliceArena, sliceKeyboardCommand, moveSliceCursor} from './slice-input.js';

let mountId = 0;

/** Optional embedded GLB replaces all safe fruit; muted preserves an explicit
 * preference. Mount/preview never activates audio. Returns idempotent cleanup.
 */
export function mountRelease(container, {
  onExit = () => {}, onAnnounce = () => {}, tripoAsset = null, muted = false,
} = {}) {
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const uid = `slice-${++mountId}`;
  const abort = new AbortController();
  const audio = createReleaseAudio();
  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let state = createSliceState();
  let scene = null, fallbackContext = null, frame = 0, previousTime = 0, disposed = false;
  let pointerId = null, keyboardBlade = false, keyboardActive = false;
  let cursor = {x: state.width / 2, y: state.height / 2};
  let soundOn = false, soundPending = false, lastHUD = '', feedbackUntil = 0;
  let soundWanted = !muted, assetStatus = 'local', assetName = '', fallbackActive = false, assetDisplay = '';
  let noteOpen = false, previewTime = 0;
  const keys = new Set();
  const root = doc.createElement('section');
  root.className = 'experience-shell release-experience slice-experience';
  root.setAttribute('aria-labelledby', `${uid}-title`);
  root.innerHTML = `
    <div class="slice-heading">
      <div><p class="slice-eyebrow"><span>03 / LET IT OUT</span><i></i>把紧绷，划开一点</p>
        <h1 id="${uid}-title" tabindex="-1">连锁切切乐<span>。</span></h1>
        <p>按住划动，看小物件在指尖散开。找准时机，一刀连切。</p>
      </div>
      <div class="slice-modes" role="group" aria-label="切切乐玩法">
        <button type="button" data-mode="challenge" aria-pressed="true">连切闯关</button>
        <button type="button" data-mode="practice" aria-pressed="false">随心切</button>
      </div>
    </div>
    <div class="slice-chapters" role="group" aria-label="选择切切乐关卡">
      ${SLICE_LEVELS.map((level, index) => `<button type="button" data-level="${level.id}" aria-pressed="${index === 0}"><span>0${index + 1}</span>${level.name}<i aria-hidden="true">↗</i></button>`).join('')}
    </div>
    <div class="slice-board">
      <div class="slice-hud">
        <div class="slice-points"><span>得分</span><strong data-stat="score">0</strong><small data-stat="goal"></small></div>
        <div class="slice-chain-stat"><span>同色连切</span><strong data-stat="chains">0 / 2</strong></div>
        <div class="slice-wave-stat"><span data-stat="wave">准备好了</span><span data-stat="shields" aria-label="3 层护盾">● ● ●</span></div>
      </div>
      <div class="slice-arena" tabindex="0" role="group" aria-label="切切乐游戏区域" aria-describedby="${uid}-instructions ${uid}-rule">
        <canvas class="slice-canvas" aria-hidden="true"></canvas>
        <canvas class="slice-fallback" aria-hidden="true" hidden></canvas>
        <span class="slice-arena-mark" data-stat="asset" role="status" aria-live="polite">A SMALL SLICE OF JOY</span>
        <div class="slice-feedback" aria-hidden="true" hidden><strong></strong><span></span></div>
        <div class="slice-cursor" aria-hidden="true" hidden><i></i></div>
        <div class="slice-cover slice-ready">
          <div class="slice-ready-copy"><p class="slice-cover-kicker">找到同色的三个</p>
            <h2>顺手一划，<br>连成好心情。</h2>
            <p>同色连切 ×3 有奖励 · 带 × 的金属块要绕开</p>
            <button class="experience-button is-primary" type="button" data-action="start">划开第一波 <span aria-hidden="true">↗</span></button>
          </div>
        </div>
        <div class="slice-cover slice-paused" hidden>
          <span class="slice-cover-kicker">TAKE YOUR TIME</span><h2>先停在这一刻。</h2>
          <p>小物件都在等你，准备好了再继续。</p>
          <button type="button" class="experience-button is-primary" data-action="resume">继续切切乐 ↗</button>
        </div>
        <div class="slice-cover slice-result" hidden>
          <span class="slice-cover-kicker"></span><h2 tabindex="-1"></h2><p class="slice-result-copy"></p>
          <div class="slice-result-stats"><span>本次得分 <b data-result="score"></b></span><span>最长连切 <b data-result="chain"></b></span></div>
          <div class="slice-result-actions">
            <button type="button" class="experience-button" data-action="retry">再切一次</button>
            <button type="button" class="experience-button is-primary" data-action="next">下一关 ↗</button>
          </div>
        </div>
      </div>
      <div class="slice-board-foot">
        <p id="${uid}-instructions"><span aria-hidden="true">↗</span> 按住鼠标或手指，划过小物件</p>
        <div class="slice-legend" aria-label="可切物件：桃子圆球、薄荷方块、金色菱形；避开带叉的金属块">
          <i class="slice-dot peach"></i><i class="slice-dot mint"></i><i class="slice-dot gold"></i><span>同色连切</span>
        </div>
      </div>
    </div>
    <div class="slice-toolbar">
      <p class="slice-status" id="${uid}-rule" role="status" aria-live="polite"></p>
      <div>
        <button type="button" class="slice-tool" data-action="pause" disabled>Ⅱ 暂停</button>
        <button type="button" class="slice-tool" data-action="reset">↺ 重来</button>
        <button type="button" class="slice-tool" data-action="sound" aria-pressed="${soundWanted}">声音：${soundWanted ? '开' : '关'}</button>
      </div>
    </div>
    <details class="slice-help"><summary>怎么玩 · 键盘操作 <span aria-hidden="true">＋</span></summary>
      <div><p>每切开一个物件得 10 分。同一次划动连续切中 3 个同色物件，就记一次连切并获得加分；切到不同颜色或中断太久，需要重新连起。</p>
        <p>闯关需要同时达到得分和连切目标。漏掉物件不扣分；切到金属块会失去一层护盾，三层用完就重来。“随心切”没有通关目标，可以一直玩。</p>
        <p>键盘：先点击游戏区域，方向键移动光标，按住空格并移动来切开物件。松开空格结束这一刀。切换窗口会自动暂停。</p></div>
    </details>
    <div class="slice-note-mount"></div>
    <div class="slice-footer"><span>想停就停，随时可以回来。</span><button type="button" data-action="exit">今天先到这里 ↗</button></div>`;
  container.append(root);

  const $ = selector => root.querySelector(selector);
  const button = action => $(`[data-action="${action}"]`);
  const arena = $('.slice-arena');
  const canvas = $('.slice-canvas');
  const fallback = $('.slice-fallback');
  const ready = $('.slice-ready'), paused = $('.slice-paused'), result = $('.slice-result');
  const status = $('.slice-status'), feedback = $('.slice-feedback'), cursorElement = $('.slice-cursor');
  const stat = name => $(`[data-stat="${name}"]`);
  const listen = (target, name, handler, options = {}) => target.addEventListener(name, handler, {...options, signal: abort.signal});
  const level = () => SLICE_LEVELS.find(item => item.id === state.level) || SLICE_LEVELS[0];

  function announce(message) {
    if (disposed) return;
    status.textContent = message;
    onAnnounce(message);
  }

  function syncSound() {
    button('sound').textContent = soundWanted ? '声音：开' : '声音：关';
    button('sound').setAttribute('aria-pressed', String(soundWanted));
  }

  async function gestureSound(note = 3, strength = .25) {
    if (disposed || !soundWanted || soundPending || state.paused || noteOpen || doc.hidden) return;
    soundPending = true;
    // Both calls run before yielding, retaining the browser's user activation.
    // resume also clears a prior pause; enable creates/reuses the original synth.
    void audio.resume();
    try {soundOn = await audio.enable();} catch {soundOn = false;}
    soundPending = false;
    if (disposed) return;
    if (!soundWanted) {audio.disable(); soundOn = false; return;}
    if (state.paused || noteOpen || doc.hidden) {audio.pause(); return;}
    if (soundOn) audio.hit(note, strength);
    else {
      soundWanted = false;
      syncSound();
      announce('当前浏览器未能开启声音，可以继续无声游玩。');
    }
  }

  function syncAssetStatus() {
    const signature = `${fallbackActive}/${assetStatus}/${assetName}`;
    if (assetDisplay === signature) return;
    assetDisplay = signature;
    root.dataset.asset = fallbackActive ? 'fallback' : assetStatus;
    const label = fallbackActive ? '简化画布 · 本地物件' : assetStatus === 'loaded' ? 'Tripo · 鲜橙已载入' :
      assetStatus === 'loading' ? '鲜橙载入中 · 可先试玩' :
        assetStatus === 'failed' ? '鲜橙未载入 · 本地物件' : 'A SMALL SLICE OF JOY';
    if (stat('asset').textContent !== label) stat('asset').textContent = label;
    stat('asset').setAttribute('title', assetStatus === 'loaded' && !fallbackActive ? assetName : '');
    $('.slice-legend').setAttribute('aria-label', assetStatus === 'loaded' && !fallbackActive ?
      '可切物件：粉、绿、金色光环的橙子，分别带一、二、三个圆点；避开带叉的金属块' :
      '可切物件：桃子圆球、薄荷方块、金色菱形；避开带叉的金属块');
  }

  function cancelBlade() {
    const captured = pointerId;
    pointerId = null;
    if (captured !== null && arena.hasPointerCapture?.(captured)) arena.releasePointerCapture(captured);
    endSlice(state);
    keyboardBlade = false;
    keys.clear();
    arena.classList.remove('is-cutting');
  }

  function stopLoop() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = previousTime = 0;
  }

  function updateHUD() {
    const current = level();
    const signature = [state.phase, state.paused, state.mode, state.level, state.score, state.chains, state.wave, state.shields].join('/');
    if (signature === lastHUD) return;
    const wasEnd = root.dataset.phase === 'won' || root.dataset.phase === 'lost';
    lastHUD = signature;
    root.dataset.phase = state.phase;
    root.dataset.paused = String(state.paused);
    stat('score').textContent = state.score;
    stat('goal').textContent = state.mode === 'practice' ? '' : `/ ${current.goal}`;
    stat('chains').textContent = state.mode === 'practice' ? `${state.chains} 次` : `${state.chains} / ${current.chains}`;
    stat('wave').textContent = state.wave ? `第 ${state.wave}${state.mode === 'practice' ? '' : ` / ${current.waves}`} 波` : '准备好了';
    stat('shields').textContent = state.mode === 'practice' ? '随心切，无限玩' : [0, 1, 2].map(i => i < state.shields ? '●' : '○').join(' ');
    stat('shields').setAttribute('aria-label', state.mode === 'practice' ? '无限练习' : `${state.shields} 层护盾`);
    ready.hidden = state.phase !== 'ready';
    paused.hidden = !state.paused || state.phase !== 'playing' || noteOpen;
    const finished = state.phase === 'won' || state.phase === 'lost';
    result.hidden = !finished;
    button('pause').disabled = state.phase !== 'playing';
    button('pause').textContent = state.paused ? '▷ 继续' : 'Ⅱ 暂停';
    for (const item of root.querySelectorAll('[data-level]')) item.setAttribute('aria-pressed', String(item.dataset.level === state.level));
    for (const item of root.querySelectorAll('[data-mode]')) item.setAttribute('aria-pressed', String(item.dataset.mode === state.mode));
    $('.slice-chapters').hidden = state.mode === 'practice';
    $('.slice-cover-kicker').textContent = state.mode === 'practice' ? '不赶进度，随心划开' : `0${SLICE_LEVELS.indexOf(current) + 1} / ${current.name}`;
    if (finished) {
      const won = state.phase === 'won';
      result.querySelector('.slice-cover-kicker').textContent = won ? 'NICELY SLICED' : 'ONE MORE LITTLE TRY';
      result.querySelector('h2').textContent = won ? '这一刀，很漂亮。' : state.shields <= 0 ? '碰到金属块了。' : '再找一组同色。';
      $('.slice-result-copy').textContent = won ? '得分和连切目标都完成了，去试试新的排列？' : `目标 ${current.goal} 分、${current.chains} 次同色连切。不用着急，下一轮会更顺手。`;
      $('[data-result="score"]').textContent = state.score;
      $('[data-result="chain"]').textContent = `${state.bestChain} 连切`;
      button('next').hidden = !won;
      button('next').textContent = SLICE_LEVELS.indexOf(current) === SLICE_LEVELS.length - 1 ? '去随心切 ↗' : '下一关 ↗';
      if (!wasEnd) {
        cancelBlade();
        announce(won ? '这一关完成了。可以再切一次，或进入下一关。' : '这一轮结束了。可以再切一次。');
        result.querySelector('h2').focus({preventScroll: true});
      }
    }
  }

  function useFallback(error) {
    if (disposed || fallbackActive) return;
    fallbackActive = true;
    if (error) console.warn('切切乐切换为二维画布：', error);
    scene?.destroy();
    scene = null;
    canvas.hidden = true;
    fallback.hidden = false;
    fallbackContext = fallback.getContext('2d');
    if (!fallbackContext) {
      announce('当前设备无法绘制游戏画面，请换一个支持画布的浏览器。');
      button('start').disabled = true;
    }
    root.classList.add('slice-uses-fallback');
    syncAssetStatus();
  }

  function drawFallback(view) {
    const context = fallbackContext;
    if (!context) return;
    const dpr = Math.min(win.devicePixelRatio || 1, 2);
    if (fallback.width !== Math.round(view.width * dpr) || fallback.height !== Math.round(view.height * dpr)) {
      fallback.width = Math.round(view.width * dpr);
      fallback.height = Math.round(view.height * dpr);
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, view.width, view.height);
    const palette = Object.fromEntries(SLICE_COLORS.map(item => [item.id, item.color]));
    for (const item of [...view.objects, ...view.fragments]) {
      context.save();
      context.globalAlpha = item.life == null ? 1 : Math.min(1, item.life / .4);
      context.translate(item.x, item.y);
      context.rotate(item.rotation || 0);
      context.shadowColor = '#04141980';
      context.shadowBlur = 15;
      context.shadowOffsetY = 8;
      const fill = context.createRadialGradient(-item.r * .3, -item.r * .4, 1, 0, 0, item.r * 1.2);
      fill.addColorStop(0, item.kind === 'hazard' ? '#adb9b9' : '#fff3dc');
      fill.addColorStop(.45, item.kind === 'hazard' ? '#52656d' : palette[item.color] || '#efae9d');
      fill.addColorStop(1, item.kind === 'hazard' ? '#24363c' : '#547d70');
      context.fillStyle = fill;
      context.beginPath();
      if (item.color === 'mint' && item.kind !== 'hazard') context.roundRect(-item.r * .82, -item.r * .82, item.r * 1.64, item.r * 1.64, item.r * .24);
      else if (item.color === 'gold' && item.kind !== 'hazard') {
        context.moveTo(0, -item.r); context.lineTo(item.r, 0); context.lineTo(0, item.r); context.lineTo(-item.r, 0); context.closePath();
      } else context.arc(0, 0, item.r, 0, Math.PI * 2);
      if (item.side) {
        context.clip();
        context.fillRect(item.side < 0 ? -item.r : 2, -item.r, item.r - 2, item.r * 2);
      } else context.fill();
      context.shadowBlur = context.shadowOffsetY = 0;
      if (item.kind === 'hazard') {
        context.strokeStyle = '#f6cfaf'; context.lineWidth = 4; context.lineCap = 'round';
        context.beginPath(); context.moveTo(-item.r * .32, -item.r * .32); context.lineTo(item.r * .32, item.r * .32);
        context.moveTo(item.r * .32, -item.r * .32); context.lineTo(-item.r * .32, item.r * .32); context.stroke();
      }
      context.restore();
    }
    for (const particle of view.particles) {
      context.globalAlpha = Math.min(1, particle.life / .3);
      context.fillStyle = palette[particle.color] || particle.color || '#ffdcc9';
      context.beginPath(); context.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2); context.fill();
    }
    context.globalAlpha = 1;
    for (let i = 1; i < view.trail.length; i++) {
      const a = view.trail[i - 1], b = view.trail[i];
      if (b.break) continue;
      context.strokeStyle = '#ffe1c5'; context.lineCap = 'round'; context.lineWidth = 4;
      context.globalAlpha = Math.min(1, (b.life ?? .2) / .2);
      context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    }
    context.globalAlpha = 1;
  }

  function preview() {
    const r = Math.min(50, state.width * .085);
    return {
      ...state, time: previewTime,
      objects: ['mint', 'peach', 'peach', 'peach', 'gold'].map((color, index) => ({
        id: `preview-${index}`, kind: 'fruit', color, x: state.width * (.14 + index * .18),
        y: state.height * (.35 - Math.sin(index / 4 * Math.PI) * .07) + (reducedMotion ? 0 : Math.sin(previewTime * .75 + index) * 8),
        z: index % 2 * 10, r: r * (index === 2 ? 1.16 : 1), rotation: -.18 + index * .23 + (reducedMotion ? 0 : previewTime * .1),
        spin: .2, vx: 0, vy: 0,
      })),
    };
  }

  function render() {
    if (disposed) return;
    const view = state.phase === 'ready' ? preview() : state;
    try { scene?.render(view); } catch (error) { useFallback(error); }
    if (!scene) drawFallback(view);
    syncAssetStatus();
    cursorElement.hidden = !keyboardActive || state.phase !== 'playing' || state.paused;
    cursorElement.style.left = `${cursor.x / state.width * 100}%`;
    cursorElement.style.top = `${cursor.y / state.height * 100}%`;
    cursorElement.classList.toggle('is-cutting', keyboardBlade);
    updateHUD();
  }

  function processEvents() {
    let latest = null;
    for (const event of drainSliceEvents(state)) {
      if (event.type === 'slice') audio.hit(SLICE_COLORS.findIndex(item => item.id === event.color), .65);
      if (event.type === 'chain') { audio.hit(3, .9); latest = event; }
      if (event.type === 'hazard') { audio.hit(0, .9); latest = event; }
      if (event.type === 'wave') {
        const current = level();
        status.textContent = state.mode === 'practice' ? '随心切：漏掉也没关系，下一波很快就来。' : current.note;
      }
    }
    if (latest) {
      feedback.hidden = false;
      feedback.classList.toggle('is-hazard', latest.type === 'hazard');
      feedback.querySelector('strong').textContent = latest.type === 'hazard' ? '绕开 ×' : `${latest.count || 3} 连切`;
      feedback.querySelector('span').textContent = latest.type === 'hazard'
        ? state.mode === 'practice' ? '金属块会打断连切' : '护盾 −1，下一刀慢一点'
        : '同色，一刀到位';
      feedbackUntil = state.time + 1.1;
      announce(latest.type === 'hazard'
        ? state.mode === 'practice' ? '碰到金属块，连切中断。随心切可以继续玩。' : `碰到金属块，剩余 ${state.shields} 层护盾。`
        : `同色 ${latest.count || 3} 连切，继续找下一组。`);
    }
    if (state.time > feedbackUntil) feedback.hidden = true;
  }

  function tick(now) {
    frame = 0;
    if (disposed) return;
    const dt = previousTime ? Math.min(.05, Math.max(0, (now - previousTime) / 1000)) : 0;
    previousTime = now;
    if (state.phase === 'playing' && !state.paused) {
      if (keys.size) {
        cursor = moveSliceCursor(cursor, keys, dt, state.width, state.height);
        if (keyboardBlade) moveSlice(state, cursor);
      }
      stepSlice(state, dt);
      processEvents();
    } else if (state.phase === 'ready' && !doc.hidden) previewTime += dt;
    render();
    if (!disposed && !doc.hidden && ((state.phase === 'playing' && !state.paused) || (state.phase === 'ready' && !reducedMotion))) frame = win.requestAnimationFrame(tick);
    else previousTime = 0;
  }

  function startLoop() {
    if (!frame && !disposed) frame = win.requestAnimationFrame(tick);
  }

  function resize() {
    if (disposed) return;
    const rect = arena.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    if (Math.abs(rect.width - state.width) < .5 && Math.abs(rect.height - state.height) < .5) return;
    cancelBlade();
    resizeSlice(state, rect.width, rect.height);
    cursor = {x: state.width / 2, y: state.height / 2};
    render();
  }

  function setPaused(value, automatic = false) {
    if (state.phase !== 'playing' || noteOpen && !value) return;
    cancelBlade();
    if (value) {
      pauseSlice(state);
      audio.pause();
      stopLoop();
      announce(automatic ? '已暂停。准备好了，点击继续。' : '停一小会，光刃也休息一下。');
    } else {
      resumeSlice(state);
      void audio.resume();
      void gestureSound(1, .15);
      announce(level().note);
      startLoop();
      arena.focus({preventScroll: true});
    }
    render();
  }

  function reset({levelId = state.level, mode = state.mode, play = false} = {}) {
    cancelBlade();
    stopLoop();
    state = createSliceState({level: levelId, mode, width: state.width, height: state.height});
    lastHUD = '';
    keyboardActive = false;
    feedback.hidden = true;
    feedbackUntil = 0;
    cursor = {x: state.width / 2, y: state.height / 2};
    void audio.resume();
    announce(mode === 'practice' ? '没有通关目标。找同色、绕开金属块，按自己的节奏切。' : `${level().note} 目标 ${level().goal} 分、${level().chains} 次同色连切。`);
    if (play) {
      startSlice(state);
      void gestureSound();
      arena.focus({preventScroll: true});
    }
    resize();
    render();
    startLoop();
  }

  listen(root, 'click', async event => {
    const target = event.target.closest('button');
    if (!target || !root.contains(target) || target.disabled || disposed) return;
    if (target.dataset.level) return reset({levelId: target.dataset.level});
    if (target.dataset.mode) return reset({mode: target.dataset.mode});
    switch (target.dataset.action) {
      case 'start':
        startSlice(state);
        void gestureSound();
        arena.focus({preventScroll: true});
        render(); startLoop(); break;
      case 'reset': reset(); break;
      case 'retry': reset({play: true}); break;
      case 'next': {
        const index = SLICE_LEVELS.findIndex(item => item.id === state.level);
        if (index < SLICE_LEVELS.length - 1) reset({levelId: SLICE_LEVELS[index + 1].id});
        else reset({mode: 'practice'});
        button('start').focus({preventScroll: true}); break;
      }
      case 'pause': setPaused(!state.paused); break;
      case 'resume': setPaused(false); break;
      case 'sound':
        soundWanted = !soundWanted;
        if (!soundWanted) {soundOn = false; audio.disable();}
        else void gestureSound(1, .2);
        syncSound(); break;
      case 'exit': cleanup(); onExit(); break;
    }
  });

  listen(arena, 'pointerdown', event => {
    if (event.target.closest('button') || event.button !== 0 || pointerId !== null || state.phase !== 'playing' || state.paused) return;
    const point = pointOnSliceArena(arena.getBoundingClientRect(), state.width, state.height, event);
    if (!point) return;
    event.preventDefault();
    cancelBlade();
    keyboardActive = false;
    arena.focus({preventScroll: true});
    pointerId = event.pointerId;
    arena.setPointerCapture?.(pointerId);
    if (!soundOn) void gestureSound(1, .15);
    beginSlice(state, point);
    arena.classList.add('is-cutting');
  });
  listen(arena, 'pointermove', event => {
    if (pointerId !== event.pointerId || state.paused) return;
    event.preventDefault();
    const events = event.getCoalescedEvents?.() || [event];
    for (const sample of events.length ? events : [event]) {
      const point = pointOnSliceArena(arena.getBoundingClientRect(), state.width, state.height, sample);
      if (point) moveSlice(state, point);
    }
    processEvents();
    render();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(arena, name, event => {
    if (pointerId === event.pointerId) cancelBlade();
  });
  listen(arena, 'keydown', event => {
    if (state.phase !== 'playing' || state.paused) return;
    if (pointerId !== null) {
      if (event.key === ' ' || event.key.startsWith('Arrow')) event.preventDefault();
      return;
    }
    if (event.key === ' ' && event.target === arena) event.preventDefault();
    // Repeated Space must not scroll the page while the blade is held.
    const command = sliceKeyboardCommand(event.key === ' ' && event.target === arena
      ? {key: event.key, repeat: event.repeat, ctrlKey: event.ctrlKey, altKey: event.altKey, metaKey: event.metaKey, isComposing: event.isComposing}
      : event);
    if (!command) return;
    event.preventDefault();
    keyboardActive = true;
    if (command === 'blade') {
      if (!soundOn) void gestureSound(1, .15);
      keyboardBlade = beginSlice(state, cursor);
    }
    else {
      if (!keys.has(command)) {
        cursor = moveSliceCursor(cursor, new Set([command]), 1 / 30, state.width, state.height);
        if (keyboardBlade) moveSlice(state, cursor);
      }
      keys.add(command);
    }
    render();
  });
  listen(arena, 'keyup', event => {
    if (event.key === ' ' && keyboardBlade) { keyboardBlade = false; endSlice(state); }
    const command = {ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down'}[event.key];
    if (command) keys.delete(command);
  });
  listen(arena, 'blur', () => { cancelBlade(); keyboardActive = false; });
  listen(win, 'blur', () => { audio.pause(); setPaused(true, true); stopLoop(); });
  listen(win, 'focus', () => { if (state.phase === 'ready') startLoop(); });
  listen(doc, 'visibilitychange', () => {
    if (doc.hidden) { audio.pause(); setPaused(true, true); stopLoop(); }
    else if (state.phase === 'ready') startLoop();
  });
  const destroyNote = mountWorryNote($('.slice-note-mount'), {
    onOpen() { audio.pause(); setPaused(true); stopLoop(); noteOpen = true; lastHUD = ''; updateHUD(); },
    onClose() { noteOpen = false; lastHUD = ''; render(); if (state.phase === 'ready') startLoop(); },
    onAnnounce,
  });
  try { scene = createSliceScene(canvas, {reducedMotion, onUnavailable: () => { useFallback(); render(); }}); }
  catch (error) { useFallback(error); }
  const observer = win.ResizeObserver ? new win.ResizeObserver(resize) : null;
  observer?.observe(arena);
  listen(win, 'resize', resize);
  reset();
  if (scene && tripoAsset) {
    const owner = scene;
    assetStatus = 'loading';
    syncAssetStatus();
    void (async () => {
      try {
        const name = await owner.setTripoAsset(tripoAsset);
        if (disposed || scene !== owner || fallbackActive) return;
        assetName = name; assetStatus = 'loaded';
      } catch {
        if (disposed || scene !== owner || fallbackActive) return;
        assetStatus = 'failed';
      }
      render();
    })();
  }

  function cleanup() {
    if (disposed) return;
    disposed = true;
    cancelBlade();
    stopLoop();
    abort.abort();
    observer?.disconnect();
    destroyNote();
    scene?.destroy();
    audio.destroy();
    root.remove();
  }
  return cleanup;
}
