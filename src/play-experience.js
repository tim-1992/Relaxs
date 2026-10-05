import {PLAY_LEVELS, createPlayState, firePlayBall, recallPlayBall, rotatePlayMirror, advancePlay} from './play-physics.js';
import {createPlayScene, createPlayFallback} from './play-scene.js';

export function mountPlay(container, {onExit = () => {}, onAnnounce = () => {}, difficulty = 'easy'} = {}) {
  const root = document.createElement('section');
  root.className = 'experience-shell play-experience';
  root.tabIndex = -1;
  root.innerHTML = `
    <header class="experience-heading"><p class="eyebrow">PLAY / 01 · 星光连锁</p>
      <h1 tabindex="-1">给星星，规划一条路。</h1><p data-play-rules></p></header>
    <div class="play-layout">
      <div class="play-board experience-panel">
        <div class="play-board-label"><span>CONSTELLATION TABLE</span><span data-lit>0 / 4</span></div>
        <canvas class="play-canvas" tabindex="0" role="img" aria-label="星光弹射台。拖动瞄准后松开发射，或使用右侧角度滑杆与发射按钮。"></canvas>
        <div class="play-curtain" hidden><p data-curtain-title></p><button class="experience-button is-primary" data-do="continue">继续玩</button></div>
        <div class="play-win" hidden><span>✦</span><h2>这一片，亮起来了。</h2><p>刚才的每一次尝试，都算数。</p><div class="experience-toolbar"><button class="experience-button is-primary" data-do="next">下一片星光 ↗</button><button class="experience-button" data-do="exit">换个游戏</button></div></div>
        <div class="play-fail" hidden><span>↻</span><h2>换一条路线，再试试。</h2><p>这一轮的发射次数用完了。先看目标编号和反弹次数，再规划角度。</p><button class="experience-button is-primary" data-do="retry">重新挑战</button></div>
      </div>
      <aside class="play-sidebar">
        <div class="play-levels" role="group" aria-label="选择关卡">${PLAY_LEVELS.map((level, i) => `<button data-level="${i}" aria-label="第 ${i + 1} 关：${level.name}" aria-pressed="${i === 0}">${String(i + 1).padStart(2, '0')}</button>`).join('')}</div>
        <p class="eyebrow">这一片星光</p><h2 data-level-name></h2><p class="play-subtitle" data-subtitle></p>
        <ol class="play-objectives" aria-label="按顺序完成目标"></ol><p class="play-budget" data-budget></p>
        <label class="play-angle-label" for="play-angle">发射方向 <output data-angle>0°</output></label>
        <input id="play-angle" type="range" min="-75" max="75" step="1" value="0">
        <div class="play-angle-ticks"><span>← 向左</span><span>向右 →</span></div>
        <button class="experience-button is-primary play-fire" data-do="fire">发射小球 ↗</button>
        <div class="play-mirrors" role="group" aria-label="转动反弹板"></div>
        <div class="experience-toolbar play-secondary"><button class="experience-button" data-do="pause">暂停</button><button class="experience-button" data-do="reset">重新摆好</button><button class="experience-button" data-do="hint" aria-expanded="false">一点提示</button></div>
        <p class="play-hint" hidden></p>
        <p class="experience-status play-status" role="status"></p>
        <button class="play-sound" data-do="sound" aria-pressed="false">音效 · 关</button>
        <p class="play-footnote">← → 调方向 · 空格发射<br>不限时，也不限尝试次数。</p>
      </aside>
    </div>`;
  container.append(root);
  const $ = selector => root.querySelector(selector);
  let canvas = $('.play-canvas'), state = createPlayState(0, difficulty), scene, raf = 0, last = 0, disposed = false, pointer = null;
  let sound = false, context = null, lastProgress = -1, lastComplete = false, lastFailed = false;
  try { scene = createPlayScene(canvas); }
  catch {
    const replacement = canvas.cloneNode();
    canvas.replaceWith(replacement); canvas = replacement;
    scene = createPlayFallback(canvas);
    canvas.classList.add('is-flat');
  }
  const events = new AbortController();
  const on = (target, type, handler) => target.addEventListener(type, handler, {signal: events.signal});
  function chime(index) {
    if (!sound || state.paused || disposed || !context || context.state !== 'running') return;
    const osc = context.createOscillator(), gain = context.createGain(), now = context.currentTime;
    osc.type = 'sine'; osc.frequency.value = [392, 440, 523.25, 587.33, 659.25][index % 5];
    gain.gain.setValueAtTime(.035, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + .45);
    osc.connect(gain); gain.connect(context.destination);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    osc.start(); osc.stop(now + .46);
  }
  function say(text) { $('.play-status').textContent = text; }
  function cancelAim() {
    const captured = pointer;
    pointer = null;
    if (captured !== null && canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured);
  }
  function setAngle(value) {
    if (state.paused || state.complete || state.failed || state.ball.active) return;
    state.angle = Math.max(-75, Math.min(75, Math.round(value)));
    $('#play-angle').value = state.angle;
    $('[data-angle]').textContent = `${state.angle}°`;
    draw();
  }
  function sync() {
    const lit = state.targets.filter(item => item.lit).length;
    $('[data-lit]').textContent = `${lit} / ${state.targets.length} 已点亮`;
    if (lit !== lastProgress && lit) say(`点亮了 ${lit} 颗星星${state.complete ? '，这一关完成了。' : '，已经亮起的会一直保留。'}`);
    lastProgress = lit;
    $('.play-win').hidden = !state.complete;
    $('.play-fail').hidden = !state.failed;
    $('.play-curtain').hidden = !state.paused;
    $('[data-budget]').textContent = state.puzzle ? `剩余 ${Math.max(0, state.maxShots - state.shots)} / ${state.maxShots} 次发射${state.ball.active ? ` · 已反弹 ${state.ball.bounces} 次` : ''}` : '';
    root.querySelectorAll('[data-group]').forEach(node => {
      const index = Number(node.dataset.group);
      node.classList.toggle('is-current', index === state.nextGroup);
      node.classList.toggle('is-done', index < state.nextGroup);
      node.setAttribute('aria-current', String(index === state.nextGroup));
    });
    $('[data-do="pause"]').textContent = state.paused ? '继续' : '暂停';
    $('[data-do="pause"]').disabled = state.complete || state.failed;
    $('[data-do="fire"]').textContent = state.ball.active ? '收回小球' : '发射小球 ↗';
    $('[data-do="fire"]').disabled = state.paused || state.complete || state.failed;
    $('#play-angle').disabled = state.ball.active || state.paused || state.complete || state.failed;
    root.querySelectorAll('[data-mirror]').forEach(node => { node.disabled = state.ball.active || state.paused || state.complete || state.failed; });
    if (state.complete && !lastComplete) $('[data-do="next"]').focus({preventScroll: true});
    if (state.failed && !lastFailed) {
      $('[data-do="retry"]').focus({preventScroll: true});
      onAnnounce('这一轮发射次数用完了，可以重新挑战。');
    }
    lastComplete = state.complete;
    lastFailed = state.failed;
  }
  function draw(time = performance.now()) {
    if (disposed) return;
    cancelAnimationFrame(raf); raf = 0;
    const dt = last ? Math.min((time - last) / 1000, .05) : 0;
    last = time;
    advancePlay(state, dt);
    for (const event of state.events.splice(0)) {
      if (event.type === 'light') chime(event.id);
      if (event.type === 'rest') say('小球回来了。换个角度，再试一次。');
      if (event.type === 'rule-miss') say(event.reason === 'order'
        ? `顺序还不对，先点亮 ${state.nextGroup + 1} 号星群。`
        : `这次反弹了 ${event.actual} 次；${state.nextGroup + 1} 号星群需要恰好 ${state.groups[state.nextGroup].bounces} 次。`);
      if (event.type === 'complete') onAnnounce('这片星光全部点亮了，可以继续下一关或换个游戏。');
    }
    scene.draw(state);
    sync();
    if (state.ball.active && !state.paused && !document.hidden) raf = requestAnimationFrame(draw);
    else last = 0;
  }
  function load(level) {
    cancelAim();
    state = createPlayState(level, difficulty);
    lastProgress = -1;
    last = 0;
    const definition = PLAY_LEVELS[state.level];
    $('[data-level-name]').textContent = definition.name;
    $('[data-subtitle]').textContent = state.puzzle ? `目标 ${state.groups.map(g => g.id + 1).join(' → ')}；每次发射只点亮一个星群，已经完成的会保留。` : definition.subtitle;
    $('[data-play-rules]').textContent = state.puzzle ? '先想顺序，再找角度。碰墙或反弹板都算一次反弹，次数恰好符合目标才会点亮。' : '选个角度，让小球碰到星星。相邻的光会连成一片。';
    $('.play-objectives').hidden = !state.puzzle;
    $('.play-objectives').innerHTML = state.puzzle ? state.groups.map(group => `<li data-group="${group.id}"><span>${group.id + 1}</span><b>反弹 ${group.bounces} 次</b></li>`).join('') : '';
    $('.play-footnote').innerHTML = state.puzzle ? '← → 调方向 · 空格发射<br>错序、多弹或少弹都消耗一次；收回也计次。<br>不限时，转动反弹板不消耗次数。' : '← → 调方向 · 空格发射<br>不限时，也不限尝试次数。';
    const puzzleHints = [
      difficulty === 'hard' ? '试着把角度朝两侧多偏一些，借两次边界折返，再靠近中间的星群。直射会少了反弹。' : '向左或向右借一次侧墙，再回到中间的星群。可以想象星星在墙外的镜像位置。',
      '中间的挡板会挡住直线。先找右侧空隙，再把要求的反弹次数算进路线。',
      '先照顾左侧的 1 号星群，再去右侧。反弹板也算一次，可以免费转动比较路线。',
      '两块板都可能改变路线。沿着提示线想象后续走向，每遇到一面墙或板就数一次。',
      '两侧的星群在前，中间的星群在后。每完成一个目标，再按新的反弹次数重新规划。',
    ];
    $('.play-hint').textContent = state.puzzle ? puzzleHints[state.level] : definition.hint;
    $('.play-hint').hidden = true;
    $('[data-do="hint"]').setAttribute('aria-expanded', 'false');
    $('[data-do="next"]').textContent = state.level === PLAY_LEVELS.length - 1 ? '再看第一片 ↗' : '下一片星光 ↗';
    root.querySelectorAll('[data-level]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.level) === state.level)));
    $('.play-mirrors').innerHTML = state.mirrors.filter(item => item.rotatable).map(item => `<button class="experience-button" data-mirror="${item.id}">↻ 转动${state.mirrors.filter(m => m.rotatable).length > 1 ? item.id + 1 + '号' : ''}反弹板</button>`).join('');
    say('在桌面上拖动瞄准，松开就发射。也可以使用方向滑杆。');
    if (sound && !document.hidden) context?.resume().catch(() => {});
    setAngle(0);
    canvas.focus({preventScroll: true});
  }
  function pause() {
    if (state.paused || state.complete || state.failed) return;
    state.paused = true;
    cancelAim();
    context?.suspend().catch(() => {});
    $('[data-curtain-title]').textContent = '歇一下，星光会等你。';
    draw();
    if (document.hasFocus()) $('[data-do="continue"]').focus({preventScroll: true});
  }
  function resume() {
    if (document.hidden || state.failed || state.complete) return;
    state.paused = false; last = 0;
    if (sound) context?.resume().catch(() => {});
    say('继续吧，已经点亮的星星还在。');
    draw();
    canvas.focus({preventScroll: true});
  }
  function fire() {
    if (state.ball.active) { recallPlayBall(state); say('收好了。换个方向，再出发。'); }
    else if (firePlayBall(state)) say('小球出发了。看看它会走到哪里。');
    draw();
  }
  function aim(event) {
    const point = scene.point(event.clientX, event.clientY);
    if (point) setAngle(Math.atan2(point.x, Math.max(.1, point.y + 4)) * 180 / Math.PI);
  }
  on(root, 'click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-level')) { load(Number(button.dataset.level)); return; }
    if (button.hasAttribute('data-mirror')) {
      if (rotatePlayMirror(state, Number(button.dataset.mirror))) say('反弹板转好了，再看看新的路线。');
      draw(); return;
    }
    switch (button.dataset.do) {
      case 'fire': fire(); break;
      case 'pause': state.paused ? resume() : pause(); break;
      case 'continue': resume(); break;
      case 'reset': case 'retry': load(state.level); break;
      case 'next': load((state.level + 1) % PLAY_LEVELS.length); break;
      case 'exit': onExit(); break;
      case 'hint': {
        const hint = $('.play-hint'); hint.hidden = !hint.hidden;
        button.setAttribute('aria-expanded', String(!hint.hidden)); break;
      }
      case 'sound': {
        sound = !sound;
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (sound && Audio) {
          context ??= new Audio();
          if (!state.paused) context.resume().catch(() => {});
        } else if (!Audio) sound = false;
        if (!sound) context?.suspend().catch(() => {});
        button.textContent = `音效 · ${sound ? '开' : '关'}`;
        button.setAttribute('aria-pressed', String(sound)); break;
      }
    }
  });
  on($('#play-angle'), 'input', event => setAngle(Number(event.target.value)));
  on(canvas, 'pointerdown', event => {
    if (event.button !== 0 || state.ball.active || state.complete || state.failed || state.paused) return;
    pointer = event.pointerId;
    canvas.focus({preventScroll: true});
    canvas.setPointerCapture(pointer);
    aim(event);
  });
  on(canvas, 'pointermove', event => { if (event.pointerId === pointer) aim(event); });
  on(canvas, 'pointerup', event => {
    if (event.pointerId !== pointer) return;
    pointer = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    fire();
  });
  on(canvas, 'pointercancel', () => { pointer = null; });
  on(canvas, 'lostpointercapture', () => { pointer = null; });
  on(root, 'keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); setAngle(state.angle + (event.key === 'ArrowLeft' ? -2 : 2));
    }
    if (event.code === 'Space' && event.target.tagName !== 'BUTTON') {
      event.preventDefault(); if (!event.repeat && !state.paused && !state.complete) fire();
    }
    if (event.key.toLowerCase() === 'p' && !event.repeat) { event.preventDefault(); state.paused ? resume() : pause(); }
  });
  on(window, 'blur', pause);
  on(document, 'visibilitychange', () => { if (document.hidden) pause(); });
  const observer = new ResizeObserver(() => draw());
  observer.observe(canvas);
  load(0);
  return () => {
    if (disposed) return;
    disposed = true;
    cancelAim();
    events.abort(); observer.disconnect(); cancelAnimationFrame(raf);
    context?.close().catch(() => {});
    scene.dispose(); root.remove();
  };
}
