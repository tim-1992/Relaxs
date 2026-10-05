import {createRideState, startRide, setRidePaused, stepRide, pushRide} from './ride-state.js';
import {createRideScene} from './ride-scene.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const clock = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
let mountId = 0;

/** Original synthesized motor, wind and contact sounds; no recordings or network. */
export function createRideAudio(win) {
  let context = null, enabled = false, running = false, disposed = false, master, engineGain, windGain, filter, noise;
  const continuous = [], nodes = [], voices = new Set();
  let drive = {speed: 0, throttle: 0, boost: false};
  const suspend = () => {if (context?.state === 'running') void context.suspend().catch(() => {});};
  function clearVoices() {
    for (const voice of [...voices]) {
      voice.source.onended = null;
      try {voice.source.stop();} catch {}
      voice.nodes.forEach(node => node.disconnect()); voices.delete(voice);
    }
  }
  function initialize() {
    if (context || disposed) return;
    const Audio = win.AudioContext || win.webkitAudioContext;
    if (!Audio) throw new Error('Web Audio unavailable');
    context = new Audio();
    master = context.createGain(); master.gain.value = .22; master.connect(context.destination);
    filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 700; filter.Q.value = .7;
    engineGain = context.createGain(); engineGain.gain.value = 0; filter.connect(engineGain); engineGain.connect(master);
    for (const [index, type] of ['sawtooth', 'triangle'].entries()) {
      const oscillator = context.createOscillator(); oscillator.type = type; oscillator.frequency.value = index ? 34 : 68;
      const gain = context.createGain(); gain.gain.value = index ? .22 : .62;
      oscillator.connect(gain); gain.connect(filter); oscillator.start();
      continuous.push(oscillator); nodes.push(oscillator, gain);
    }
    noise = context.createBuffer(1, Math.ceil(context.sampleRate * .7), context.sampleRate);
    const samples = noise.getChannelData(0); let seed = 173, previous = 0;
    for (let index = 0; index < samples.length; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      previous = previous * .72 + (seed / 4294967296 * 2 - 1) * .28; samples[index] = previous;
    }
    const wind = context.createBufferSource(); wind.buffer = noise; wind.loop = true;
    const windFilter = context.createBiquadFilter(); windFilter.type = 'highpass'; windFilter.frequency.value = 350;
    windGain = context.createGain(); windGain.gain.value = 0;
    wind.connect(windFilter); windFilter.connect(windGain); windGain.connect(master); wind.start();
    continuous.push(wind); nodes.push(wind, windFilter, windGain, filter, engineGain, master);
  }
  async function activate() {
    if (!enabled || !running || disposed) return false;
    try {
      initialize();
      const current = context;
      if (current.state !== 'running') await current.resume();
      if (disposed || !enabled || !running) {if (current.state === 'running') await current.suspend(); return false;}
      update(drive); return true;
    } catch {enabled = false; suspend(); return false;}
  }
  function update(input) {
    drive = input;
    if (!context || disposed || !enabled || !running) return;
    const speed = clamp(Number.isFinite(input.speed) ? input.speed : 0, 0, 65), at = context.currentTime;
    const throttle = clamp(Number.isFinite(input.throttle) ? input.throttle : 0, 0, 1);
    const gear = Math.min(5, Math.floor(speed / 9));
    const rpm = 66 + (speed - gear * 9) * 10 + gear * 8 + throttle * 16;
    continuous[0].frequency.setTargetAtTime(rpm, at, .1);
    continuous[1].frequency.setTargetAtTime(rpm * .5, at, .1);
    filter.frequency.setTargetAtTime(500 + speed * 22 + (input.boost ? 240 : 0), at, .12);
    engineGain.gain.setTargetAtTime(.045 + throttle * .08 + speed * .001, at, .08);
    windGain.gain.setTargetAtTime(Math.min(.18, (speed / 42) ** 2 * .11), at, .18);
  }
  function play(kind) {
    if (!enabled || !running || disposed || context?.state !== 'running' || voices.size >= 6) return;
    const duration = kind === 'impact' ? .23 : .12, at = context.currentTime;
    const source = context.createBufferSource(); source.buffer = noise;
    const band = context.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = kind === 'impact' ? 550 : 280;
    const gain = context.createGain();
    gain.gain.setValueAtTime(.001, at); gain.gain.exponentialRampToValueAtTime(kind === 'impact' ? .45 : .26, at + .008);
    gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    source.connect(band); band.connect(gain); gain.connect(master);
    const voice = {source, nodes: [source, band, gain]}; voices.add(voice);
    source.onended = () => {voice.nodes.forEach(node => node.disconnect()); voices.delete(voice);};
    source.start(at); source.stop(at + duration + .02);
  }
  function finish({podium = false} = {}) {
    const audible = enabled && running && !disposed && context?.state === 'running';
    running = false; clearVoices();
    if (!audible) {suspend(); return false;}
    const at = context.currentTime;
    for (const gain of [engineGain.gain, windGain.gain]) {
      gain.cancelScheduledValues?.(at); gain.setValueAtTime(0, at);
    }
    for (const [index, frequency] of (podium ? [392, 523.25, 659.25] : [392, 440, 523.25]).entries()) {
      const source = context.createOscillator(), gain = context.createGain(), start = at + index * .11;
      source.type = 'triangle'; source.frequency.value = frequency;
      gain.gain.setValueAtTime(.001, start); gain.gain.exponentialRampToValueAtTime(.2, start + .018);
      gain.gain.exponentialRampToValueAtTime(.001, start + .28);
      source.connect(gain); gain.connect(master);
      const voice = {source, nodes: [source, gain]}; voices.add(voice);
      source.onended = () => {
        voice.nodes.forEach(node => node.disconnect()); voices.delete(voice);
        if (!running && !voices.size) suspend();
      };
      source.start(start); source.stop(start + .30);
    }
    return true;
  }
  return {
    async enable() {
      if (disposed || !(win.AudioContext || win.webkitAudioContext)) return false;
      enabled = true; if (running) await activate(); return enabled && !disposed;
    },
    disable() {enabled = false; clearVoices(); suspend();},
    pause() {running = false; clearVoices(); suspend();},
    resume() {running = true; return enabled ? activate() : Promise.resolve(false);},
    update, play, finish,
    dispose() {
      if (disposed) return; disposed = true; enabled = running = false; clearVoices();
      for (const source of continuous) {try {source.stop();} catch {}}
      nodes.forEach(node => node.disconnect()); continuous.length = nodes.length = 0;
      if (context?.state !== 'closed') void context?.close().catch(() => {});
      context = noise = null;
    },
  };
}

export function mountRide(container, {
  difficulty = 'standard', onExit = () => {}, onAnnounce = () => {}, tripoVehicle = null, tripoTree = null, tripoRider = null,
} = {}) {
  const doc = container.ownerDocument, win = doc.defaultView, uid = `ride-${++mountId}`;
  const abort = new AbortController(), audio = createRideAudio(win);
  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let state = createRideState({difficulty}), scene = null, observer = null, frame = 0, previousTime = null, disposed = false;
  let soundOn = false, soundPending = false, soundChosen = false, lastImpacts = 0, lastOvertakes = 0, feedbackUntil = 0, lastFallTime = 0;
  let fallbackActive = false, finalCallout = false;
  const keys = new Set(), pointers = new Map(), taps = new Map();
  const root = doc.createElement('section');
  root.className = 'ride-experience'; root.tabIndex = 0; root.setAttribute('aria-label', '疾风骑行，三维山间公路竞速');
  root.innerHTML = `
    <div class="ride-viewport">
      <canvas class="ride-canvas" aria-hidden="true"></canvas>
      <span class="ride-player-label" hidden>Tripo · 3</span>
      <div class="ride-fallback" hidden><div class="ride-fallback-road"></div>
        <span class="ride-fallback-player"></span><div class="ride-fallback-rivals">${Array.from({length: 5}, () => '<i></i>').join('')}</div>
        <div class="ride-fallback-obstacles">${Array.from({length: 16}, () => '<i hidden></i>').join('')}</div>
        <div class="ride-fallback-finish" hidden></div>
        <small>简化路况 · 相同的竞速与操控</small></div>
      <div class="ride-shade" aria-hidden="true"></div><div class="ride-impact" aria-hidden="true"></div>
      <header class="ride-top">
        <div class="ride-brand"><span>疾风骑行</span></div>
        <div class="ride-top-actions">
          <button type="button" class="ride-icon" data-r="sound" aria-label="开启骑行音效" aria-pressed="false">♪</button>
          <button type="button" class="ride-icon" data-r="pause" aria-label="暂停骑行" hidden>Ⅱ</button>
          <details class="ride-settings"><summary aria-label="玩法和操作设置">⋯</summary>
            <div class="ride-settings-panel">
              <label>玩法<select data-ride-mode><option value="race">1.8 km 竞速</option><option value="practice">自由骑行</option></select></label>
              <p id="${uid}-instructions">自动前进。A / D 或 ← → 转向，S / ↓ 刹车，Shift / 空格冲刺。Q / E 向左、右侧推，只对身边骑手有效。P 暂停。</p>
              <p>触屏按住边缘按钮操控。弯前松开冲刺或刹车；侧推能挤倒身旁对手，摔倒后会回到车上。</p>
              <button type="button" data-r="retry">重新出发</button><button type="button" data-r="exit">返回 ↗</button>
            </div>
          </details>
        </div>
      </header>
      <div class="ride-hud" aria-label="骑行状态">
        <div class="ride-speed"><strong data-ride-speed>0</strong><small>km/h</small></div>
        <div class="ride-rank"><b data-ride-rank>6<small>/ 6</small></b><span data-ride-distance>0 / 1800 m</span></div>
        <div class="ride-boost"><span>冲刺</span><progress data-ride-stamina max="1" value="1" aria-label="冲刺体力"></progress></div>
      </div>
      <progress class="ride-progress" data-ride-progress max="1800" value="0" aria-label="赛道进度"></progress>
      <div class="ride-ready"><span data-ride-ready-label>1.8 KM / 山间公路</span>
        <button type="button" class="ride-primary" data-r="start">出发 <span aria-hidden="true">↗</span></button>
        <p>转向，找空隙。把风留在身后。</p></div>
      <div class="ride-paused" hidden><p>先停在这里。</p><button type="button" class="ride-primary" data-r="resume">继续骑行 ↗</button></div>
      <div class="ride-result" hidden><span>FINISH LINE</span><h2 data-ride-result-title></h2>
        <p data-ride-result-detail></p><button type="button" class="ride-primary" data-r="retry">再跑一程 ↗</button></div>
      <div class="ride-feedback" role="status" aria-live="polite"></div>
      <div class="ride-controls" aria-describedby="${uid}-instructions">
        <div><button type="button" data-ride-control="left" aria-label="向左转向">←</button><button type="button" data-ride-control="right" aria-label="向右转向">→</button></div>
        <div><button type="button" data-ride-control="brake" aria-label="按住刹车">刹车</button><button type="button" class="ride-boost-button" data-ride-control="boost" aria-label="按住冲刺">冲刺</button></div>
      </div>
      <button type="button" class="ride-push ride-push-left" data-r="push-left" aria-label="向左侧推附近骑手">← 推</button>
      <button type="button" class="ride-push ride-push-right" data-r="push-right" aria-label="向右侧推附近骑手">推 →</button>
      <span class="ride-recovery" hidden>稳住车身…</span>
    </div>`;
  container.append(root);
  const query = selector => root.querySelector(selector);
  const canvas = query('canvas'), viewport = query('.ride-viewport'), settings = query('.ride-settings');
  const modeSelect = query('[data-ride-mode]'), controls = [...root.querySelectorAll('[data-ride-control]')];
  const feedback = query('.ride-feedback');
  const playerLabel = query('.ride-player-label');
  const speed = query('[data-ride-speed]'), rank = query('[data-ride-rank]'), distance = query('[data-ride-distance]');
  const stamina = query('[data-ride-stamina]'), progress = query('[data-ride-progress]');
  const pauseButton = query('[data-r="pause"]'), soundButton = query('[data-r="sound"]');
  const ready = query('.ride-ready'), paused = query('.ride-paused'), result = query('.ride-result');
  const listen = (target, type, fn) => target.addEventListener(type, fn, {signal: abort.signal});
  const text = (target, value) => {if (target.textContent !== String(value)) target.textContent = value;};
  function announce(message, duration = 1.5) {
    text(feedback, message); feedbackUntil = state.elapsed + duration; feedback.classList.add('is-visible'); onAnnounce(message);
  }
  function releasePointer(id) {
    const entry = pointers.get(id); pointers.delete(id);
    if (!entry) return;
    try {if (entry.button.hasPointerCapture(id)) entry.button.releasePointerCapture(id);} catch {}
    entry.button.classList.remove('is-held');
  }
  function clearInput() {
    keys.clear(); taps.clear();
    for (const id of [...pointers.keys()]) releasePointer(id);
    controls.forEach(button => button.classList.remove('is-held'));
  }
  function active(control) {
    const aliases = {left: ['a', 'arrowleft'], right: ['d', 'arrowright'], brake: ['s', 'arrowdown'], boost: ['shift', ' ']};
    return aliases[control].some(key => keys.has(key)) || [...pointers.values()].some(entry => entry.control === control) ||
      (taps.get(control) || 0) > state.elapsed;
  }
  function input() {
    if (state.phase !== 'running' || state.fallTime > 0) return {steer: 0, throttle: 0, brake: 0, boost: false};
    const brake = active('brake');
    return {steer: Number(active('right')) - Number(active('left')), throttle: brake ? 0 : 1, brake: Number(brake), boost: active('boost')};
  }
  function updateHUD() {
    if (disposed) return;
    root.dataset.phase = state.phase; root.dataset.mode = state.mode; root.dataset.result = state.resultReason || '';
    text(speed, Math.round(state.speed * 3.6)); text(rank, state.mode === 'race' ? `${state.rank} / 6` : 'FREE');
    const remaining = Math.max(0, Math.ceil(state.config.raceLength - state.distance));
    const finalStretch = state.mode === 'race' && remaining <= 200 && remaining > 0;
    root.classList.toggle('is-final-stretch', finalStretch);
    text(distance, state.mode === 'race' ? state.phase === 'finished' ? `${state.config.raceLength} m · 抵达终点` :
      finalStretch ? `终点还剩 ${remaining} m` : `${Math.round(state.distance)} / ${state.config.raceLength} m` : `${(state.distance / 1000).toFixed(2)} km`);
    stamina.value = state.stamina; progress.max = state.config.raceLength; progress.value = state.distance;
    progress.hidden = state.mode === 'practice';
    ready.hidden = state.phase !== 'ready'; paused.hidden = state.phase !== 'paused' || settings.open;
    result.hidden = state.phase !== 'finished'; pauseButton.hidden = !['running', 'paused'].includes(state.phase);
    pauseButton.textContent = state.phase === 'paused' ? '▶' : 'Ⅱ';
    pauseButton.setAttribute('aria-label', state.phase === 'paused' ? '继续骑行' : '暂停骑行');
    root.classList.toggle('is-recovering', state.recovery > 0); query('.ride-recovery').hidden = state.recovery <= 0 || state.phase !== 'running';
    root.classList.toggle('is-falling', state.fallTime > 0);
    text(query('.ride-recovery'), state.fallTime > 0 ? '翻滚一下，马上回来…' : '稳住车身…');
    for (const button of controls) {
      button.disabled = state.phase !== 'running' || state.fallTime > 0; button.classList.toggle('is-held', state.phase === 'running' && active(button.dataset.rideControl));
    }
    for (const button of root.querySelectorAll('.ride-push')) button.disabled = state.phase !== 'running' || state.fallTime > 0;
    query('.ride-controls').hidden = state.phase !== 'running';
    query('.ride-push-left').hidden = query('.ride-push-right').hidden = state.phase !== 'running';
    soundButton.disabled = soundPending; soundButton.setAttribute('aria-pressed', String(soundOn));
    soundButton.setAttribute('aria-label', soundOn ? '关闭骑行音效' : '开启骑行音效');
    text(query('[data-ride-ready-label]'), state.mode === 'race' ?
      state.goalRank ? `1.8 KM · 目标前 ${state.goalRank}` : '1.8 KM / 山间公路' : 'FREE RIDE / 自由骑行');
  }
  function fallback(error) {
    console.warn('Ride WebGL unavailable; using simplified road view.', error);
    scene?.dispose(); scene = null; fallbackActive = true;
    canvas.hidden = true; query('.ride-fallback').hidden = false; playerLabel.hidden = true;
    root.classList.add('ride-is-fallback');
  }
  function render(dt = 0) {
    updateHUD();
    if (scene) {
      try {
        scene.render(state, {boost: state.phase === 'running' && active('boost')}, dt);
        const point = scene.getPlayerLabelPosition?.();
        playerLabel.hidden = !point?.visible;
        if (point?.visible) {
          const bounds = viewport.getBoundingClientRect();
          playerLabel.style.left = `${clamp(point.x, 40, bounds.width - 40)}px`;
          playerLabel.style.top = `${clamp(point.y, 45, bounds.height - 45)}px`;
        }
      }
      catch (error) {fallback(error);}
    }
    if (fallbackActive) {
      query('.ride-fallback-road').style.backgroundPositionY = `${state.distance * 8}px`;
      query('.ride-fallback-player').style.left = `${50 + state.lateral / state.config.roadHalfWidth * 27}%`;
      query('.ride-fallback-player').style.top = state.phase === 'finished' ? '48%' : '76%';
      const finish = query('.ride-fallback-finish'), remaining = state.config.raceLength - state.distance;
      finish.hidden = state.mode !== 'race' || remaining > 90 || remaining < -12;
      finish.style.top = `${state.phase === 'finished' ? 48 : 76 - remaining * .62}%`;
      const riders = query('.ride-fallback-rivals').children;
      for (let index = 0; index < riders.length; index++) {
        const opponent = state.opponents[index], gap = opponent.distance - state.distance;
        riders[index].hidden = gap < -12 || gap > 42;
        riders[index].style.left = `${50 + opponent.lateral / state.config.roadHalfWidth * 27}%`;
        riders[index].style.top = `${76 - gap * 1.65}%`;
      }
      const markers = query('.ride-fallback-obstacles').children;
      for (let index = 0; index < markers.length; index++) {
        const obstacle = state.obstacles[index], marker = markers[index], gap = obstacle ? obstacle.distance - state.distance : 0;
        marker.hidden = !obstacle || gap <= -12 || gap >= 90;
        if (marker.hidden) continue;
        marker.dataset.type = obstacle.type;
        marker.style.width = `${(obstacle.type === 'barrier' ? 1.8 : .44) / state.config.roadHalfWidth * 27}%`;
        marker.style.left = `${50 + obstacle.lateral / state.config.roadHalfWidth * 27}%`;
        marker.style.top = `${76 - gap * .62}%`;
      }
    }
  }
  function stopFrame() {if (frame) win.cancelAnimationFrame(frame); frame = 0; previousTime = null;}
  function wake() {
    if (!disposed && !frame && state.phase === 'running' && !doc.hidden) frame = win.requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = 0;
    if (disposed || state.phase !== 'running' || doc.hidden) return;
    const dt = previousTime === null ? 0 : clamp((now - previousTime) / 1000, 0, .05); previousTime = now;
    const controls = input();
    stepRide(state, controls, dt); audio.update({speed: state.speed, throttle: controls.throttle, boost: controls.boost});
    const down = state.events?.find(event => event.type === 'knockdown');
    const threat = state.events?.find(event => event.type === 'rival-windup');
    if (down) {
      audio.play('impact');
      if (down.targetId === 'player') {clearInput(); announce('3 号翻滚中，马上重回赛道。', 2.7);}
      else if (down.sourceId === 'player') announce('漂亮，击倒一位。');
    } else if (threat) announce(`${threat.fromSide < 0 ? '左' : '右'}侧骑手准备侧推，换线或刹车。`, .9);
    else if (state.impacts > lastImpacts) {audio.play('impact'); announce('稳住，再找下一个空隙。');}
    else if (state.overtakes > lastOvertakes) announce('漂亮，超过一位。', 1);
    if (!finalCallout && !down && !threat && state.mode === 'race' && state.phase === 'running' && state.config.raceLength - state.distance <= 200) {
      finalCallout = true; announce('最后 200 米，前方就是终点。', 1.5);
    }
    if (lastFallTime > 2.28 && state.fallTime <= 2.28 && state.fallTime > 0) audio.play('impact');
    lastFallTime = state.fallTime || 0;
    lastImpacts = state.impacts; lastOvertakes = state.overtakes;
    if (state.elapsed > feedbackUntil) feedback.classList.remove('is-visible');
    if (state.phase === 'finished') {
      clearInput(); audio.finish({podium: state.resultReason === 'podium'}); stopFrame();
      const podium = state.resultReason === 'podium';
      text(query('[data-ride-result-title]'), podium ? `第 ${state.rank} 名，登上领奖台。` :
        state.rank === 1 ? '第 1 名，迎着风。' : `第 ${state.rank} 名抵达。`);
      text(query('[data-ride-result-detail]'), `${state.goalRank ? `目标前 ${state.goalRank} · ` : ''}${clock(state.elapsed)} · 超越 ${state.overtakes} 次${state.knockdowns ? ` · 击倒 ${state.knockdowns} 次` : ''}`);
      announce(`${podium ? '登上领奖台' : '骑行完成'}，第 ${state.rank} 名，用时 ${clock(state.elapsed)}。`);
      feedback.classList.remove('is-visible');
    }
    render(dt);
    if (state.phase === 'finished') result.querySelector('button').focus({preventScroll: true});
    wake();
  }
  function start() {
    if (disposed || doc.hidden || state.phase !== 'ready') return;
    clearInput(); settings.open = false; startRide(state); previousTime = null;
    void audio.resume();
    if (!soundChosen) {soundChosen = true; void enableSound();}
    render(); wake(); root.focus({preventScroll: true});
  }
  async function enableSound(announceFailure = false) {
    soundPending = true; updateHUD();
    const enabled = await audio.enable();
    if (disposed) return;
    soundPending = false; soundOn = enabled;
    if (state.phase !== 'running' || doc.hidden) audio.pause();
    if (!enabled && announceFailure) announce('声音暂不可用，可以继续安静骑行。');
    updateHUD();
  }
  function pause() {
    if (disposed) return;
    clearInput(); audio.pause(); stopFrame();
    if (state.phase === 'running') setRidePaused(state, true);
    render();
  }
  function resume() {
    if (disposed || doc.hidden || state.phase !== 'paused') return;
    clearInput(); settings.open = false; setRidePaused(state, false); previousTime = null;
    void audio.resume(); render(); wake(); root.focus({preventScroll: true});
  }
  function reset(mode = state.mode, play = false) {
    clearInput(); audio.pause(); stopFrame();
    state = createRideState({difficulty, mode}); lastImpacts = lastOvertakes = feedbackUntil = lastFallTime = 0;
    finalCallout = false;
    feedback.classList.remove('is-visible'); modeSelect.value = state.mode; settings.open = false;
    render(); if (play) start();
  }
  function push(side) {
    if (state.phase !== 'running' || state.fallTime > 0 || doc.hidden) return;
    const previousKnockdowns = state.knockdowns || 0;
    if (pushRide(state, side)) {audio.play('push'); announce((state.knockdowns || 0) > previousKnockdowns ? '漂亮，击倒一位。' : side < 0 ? '左侧，留出空隙。' : '右侧，留出空隙。', .8);}
    else announce('靠近身边的骑手，再试侧推。', 1);
    render();
  }
  listen(root, 'click', async event => {
    if (disposed) return;
    const button = event.target.closest?.('button');
    if (!button || button.disabled || !root.contains(button)) return;
    if (button.dataset.rideControl) {
      if (event.detail === 0 && state.phase === 'running') taps.set(button.dataset.rideControl, state.elapsed + .22);
      return;
    }
    const action = button.dataset.r;
    if (action === 'start') start();
    if (action === 'pause') state.phase === 'paused' ? resume() : pause();
    if (action === 'resume') resume();
    if (action === 'retry') reset(state.mode, true);
    if (action === 'exit') {cleanup(); onExit();}
    if (action === 'push-left') push(-1);
    if (action === 'push-right') push(1);
    if (action === 'sound' && !soundPending) {
      soundChosen = true;
      if (soundOn) {audio.disable(); soundOn = false;}
      else await enableSound(true);
      updateHUD();
    }
  });
  listen(root, 'change', event => {if (event.target === modeSelect) reset(modeSelect.value);});
  listen(settings, 'toggle', () => {if (settings.open) pause(); else updateHUD();});
  listen(root, 'pointerdown', event => {
    const button = event.target.closest?.('[data-ride-control]');
    if (!button || button.disabled || state.phase !== 'running' || state.fallTime > 0 || event.button !== 0 || pointers.has(event.pointerId)) return;
    event.preventDefault(); taps.delete(button.dataset.rideControl);
    pointers.set(event.pointerId, {button, control: button.dataset.rideControl});
    button.classList.add('is-held'); root.focus({preventScroll: true});
    try {button.setPointerCapture(event.pointerId);} catch {releasePointer(event.pointerId);}
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(root, type, event => releasePointer(event.pointerId));
  listen(root, 'keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
        event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    const key = event.key.toLowerCase();
    if (key === 'p' || key === 'escape') {
      event.preventDefault(); if (!event.repeat) state.phase === 'paused' ? resume() : pause(); return;
    }
    if ((key === 'enter' || key === ' ') && state.phase === 'ready' && event.target.tagName !== 'BUTTON') {
      event.preventDefault(); if (!event.repeat) start(); return;
    }
    if (state.phase !== 'running' || state.fallTime > 0) return;
    if (key === 'q' || key === 'e') {event.preventDefault(); if (!event.repeat) push(key === 'q' ? -1 : 1); return;}
    if (['a', 'd', 's', 'w', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'shift', ' '].includes(key)) {
      if (key === ' ' && event.target.tagName === 'BUTTON') return;
      event.preventDefault(); if (!event.repeat || keys.has(key)) keys.add(key);
    }
  });
  const releaseKey = event => keys.delete(event.key?.toLowerCase());
  listen(root, 'keyup', releaseKey); listen(win, 'keyup', releaseKey);
  listen(root, 'focusout', event => {if (!root.contains(event.relatedTarget)) clearInput();});
  listen(win, 'blur', pause); listen(win, 'pagehide', pause);
  listen(doc, 'visibilitychange', () => {if (doc.hidden) pause();});
  listen(container, 'songjian:pause', pause);
  function resize() {
    if (disposed) return;
    try {scene?.resize();} catch (error) {fallback(error);}
    render();
  }
  listen(win, 'resize', resize);
  try {scene = createRideScene(canvas, {reducedMotion});}
  catch (error) {fallback(error);}
  if (win.ResizeObserver) {observer = new win.ResizeObserver(resize); observer.observe(viewport);}
  render();
  if (tripoVehicle?.buffer && scene?.setTripoVehicle) Promise.resolve().then(async () => {
    if (disposed) return;
    try {
      const loaded = await scene.setTripoVehicle(tripoVehicle.buffer, {name: tripoVehicle.name, yaw: tripoVehicle.yaw});
      if (disposed || loaded !== true || !scene) return;
      root.dataset.tripoVehicle = 'ready'; render();
    } catch (error) {if (!disposed) console.warn('Tripo vehicle unavailable; keeping procedural motorcycle.', error);}
  });
  if (tripoTree?.buffer && scene?.setTripoTree) Promise.resolve().then(async () => {
    if (disposed) return;
    try {
      const loaded = await scene.setTripoTree(tripoTree.buffer, {name: tripoTree.name});
      if (disposed || loaded !== true || !scene) return;
      root.dataset.tripoTree = 'ready';
      render();
    } catch (error) {if (!disposed) console.warn('Tripo tree unavailable; keeping procedural forest.', error);}
  });
  if (tripoRider?.buffer && scene?.setTripoRider) Promise.resolve().then(async () => {
    if (disposed) return;
    try {
      const loaded = await scene.setTripoRider(tripoRider.buffer, {name: tripoRider.name});
      if (disposed || loaded !== true || !scene) return;
      root.dataset.tripoRider = 'ready';
      render();
    } catch (error) {if (!disposed) console.warn('Tripo rider unavailable; keeping procedural rider.', error);}
  });
  function cleanup() {
    if (disposed) return; disposed = true;
    clearInput(); stopFrame(); abort.abort(); observer?.disconnect(); audio.dispose(); scene?.dispose(); scene = null; root.remove();
  }
  return cleanup;
}
