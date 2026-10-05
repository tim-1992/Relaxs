import {
  MOLES_KEYS, MOLES_TYPES, MOLES_DIFFICULTIES, createMolesState, startMoles, stepMoles,
  hitMole, pauseMoles, resumeMoles, finishMoles, drainMolesEvents, molesAccuracy, molesHoleForKey,
} from './moles-state.js';
import {createMolesScene, molesLayout} from './moles-scene.js';
import {createReleaseAudio} from './release-audio.js';
import {loadMolesCharacter} from './moles-character.js';

let mountSequence = 0;
let soundPreference = true;
const critterArt = `<span class="moles-fallback-art" aria-hidden="true"><i class="moles-css-ground"></i>
  <i class="moles-css-body"><i class="moles-css-ear left"></i><i class="moles-css-ear right"></i>
    <i class="moles-css-eyes"></i><i class="moles-css-nose"></i><i class="moles-css-teeth"></i>
    <i class="moles-css-hat"></i><i class="moles-css-star"></i><i class="moles-css-leaves"></i></i></span>`;

export function mountMoles(container, {
  difficulty = 'standard', onExit = () => {}, onAnnounce = () => {}, initialCharacter = null,
} = {}) {
  const doc = container.ownerDocument, win = doc.defaultView;
  const id = `moles-${++mountSequence}`;
  const abort = new (win.AbortController || AbortController)();
  const audio = createReleaseAudio();
  let state = createMolesState({difficulty, seed: Math.floor(Math.random() * 4294967296)});
  let scene = null, disposed = false, frame = 0, lastTime = null, lastHUD = '';
  let soundOn = soundPreference, audioVersion = 0;
  let characterVersion = 0, characterRequest = null, characterName = '', characterSource = '', characterYaw = 0, roundId = 0;
  const flashes = Array(9).fill(null), labels = Array(9).fill('');
  const root = doc.createElement('section');
  root.className = 'experience-shell moles-experience';
  root.setAttribute('aria-labelledby', `${id}-title`);
  root.innerHTML = `
    <header class="moles-heading">
      <div><p class="moles-eyebrow">PLAY / POP-OUT MEADOW <span>看准了，再敲一下</span></p>
        <h1 id="${id}-title" tabindex="-1">敲敲小怪兽<span>。</span></h1>
        <p>小脑袋冒出来，好心情也跟着冒出来。叶子朋友，要温柔放过。</p></div>
      <div class="moles-modes" role="group" aria-label="敲敲小怪兽玩法">
        <button type="button" data-moles-action="challenge" aria-pressed="true">45 秒挑战</button>
        <button type="button" data-moles-action="practice" aria-pressed="false">随心练习</button>
      </div>
    </header>
    <details class="moles-character-panel">
      <summary>Tripo 角色 <span data-moles-character-name>示例角色（程序生成）</span><i aria-hidden="true">＋</i></summary>
      <div class="moles-character-content">
        <p>在 Tripo Studio 生成自己的小怪兽，导出 <b>GLB</b> 后在这里导入。模型仅在当前页面、本机内存中使用，<b>不会上传</b>；离开游戏后会释放。</p>
        <div class="moles-character-actions"><input type="file" accept=".glb,model/gltf-binary" data-moles-file aria-label="导入 Tripo 导出的 GLB 角色">
          <button type="button" data-moles-action="character-turn" disabled>转个方向 ↻</button>
          <button type="button" data-moles-action="character-reset">恢复示例</button></div>
        <p class="moles-character-status" data-moles-character-status role="status" aria-live="polite">当前为程序生成的示例角色，不是 Tripo 生成作品。展开时可预览九个位置。</p>
        <div class="moles-prompt-help"><span>给 Tripo Studio 的提示词</span>
          <p lang="en">One single full-body cute round little monster, standing upright in a symmetrical pose, facing forward, friendly face, short arms and legs, simple geometry, no pedestal, no props, no hat, no background.</p>
          <span>生成后选择 GLB 导出，将贴图嵌入同一个文件（≤20 MB）。不要使用 Draco / Meshopt / KTX2 压缩。导入后可转向；头盔、星星和叶子标记由游戏添加。</span></div>
      </div>
    </details>
    <div class="moles-board">
      <div class="moles-hud">
        <div class="moles-score"><span>本轮得分</span><strong data-moles-stat="score">0</strong></div>
        <div><span>连续抓到</span><strong data-moles-stat="combo">0</strong></div>
        <div><span>命中率</span><strong data-moles-stat="accuracy">—</strong></div>
        <div class="moles-clock"><span data-moles-stat="clock-label">剩余时间</span><strong data-moles-stat="time">45<small>秒</small></strong></div>
      </div>
      <div class="moles-progress" aria-hidden="true"><i></i></div>
      <div class="moles-arena" tabindex="0" role="group" aria-label="九洞敲敲小怪兽" aria-describedby="${id}-instructions">
        <canvas class="moles-canvas" aria-hidden="true"></canvas>
        <div class="moles-meadow-mark" aria-hidden="true"><span>THE LITTLE MEADOW</span><i>✦</i></div>
        <span class="moles-preview-note" hidden>角色预览 · 收起「Tripo 角色」后开始或继续</span>
        <div class="moles-holes" role="group" aria-label="QWE、ASD、ZXC 对应三排地洞">
          ${MOLES_KEYS.map((key, hole) => `<button type="button" class="moles-hole" data-moles-hole="${hole}" disabled aria-label="${key}：空地洞">
            ${critterArt}<span class="moles-hole-label"><kbd>${key}</kbd><span class="moles-kind">等它冒头</span></span>
            <span class="moles-life" aria-hidden="true"><i></i></span><span class="moles-pop" aria-hidden="true"></span>
          </button>`).join('')}
        </div>
        <div class="moles-cover moles-intro">
          <div class="moles-cover-copy"><span class="moles-kicker">NINE LITTLE SURPRISES</span>
            <h2>冒个头，<br>就敲一下。</h2><p data-moles-intro-copy>45 秒，三波小惊喜。看清模样，别敲到叶子朋友。</p>
            <button type="button" class="moles-primary" data-moles-action="start">准备好，开始 ↗</button>
            <span class="moles-cover-tip">鼠标 / 手指点按 · QWE / ASD / ZXC</span></div>
        </div>
        <div class="moles-cover moles-paused" role="dialog" aria-label="敲敲小怪兽已暂停" hidden>
          <div class="moles-cover-copy"><span class="moles-kicker">A LITTLE BREATHER</span><h2>小脑袋，<br>也歇一会。</h2>
            <p>时间和小怪兽都停住了，准备好了再继续。</p>
            <button type="button" class="moles-primary" data-moles-action="resume">继续这一轮 ↗</button></div>
        </div>
        <div class="moles-cover moles-result" role="dialog" aria-label="敲敲小怪兽本轮结果" hidden>
          <div class="moles-cover-copy"><span class="moles-kicker">A POCKETFUL OF LITTLE WINS</span>
            <h2 tabindex="-1">这一轮，收好啦。</h2><strong class="moles-result-score" data-moles-result="score">0</strong>
            <div class="moles-result-stats"><span>最长连击<b data-moles-result="combo">0</b></span><span>命中率<b data-moles-result="accuracy">0%</b></span><span>抓到怪兽<b data-moles-result="caught">0</b></span></div>
            <p data-moles-result="detail"></p><button type="button" class="moles-primary" data-moles-action="retry">再来一轮 ↺</button>
          </div>
        </div>
      </div>
      <div class="moles-board-foot"><span data-moles-stat="wave">第一波 · 慢慢找感觉</span><span data-moles-difficulty>${MOLES_DIFFICULTIES[state.difficulty].label} / 3D MEADOW</span></div>
    </div>
    <div class="moles-legend" aria-label="四种小伙伴与规则">
      <div data-kind="normal"><span class="moles-legend-icon"></span><strong>普通怪兽</strong><span>1 下 · 10 分</span></div>
      <div data-kind="helmet"><span class="moles-legend-icon"></span><strong>头盔怪兽</strong><span>2 下 · 20 分</span></div>
      <div data-kind="shiny"><span class="moles-legend-icon"></span><strong>星星怪兽</strong><span>1 下 · 30 分</span></div>
      <div data-kind="friend"><span class="moles-legend-icon"></span><strong>叶子朋友</strong><span>别敲 · −15 分</span></div>
    </div>
    <div class="moles-toolbar">
      <p class="moles-status" role="status" aria-live="polite">先看模样，再出手。叶子朋友不需要敲。</p>
      <div><button type="button" data-moles-action="pause" disabled>Ⅱ 暂停</button>
        <button type="button" data-moles-action="reset">↺ 重来</button>
        <button type="button" data-moles-action="sound" aria-pressed="${soundOn}">声音：${soundOn ? '开' : '关'}</button>
        <button type="button" data-moles-action="finish" hidden>结束练习</button></div>
    </div>
    <details class="moles-help"><summary>怎么玩 · 键盘与计分 <span aria-hidden="true">＋</span></summary>
      <div id="${id}-instructions"><p>点按地洞，或用 Q W E / A S D / Z X C 对应三排。也可用 Tab 选择地洞，再按空格或回车。P 暂停 / 继续；切换窗口会自动暂停。</p>
        <p>头盔怪兽先破盔、再敲一下。星星怪兽得 30 分。头顶两片叶子的朋友要放过，误敲扣 15 分，最低扣到 0。</p>
        <p>漏掉怪兽、敲空或误敲朋友都会断连击。每满 5 连击，每只多加 5 分，最多多加 15 分。命中率按有效敲击 / 总敲击计算，破盔也算命中，漏掉不降低命中率。</p>
        <p>挑战共 45 秒，每 15 秒节奏加快。随心练习不限时，可随时暂停或结束；三波之后保持当前节奏。</p></div>
    </details>
    <footer class="moles-footer"><span>手慢一点也没关系，好心情不用赶。</span><button type="button" data-moles-action="exit">返回游戏 ↗</button></footer>`;
  container.append(root);
  const $ = selector => root.querySelector(selector);
  const action = name => $(`[data-moles-action="${name}"]`);
  const stat = name => $(`[data-moles-stat="${name}"]`);
  const arena = $('.moles-arena'), canvas = $('.moles-canvas');
  const holeButtons = [...root.querySelectorAll('[data-moles-hole]')];
  const intro = $('.moles-intro'), paused = $('.moles-paused'), result = $('.moles-result');
  const status = $('.moles-status');
  const characterPanel = $('.moles-character-panel'), characterStatus = $('[data-moles-character-status]');
  const characterFile = $('[data-moles-file]');
  const listen = (target, type, fn) => target.addEventListener(type, fn, {signal:abort.signal});
  const now = () => win.performance.now();
  const playing = () => state.phase === 'playing' && !state.paused && !doc.hidden && !characterPanel.open;

  function announce(text) {status.textContent = text; onAnnounce(text);}
  function stopLoop() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0; lastTime = null;
  }
  function startLoop() {
    if (disposed || !playing() || frame) return;
    lastTime = now(); frame = win.requestAnimationFrame(tick);
  }
  function syncAudio() {
    const version = ++audioVersion;
    if (!soundOn) {audio.disable(); return;}
    if (!playing()) {audio.pause(); return;}
    // Calls remain in the user gesture; pause/mute/dispose can invalidate the result.
    void audio.resume();
    void audio.enable().then(enabled => {
      if (disposed || version !== audioVersion) return;
      if (!playing()) {audio.pause(); return;}
      if (!enabled) {
        soundOn = false; audio.disable(); updateSound();
        announce('这个浏览器暂时不能播放声音，可以继续无声游玩。');
      }
    });
  }
  function updateSound() {
    action('sound').setAttribute('aria-pressed', String(soundOn));
    action('sound').textContent = soundOn ? '声音：开' : '声音：关';
  }
  function processEvents() {
    for (const event of drainMolesEvents(state)) {
      if (event.type === 'end') {
        stopLoop(); audioVersion++; audio.pause();
        announce(`这一轮结束。${state.score} 分，最长 ${state.bestCombo} 连击，命中率 ${molesAccuracy(state)}%。`);
      } else if (['hit', 'armour', 'friend', 'empty'].includes(event.type)) {
        const text = event.type === 'hit' ? `+${event.points}` : event.type === 'armour' ? '再一下！' : event.type === 'friend' ? '放过朋友' : '敲空啦';
        flashes[event.hole] = {text, type:event.type, until:state.elapsed + .65};
        scene?.flash(event.hole, event.type, event.at);
        if (soundOn) audio.hit(event.type === 'hit' ? 1 : event.type === 'armour' ? 0 : 3, .35);
        status.textContent = event.type === 'hit' ? `${MOLES_KEYS[event.hole]}，抓到了！+${event.points} 分。${state.combo} 连击。`
          : event.type === 'armour' ? `${MOLES_KEYS[event.hole]}，头盔敲掉了，再一下！`
            : event.type === 'friend' ? `叶子朋友要放过。扣 ${-event.points} 分，连击重新开始。` : '这个洞是空的，等小脑袋冒出来再敲。';
      }
    }
  }
  function advance(time) {
    if (!playing()) return;
    if (lastTime !== null) stepMoles(state, Math.max(0, (time - lastTime) / 1000));
    lastTime = time; processEvents();
  }
  function tick(time) {
    frame = 0;
    if (disposed) return;
    if (doc.hidden) {setPaused(true); return;}
    advance(time); render();
    if (playing()) frame = win.requestAnimationFrame(tick);
  }
  function render() {
    if (disposed) return;
    root.dataset.characterPreview = String(Boolean(characterPanel.open));
    $('.moles-preview-note').hidden = !characterPanel.open;
    const endedBefore = root.dataset.phase === 'ended';
    const seconds = state.mode === 'practice' ? '∞' : Math.max(0, Math.ceil(45 - state.elapsed));
    const signature = [state.phase, state.paused, state.mode, state.score, state.combo, state.goodHits, state.taps, seconds, state.wave].join('/');
    if (signature !== lastHUD) {
      lastHUD = signature;
      root.dataset.phase = state.phase; root.dataset.paused = String(state.paused); root.dataset.mode = state.mode;
      stat('score').textContent = state.score; stat('combo').textContent = state.combo;
      stat('accuracy').textContent = state.taps ? `${molesAccuracy(state)}%` : '—';
      stat('time').innerHTML = `${seconds}${state.mode === 'challenge' ? '<small>秒</small>' : ''}`;
      stat('clock-label').textContent = state.mode === 'practice' ? '随心练习' : '剩余时间';
      stat('wave').textContent = ['第一波 · 慢慢找感觉', '第二波 · 小脑袋更活跃了', '第三波 · 看清再敲，稳住连击'][state.wave - 1];
      intro.hidden = state.phase !== 'ready'; paused.hidden = !state.paused; result.hidden = state.phase !== 'ended';
      action('pause').disabled = state.phase !== 'playing';
      action('pause').textContent = state.paused ? '▷ 继续' : 'Ⅱ 暂停';
      action('finish').hidden = state.mode !== 'practice' || state.phase !== 'playing';
      action('challenge').setAttribute('aria-pressed', String(state.mode === 'challenge'));
      action('practice').setAttribute('aria-pressed', String(state.mode === 'practice'));
      $('[data-moles-intro-copy]').textContent = state.mode === 'practice'
        ? '不计时，也不赶进度。小怪兽会一直来，可以随时停。' : '45 秒，三波小惊喜。看清模样，别敲到叶子朋友。';
      if (state.phase === 'ended') {
        $('[data-moles-result="score"]').textContent = state.score;
        $('[data-moles-result="combo"]').textContent = state.bestCombo;
        $('[data-moles-result="accuracy"]').textContent = `${molesAccuracy(state)}%`;
        $('[data-moles-result="caught"]').textContent = state.caught;
        $('[data-moles-result="detail"]').textContent = `漏掉 ${state.missed} 只 · 误敲朋友 ${state.friendHits} 次。下一轮，试着更稳一点。`;
        if (!endedBefore) result.querySelector('h2').focus({preventScroll:true});
      }
    }
    root.style.setProperty('--moles-time', state.mode === 'practice' ? 1 : Math.max(0, 1 - state.elapsed / 45));
    holeButtons.forEach((button, hole) => {
      const previewType = ['normal','helmet','shiny','normal','friend','normal','helmet','shiny','friend'][hole];
      const mole = characterPanel.open ? {type:previewType, hp:previewType === 'helmet' ? 2 : 1} : state.holes[hole];
      const label = mole ? `${MOLES_TYPES[mole.type].name}，${mole.type === 'friend' ? '不要敲' : `还需 ${mole.hp} 下`}` : '空地洞';
      button.disabled = !playing();
      if (labels[hole] !== label) {
        labels[hole] = label;
        button.setAttribute('aria-label', `${MOLES_KEYS[hole]}：${label}`);
        button.dataset.kind = mole?.type || 'empty'; button.dataset.hp = String(mole?.hp || 0);
        button.querySelector('.moles-kind').textContent = mole ? mole.type === 'friend' ? '别敲' : `${mole.hp} 下` : '等它冒头';
      }
      button.style.setProperty('--moles-life', mole && !characterPanel.open ? Math.max(0, (mole.expiresAt - state.elapsed) / (mole.expiresAt - mole.bornAt)) : 0);
      const flash = flashes[hole], pop = button.querySelector('.moles-pop');
      pop.hidden = !flash || flash.until <= state.elapsed || state.phase !== 'playing';
      if (flash) {pop.textContent = flash.text; pop.dataset.kind = flash.type;}
    });
    scene?.render({...state, preview:Boolean(characterPanel.open), roundId});
  }
  function setPaused(value) {
    if (disposed || state.phase !== 'playing' || state.paused === value) return;
    if (value) {
      if (!doc.hidden) advance(now());
      if (!pauseMoles(state)) {render(); return;}
      stopLoop(); audioVersion++; audio.pause(); render();
      announce('已暂停，时间和小怪兽都停住了。点击继续再开始。');
      action('resume').focus({preventScroll:true});
    } else if (!doc.hidden && !characterPanel.open && resumeMoles(state)) {
      render(); syncAudio(); startLoop(); arena.focus({preventScroll:true});
      announce('继续这一轮。看清叶子朋友，再出手。');
    }
  }
  function reset(mode = state.mode, play = false) {
    if (disposed) return;
    stopLoop(); audioVersion++; audio.pause();
    state = createMolesState({difficulty:state.difficulty, mode, seed:Math.floor(Math.random() * 4294967296)});
    roundId++;
    flashes.fill(null); labels.fill(''); lastHUD = '';
    if (play && !doc.hidden && !characterPanel.open) startMoles(state);
    render(); syncAudio(); startLoop();
    (play ? arena : action('start')).focus({preventScroll:true});
    announce(mode === 'practice' ? '随心练习，不计时。叶子朋友不要敲。' : '45 秒挑战，三波节奏。准备好后点击开始。');
  }
  function hit(hole) {
    if (!playing() || disposed) return;
    advance(now());
    hitMole(state, hole); processEvents(); render();
  }
  function fallback() {
    characterVersion++; characterRequest?.abort(); characterRequest = null;
    scene?.dispose(); scene = null;
    canvas.hidden = true; root.classList.add('moles-fallback');
    characterName = ''; characterSource = ''; characterFile.disabled = true; updateCharacter();
    characterStatus.textContent = '当前设备使用轻量示例角色。导入 GLB 需要支持 3D 的浏览器；游戏仍可正常玩。';
  }
  function updateCharacter() {
    $('[data-moles-character-name]').textContent = characterName
      ? `${characterSource === 'Tripo' ? 'Tripo' : '已导入'} · ${characterName}` : '示例角色（程序生成）';
    action('character-turn').disabled = !characterName;
  }
  async function importCharacter(file, {source = '', frontYaw = 0} = {}) {
    if (!file || !scene || disposed) return;
    setPaused(true);
    characterRequest?.abort();
    const request = new (win.AbortController || AbortController)(), version = ++characterVersion;
    characterRequest = request;
    characterStatus.textContent = `正在读取 ${file.name}…文件只在本机处理。`;
    try {
      const asset = await loadMolesCharacter(file, {signal:request.signal});
      if (disposed || version !== characterVersion || !scene) {asset.dispose(); return;}
      scene.setCharacter(asset);
      characterYaw = Number.isFinite(frontYaw) ? frontYaw : 0;
      scene.setCharacterYaw(characterYaw);
      characterName = asset.name; characterSource = source; updateCharacter(); render();
      characterStatus.textContent = source === 'Tripo'
        ? `已载入 Tripo 角色 ${characterName}。展开可预览、转向或更换角色。`
        : `已导入 ${characterName}。九个位置共用模型资源；收起设置后可继续游戏。`;
    } catch (error) {
      if (disposed || version !== characterVersion || error.name === 'AbortError') return;
      characterStatus.textContent = `导入未完成：${error.message || '请重新导出完整的 GLB 文件。'} 当前仍使用${characterName || '示例角色'}。`;
    } finally {
      if (version === characterVersion) characterRequest = null;
    }
  }
  function resize() {
    if (disposed) return;
    const {width, height} = arena.getBoundingClientRect();
    const layout = molesLayout(width, height);
    holeButtons.forEach((button, hole) => {
      const box = layout.holes[hole];
      button.style.left = `${box.x * 100}%`; button.style.top = `${box.y * 100}%`;
      button.style.width = `${box.width * 100}%`; button.style.height = `${box.height * 100}%`;
    });
    scene?.resize(width, height); render();
  }
  listen(root, 'click', event => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button) || disposed) return;
    if (button.dataset.molesHole !== undefined) return hit(Number(button.dataset.molesHole));
    switch (button.dataset.molesAction) {
      case 'start':
        if (!doc.hidden && !characterPanel.open && startMoles(state)) {render(); syncAudio(); startLoop(); arena.focus({preventScroll:true}); announce('开始了！看准小脑袋，放过叶子朋友。');}
        break;
      case 'challenge': if (state.mode !== 'challenge') reset('challenge'); break;
      case 'practice': if (state.mode !== 'practice') reset('practice'); break;
      case 'retry': reset(state.mode, true); break;
      case 'reset': reset(); break;
      case 'pause': setPaused(!state.paused); break;
      case 'resume': setPaused(false); break;
      case 'finish': if (state.mode === 'practice') {advance(now()); finishMoles(state); processEvents(); render();} break;
      case 'sound': soundOn = !soundOn; soundPreference = soundOn; updateSound(); syncAudio(); break;
      case 'character-turn':
        if (characterName) {characterYaw = (characterYaw + Math.PI / 2) % (Math.PI * 2); scene?.setCharacterYaw(characterYaw); render();}
        break;
      case 'character-reset':
        characterVersion++; characterRequest?.abort(); characterRequest = null;
        scene?.setCharacter(null); characterName = ''; characterSource = ''; characterYaw = 0; updateCharacter(); render();
        characterStatus.textContent = '已恢复程序生成的示例角色。可随时重新导入 Tripo Studio 的 GLB。';
        break;
      case 'exit': setPaused(true); onExit(); break;
    }
  });
  listen(root, 'keydown', event => {
    const target = event.target;
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey ||
        target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (event.key.toLowerCase() === 'p') {event.preventDefault(); if (!event.repeat) setPaused(!state.paused); return;}
    if (event.repeat && ['Enter',' '].includes(event.key) && target.closest('[data-moles-hole]')) {event.preventDefault(); return;}
    const hole = molesHoleForKey(event);
    if (hole !== null && playing()) {event.preventDefault(); hit(hole);}
  });
  listen(win, 'blur', () => {setPaused(true); stopLoop(); audioVersion++; audio.pause();});
  listen(doc, 'visibilitychange', () => {if (doc.hidden) {setPaused(true); stopLoop(); audioVersion++; audio.pause();}});
  listen(characterFile, 'change', event => {
    const file = event.target.files?.[0]; event.target.value = '';
    void importCharacter(file);
  });
  listen(characterPanel, 'toggle', () => {
    if (characterPanel.open) {
      setPaused(true); stopLoop(); audioVersion++; audio.pause();
      characterPanel.querySelector('summary').focus({preventScroll:true});
    }
    render();
  });
  listen($('.moles-help'), 'toggle', () => {if ($('.moles-help').open) setPaused(true);});
  listen(canvas, 'webglcontextlost', event => {
    event.preventDefault(); setPaused(true); fallback(); render();
    announce('画面已切换为轻量示例角色，进度保留。可以继续点按小怪兽。');
  });
  listen(win, 'resize', resize);
  try {scene = createMolesScene(canvas, {reducedMotion:win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false});}
  catch {fallback();}
  const observer = win.ResizeObserver ? new win.ResizeObserver(resize) : null;
  observer?.observe(arena);
  audio.pause(); resize();
  if (initialCharacter && scene) {
    const {buffer, source, frontYaw} = initialCharacter;
    const name = String(initialCharacter.name || '小怪兽.glb').trim() || '小怪兽.glb';
    void importCharacter({
      name: /\.glb$/i.test(name) ? name : `${name}.glb`,
      size: buffer?.byteLength ?? 0,
      arrayBuffer: async () => buffer,
    }, {source, frontYaw});
  }
  return () => {
    if (disposed) return;
    disposed = true; audioVersion++; characterVersion++; characterRequest?.abort(); stopLoop(); abort.abort(); observer?.disconnect();
    scene?.dispose(); scene = null; audio.destroy(); root.remove();
  };
}
