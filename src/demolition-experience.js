import {
  DEMO_ROOMS, DEMO_TOOLS, createDemoState, hitDemo, stepDemo, setDemoTool,
  pauseDemo, resumeDemo, drainDemoEvents, getDemoGoals,
} from './demolition-state.js';
import {createDemoScene} from './demolition-scene.js';
import {createReleaseAudio} from './release-audio.js';

let mountId = 0;
const MATERIALS = {wood: '木质', glass: '易碎', fabric: '布艺', metal: '金属'};
const TOOL_MARKS = {hammer: '↘', ball: '●', wave: '◎'};
const PROP_MARKS = {sofa: '▰', table: '┬', cabinet: '▤', shelf: '▥', chair: '⑁',
  screen: '▣', vase: '♧', bottle: '♙', book: '▱', cushion: '◇', lamp: '♧', picture: '▧', speaker: '◉'};
const TRIPO_LABELS = {vase: '花瓶', screen: '电视', sofa: '沙发', table: '桌子', cabinet: '柜子',
  shelf: '书架', chair: '椅子', cushion: '抱枕', lamp: '灯具', picture: '挂画', speaker: '音箱', bottle: '瓶子', book: '书本'};
const escapeHTML = value => String(value).replace(/[&<>"']/g, char =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));

export function mountDemolition(container, {
  difficulty = 'standard', onExit = () => {}, onAnnounce = () => {}, tripoAssets = null,
} = {}) {
  const doc = container.ownerDocument, win = doc.defaultView;
  const uid = `demolition-${++mountId}`, abort = new AbortController();
  const audio = createReleaseAudio();
  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let state = createDemoState({difficulty}), scene = null, observer = null;
  let selectedId = null, view = 'front', gesture = null, frame = 0, previousTime = null;
  let disposed = false, soundOn = false, soundPending = false, lastInventory = '';
  let soundChosen = false, audioRequest = 0;
  const pendingSounds = [];
  let loadedTripoKinds = [];
  let status = '挑一件物品。轻点敲一下，按住再松手更有力。';
  const root = doc.createElement('section');
  root.className = 'experience-shell demolition-experience';
  root.setAttribute('aria-labelledby', `${uid}-title`);
  root.innerHTML = `
    <style>
      .demolition-experience{max-width:1480px;width:100%;--demo-line:#dedace24}
      .demolition-experience .demo-heading{margin-bottom:8px;gap:8px;flex-wrap:nowrap}
      .demolition-experience .demo-title{width:auto}
      .demolition-experience .demo-title h1{font-size:22px;white-space:nowrap}
      .demolition-experience .demo-actions{width:auto;flex-wrap:nowrap;align-items:center;gap:2px}
      .demolition-experience .demo-actions button{min-height:40px;padding:7px 10px}
      .demolition-experience .demo-board{border-radius:14px;background:#292c2b}
      .demolition-experience .demo-stage{height:clamp(420px,70svh,880px);background:#292c2b}
      .demolition-experience [data-tripo-status]{position:absolute;top:14px;left:18px;z-index:1;
        margin:0;font-size:10px;color:#e6e2d2ad;pointer-events:none;text-shadow:0 1px 4px #000}
      .demolition-experience .demo-room-foot{min-height:34px;padding:7px 14px;gap:12px;background:#1c2625;font-size:10px}
      .demolition-experience .demo-selected{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .demolition-experience .demo-dock{border:0;border-radius:0;border-top:1px solid var(--demo-line);padding:6px 10px;gap:12px;background:#182724}
      .demolition-experience .demo-tools{flex:1 1 300px}
      .demolition-experience .demo-tools button{min-height:44px;padding:6px 12px;border-radius:8px;gap:7px}
      .demolition-experience .demo-tool-mark{font-size:22px;min-width:22px}
      .demolition-experience .demo-tools kbd{align-self:center}
      .demolition-experience .demo-accessible{flex:0 1 320px;border:0;padding:0;gap:7px}
      .demolition-experience .demo-accessible select{min-height:38px}
      .demolition-experience .demo-strike{min-height:38px;padding:7px 13px}
      .demolition-experience .demo-caption{margin-top:7px;gap:12px;font-size:10px;align-items:baseline}
      .demolition-experience .demo-caption .demo-help{flex:0 1 auto;max-width:none}
      .demolition-experience .demo-help[open]{flex-basis:100%;max-width:100%}
      .demolition-experience .demo-caption:has(.demo-help[open]){flex-wrap:wrap}
      .demolition-experience .demo-options{position:relative;font-size:11px}
      .demolition-experience .demo-options>summary{padding:10px;cursor:pointer;list-style:none;color:var(--demo-muted)}
      .demolition-experience .demo-options-panel{position:absolute;right:0;top:44px;width:min(370px,86vw);
        z-index:5;padding:16px;border:1px solid #b6b6a841;border-radius:12px;background:#1b2e2b;box-shadow:0 14px 40px #0006}
      .demolition-experience .demo-options-panel .demo-rooms{margin:0 0 12px;gap:5px}
      .demolition-experience .demo-options-panel .demo-rooms button{padding:8px;min-height:40px;justify-content:center;font-size:11px}
      .demolition-experience .demo-settings-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .demolition-experience .demo-room-copy{margin:12px 0 0;font-size:10px}
      .demolition-experience .demo-goals{border:0;padding:8px 0;margin:0;background:none}
      .demolition-experience [data-action="next"]{background:transparent;border:0;color:#e8b590;cursor:pointer;font-size:11px}
      @media(max-width:760px){
        .demolition-experience .demo-title h1{font-size:18px}
        .demolition-experience .demo-actions button{font-size:10px;padding:6px}
        .demolition-experience .demo-options>summary{padding:8px 6px}
        .demolition-experience .demo-stage{height:clamp(380px,62svh,620px)}
        .demolition-experience .demo-room-foot{gap:6px;padding:6px 10px}
        .demolition-experience .demo-selected{flex-basis:auto;max-width:60%}
        .demolition-experience .demo-charge>span{min-width:0}
        .demolition-experience .demo-charge progress{width:45px}
        .demolition-experience .demo-tally{display:none}
        .demolition-experience .demo-dock{gap:5px;padding:5px 8px}
        .demolition-experience .demo-tools{flex-basis:100%}
        .demolition-experience .demo-accessible{flex:1 1 100%;padding:0;border:0}
        .demolition-experience .demo-accessible label{display:none}
        .demolition-experience .demo-caption{flex-wrap:nowrap}
        .demolition-experience .demo-help summary{white-space:nowrap}
      }
    </style>
    <header class="demo-heading">
      <div class="demo-title"><h1 id="${uid}-title">下班拆家<span>。</span></h1></div>
      <div class="demo-actions" aria-label="游戏控制">
        <button type="button" data-action="pause">Ⅱ 暂停</button>
        <button type="button" data-action="reset">↺ 还原</button>
        <button type="button" data-action="sound" aria-pressed="false">声音：自动</button>
        <details class="demo-options"><summary>设置</summary>
          <div class="demo-options-panel">
            <div class="demo-rooms" role="group" aria-label="选择房间">
              ${DEMO_ROOMS.map(room => `<button type="button" data-room="${room.id}" aria-pressed="false">${escapeHTML(room.name)}</button>`).join('')}
            </div>
            <div class="demo-settings-row">
              <div class="demo-views" role="group" aria-label="房间视角">
                <button type="button" data-view="left" aria-pressed="false">左侧</button>
                <button type="button" data-view="front" aria-pressed="true">正面</button>
                <button type="button" data-view="right" aria-pressed="false">右侧</button>
              </div>
            </div>
            <p class="demo-room-copy"></p>
          </div>
        </details>
        <button type="button" data-action="exit">返回 ↗</button>
      </div>
    </header>
    <div class="demo-board">
      <div class="demo-stage" tabindex="0" role="group" aria-label="可拆卸的房间" aria-describedby="${uid}-instructions">
        <p data-tripo-status hidden></p>
        <canvas class="demo-canvas" aria-hidden="true"></canvas>
        <div class="demo-fallback" hidden>
          <p>简化视图 · 选择物件，同样可以拆</p>
          <div class="demo-props" role="group" aria-label="房间物件"></div>
        </div>
        <div class="demo-paused" hidden>
          <span>TAKE YOUR TIME</span><h2>房间等你回来。</h2>
          <p>物件和碎片都停好了。</p>
          <button type="button" data-action="resume">继续拆家 ↗</button>
        </div>
      </div>
      <div class="demo-room-foot">
        <p class="demo-selected"></p>
        <div class="demo-charge"><span data-charge-label>按住蓄力</span><progress max="1" value="0" aria-label="打击蓄力"></progress></div>
        <span class="demo-tally"></span>
      </div>
    <div class="demo-dock">
      <div class="demo-tools" role="group" aria-label="选择拆家工具">
        ${DEMO_TOOLS.map((tool, index) => `<button type="button" data-tool="${tool.id}" aria-pressed="false" title="${escapeHTML(tool.hint)}"><span class="demo-tool-mark" aria-hidden="true">${TOOL_MARKS[tool.id]}</span><span>${escapeHTML(tool.name)}</span><kbd>${index + 1}</kbd></button>`).join('')}
      </div>
      <div class="demo-accessible">
        <label for="${uid}-target">选择物件</label><select id="${uid}-target" data-target-select></select>
        <button type="button" class="demo-strike" data-action="strike">敲一下 ↘</button>
      </div>
    </div>
    </div>
    <div class="demo-caption">
      <p class="demo-status" role="status" aria-live="polite"></p>
      <button type="button" data-action="next" hidden>换个房间 ↗</button>
      <details class="demo-help"><summary>目标与玩法</summary>
        <div class="demo-goals" aria-label="可选的小目标"><div class="demo-goal-items"></div></div>
        <p id="${uid}-instructions">点物品敲击，按住再松手更有力。拆掉支撑物，试试连锁。方向键切换物件，1 / 2 / 3 换工具，空格蓄力、松开敲击，P 暂停。也可用“选择物件”和“敲一下”。不计时，目标完成后仍可继续拆。</p>
      </details>
    </div>`;
  container.append(root);
  const query = selector => root.querySelector(selector);
  const stage = query('.demo-stage'), canvas = query('canvas'), fallback = query('.demo-fallback');
  const props = query('.demo-props'), targetSelect = query('[data-target-select]');
  const roomCopy = query('.demo-room-copy'), selectedCopy = query('.demo-selected');
  const chargeMeter = query('progress'), chargeLabel = query('[data-charge-label]');
  const tally = query('.demo-tally'), goals = query('.demo-goal-items');
  const statusCopy = query('.demo-status'), pausedCover = query('.demo-paused');
  const tripoStatus = query('[data-tripo-status]');
  const pauseButton = query('[data-action="pause"]'), soundButton = query('[data-action="sound"]');
  const strikeButton = query('[data-action="strike"]'), nextButton = query('[data-action="next"]');
  const roomButtons = [...root.querySelectorAll('[data-room]')];
  const toolButtons = [...root.querySelectorAll('[data-tool]')];
  const viewButtons = [...root.querySelectorAll('[data-view]')];
  const living = () => state.objects.filter(object => !object.destroyed && object.hp > 0);
  const findTarget = id => state.objects.find(object => object.id === id && !object.destroyed && object.hp > 0);
  const currentCharge = () => gesture ? Math.min(1, .35 + .65 * (state.elapsed - gesture.started) / .8) : 0;
  const listen = (target, type, fn) => target.addEventListener(type, fn, {signal: abort.signal});

  function announce(message) {
    status = message;
    if (statusCopy.textContent !== message) statusCopy.textContent = message;
    onAnnounce(message);
  }

  function cancelGesture() {
    const old = gesture;
    gesture = null;
    if (old?.kind === 'pointer') {
      try {if (stage.hasPointerCapture(old.pointerId)) stage.releasePointerCapture(old.pointerId);} catch {}
    }
  }

  function useFallback(error) {
    console.warn('拆家 3D 场景不可用，已切换简化视图。', error);
    cancelGesture();
    const oldScene = scene; scene = null;
    try {oldScene?.dispose();} catch {}
    canvas.hidden = true; fallback.hidden = false;
    loadedTripoKinds = []; tripoStatus.hidden = true; tripoStatus.textContent = '';
    root.classList.add('demo-is-fallback'); lastInventory = '';
    for (const button of viewButtons) button.disabled = true;
  }

  function updateUI() {
    if (disposed) return;
    const remaining = living(), paused = state.phase !== 'playing';
    if (!findTarget(selectedId)) selectedId = remaining[0]?.id ?? null;
    const selected = findTarget(selectedId), charge = currentCharge();
    root.dataset.phase = state.phase;
    pausedCover.hidden = !paused;
    pauseButton.textContent = paused ? '▶ 继续' : 'Ⅱ 暂停';
    soundButton.textContent = `声音：${!soundChosen ? '自动' : soundOn ? '开' : '关'}${paused && soundOn ? ' · 暂停' : ''}`;
    soundButton.title = soundPending ? '声音准备中，点击可静音' : !soundChosen ? '首次敲击时开启音效；点击可手动开启' : '点击切换音效';
    soundButton.setAttribute('aria-pressed', String(soundOn));
    soundButton.disabled = false;
    roomCopy.textContent = DEMO_ROOMS.find(room => room.id === state.room)?.subtitle ?? '';
    tripoStatus.hidden = !scene || !loadedTripoKinds.length;
    tripoStatus.textContent = loadedTripoKinds.length
      ? `Tripo 家具：${loadedTripoKinds.map(kind => Object.hasOwn(TRIPO_LABELS, kind) ? TRIPO_LABELS[kind] : kind).join('、')}` : '';
    for (const button of roomButtons) button.setAttribute('aria-pressed', String(button.dataset.room === state.room));
    for (const button of toolButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.tool === state.tool)); button.disabled = paused;
    }
    for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === view));
    selectedCopy.textContent = selected ? `${selected.label} · ${MATERIALS[selected.material]} · 完好度 ${Math.ceil(selected.hp / selected.maxHp * 100)}%` : '房间清空了。随时还原，再拆一次。';
    chargeMeter.value = charge;
    chargeLabel.textContent = paused ? '已暂停' : charge ? (charge >= 1 ? '满力 · 松手敲击' : `蓄力 ${Math.round(charge * 100)}%`) : state.cooldown > 0 ? '工具回弹中…' : '按住蓄力';
    tally.textContent = `已拆 ${state.stats.destroyed} / ${state.objects.length} · 连锁 ${state.stats.bestChain}`;
    const inventory = remaining.map(object => `${object.id}:${object.hp}`).join('|');
    if (inventory !== lastInventory) {
      lastInventory = inventory;
      targetSelect.innerHTML = remaining.length ? remaining.map(object => `<option value="${object.id}">${escapeHTML(object.label)} · ${Math.ceil(object.hp / object.maxHp * 100)}%</option>`).join('') : '<option value="">房间已清空</option>';
      if (!scene) props.innerHTML = remaining.map(object => `<button type="button" data-prop="${object.id}" aria-pressed="false"><span aria-hidden="true">${PROP_MARKS[object.kind] ?? '◇'}</span><strong>${escapeHTML(object.label)}</strong><small>${MATERIALS[object.material]} · ${Math.ceil(object.hp / object.maxHp * 100)}%</small></button>`).join('');
    }
    targetSelect.value = selectedId ?? '';
    targetSelect.disabled = paused || !remaining.length;
    strikeButton.disabled = paused || !selected || state.cooldown > 0 || !!gesture;
    for (const button of props.querySelectorAll('[data-prop]')) {
      button.disabled = paused || state.cooldown > 0;
      button.setAttribute('aria-pressed', String(button.dataset.prop === selectedId));
    }
    const goalHTML = getDemoGoals(state).map(goal => `<div class="demo-goal${goal.done ? ' is-done' : ''}"><span>${goal.done ? '✓' : '○'} ${escapeHTML(goal.label)}</span><small>${Math.min(goal.current, goal.target)} / ${goal.target}</small></div>`).join('');
    if (goals._content !== goalHTML) {goals.innerHTML = goalHTML; goals._content = goalHTML;}
    nextButton.hidden = !state.completed;
    if (statusCopy.textContent !== status) statusCopy.textContent = status;
  }

  function render(dt = 0) {
    updateUI();
    if (scene) {
      try {scene.render(state, {selectedId, charge: currentCharge()}, dt);}
      catch (error) {useFallback(error); updateUI();}
    }
  }

  function processEvents() {
    const events = drainDemoEvents(state);
    const strike = events.find(event => event.type === 'strike');
    if (strike) playSound({hammer: 1, ball: 0, wave: 3}[strike.tool] ?? 0, Math.min(1, strike.power || .7));
    const broken = events.filter(event => event.type === 'break');
    if (broken.some(event => event.material === 'glass')) playSound(2, .65);
    const chain = events.filter(event => event.type === 'chain').sort((a, b) => b.count - a.count)[0];
    if (events.some(event => event.type === 'complete')) announce('小目标都完成了！可以继续拆，也可以换个房间。');
    else if (chain?.count > 1) announce(`连锁拆下 ${chain.count} 件，舒服一点了。`);
    else if (broken.length) announce(`拆下 ${broken.length} 件。试试物件底下的支撑。`);
    else if (events.some(event => event.type === 'damage')) announce('留下了一道裂痕。按住蓄力，或换个工具试试。');
  }

  function wake() {
    if (!disposed && !frame && state.phase === 'playing' && !doc.hidden) frame = win.requestAnimationFrame(tick);
  }

  function tick(time) {
    frame = 0;
    if (disposed || state.phase !== 'playing' || doc.hidden) return;
    const dt = previousTime === null ? 0 : Math.max(0, Math.min(.05, (time - previousTime) / 1000));
    previousTime = time;
    stepDemo(state, dt); processEvents(); render(dt); wake();
  }

  function stopFrame() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0; previousTime = null;
  }

  function pause({focus = false} = {}) {
    if (disposed) return;
    pendingSounds.length = 0;
    cancelGesture(); pauseDemo(state); audio.pause(); stopFrame(); render();
    if (focus) query('[data-action="resume"]').focus();
  }

  function resume() {
    if (disposed || doc.hidden) return;
    cancelGesture(); resumeDemo(state); previousTime = null;
    void resumeSound(); render(); wake(); stage.focus();
  }

  function reset(room = state.room) {
    cancelGesture(); stopFrame(); audio.pause();
    pendingSounds.length = 0;
    const tool = state.tool;
    state = createDemoState({room, difficulty: state.difficulty});
    setDemoTool(state, tool);
    selectedId = null; lastInventory = '';
    if (doc.hidden) pauseDemo(state); else void resumeSound();
    announce('房间还原好了。从喜欢的物件开始。');
    render(); wake();
  }

  function strike(id, charge = 1) {
    if (disposed || state.phase !== 'playing' || doc.hidden || !findTarget(id)) return;
    unlockSound();
    selectedId = id;
    if (hitDemo(state, id, {charge})) processEvents();
    render(); wake();
  }

  function beginGesture(kind, id, pointerId) {
    if (gesture || disposed || state.phase !== 'playing' || doc.hidden || state.cooldown > 0 || !findTarget(id)) return false;
    unlockSound();
    selectedId = id; gesture = {kind, pointerId, targetId: id, started: state.elapsed};
    render(); return true;
  }

  function releaseGesture() {
    const old = gesture, charge = currentCharge();
    cancelGesture();
    if (old) strike(old.targetId, charge);
  }

  function playSound(note, strength) {
    if (!soundOn || disposed || state.phase !== 'playing' || doc.hidden) return;
    if (soundPending) {
      pendingSounds.push([note, strength]);
      if (pendingSounds.length > 4) pendingSounds.shift();
    } else audio.hit(note, strength);
  }

  function flushSounds() {
    const sounds = pendingSounds.splice(0);
    if (!disposed && soundOn && state.phase === 'playing' && !doc.hidden) {
      for (const [note, strength] of sounds) audio.hit(note, strength);
    }
  }

  async function activateSound(resuming = false) {
    const request = ++audioRequest, wasPlaying = state.phase === 'playing' && !doc.hidden;
    soundPending = soundOn;
    try {
      // enable() records preference even when paused, where false means no
      // activation. Keep preference separate and never unpause audio to set it.
      const active = await (resuming ? audio.resume() : audio.enable());
      if (disposed || request !== audioRequest) return;
      if (!active && wasPlaying && state.phase === 'playing' && !doc.hidden) {
        audio.disable(); soundOn = false;
        announce('声音暂时不可用，仍可以安静地拆家。');
      }
    } catch {
      if (!disposed && request === audioRequest) {
        audio.disable(); soundOn = false; announce('声音暂时不可用，仍可以安静地拆家。');
      }
    } finally {
      if (!disposed && request === audioRequest) {
        soundPending = false; flushSounds(); render();
      }
    }
  }

  function resumeSound() {return activateSound(true);}

  function unlockSound() {
    if (soundChosen) return;
    soundChosen = true; soundOn = true;
    // Called synchronously from pointer/key/accessible strike handlers so
    // browsers may unlock audio. A pending first impact is played once ready.
    void activateSound();
  }

  async function toggleSound() {
    if (disposed) return;
    soundChosen = true;
    if (soundOn) {
      audioRequest++; soundOn = soundPending = false; pendingSounds.length = 0;
      audio.disable(); render(); return;
    }
    soundOn = true;
    const enabling = activateSound(); render();
    await enabling;
  }

  listen(root, 'click', event => {
    if (disposed) return;
    const button = event.target.closest?.('button');
    if (!button || !root.contains(button) || button.disabled) return;
    const {action, room, tool, view: nextView, prop} = button.dataset;
    if (action === 'exit') {cleanup(); onExit(); return;}
    if (action === 'pause') {state.phase === 'playing' ? pause({focus: true}) : resume(); return;}
    if (action === 'resume') {resume(); return;}
    if (action === 'reset') {reset(); return;}
    if (action === 'sound') return toggleSound();
    if (action === 'strike') {cancelGesture(); strike(selectedId); return;}
    if (action === 'next' && state.completed) {
      reset(DEMO_ROOMS[(DEMO_ROOMS.findIndex(item => item.id === state.room) + 1) % DEMO_ROOMS.length].id); return;
    }
    if (room) {reset(room); return;}
    if (tool) {cancelGesture(); setDemoTool(state, tool); announce(DEMO_TOOLS.find(item => item.id === tool).hint); render(); return;}
    if (nextView) {
      cancelGesture(); view = nextView;
      try {scene?.setView(view);} catch (error) {useFallback(error);}
      render(); return;
    }
    // Pointer input already strikes on release. Native keyboard/AT clicks
    // have detail 0 and retain direct access to every remaining prop.
    if (prop && event.detail === 0) {cancelGesture(); strike(prop);}
  });
  listen(root, 'change', event => {
    if (event.target !== targetSelect || targetSelect.disabled) return;
    cancelGesture(); selectedId = findTarget(targetSelect.value)?.id ?? selectedId; render();
  });
  listen(stage, 'pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false || gesture) return;
    if (event.target.closest?.('.demo-paused')) return;
    let id = null;
    if (scene) {
      try {id = scene.pick(event.clientX, event.clientY);} catch (error) {useFallback(error); render(); return;}
    } else id = event.target.closest?.('[data-prop]')?.dataset.prop;
    if (!beginGesture('pointer', id, event.pointerId)) return;
    event.preventDefault(); stage.focus();
    try {stage.setPointerCapture(event.pointerId);} catch {cancelGesture(); render();}
  });
  listen(stage, 'pointerup', event => {
    if (gesture?.kind !== 'pointer' || gesture.pointerId !== event.pointerId) return;
    const bounds = stage.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.left + bounds.width ||
        event.clientY < bounds.top || event.clientY > bounds.top + bounds.height) {
      cancelGesture(); render(); return;
    }
    event.preventDefault(); releaseGesture();
  });
  for (const type of ['pointercancel', 'lostpointercapture']) listen(stage, type, event => {
    if (gesture?.kind === 'pointer' && gesture.pointerId === event.pointerId) {cancelGesture(); render();}
  });

  const nativeControl = target => !!target?.closest?.('button,select,input,textarea,summary,[contenteditable="true"]');
  listen(root, 'keydown', event => {
    if (disposed || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || nativeControl(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === 'p') {event.preventDefault(); if (!event.repeat) state.phase === 'playing' ? pause({focus: true}) : resume(); return;}
    if (gesture?.kind === 'pointer' || state.phase !== 'playing') return;
    if (key === ' ' || event.code === 'Space') {
      event.preventDefault(); if (!event.repeat) beginGesture('key', selectedId); return;
    }
    if (gesture) return;
    const toolIndex = ['1', '2', '3'].indexOf(key);
    if (toolIndex >= 0) {
      event.preventDefault(); setDemoTool(state, DEMO_TOOLS[toolIndex].id); render(); return;
    }
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
      event.preventDefault();
      const remaining = living(), index = remaining.findIndex(object => object.id === selectedId);
      if (remaining.length) selectedId = remaining[(index + (key === 'arrowleft' || key === 'arrowup' ? -1 : 1) + remaining.length) % remaining.length].id;
      render();
    }
  });
  listen(root, 'keyup', event => {
    if (gesture?.kind !== 'key' || !(event.key === ' ' || event.code === 'Space')) return;
    event.preventDefault();
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || nativeControl(event.target)) {cancelGesture(); render();}
    else releaseGesture();
  });
  listen(root, 'focusout', event => {
    if (gesture?.kind === 'key' && event.relatedTarget !== event.target) {cancelGesture(); render();}
  });
  listen(win, 'blur', () => pause());
  listen(win, 'pagehide', () => pause());
  listen(doc, 'visibilitychange', () => {if (doc.hidden) pause();});
  listen(container, 'songjian:pause', () => pause());
  function resize() {
    if (disposed) return;
    try {scene?.resize();} catch (error) {useFallback(error);}
    render();
  }
  listen(win, 'resize', resize);
  if (win.ResizeObserver) {observer = new win.ResizeObserver(resize); observer.observe(stage);}
  try {scene = createDemoScene(canvas, {reducedMotion}); scene.setView(view);}
  catch (error) {useFallback(error);}
  if (doc.hidden) pause(); else {render(); wake();}
  if (scene && tripoAssets) {
    const owner = scene;
    void owner.setTripoAssets(tripoAssets).then(result => {
      // A fallback, exit or later mount can overtake image decoding.
      if (disposed || scene !== owner) return;
      loadedTripoKinds = [...new Set(result.loaded || [])];
      render();
    }).catch(error => {
      if (disposed || scene !== owner) return;
      console.warn('Tripo 家具载入失败，保留当前家具。', error);
      render();
    });
  }

  function cleanup() {
    if (disposed) return;
    disposed = true;
    audioRequest++; pendingSounds.length = 0;
    cancelGesture(); pauseDemo(state); stopFrame(); abort.abort();
    observer?.disconnect(); audio.destroy();
    try {scene?.dispose();} finally {scene = null; root.remove();}
  }
  return cleanup;
}
