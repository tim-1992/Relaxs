import {
  createReleaseState, resetRelease, applyReleaseImpulse, toppleRelease, stepRelease,
  pauseRelease, resumeRelease, releaseShortcut, openWorry, setWorryText, crumpleWorry,
  tossWorry, finishWorry, closeWorry, resumeWorry,
  setReleaseMode, aimReleaseChallenge, fireReleaseChallenge,
} from './release-state.js';
import {RELEASE_LEVELS, RELEASE_PROJECTILES, releaseLevel, releaseTrajectory} from './release-challenges.js';
import {createReleaseScene} from './release-scene.js';
import {createReleaseAudio} from './release-audio.js';

let mountId = 0;
const instruments = [
  {id: 'puff', key: 'A', name: '拍拍软团', sound: '咚', note: '软软地弹一下'},
  {id: 'pebble', key: 'S', name: '敲敲小石', sound: '笃', note: '给手心一点回响'},
  {id: 'ring', key: 'D', name: '弹弹圈圈', sound: '嗒', note: '让它翻个跟头'},
  {id: 'stack', key: 'F', name: '推推积木', sound: '砰', note: '倒了，再摆回来'},
];

export function mountRelease(container, {onExit = () => {}, onAnnounce = () => {}} = {}) {
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const uid = `release-${++mountId}`;
  const state = createReleaseState({mode: 'challenge'});
  const abort = new AbortController();
  const audio = createReleaseAudio();
  const media = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reducedMotion = media?.matches ?? false;
  let scene = null;
  let frame = 0;
  let lastFrame = 0;
  let disposed = false;
  let soundOn = false;
  let soundUnavailable = false;
  let soundPending = false;
  let tossTimer = 0;
  let tossRemaining = 0;
  let tossStarted = 0;
  let view = 'right';
  const root = doc.createElement('section');
  root.className = 'experience-shell release-experience';
  root.setAttribute('aria-labelledby', `${uid}-title`);
  // Only fixed interface copy enters this template. Worry text stays in the input/state.
  root.innerHTML = `
    <div class="experience-heading release-heading">
      <div>
        <p class="release-eyebrow">A LITTLE ROOM TO LET GO</p>
        <h1 id="${uid}-title" tabindex="-1">连锁拆解</h1>
        <p class="release-intro">先看结构，再选落点。推开一处，看看会发生什么。</p>
      </div>
      <span class="release-mode-tag"><i aria-hidden="true"></i>不赶时间，慢慢想</span>
    </div>
    <div class="release-mode-switch" role="group" aria-label="玩法模式">
      <button type="button" data-mode="challenge" aria-pressed="true">连锁拆解 <small>观察 · 瞄准 · 连锁</small></button>
      <button type="button" data-mode="free" aria-pressed="false">自由玩具台 <small>拍拍 · 拖抛 · 推倒</small></button>
    </div>
    <p class="release-switch-note">切换玩法或关卡，会重新摆好当前桌面。</p>
    <div class="release-challenge-panel">
      <div class="release-levels" role="group" aria-label="选择拆解关卡">
        ${RELEASE_LEVELS.map((level, index) => `<button type="button" data-level="${level.id}" aria-pressed="${index === 0}"><span>0${index + 1} / ${level.name}</span><small>${level.blocks.length} 块 · ${level.shots} 次发射</small></button>`).join('')}
      </div>
      <div class="release-challenge-brief">
        <div><h2 class="release-level-name"></h2><p class="release-level-hint"></p></div>
        <div class="release-progress-group">
          <span class="release-progress-label" id="${uid}-progress-label"></span>
          <progress max="12" value="0" aria-labelledby="${uid}-progress-label"></progress>
          <span class="release-shots-left"></span>
        </div>
      </div>
    </div>
    <div class="release-stage experience-panel" role="group" aria-label="积木拆解桌面" aria-describedby="${uid}-instructions">
      <div class="release-table-caption" aria-hidden="true"><span>LET IT OUT</span><i></i><span>轻轻一下，也算数</span></div>
      <div class="release-camera-bar">
        <span class="release-render-label"></span>
        <div class="release-view-controls" role="group" aria-label="观察角度，只改变相机">
          <button type="button" data-camera="left" aria-pressed="false">左侧</button>
          <button type="button" data-camera="front" aria-pressed="false">正面</button>
          <button type="button" data-camera="right" aria-pressed="true">右侧</button>
        </div>
      </div>
      <canvas class="release-canvas" aria-hidden="true"></canvas>
      <div class="release-fallback" hidden>
        <div class="release-free-fallback">
          <p>用手点一点，或者按下 A S D F。</p>
          <div class="release-fallback-toys">
            ${instruments.map(item => `<button type="button" class="release-fallback-toy release-toy-${item.id}" data-impact="${item.id}" aria-label="${item.name}"><span class="release-toy-art" aria-hidden="true">${item.id === 'stack' ? '<i></i><i></i><i></i>' : '<i></i>'}</span><span>${item.name}</span></button>`).join('')}
          </div>
        </div>
        <div class="release-challenge-visual"><svg class="release-challenge-map" viewBox="0 0 720 360" role="img" aria-label="二维积木桌面，使用下方方向和力度控制发射"></svg></div>
      </div>
      <div class="release-pause-cover" hidden>
        <span class="release-pause-symbol" aria-hidden="true">Ⅱ</span>
        <p>小物件在等你。</p>
        <span>准备好了，再继续。</span>
        <button type="button" class="experience-button is-primary" data-action="continue">继续闹一会</button>
      </div>
      <p class="release-stage-hint" id="${uid}-instructions"><span aria-hidden="true">↗</span> 点一下，弹起来 · 拖动后松手，抛出去</p>
    </div>
    <div class="release-shot-controls">
      <div class="release-projectiles" role="group" aria-label="选择投掷物">
        ${RELEASE_PROJECTILES.map(item => `<button type="button" data-projectile="${item.id}" aria-pressed="${item.id === 'puff'}"><strong>${item.name}</strong><small>${item.note}</small></button>`).join('')}
      </div>
      <div class="release-aim-controls">
        <label for="${uid}-angle"><span>方向 <output class="release-angle-value">正前方</output></span>
          <input id="${uid}-angle" data-aim="angle" type="range" min="-55" max="55" step="1" value="0">
          <small>以正面为准：← 左 · 右 →</small>
        </label>
        <label for="${uid}-power"><span>力度 <output class="release-power-value">60%</output></span>
          <input id="${uid}-power" data-aim="power" type="range" min="15" max="100" step="5" value="60">
          <small>轻推 · · · 用力投</small>
        </label>
        <button type="button" class="experience-button is-primary release-fire" data-action="fire">发射软团 ↗</button>
      </div>
      <p class="release-rule-note">移开约一块积木宽度，或明显掉落、倾倒，记为拆倒一块。每块只算一次；虚线是起始轨迹，碰撞会改变走向。</p>
    </div>
    <section class="release-result" hidden aria-labelledby="${uid}-result">
      <div><h2 id="${uid}-result" tabindex="-1"></h2><p class="release-result-note"></p></div>
      <div class="release-action-group">
        <button type="button" class="experience-button" data-action="retry">重来本关</button>
        <button type="button" class="experience-button is-primary" data-action="next">下一关 ↗</button>
      </div>
    </section>
    <div class="release-pads" role="group" aria-label="敲击玩具，支持 A S D F 快捷键">
      ${instruments.map(item => `<button type="button" class="release-pad release-pad-${item.id}" data-impact="${item.id}" aria-keyshortcuts="${item.key}" aria-label="${item.name}，快捷键 ${item.key}"><span class="release-pad-top"><kbd>${item.key}</kbd><span class="release-pad-sound" aria-hidden="true">${item.sound}</span></span><strong>${item.name}</strong><small>${item.note}</small></button>`).join('')}
    </div>
    <div class="experience-toolbar release-toolbar" aria-label="玩具台控制">
      <div class="release-action-group">
        <button type="button" class="experience-button is-primary" data-action="topple">推倒全部 <span aria-hidden="true">↗</span></button>
        <button type="button" class="experience-button" data-action="reset">重新摆好</button>
        <button type="button" class="experience-button" data-action="pause">暂停一下</button>
      </div>
      <div class="release-audio-controls">
        <button type="button" class="experience-button release-sound" data-action="sound" aria-pressed="false">开启声音</button>
        <label class="release-volume" for="${uid}-volume"><span>音量</span><input id="${uid}-volume" type="range" min="0" max="50" step="1" value="25" aria-valuetext="25%"></label>
      </div>
    </div>
    <p class="experience-status release-status" role="status" aria-live="polite">不用使劲。先挑一个，随手拍一拍。</p>
    <div class="release-leave-a-note">
      <div><span class="release-paper-icon" aria-hidden="true">↘</span><div><p>有件事，想丢掉？</p><span>也可以，把它揉成一个小纸团。</span></div></div>
      <button type="button" class="experience-button" data-action="worry">有件事，想丢掉？ <span aria-hidden="true">↗</span></button>
    </div>
    <div class="release-footer"><span class="release-footer-note">不设倒计时。看看结构，随时可以重来。</span><button type="button" class="release-exit" data-action="exit">今天先到这里 <span aria-hidden="true">↗</span></button></div>
    <dialog class="release-dialog" aria-labelledby="${uid}-worry-title" aria-describedby="${uid}-privacy">
      <button type="button" class="release-dialog-close" data-action="worry-close" aria-label="关闭并清空这次输入">×</button>
      <p class="release-eyebrow">LEAVE A LITTLE HERE</p>
      <h2 id="${uid}-worry-title" tabindex="-1">此刻，有什么想先放一边？</h2>
      <p class="release-privacy" id="${uid}-privacy">只在此刻，不会保存。揉成纸团、取消或离开，文字就会清空。</p>
      <div class="release-worry-paused" hidden>
        <p>刚才暂停了。准备好了，再继续。</p>
        <button type="button" class="experience-button is-primary" data-action="worry-continue">继续这一刻</button>
      </div>
      <div class="release-worry-writing">
        <label for="${uid}-worry-text">写一句，或者什么也不写。</label>
        <textarea id="${uid}-worry-text" maxlength="240" rows="4" autocomplete="off" spellcheck="false" placeholder="先放在这里……" aria-describedby="${uid}-privacy ${uid}-worry-limit"></textarea>
        <p class="release-worry-limit" id="${uid}-worry-limit"><span>最多 240 字</span><span class="release-worry-count">0 / 240</span></p>
        <div class="release-dialog-actions">
          <button type="button" class="experience-button" data-action="worry-close">先不丢了</button>
          <button type="button" class="experience-button is-primary" data-action="crumple">揉成纸团 <span aria-hidden="true">↗</span></button>
        </div>
      </div>
      <div class="release-worry-ball-step" hidden>
        <div class="release-bin-stage" role="img" aria-label="一个纸团和一只小纸篓">
          <div class="release-paper-ball"><i></i><b></b><span></span></div>
          <div class="release-bin-shadow"></div>
          <div class="release-bin"><div class="release-bin-rim"></div><div class="release-bin-body"><i></i><i></i><i></i><i></i><i></i></div><span>先放这里</span></div>
          <div class="release-bin-spark release-bin-spark-one"></div><div class="release-bin-spark release-bin-spark-two"></div>
        </div>
        <p class="release-worry-message" role="status" aria-live="polite">已经揉好了。不用瞄准。</p>
        <div class="release-dialog-actions">
          <button type="button" class="experience-button" data-action="worry-close">先回工坊</button>
          <button type="button" class="experience-button is-primary" data-action="toss">丢进去 <span aria-hidden="true">↗</span></button>
          <button type="button" class="experience-button is-primary" data-action="worry-done" hidden>继续闹一会</button>
        </div>
      </div>
    </dialog>`;
  container.append(root);

  const query = selector => root.querySelector(selector);
  const button = action => query(`[data-action="${action}"]`);
  const canvas = query('.release-canvas');
  const fallback = query('.release-fallback');
  const stage = query('.release-stage');
  const status = query('.release-status');
  const dialog = query('.release-dialog');
  const textarea = query('textarea');
  const writing = query('.release-worry-writing');
  const ballStep = query('.release-worry-ball-step');
  const ballStage = query('.release-bin-stage');
  const worryMessage = query('.release-worry-message');
  const impactButtons = [...root.querySelectorAll('[data-impact]')];

  function announce(message) {
    status.textContent = message;
    onAnnounce(message);
  }

  function stopLoop() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = lastFrame = 0;
  }

  function useFallback() {
    scene?.destroy();
    scene = null;
    stopLoop();
    canvas.hidden = true;
    fallback.hidden = false;
    stage.classList.add('release-stage-fallback');
    updateControls();
    renderFallback();
    startLoop();
  }

  function renderFallback() {
    if (scene || !state.challenge) return;
    const project = ({x, y, z}) => [360 + x * 47 + z * 12, 245 + z * 21 - y * 42];
    const pointString = point => project(point).map(value => value.toFixed(2)).join(',');
    const table = [[-5.6, -3.3], [5.6, -3.3], [5.6, 3.3], [-5.6, 3.3]]
      .map(([x, z]) => pointString({x, y: 0, z})).join(' ');
    const trajectory = state.challenge.phase === 'aiming'
      ? `<polyline points="${releaseTrajectory(state.challenge).map(pointString).join(' ')}" fill="none" stroke="#ffdcaa" stroke-width="3" stroke-dasharray="5 5"/>` : '';
    const shapes = [...state.bodies].sort((a, b) => a.position.z - b.position.z || a.position.y - b.position.y)
      .map(body => {
        const [x, y] = project(body.position);
        const width = body.half.x * 94, height = body.half.y * 84;
        const opacity = state.challenge.knocked.includes(body.id) ? .62 : 1;
        return body.kind === 'block'
          ? `<g opacity="${opacity}"><rect x="${x-width/2}" y="${y-height/2}" width="${width}" height="${height}" rx="4" fill="${body.color}" stroke="#233e35" stroke-width="1.5"/><path d="M${x-width/2+4},${y-height/2+4}h${Math.max(0, width-8)}" stroke="#fff5" fill="none"/></g>`
          : `<ellipse cx="${x}" cy="${y}" rx="${width/2}" ry="${height/2}" fill="${body.color}" stroke="#fff8" stroke-width="2"/>`;
      }).join('');
    query('.release-challenge-map').innerHTML = `<polygon points="${table}" fill="#6b8075" stroke="#acb799" stroke-width="3"/>${trajectory}${shapes}`;
  }

  function drawBoard() {
    if (scene) {
      try { scene.render(); } catch { useFallback(); }
    } else renderFallback();
  }

  function wantsFrame() {
    return state.challenge ? state.challenge.phase === 'flying' :
      Boolean(scene && !reducedMotion) || state.bodies.some(body => !body.sleeping);
  }

  function renderFrame(now) {
    frame = 0;
    if (disposed || state.paused) return;
    const phase = state.challenge?.phase;
    const count = state.challenge?.knocked.length;
    if (lastFrame) stepRelease(state, (now - lastFrame) / 1000);
    lastFrame = now;
    if (phase !== state.challenge?.phase || count !== state.challenge?.knocked.length) updateControls();
    if (phase === 'flying' && state.challenge.phase !== 'flying') {
      if (state.challenge.phase === 'won' || state.challenge.phase === 'lost') {
        announce(query('.release-result-note').textContent);
        query(`#${uid}-result`).focus({preventScroll: true});
      } else announce(`这一投拆倒累计 ${state.challenge.knocked.length} 块。观察新结构，再选下一处。`);
    }
    drawBoard();
    if (wantsFrame() && !frame) frame = win.requestAnimationFrame(renderFrame);
    else lastFrame = 0;
  }

  function startLoop() {
    if (disposed || frame || state.paused) return;
    lastFrame = 0;
    frame = win.requestAnimationFrame(renderFrame);
  }

  function flash(id) {
    for (const element of impactButtons.filter(item => item.dataset.impact === id)) {
      element.classList.remove('release-hit');
      void element.offsetWidth;
      element.classList.add('release-hit');
    }
  }

  function impact(id, {thrown = false} = {}) {
    if (disposed || state.paused || state.mode !== 'free') return;
    const padId = id.startsWith('block-') ? 'stack' : id;
    const index = instruments.findIndex(item => item.id === padId);
    if (index < 0) return;
    if (!thrown) {
      if (padId === 'stack') {
        state.bodies.filter(body => body.kind === 'block').forEach((body, order) =>
          applyReleaseImpulse(state, body.id, {x: -2.1 - order * .5, y: 2.6 + order * .3, z: 1.8}));
      } else applyReleaseImpulse(state, id, {x: (Math.random() - .5) * .7, y: 5.2, z: (Math.random() - .5) * .7});
    }
    audio.hit(index);
    flash(padId);
    status.textContent = thrown ? '抛出去，再看它慢慢落下。' : instruments[index].note + '。';
    startLoop();
  }

  function updateControls() {
    const worryOpen = state.worry.phase !== 'closed';
    const challenge = state.challenge;
    root.dataset.releaseMode = state.mode;
    root.classList.toggle('release-is-paused', state.paused);
    dialog.classList.toggle('release-is-paused', state.needsContinue);
    query('.release-pause-cover').hidden = !state.paused || worryOpen;
    query('.release-worry-paused').hidden = !state.needsContinue;
    button('pause').textContent = state.paused ? '继续闹一会' : '暂停一下';
    for (const item of impactButtons) item.disabled = state.paused || Boolean(challenge);
    button('topple').hidden = Boolean(challenge);
    button('topple').disabled = state.paused || Boolean(challenge);
    button('reset').disabled = button('retry').disabled = state.paused;
    button('reset').textContent = challenge ? '重来本关' : '重新摆好';
    button('sound').disabled = state.paused || soundUnavailable || soundPending;
    button('sound').textContent = soundUnavailable ? '声音暂不可用' : soundOn ? '关闭声音' : '开启声音';
    button('sound').setAttribute('aria-pressed', String(soundOn));
    query('.release-volume input').disabled = state.paused || soundUnavailable;
    button('crumple').disabled = state.needsContinue;
    button('toss').disabled = state.needsContinue || state.worry.phase !== 'ready';
    textarea.disabled = state.needsContinue;
    query('.release-pads').hidden = Boolean(challenge);
    query('.release-challenge-panel').hidden = !challenge;
    query('.release-shot-controls').hidden = !challenge;
    query('.release-free-fallback').hidden = Boolean(challenge);
    query('.release-challenge-visual').hidden = !challenge;
    query('.release-view-controls').hidden = !scene;
    query('.release-render-label').textContent = scene ? '3D 桌面' : '二维桌面 · 同样的物理规则';
    query('.release-intro').textContent = challenge
      ? '先看结构，再选落点。推开一处，看看会发生什么。' : '拍拍、抛抛、推倒。这里的东西，都可以重新摆好。';
    query(`#${uid}-title`).textContent = challenge ? '连锁拆解' : '松松小工坊';
    query('.release-footer-note').textContent = challenge
      ? '不设倒计时。看看结构，随时可以重来。' : '没有分数，也不用收拾得很完美。';
    stage.setAttribute('aria-label', challenge ? '积木拆解桌面' : '可以点击和拖动的玩具台');
    query('.release-stage-hint').textContent = challenge
      ? scene ? '切换视角观察 · 点击桌面定方向 · 下方调力度，再发射' : '二维投影 · 用下方方向、力度和发射按钮，同样可以拆解'
      : scene ? '点一下，弹起来 · 拖动后松手，抛出去' : '点点小物件，或用下方按钮，照样可以拍一拍。';
    query('.release-table-caption span:last-child').textContent = challenge ? '先找薄弱处' : '轻轻一下，也算数';
    for (const item of root.querySelectorAll('[data-mode]')) {
      item.setAttribute('aria-pressed', String(item.dataset.mode === state.mode));
      item.disabled = state.paused;
    }
    for (const item of root.querySelectorAll('[data-level]')) {
      item.setAttribute('aria-pressed', String(item.dataset.level === challenge?.levelId));
      item.disabled = state.paused;
    }
    for (const item of root.querySelectorAll('[data-camera]')) {
      item.setAttribute('aria-pressed', String(item.dataset.camera === view));
      item.disabled = state.paused || !scene;
    }
    const ended = challenge && ['won', 'lost'].includes(challenge.phase);
    query('.release-result').hidden = !ended;
    button('next').hidden = challenge?.phase !== 'won';
    button('next').disabled = state.paused || challenge?.phase !== 'won';
    if (!challenge) return;
    const level = releaseLevel(challenge.levelId);
    query('.release-level-name').textContent = level.subtitle;
    query('.release-level-hint').textContent = level.hint;
    query('.release-progress-label').textContent = `已拆 ${challenge.knocked.length} / 目标 ${level.goal} 块`;
    query('progress').max = level.goal;
    query('progress').value = Math.min(challenge.knocked.length, level.goal);
    query('.release-shots-left').textContent = `剩余 ${level.shots - challenge.shotsUsed} / ${level.shots} 次发射`;
    const aiming = !state.paused && challenge.phase === 'aiming';
    for (const item of root.querySelectorAll('[data-projectile]')) {
      item.disabled = !aiming;
      item.setAttribute('aria-pressed', String(item.dataset.projectile === challenge.projectile));
    }
    for (const item of root.querySelectorAll('[data-aim]')) {
      item.disabled = !aiming;
      item.value = challenge[item.dataset.aim];
    }
    const angle = Math.round(challenge.angle);
    const direction = angle === 0 ? '正前方' : `${angle < 0 ? '左' : '右'} ${Math.abs(angle)}°`;
    query('.release-angle-value').textContent = direction;
    query('[data-aim="angle"]').setAttribute('aria-valuetext', direction);
    query('.release-power-value').textContent = `${challenge.power}%`;
    query('[data-aim="power"]').setAttribute('aria-valuetext', `${challenge.power}%`);
    button('fire').disabled = !aiming;
    button('fire').textContent = challenge.phase === 'flying' ? '等物件落稳…' : ended ? '本关已结束' :
      `发射${RELEASE_PROJECTILES.find(item => item.id === challenge.projectile).name} ↗`;
    if (ended) {
      const won = challenge.phase === 'won';
      query(`#${uid}-result`).textContent = won ? '结构松开了。' : '这次，还差一点。';
      query('.release-result-note').textContent = won
        ? `${challenge.shotsUsed} 次发射，拆倒 ${challenge.knocked.length} 块，达到 ${level.goal} 块目标。可以换个结构再试。`
        : `次数用完，拆倒 ${challenge.knocked.length} / ${level.goal} 块。试试换个视角，瞄准底层或选择另一种投掷物。`;
      button('next').textContent = level.id === RELEASE_LEVELS.at(-1).id ? '再玩第一关 ↗' : '下一关 ↗';
    }
  }

  function stopTossClock() {
    if (!tossTimer) return;
    win.clearTimeout(tossTimer);
    tossTimer = 0;
    tossRemaining = Math.max(0, tossRemaining - (win.performance.now() - tossStarted));
  }

  function completeToss() {
    if (disposed || state.needsContinue || !finishWorry(state)) return;
    stopTossClock();
    ballStage.classList.remove('release-is-tossing');
    ballStage.classList.add('release-is-done');
    ballStage.setAttribute('aria-label', '纸团已经落进小纸篓');
    worryMessage.textContent = '先把它放在这里。';
    button('toss').hidden = true;
    button('worry-done').hidden = false;
    audio.hit(1, .3);
    button('worry-done').focus({preventScroll: true});
  }

  function runTossClock() {
    if (state.worry.phase !== 'tossing' || state.needsContinue || tossTimer) return;
    tossStarted = win.performance.now();
    tossTimer = win.setTimeout(() => { tossTimer = 0; completeToss(); }, tossRemaining);
  }

  function pause() {
    if (disposed) return;
    pauseRelease(state);
    scene?.cancelGesture();
    stopLoop();
    stopTossClock();
    audio.pause();
    updateControls();
    announce('已暂停。准备好了，点「继续」再开始。');
  }

  function continueScene() {
    if (disposed || doc.hidden || !resumeRelease(state)) return;
    updateControls();
    void audio.resume();
    startLoop();
    announce(state.challenge ? '继续观察这次拆解。' : '继续随手拍一拍。');
  }

  function resetWorryView() {
    textarea.value = '';
    query('.release-worry-count').textContent = '0 / 240';
    writing.hidden = false;
    ballStep.hidden = true;
    ballStage.classList.remove('release-is-tossing', 'release-is-done', 'release-is-crumpled');
    ballStage.setAttribute('aria-label', '一个纸团和一只小纸篓');
    worryMessage.textContent = '已经揉好了。不用瞄准。';
    query(`#${uid}-worry-title`).textContent = '此刻，有什么想先放一边？';
    button('toss').hidden = false;
    button('worry-done').hidden = true;
    tossRemaining = 0;
  }

  function closeDialog() {
    if (disposed || state.worry.phase === 'closed') return;
    stopTossClock();
    // Clear the actual form control as well as state on every exit path.
    textarea.value = '';
    closeWorry(state);
    resetWorryView();
    if (dialog.open) dialog.close();
    updateControls();
    button('worry').focus({preventScroll: true});
    if (!state.paused) {
      void audio.resume();
      startLoop();
    }
  }

  function showWorry() {
    if (disposed || !openWorry(state)) return;
    scene?.cancelGesture();
    stopLoop();
    audio.pause();
    resetWorryView();
    updateControls();
    try {
      dialog.showModal();
      if (state.needsContinue) button('worry-continue').focus();
      else textarea.focus({preventScroll: true});
    } catch {
      closeWorry(state);
      textarea.value = '';
      updateControls();
      if (!state.paused) { void audio.resume(); startLoop(); }
      announce('这个窗口暂时打不开，先在工坊随手拍一拍吧。');
    }
  }

  function changeMode(mode, level = state.challenge?.levelId ?? 'tower') {
    if (disposed || state.paused) return;
    scene?.cancelGesture();
    if (!setReleaseMode(state, mode, level)) return;
    stopLoop();
    updateControls();
    drawBoard();
    announce(mode === 'challenge' ? `${releaseLevel(state.challenge.levelId).name}。${releaseLevel(state.challenge.levelId).hint}`
      : '自由玩具台。可以按 A S D F、拖抛物件，或者推倒全部。');
    startLoop();
  }

  function aim(options) {
    if (disposed || !aimReleaseChallenge(state, options)) return;
    updateControls();
    drawBoard();
  }

  const actions = {
    fire() {
      if (disposed || !fireReleaseChallenge(state)) return;
      updateControls();
      announce(`第 ${state.challenge.shotsUsed} 次发射。看看支点和上层会怎样移动。`);
      audio.hit(state.challenge.projectile === 'puff' ? 0 : 1, .5);
      startLoop();
    },
    retry() { actions.reset(); },
    next() {
      if (state.paused || state.challenge?.phase !== 'won') return;
      const index = RELEASE_LEVELS.findIndex(level => level.id === state.challenge.levelId);
      changeMode('challenge', RELEASE_LEVELS[(index + 1) % RELEASE_LEVELS.length].id);
    },
    topple() {
      if (!toppleRelease(state)) return;
      instruments.forEach((item, index) => { flash(item.id); audio.hit(index, .45); });
      announce('都推倒了。想重来，就再摆一次。');
      startLoop();
    },
    reset() {
      if (state.paused) return;
      scene?.cancelGesture();
      stopLoop();
      resetRelease(state);
      for (const item of impactButtons) item.classList.remove('release-hit');
      updateControls();
      drawBoard();
      announce(state.challenge ? '本关重新摆好了，发射次数已恢复。再观察一次结构。' : '重新摆好了。想怎么玩，都可以。');
      startLoop();
    },
    pause() { if (state.paused) continueScene(); else pause(); },
    continue: continueScene,
    async sound() {
      if (state.paused || soundPending || soundUnavailable) return;
      if (soundOn) {
        soundOn = false;
        audio.disable();
      } else {
        soundPending = true;
        updateControls();
        soundOn = await audio.enable();
        if (disposed) return;
        soundPending = false;
        soundUnavailable = !soundOn;
        if (soundOn) audio.hit(0, .35);
        else announce('这里暂时无法播放声音，触碰和纸篓仍然可以使用。');
      }
      updateControls();
    },
    worry: showWorry,
    'worry-close': closeDialog,
    'worry-done': closeDialog,
    'worry-continue'() {
      if (doc.hidden || !resumeWorry(state)) return;
      updateControls();
      runTossClock();
      if (state.worry.phase === 'writing') textarea.focus({preventScroll: true});
      else if (state.worry.phase === 'ready') button('toss').focus({preventScroll: true});
      else if (state.worry.phase === 'done') button('worry-done').focus({preventScroll: true});
    },
    crumple() {
      if (state.needsContinue) return;
      textarea.value = '';
      if (!crumpleWorry(state)) return;
      query('.release-worry-count').textContent = '0 / 240';
      writing.hidden = true;
      ballStep.hidden = false;
      query(`#${uid}-worry-title`).textContent = '揉一揉，先放下。';
      ballStage.classList.add('release-is-crumpled');
      button('toss').disabled = false;
      button('toss').focus({preventScroll: true});
    },
    toss() {
      if (state.needsContinue || !tossWorry(state)) return;
      const duration = reducedMotion ? 420 : 980;
      tossRemaining = duration + 90;
      ballStage.style.setProperty('--release-toss-duration', `${duration}ms`);
      ballStage.classList.remove('release-is-crumpled');
      ballStage.classList.add('release-is-tossing');
      ballStage.setAttribute('aria-label', '纸团正沿着弧线落进小纸篓');
      worryMessage.textContent = '轻轻一丢……';
      button('toss').disabled = true;
      runTossClock();
    },
    exit() { cleanup(); onExit(); },
  };

  root.addEventListener('click', event => {
    const modeButton = event.target.closest('[data-mode]');
    if (modeButton && !modeButton.disabled) { changeMode(modeButton.dataset.mode); return; }
    const levelButton = event.target.closest('[data-level]');
    if (levelButton && !levelButton.disabled) { changeMode('challenge', levelButton.dataset.level); return; }
    const projectileButton = event.target.closest('[data-projectile]');
    if (projectileButton && !projectileButton.disabled) { aim({projectile: projectileButton.dataset.projectile}); return; }
    const cameraButton = event.target.closest('[data-camera]');
    if (cameraButton && !cameraButton.disabled && scene?.setView(cameraButton.dataset.camera)) {
      view = cameraButton.dataset.camera;
      updateControls();
      return;
    }
    const impactButton = event.target.closest('[data-impact]');
    if (impactButton && !impactButton.disabled) { impact(impactButton.dataset.impact); return; }
    const actionButton = event.target.closest('[data-action]');
    if (actionButton && !actionButton.disabled) actions[actionButton.dataset.action]?.();
  }, {signal: abort.signal});
  root.addEventListener('animationend', event => {
    if (event.animationName === 'release-toss') completeToss();
    const toy = event.target.closest('[data-impact]');
    if (toy && event.animationName === 'release-pad-pop') toy.classList.remove('release-hit');
  }, {signal: abort.signal});
  query('.release-volume input').addEventListener('input', event => {
    const value = Number(event.target.value);
    audio.setVolume(value / 100);
    event.target.setAttribute('aria-valuetext', `${value}%`);
  }, {signal: abort.signal});
  for (const input of root.querySelectorAll('[data-aim]')) {
    input.addEventListener('input', event => {
      aim({[event.target.dataset.aim]: Number(event.target.value)});
    }, {signal: abort.signal});
  }
  function readWorryInput(event) {
    if (event.isComposing) return;
    const value = setWorryText(state, textarea.value);
    if (textarea.value !== value) textarea.value = value;
    query('.release-worry-count').textContent = `${value.length} / 240`;
  }
  textarea.addEventListener('input', readWorryInput, {signal: abort.signal});
  textarea.addEventListener('compositionend', readWorryInput, {signal: abort.signal});
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); }, {signal: abort.signal});
  dialog.addEventListener('close', closeDialog, {signal: abort.signal});
  doc.addEventListener('keydown', event => {
    if (disposed || state.paused || dialog.open || state.mode !== 'free') return;
    const id = releaseShortcut(event);
    if (id) { event.preventDefault(); impact(id); }
  }, {signal: abort.signal});
  win.addEventListener('blur', pause, {signal: abort.signal});
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) pause(); }, {signal: abort.signal});
  win.addEventListener('pagehide', () => {
    if (disposed) return;
    pause();
    textarea.value = '';
    closeWorry(state);
    resetWorryView();
    if (dialog.open) dialog.close();
    updateControls();
  }, {signal: abort.signal});
  function motionChanged(event) {
    reducedMotion = event.matches;
    scene?.setReducedMotion(reducedMotion);
    startLoop();
  }
  media?.addEventListener?.('change', motionChanged, {signal: abort.signal});
  scene = createReleaseScene(canvas, {
    state, onImpact: impact, onUnavailable: useFallback, onActivity: startLoop, reducedMotion,
    onAim: point => aim({angle: Math.round(Math.atan2(point.x, 2.35 - point.z) * 180 / Math.PI)}),
  });
  if (!scene) useFallback();
  if (doc.hidden) pause();
  else startLoop();
  updateControls();
  announce('先选择一个结构。切换视角找支点，再调方向和力度发射。');

  function cleanup() {
    if (disposed) return;
    disposed = true;
    abort.abort();
    media?.removeEventListener?.('change', motionChanged);
    stopLoop();
    stopTossClock();
    textarea.value = '';
    closeWorry(state);
    resetWorryView();
    if (dialog.open) dialog.close();
    scene?.destroy();
    scene = null;
    audio.destroy();
    root.remove();
  }
  return cleanup;
}
