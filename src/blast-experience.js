import {
  BLAST_LAYOUTS, BLAST_TYPES, createBlastState, selectBlastTarget, setBlastType,
  plantBlast, removeBlast, detonateBlast, stepBlast, pauseBlast, resumeBlast,
  retryBlast, nextBlast, getBlastProgress, drainBlastEvents,
} from './blast-state.js';
import {createBlastScene} from './blast-scene.js';
import {createReleaseAudio} from './release-audio.js';

let mountId = 0;

/** tripoAssets accepts embedded {buffer,name} entries for sofa, tv (or screen)
 * and car. The hub may pass its existing room/crusher asset map unchanged.
 */
export function mountBlast(container, {
  difficulty = 'standard', onExit = () => {}, onAnnounce = () => {}, tripoAssets = null, muted = false,
} = {}) {
  const doc = container.ownerDocument, win = doc.defaultView;
  const uid = `blast-${++mountId}`;
  const abort = new (win.AbortController || AbortController)();
  const audio = createReleaseAudio();
  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let state = createBlastState({difficulty}), scene = null, fallback = false, disposed = false;
  let frame = 0, previousTime = 0, pointer = null, soundOn = false, soundWanted = !muted;
  let soundPending = null, soundCue = null;
  let uiSignature = '', optionSignature = '', fallbackLayout = '', currentView = 'right';
  let assetsLoading = false, assetFailures = [], cargoSignature = '';
  const diagramPieces = new Map();
  const root = doc.createElement('section');
  root.className = 'experience-shell blast-experience';
  root.setAttribute('aria-labelledby', `${uid}-title`);
  root.innerHTML = `
    <header class="blast-heading">
      <div><p class="blast-eyebrow">A LITTLE ROOM TO LET GO <span> / 3D</span></p>
        <h1 id="${uid}-title">轰隆，小楼松开了<span>。</span></h1>
        <p>选一个落点，让一点小动静，带来一整片松弛。</p></div>
      <div class="blast-modes" role="group" aria-label="选择玩法">
        <button type="button" data-mode="challenge" aria-pressed="true">连锁挑战</button>
        <button type="button" data-mode="practice" aria-pressed="false">随心练习</button>
      </div>
    </header>
    <nav class="blast-layouts" aria-label="选择建筑">
      ${BLAST_LAYOUTS.map((layout, index) => `<button type="button" data-layout="${layout.id}" aria-pressed="${index === 0}">
        <span class="blast-layout-icon is-${layout.id}" aria-hidden="true">▥</span>
        <span><small>0${index + 1}</small>${layout.name}</span><i aria-hidden="true">↗</i></button>`).join('')}
    </nav>
    <div class="blast-board">
      <div class="blast-hud">
        <div><span>本轮坍塌</span><strong data-stat="percent">0<small>%</small></strong><span data-stat="goal"></span></div>
        <div class="blast-chain"><span>连锁掉落</span><strong data-stat="chain">0</strong><span>块</span></div>
        <span class="blast-phase" data-stat="phase">PLANT / 放置标记</span>
      </div>
      <div class="blast-meter" role="progressbar" aria-label="建筑坍塌比例" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i><b></b></div>
      <div class="blast-arena" tabindex="0" role="group" aria-label="建筑拆除游戏区域" aria-describedby="${uid}-instruction">
        <canvas class="blast-canvas" aria-hidden="true"></canvas>
        <div class="blast-site-markers" aria-hidden="true"></div>
        <div class="blast-fallback" hidden>
          <p class="blast-fallback-label">简化视图 · 点击构件，玩法相同</p>
          <div class="blast-diagram" role="group" aria-label="可点击的建筑示意图"></div>
          <div class="blast-diagram-markers" aria-hidden="true"></div>
        </div>
        <div class="blast-site-label" aria-hidden="true"><span data-stat="site">LITTLE HOUSE</span><small data-stat="cargo">MINIATURE WORKSITE</small></div>
        <div class="blast-pause-cover" hidden><span>TAKE YOUR TIME</span><h2>小楼也歇一会。</h2>
          <p>已暂停。准备好后再继续。</p><button type="button" data-action="resume">继续 ↗</button></div>
      </div>
      <div class="blast-view-bar">
        <p id="${uid}-instruction"><span aria-hidden="true">◎</span> 点楼体选落点 → 放置标记 → 一起引爆</p>
        <div role="group" aria-label="相机角度">
          <button type="button" data-view="left" aria-pressed="false" aria-label="左侧视角">左</button>
          <button type="button" data-view="front" aria-pressed="false" aria-label="正面视角">正</button>
          <button type="button" data-view="right" aria-pressed="true" aria-label="右侧视角">右</button>
        </div>
      </div>
      <section class="blast-result" aria-label="本轮结果" hidden>
        <div><p class="blast-eyebrow" data-result="eyebrow"></p><h2 tabindex="-1"></h2><p data-result="detail"></p></div>
        <div><button type="button" data-action="retry">再试一次</button><button type="button" class="blast-primary" data-action="next">下一座 ↗</button></div>
      </section>
      <div class="blast-controls">
        <div class="blast-placement">
          <div class="blast-type-buttons" role="group" aria-label="选择虚拟波纹范围">
            ${BLAST_TYPES.map(type => `<button type="button" data-type="${type.id}" aria-pressed="${type.id === 'small'}">
              <span class="blast-pulse-icon is-${type.id}" aria-hidden="true">◎</span><span><small>${type.caption}</small>${type.name}</span></button>`).join('')}
          </div>
          <div class="blast-target">
            <label for="${uid}-target">选择落点 <span>也可以用键盘</span></label>
            <select id="${uid}-target" data-target-select aria-label="选择建筑构件"><option value="">先点一下楼体</option></select>
          </div>
          <button type="button" class="blast-plant" data-action="plant" disabled>＋ 放置标记</button>
        </div>
        <div class="blast-detonation">
          <div class="blast-marker-summary"><p data-stat="budget"></p>
            <div class="blast-marker-list" aria-label="已放置的标记"></div>
            <button type="button" class="blast-undo" data-action="undo" disabled>撤销上一枚</button></div>
          <button type="button" class="blast-primary blast-detonate" data-action="detonate" disabled><span aria-hidden="true">✳</span> 一起引爆 <b>↗</b></button>
        </div>
      </div>
    </div>
    <div class="blast-toolbar">
      <p class="blast-status" role="status" aria-live="polite"></p>
      <div><button type="button" data-action="pause">Ⅱ 暂停</button><button type="button" data-action="reset">↺ 重置</button>
        <button type="button" data-action="sound" aria-pressed="${soundWanted}">声音：${soundWanted ? '开' : '关'}</button></div>
    </div>
    <details class="blast-help"><summary>怎么玩 · 键盘操作 <span aria-hidden="true">＋</span></summary>
      <p>点选楼体上的位置，选择 SMALL 或 WIDE，放下标记后一起引爆。移走支点，上方的横梁、楼板和窗墙会依次掉落。橙色圆环表示虚拟波纹的范围；标记放好后仍可撤销。</p>
      <p data-stat="cargo-instruction" hidden>真实家具放在楼板上。点家具会选中它下方的承托楼板；支点松开后，实物也会翻落并留在现场。重置会把楼板和实物一同复位。</p>
      <p data-stat="rules"></p>
      <p>键盘：用“选择落点”列表选构件；或聚焦画面，用方向键轮换、1 / 2 切换范围、空格放标记、Enter 引爆、P 暂停。按钮也都可以用 Tab 到达。切换窗口会自动暂停，需要手动继续。</p>
      <p>这是小小的抽象连锁游戏。没有倒计时，想停就停。</p>
    </details>
    <footer class="blast-footer"><span>留一点空地，给好心情。</span><button type="button" data-action="exit">回到拆除乐园 ↗</button></footer>`;
  // The mount owns its stylesheet too; native module consumers need no index edits.
  const stylesheet = doc.createElement('link');
  stylesheet.rel = 'stylesheet';
  // Entry-relative so the same mount survives the app's IIFE build and file:// release.
  stylesheet.href = new URL('src/blast.css', doc.baseURI).href;
  root.append(stylesheet);
  container.append(root);
  const $ = selector => root.querySelector(selector);
  const action = name => $(`[data-action="${name}"]`);
  const stat = name => $(`[data-stat="${name}"]`);
  const arena = $('.blast-arena'), canvas = $('.blast-canvas'), targetSelect = $('[data-target-select]');
  const diagram = $('.blast-diagram'), status = $('.blast-status');
  const listen = (target, type, callback) => target.addEventListener(type, callback, {signal: abort.signal});
  const layout = () => BLAST_LAYOUTS.find(item => item.id === state.layout);
  function announce(message) {status.textContent = message; onAnnounce(message);}
  function updateCargoUI() {
    const cargo = scene?.getTripoStatus?.() || {loaded: [], total: 0, salvaged: 0};
    const mode = fallback ? 'fallback' : cargo.total && cargo.loaded.length ? 'loaded'
      : assetsLoading ? 'loading' : assetFailures.length ? 'failed' : 'local';
    const signature = `${mode}/${cargo.total}/${cargo.salvaged}/${assetFailures.length}`;
    if (cargoSignature === signature) return;
    cargoSignature = signature; root.dataset.asset = mode;
    stat('cargo').textContent = mode === 'loaded' ? `Tripo 实物 ${cargo.total} · 已落地 ${cargo.salvaged} / ${cargo.total}`
      : mode === 'loading' ? '实物载入中 · 可先放置标记' : mode === 'failed' ? '实物未载入 · 建筑可照常拆'
        : mode === 'fallback' ? '简化建筑示意图' : 'MINIATURE WORKSITE';
    stat('cargo').title = assetFailures.length ? '部分实物未载入；已载入的物件仍可游玩。' : '';
    stat('cargo-instruction').hidden = mode !== 'loaded';
  }
  function updateSoundControl() {
    const control = action('sound');
    // Display the preference; allow muting while device activation is pending.
    control.disabled = state.paused;
    control.setAttribute('aria-pressed', String(soundWanted));
    control.textContent = `声音：${soundWanted ? '开' : '关'}${state.paused ? ' · 已暂停' : ''}`;
  }
  function silenceSound(disable = false) {
    soundPending = soundCue = null;
    soundOn = false;
    if (disable) audio.disable(); else audio.pause();
  }
  async function gestureSound(note, strength = .2) {
    if (disposed || !soundWanted || state.paused || doc.hidden) return;
    if (note !== undefined) soundCue = {note, strength};
    if (soundPending) return;
    const request = {};
    soundPending = request;
    let enabled = false;
    try {
      // Both calls start inside the click/keypress, before yielding activation.
      void audio.resume();
      enabled = await audio.enable();
    } catch { /* Unavailable hardware does not interrupt the building game. */ }
    if (disposed || soundPending !== request) return;
    soundPending = null;
    if (!soundWanted || state.paused || doc.hidden) {
      silenceSound(!soundWanted); updateSoundControl(); return;
    }
    soundOn = enabled;
    const cue = soundCue; soundCue = null;
    if (enabled && cue) audio.hit(cue.note, cue.strength);
    if (!enabled) {
      soundWanted = false; audio.disable();
      announce('当前设备暂时无法开启声音，可以继续安静地玩。');
    }
    updateSoundControl();
  }
  function stopLoop() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = previousTime = 0;
  }
  function startLoop() {
    if (!disposed && !frame && !doc.hidden && !state.paused && state.phase === 'collapsing') frame = win.requestAnimationFrame(tick);
  }
  function diagramPosition(point) {
    const top = state.layout === 'tower' ? 9.5 : state.layout === 'bridge' ? 5.2 : 7.5;
    return {left: 50 + (point.x + point.z * .45) * 7, top: 87 - point.y / top * 77 + point.z * 1.2};
  }
  function drawFallback() {
    if (!fallback) return;
    if (fallbackLayout !== state.layout || diagramPieces.size !== state.pieces.length) {
      fallbackLayout = state.layout;
      diagram.innerHTML = ''; diagramPieces.clear();
      for (const piece of state.pieces) {
        const item = doc.createElement('button');
        item.type = 'button'; item.className = `blast-map-piece is-${piece.kind}`;
        item.setAttribute('data-piece', piece.id); item.setAttribute('aria-label', piece.label);
        item.setAttribute('tabindex', '-1'); item.title = piece.label;
        item.textContent = piece.kind === 'wall' ? '▥' : '';
        diagram.append(item); diagramPieces.set(piece.id, item);
      }
    }
    const top = state.layout === 'tower' ? 9.5 : state.layout === 'bridge' ? 5.2 : 7.5;
    for (const piece of state.pieces) {
      const item = diagramPieces.get(piece.id), point = diagramPosition(piece.position);
      item.style.left = `${point.left}%`; item.style.top = `${point.top}%`;
      item.style.width = `${Math.max(1.9, (piece.size.x + piece.size.z * .3) * 7)}%`;
      item.style.height = `${Math.max(1.4, piece.size.y / top * 77)}%`;
      item.style.transform = `translate(-50%, -50%) rotate(${-piece.rotation.z}rad)`;
      item.style.backgroundColor = `#${piece.color.toString(16).padStart(6, '0')}`;
      item.style.zIndex = String(20 + Math.round(piece.position.z * 3 + piece.position.y));
      item.disabled = piece.status !== 'stable' || state.phase !== 'planning' || state.paused;
      item.setAttribute('aria-pressed', String(piece.id === state.selectedId));
      item.classList.toggle('is-rubble', piece.status !== 'stable');
    }
    $('.blast-diagram-markers').innerHTML = state.markers.map((marker, i) => {
      const point = diagramPosition(marker.point);
      return `<span style="left:${point.left}%;top:${point.top}%">${i + 1}</span>`;
    }).join('');
  }
  function useFallback() {
    if (disposed || fallback) return;
    fallback = true; scene?.destroy(); scene = null;
    canvas.hidden = true; $('.blast-fallback').hidden = false;
    root.dataset.renderer = 'diagram';
    for (const item of root.querySelectorAll('[data-view]')) item.disabled = true;
    announce('已切换为可点击的建筑示意图。选择构件、放置标记，玩法相同。');
  }
  function updateUI() {
    const progress = getBlastProgress(state);
    const signature = [state.layout, state.mode, state.phase, state.paused, state.blastType,
      state.selectedId, state.markers.map(marker => marker.id).join(','), progress.percent, progress.chain].join('/');
    if (uiSignature === signature) return;
    const previousPhase = root.dataset.phase;
    uiSignature = signature;
    root.dataset.phase = state.phase; root.dataset.paused = String(state.paused);
    const planning = state.phase === 'planning' && !state.paused;
    const ended = state.phase === 'won' || state.phase === 'lost';
    stat('percent').textContent = `${progress.percent}%`;
    stat('goal').textContent = state.mode === 'practice' ? '随心拆，无限次' : `/ 目标 ${progress.target}%`;
    stat('chain').textContent = progress.chain;
    stat('phase').textContent = state.paused ? 'PAUSED / 暂停' : state.phase === 'collapsing' ? 'LET GO / 连锁中' : ended ? 'SETTLED / 尘埃落定' : 'PLANT / 放置标记';
    stat('site').textContent = layout().subtitle;
    const meter = $('.blast-meter');
    meter.setAttribute('aria-valuenow', String(progress.percent));
    meter.setAttribute('aria-valuetext', state.mode === 'practice' ? `${progress.percent}%` : `${progress.percent}%，目标 ${progress.target}%`);
    meter.querySelector('i').style.width = `${progress.percent}%`;
    meter.querySelector('b').style.left = `${progress.target}%`;
    meter.querySelector('b').hidden = state.mode === 'practice';
    $('.blast-pause-cover').hidden = !state.paused;
    $('.blast-result').hidden = !ended;
    $('.blast-controls').hidden = ended;
    const stable = state.pieces.filter(piece => piece.status === 'stable');
    const options = stable.map(piece => piece.id).join('/');
    if (optionSignature !== options) {
      optionSignature = options;
      targetSelect.innerHTML = '<option value="">点一下楼体，或在这里选</option>' +
        stable.map(piece => `<option value="${piece.id}">${piece.label}</option>`).join('');
    }
    targetSelect.value = state.selectedId || '';
    targetSelect.disabled = !planning;
    action('plant').disabled = !planning || !state.selectedId || progress.remaining <= 0 || state.markers.some(marker => marker.pieceId === state.selectedId);
    action('detonate').disabled = !planning || !state.markers.length;
    action('undo').disabled = !planning || !state.markers.length;
    action('pause').disabled = ended;
    updateSoundControl();
    action('pause').textContent = state.paused ? '▷ 继续' : 'Ⅱ 暂停';
    stat('budget').textContent = state.phase === 'collapsing' ? '标记已释放 · 等小楼慢慢落稳' : state.mode === 'practice'
      ? `已放 ${state.markers.length} / 6 枚 · 每批结束后可继续`
      : `已放 ${state.markers.length} 枚 · 还可放 ${progress.remaining} 枚`;
    $('.blast-marker-list').innerHTML = state.markers.length
      ? state.markers.map((marker, i) => `<button type="button" data-remove="${marker.id}" ${planning ? '' : 'disabled'} aria-label="撤销第 ${i + 1} 枚${marker.type === 'wide' ? '大' : '小'}范围标记"><b>0${i + 1}</b> ${marker.type.toUpperCase()} <span aria-hidden="true">×</span></button>`).join('')
      : `<span>${state.phase === 'collapsing' ? '支点松开，连锁正在发生' : '把标记放在你选中的位置'}</span>`;
    for (const item of root.querySelectorAll('[data-type]')) {
      item.setAttribute('aria-pressed', String(item.dataset.type === state.blastType));
      item.disabled = !planning;
    }
    for (const item of root.querySelectorAll('[data-layout]')) item.setAttribute('aria-pressed', String(item.dataset.layout === state.layout));
    for (const item of root.querySelectorAll('[data-mode]')) item.setAttribute('aria-pressed', String(item.dataset.mode === state.mode));
    stat('rules').textContent = state.mode === 'practice'
      ? '随心练习没有失败，也没有总次数限制。每批最多放 6 枚，等碎块落稳后可以接着拆；随时重置整座建筑。'
      : `本轮最多放 ${state.difficulty === 'easy' ? 3 : state.difficulty === 'hard' ? 1 : 2} 枚标记，坍塌达到 ${progress.target}% 就过关。引爆后等碎块落稳；没达到目标可以原样重试，换个落点。`;
    if (ended) {
      const won = state.phase === 'won';
      $('[data-result="eyebrow"]').textContent = won ? 'A LITTLE MORE ROOM' : 'ANOTHER WAY TO LET GO';
      $('.blast-result').querySelector('h2').textContent = won ? '这一下，松快了。' : '换个落点，再试试。';
      $('[data-result="detail"]').textContent = `坍塌 ${progress.percent}% · 连锁掉落 ${progress.chain} 块。${state.mode === 'practice' ? '小工地清空了，想再来随时可以。' : won ? '这座小楼的挑战完成了。' : layout().hint}`;
      action('next').hidden = !won;
      if (previousPhase !== 'won' && previousPhase !== 'lost') {
        announce(`${won ? '本轮完成' : '本轮结束'}，坍塌 ${progress.percent}%，连锁掉落 ${progress.chain} 块。`);
        $('.blast-result').querySelector('h2').focus({preventScroll: true});
      }
    }
  }
  function render() {
    if (disposed) return;
    try {scene?.render(state);} catch {useFallback();}
    $('.blast-site-markers').innerHTML = scene ? state.markers.map((marker, i) => {
      const point = scene.project?.(marker.point);
      return point ? `<span style="left:${point.x * 100}%;top:${point.y * 100}%">${i + 1}</span>` : '';
    }).join('') : '';
    drawFallback(); updateUI(); updateCargoUI();
  }
  function processEvents() {
    let chained = false;
    for (const event of drainBlastEvents(state)) {
      if (event.type === 'chain') chained = true;
      if (event.type === 'settled') announce('碎块落稳了。可以在剩余构件上继续放标记，或重置小工地。');
    }
    if (chained && soundWanted && soundOn && !state.paused && !doc.hidden) audio.hit(2, .25);
  }
  function tick(now) {
    frame = 0;
    if (disposed || state.paused || doc.hidden) {previousTime = 0; return;}
    const dt = previousTime ? Math.min(.1, Math.max(0, (now - previousTime) / 1000)) : 0;
    previousTime = now;
    stepBlast(state, dt); processEvents(); render();
    if (state.phase === 'collapsing') startLoop();
    else previousTime = 0;
  }
  function setPaused(value, automatic = false) {
    pointer = null;
    if (value) {
      pauseBlast(state); silenceSound(); stopLoop();
      if (state.paused) announce(automatic ? '已自动暂停。点击继续后，小楼才会接着动。' : '停一会也很好。准备好了再继续。');
    } else {
      if (doc.hidden) return;
      resumeBlast(state); void gestureSound();
      announce(state.phase === 'planning' ? layout().hint : '继续看小楼慢慢松开。');
      startLoop();
    }
    render();
  }
  function reset(next = retryBlast(state)) {
    silenceSound();
    stopLoop(); pointer = null; state = next;
    if (doc.hidden) pauseBlast(state);
    uiSignature = optionSignature = '';
    if (fallback) fallbackLayout = '';
    announce(state.mode === 'practice' ? '随心练习，没有总次数限制。选落点，放标记，一起引爆。'
      : `${layout().hint} 本轮目标 ${getBlastProgress(state).target}%。`);
    render();
  }
  function select(id, point, cargoKind) {
    if (!selectBlastTarget(state, id, point)) return;
    const piece = state.pieces.find(item => item.id === id);
    const cargoName = {sofa: '沙发', tv: '电视', car: '汽车'}[cargoKind];
    announce(`已选 ${cargoName ? `${cargoName}下方的楼板 · ` : ''}${piece.label}。选择波纹范围，再放下标记。`);
    render();
  }
  function place() {
    if (plantBlast(state)) {
      void gestureSound(1);
      const count = state.markers.length;
      announce(`已放置 ${count} 枚标记。${getBlastProgress(state).remaining ? '可以继续放置，或一起引爆。' : '位置准备好了，点击一起引爆。'}`);
      processEvents(); render();
    }
  }
  function detonate() {
    if (!detonateBlast(state)) return;
    void gestureSound(0, .85);
    pointer = null; announce('波纹出发了。看看支撑松开后，会带动多少块。');
    processEvents(); render();
    arena.scrollIntoView?.({block: 'center', behavior: 'instant'});
    startLoop();
  }
  listen(root, 'click', async event => {
    const control = event.target.closest('button');
    if (!control || !root.contains(control) || control.disabled || disposed) return;
    if (control.dataset.layout) return reset(createBlastState({layout: control.dataset.layout, mode: state.mode, difficulty: state.difficulty}));
    if (control.dataset.mode) return reset(createBlastState({layout: state.layout, mode: control.dataset.mode, difficulty: state.difficulty}));
    if (control.dataset.type) {setBlastType(state, control.dataset.type); render(); return;}
    if (control.dataset.piece) return select(control.dataset.piece);
    if (control.dataset.remove) {removeBlast(state, Number(control.dataset.remove)); announce('标记已撤销，可以重新选位置。'); render(); return;}
    if (control.dataset.view) {
      currentView = control.dataset.view; scene?.setView(currentView);
      for (const item of root.querySelectorAll('[data-view]')) item.setAttribute('aria-pressed', String(item.dataset.view === currentView));
      render(); return;
    }
    switch (control.dataset.action) {
      case 'plant': place(); break;
      case 'detonate': detonate(); break;
      case 'undo': removeBlast(state); announce('已撤销上一枚标记。'); render(); break;
      case 'pause': setPaused(!state.paused); break;
      case 'resume': setPaused(false); arena.focus({preventScroll: true}); break;
      case 'retry': case 'reset': reset(); break;
      case 'next': reset(nextBlast(state)); break;
      case 'exit': setPaused(true); audio.pause(); onExit(); break;
      case 'sound':
        soundWanted = !soundWanted;
        if (!soundWanted) silenceSound(true);
        else void gestureSound(1);
        updateSoundControl();
        break;
    }
  });
  listen(root, 'change', event => {if (event.target === targetSelect) select(targetSelect.value);});
  listen(arena, 'pointerdown', event => {
    if (event.target !== canvas && event.target !== arena || event.button !== 0 || event.isPrimary === false ||
      state.phase !== 'planning' || state.paused || pointer) return;
    pointer = {id: event.pointerId, x: event.clientX, y: event.clientY};
  });
  listen(arena, 'pointerup', event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const start = pointer; pointer = null;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) return;
    const hit = scene?.pick(event.clientX, event.clientY);
    if (hit) {arena.focus({preventScroll: true}); select(hit.id, hit.point, hit.kind);}
    else if (!fallback) announce('点一下楼体上的构件，或使用下面的落点列表。');
  });
  listen(arena, 'pointercancel', () => {pointer = null;});
  listen(arena, 'pointerleave', () => {pointer = null;});
  listen(arena, 'blur', () => {pointer = null;});
  listen(arena, 'keydown', event => {
    if (event.target !== arena || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const key = event.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter', '1', '2', 'p', 'P'].includes(key)) return;
    event.preventDefault();
    if (event.repeat) return;
    if (key.toLowerCase() === 'p') return setPaused(!state.paused);
    if (state.paused || state.phase !== 'planning') return;
    if (key === ' ') return place();
    if (key === 'Enter') return detonate();
    if (key === '1' || key === '2') {setBlastType(state, key === '1' ? 'small' : 'wide'); render(); return;}
    const pieces = state.pieces.filter(piece => piece.status === 'stable');
    const index = pieces.findIndex(piece => piece.id === state.selectedId);
    const direction = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
    const next = (index + direction + pieces.length) % pieces.length;
    if (pieces[next]) select(pieces[next].id);
  });
  listen(win, 'blur', () => setPaused(true, true));
  listen(doc, 'visibilitychange', () => {if (doc.hidden) setPaused(true, true);});
  const resize = () => {if (!disposed) {scene?.resize(); render();}};
  listen(win, 'resize', resize);
  const observer = win.ResizeObserver ? new win.ResizeObserver(resize) : null;
  observer?.observe(arena);
  try {scene = createBlastScene(canvas, {reducedMotion, onUnavailable: () => {useFallback(); render();}});}
  catch {useFallback();}
  if (!fallback) root.dataset.renderer = 'webgl';
  reset(state);
  if (scene && ['sofa', 'tv', 'screen', 'car'].some(kind => tripoAssets?.[kind])) {
    const owner = scene;
    assetsLoading = true; updateCargoUI();
    void (async () => {
      try {
        const result = await owner.setTripoAssets(tripoAssets);
        if (disposed || scene !== owner || fallback) return;
        assetFailures = result.failed;
      } catch {
        if (disposed || scene !== owner || fallback) return;
        assetFailures = [{message: '实物未能读取。'}];
      }
      assetsLoading = false; render();
    })();
  }

  return () => {
    if (disposed) return;
    disposed = true; pointer = null;
    soundPending = soundCue = null;
    stopLoop(); abort.abort(); observer?.disconnect();
    scene?.destroy(); audio.destroy(); diagramPieces.clear(); root.remove();
  };
}
