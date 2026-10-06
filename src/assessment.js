import { assessmentGames, storyScenes, makeTrials } from './assessment-data.js';

const DEADLINE_MS = 1800;
const FIXATION_MS = 450;
const FEEDBACK_MS = 650;
const mounts = new WeakMap();
const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
const nextIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';
const leafIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 4C9 3 3 7 5 14c2 6 12 6 14-10Z"/><path d="m5 20 9-10"/></svg>';
const starIcon = '<svg viewBox="0 0 80 80" aria-hidden="true"><path d="m40 7 10 21 23 4-17 17 4 24-20-11-21 11 4-24L6 32l24-4Z"/></svg>';
const cloudIcon = '<svg viewBox="0 0 100 80" aria-hidden="true"><path d="M23 61C3 61 3 34 21 32 22 10 53 5 63 25 87 17 103 53 81 60Z"/></svg>';

function scenery(gameId, sceneIndex = 0) {
  const lantern = gameId === 'lantern';
  return `<svg class="sa-scenery" viewBox="0 0 600 300" fill="none" aria-hidden="true">
    <circle cx="${[460, 425, 485][sceneIndex % 3]}" cy="64" r="32" fill="#e7d6a8"/>
    <path d="M22 153c59-66 117-78 170-40 53-82 113-70 162-13 66-54 153-37 224 54" fill="#d7e1cd"/>
    <path d="M0 182c94-40 179-28 269-9 100-53 219-42 331-5v132H0Z" fill="${lantern ? '#dce3ce' : '#d9e8e0'}"/>
    <path d="M0 235c135-33 189 18 326-8 103-20 155-11 274 6v67H0Z" fill="${lantern ? '#ccd9be' : '#c1d7cf'}"/>
    <path d="M85 95q12-12 24 0m0 0q12-12 24 0M149 74q9-9 18 0m0 0q9-9 18 0" stroke="#8b9d84" stroke-width="2" stroke-linecap="round"/>
    ${lantern ? `
      <path d="M54 14v240M540 22v232" stroke="#8e9e7d" stroke-width="7" stroke-linecap="round"/>
      <path d="M54 51q245 71 486 0" stroke="#8e9e7d" stroke-width="2"/>
      ${[116, 208, 300, 392, 484].map((x, index) => `<g class="sa-light sa-light-${index}">
        <path d="M${x} ${[65, 78, 85, 78, 65][index]}v20" stroke="#8e9e7d" stroke-width="2"/>
        <ellipse class="sa-light-halo" cx="${x}" cy="${[105, 118, 125, 118, 105][index]}" rx="30" ry="35" fill="#f5e4a3"/>
        <rect x="${x - 14}" y="${[88, 101, 108, 101, 88][index]}" width="28" height="34" rx="10" fill="#eee1b9" stroke="#b7ac80" stroke-width="1.5"/>
        <path d="M${x - 9} ${[92, 105, 112, 105, 92][index]}h18M${x - 9} ${[117, 130, 137, 130, 117][index]}h18" stroke="#b7ac80" stroke-width="1.5"/>
      </g>`).join('')}
      <path d="M222 300q82-48 84-83" stroke="#f8f1de" stroke-width="48"/>
      <path d="m53 265 5-18m0 18 11-11m459 12 4-19m0 19 11-11" stroke="#9bac89" stroke-width="3" stroke-linecap="round"/>
    ` : `
      <path d="M421 160v-63h29v63m-31-64 17-23 16 23" fill="#f7f0dd" stroke="#acb79c" stroke-width="2" stroke-linejoin="round"/>
      <path d="M435 111v13" stroke="#96a489" stroke-width="5" stroke-linecap="round"/>
      <path d="M405 163h64" stroke="#acb79c" stroke-width="3" stroke-linecap="round"/>
      <path d="M62 211h42m13 0h18m311 44h53m-339 17h34" stroke="#94b6ac" stroke-width="2" stroke-linecap="round"/>
      <g class="sa-boat">
        <ellipse cx="292" cy="252" rx="58" ry="5" fill="#9cbbb0" opacity=".35"/>
        <path d="m238 222 22 25h62l22-25Z" fill="#b39472" stroke="#8e7e64" stroke-width="2" stroke-linejoin="round"/>
        <path d="M291 221v-91" stroke="#8f9276" stroke-width="3" stroke-linecap="round"/>
        <path d="m283 143-40 67h40Z" fill="#fff9e9" stroke="#c2c2a3" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="m300 158 31 52h-31Z" fill="#d9b9a0" stroke="#bba58c" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M274 261h42" stroke="#87a99d" stroke-width="2" stroke-linecap="round"/>
      </g>
    `}
    <path d="m27 287 6-21m-6 12-7-7m13 8 6-6m524 14 7-25m-7 15-8-6m9 9 7-5" stroke="#93a687" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;
}

function stimulusMarkup(gameId, trial) {
  if (gameId === 'harbor') {
    const center = trial.target === 'left' ? '←' : '→';
    const flank = trial.flank === 'left' ? '←' : '→';
    const label = `中间箭头向${trial.target === 'left' ? '左' : '右'}，两侧箭头向${trial.flank === 'left' ? '左' : '右'}`;
    return `<div class="sa-arrows" role="img" aria-label="${label}">
      <span class="sa-flank" aria-hidden="true">${flank}${flank}</span>
      <span class="sa-central-arrow" aria-hidden="true">${center}</span>
      <span class="sa-flank" aria-hidden="true">${flank}${flank}</span>
    </div><span class="sa-stimulus-caption">只看中间的箭头</span>`;
  }
  const go = trial.kind === 'go';
  return `<div class="sa-symbol ${go ? 'sa-star' : 'sa-cloud'}" role="img" aria-label="${go ? '星星' : '云朵'}">${go ? starIcon : cloudIcon}</div>
    <span class="sa-stimulus-caption">${go ? '星星' : '云朵'}</span>`;
}

function responseButtons(gameId, disabled = false) {
  return `<div class="sa-response-buttons ${gameId === 'lantern' ? 'sa-response-single' : ''}">
    ${gameId === 'harbor' ? `
      <button type="button" class="sa-response" data-response="left" ${disabled ? 'disabled' : ''} aria-label="向左，或按键盘左方向键"><kbd>←</kbd><span>向左</span></button>
      <button type="button" class="sa-response" data-response="right" ${disabled ? 'disabled' : ''} aria-label="向右，或按键盘右方向键"><span>向右</span><kbd>→</kbd></button>
    ` : `<button type="button" class="sa-response sa-tap" data-response="tap" ${disabled ? 'disabled' : ''} aria-label="点亮星星，或按空格键">${starIcon}<span>点亮星星</span><kbd>空格</kbd></button>`}
  </div>`;
}

// This only supplies immediate trial feedback. Final scoring belongs to assessment-data.js.
function trialFeedback(gameId, trial, response) {
  if (response === trial.target) {
    return {
      state: 'correct',
      text: gameId === 'harbor' ? '方向对了，小船向前了一点。' :
        trial.kind === 'stop' ? '让云朵经过，灯火留在这里。' : '接住一颗星，亮起一盏小灯。',
    };
  }
  if (response === null) {
    return { state: 'missed', text: '这次没收到操作。下一次，等符号出现再试。' };
  }
  return {
    state: 'error',
    text: gameId === 'harbor' ? '刚才看偏了。下一次，只看中间的箭头。' : '刚才是云朵。遇到它时，停一停，不用点。',
  };
}

/**
 * Mount one story + attention challenge. The host owns showModal(), close(),
 * scoring, persistence, and navigation. Calling cleanup is safe more than once.
 */
export function mountAssessment(container, { mode = 'before', gameId, onComplete = () => {}, onCancel = () => {} } = {}) {
  if (!container || typeof container.replaceChildren !== 'function') {
    throw new TypeError('mountAssessment requires a DOM container.');
  }
  mounts.get(container)?.();
  const game = assessmentGames.find(item => item.id === gameId) || assessmentGames[0];
  if (!game || !['harbor', 'lantern'].includes(game.id)) {
    throw new TypeError('An assessment game must be harbor or lantern.');
  }
  const scenes = storyScenes.slice(0, 3);
  const root = document.createElement('div');
  root.className = 'sa-root';
  root.dataset.game = game.id;
  container.replaceChildren(root);

  let disposed = false;
  let completed = false;
  let phase = 'story';
  let sceneIndex = 0;
  const choices = Array(scenes.length).fill(null);
  let demoIndex = 0;
  let roundType = 'practice';
  let roundTrials = [];
  let records = [];
  let accepting = false;
  let startedAt = null;
  let trialToken = 0;
  let clockVersion = 0;
  let pointerStart = null;
  let pauseReason = '';
  const keysDown = new Set();
  const timers = new Set();
  const frames = new Set();
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const now = () => win.performance.now();
  const followUp = mode === 'after' || mode === 'post';

  function stopClock() {
    clockVersion += 1;
    timers.forEach(id => win.clearTimeout(id));
    frames.forEach(id => win.cancelAnimationFrame(id));
    timers.clear();
    frames.clear();
    accepting = false;
    startedAt = null;
    pointerStart = null;
  }

  function later(callback, delay) {
    const version = clockVersion;
    const id = win.setTimeout(() => {
      timers.delete(id);
      if (!disposed && version === clockVersion) callback();
    }, delay);
    timers.add(id);
  }

  function nextFrame(callback) {
    const version = clockVersion;
    const id = win.requestAnimationFrame(() => {
      frames.delete(id);
      if (!disposed && version === clockVersion) callback();
    });
    frames.add(id);
  }

  function cleanup() {
    if (disposed) return;
    disposed = true;
    stopClock();
    keysDown.clear();
    root.removeEventListener('click', handleClick);
    root.removeEventListener('pointerdown', handlePointerDown, true);
    win.removeEventListener('keydown', handleKeyDown, true);
    win.removeEventListener('keyup', handleKeyUp, true);
    win.removeEventListener('blur', handleBlur);
    doc.removeEventListener('visibilitychange', handleVisibility);
    container.removeEventListener('close', handleClose);
    root.remove();
    if (mounts.get(container) === cleanup) mounts.delete(container);
  }

  function cancel() {
    if (disposed || completed) return;
    cleanup();
    onCancel();
  }

  function shell(content, activeStep = 0) {
    root.dataset.screen = phase;
    if (phase !== 'running') delete root.dataset.trialState;
    root.innerHTML = `<header class="sa-header">
      <div class="sa-header-mark">${leafIcon}</div>
      <div class="sa-header-copy"><span class="sa-eyebrow">${followUp ? 'ANOTHER LITTLE MOMENT' : 'A LITTLE MOMENT FOR YOU'}</span>
        <h2 id="assessment-title">${followUp ? '再走一段，看看此刻的自己。' : '从一段小故事，走近此刻。'}</h2>
      </div>
      <button type="button" class="sa-close" data-action="cancel" aria-label="关闭情境与操作体验">${closeIcon}</button>
    </header>
    <ol class="sa-steps" aria-label="体验步骤">${['三幕小故事', '先试一试', '操作小挑战'].map((label, index) => `
      <li class="${index === activeStep ? 'sa-step-current' : index < activeStep ? 'sa-step-done' : ''}" ${index === activeStep ? 'aria-current="step"' : ''}>
        <span>${index < activeStep ? '✓' : `0${index + 1}`}</span>${label}
      </li>`).join('')}</ol>
    <div class="sa-screen">${content}</div>`;
  }

  function focusHeading() {
    const heading = root.querySelector('[data-focus]');
    heading?.focus({ preventScroll: true });
  }

  function renderStory(focus = false) {
    phase = 'story';
    const scene = scenes[sceneIndex];
    const selection = scene.options.find(option => option.id === choices[sceneIndex]);
    shell(`<div class="sa-story-layout">
      <aside class="sa-story-visual" data-reacted="${Boolean(selection)}">
        <div class="sa-postcard-top"><span>此刻 · 一张生活切片</span><span>0${sceneIndex + 1}</span></div>
        ${scenery(game.id, sceneIndex)}
        <div class="sa-postcard-note">${['不急着往前，先听听自己。', '岔路的每一边，都有风景。', '给接下来的一小步，留点空间。'][sceneIndex]}</div>
        <div class="sa-scene-dots" aria-label="第 ${sceneIndex + 1} 幕，共 ${scenes.length} 幕">${scenes.map((_, index) => `<i class="${index === sceneIndex ? 'sa-dot-active' : ''}"></i>`).join('')}</div>
      </aside>
      <section class="sa-story-copy">
        <span class="sa-eyebrow">STORY ${String(sceneIndex + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}</span>
        <h3 class="sa-screen-title" tabindex="-1" data-focus>${html(scene.title)}</h3>
        <p class="sa-scene-text">${html(scene.scene)}</p>
        <p class="sa-prompt" id="sa-story-prompt">${html(scene.prompt)}</p>
        <div class="sa-options" role="group" aria-labelledby="sa-story-prompt">
          ${scene.options.map((option, index) => `<button type="button" class="sa-option ${selection?.id === option.id ? 'sa-option-selected' : ''}"
            data-choice="${html(option.id)}" aria-pressed="${selection?.id === option.id}">
            <span class="sa-option-letter">${String.fromCharCode(65 + index)}</span><span>${html(option.label)}</span><span class="sa-option-check" aria-hidden="true">✓</span>
          </button>`).join('')}
        </div>
        <div class="sa-reply ${selection ? 'sa-reply-visible' : ''}" role="status" aria-live="polite" aria-atomic="true">
          ${selection ? `<span class="sa-reply-mark">${leafIcon}</span><div><span class="sa-reply-label">故事接着这样发生</span><p>${html(selection.reply)}</p></div>` : '<p>选一个更像你的反应，看看故事怎样继续。</p>'}
        </div>
      </section>
    </div>
    <footer class="sa-story-footer">
      <button type="button" class="sa-text-button" data-action="${sceneIndex === 0 ? 'cancel' : 'previous-scene'}">${sceneIndex === 0 ? '返回选择' : '← 上一幕'}</button>
      <span class="sa-footnote">情境选择没有标准答案</span>
      <button type="button" class="sa-button sa-primary" data-action="next-scene" ${!selection ? 'disabled' : ''}>${sceneIndex === scenes.length - 1 ? '去试试小挑战' : '继续故事'}${nextIcon}</button>
    </footer>`);
    if (focus) focusHeading();
  }

  function selectChoice(id) {
    const scene = scenes[sceneIndex];
    const option = scene.options.find(item => item.id === id);
    if (!option) return;
    choices[sceneIndex] = option.id;
    root.querySelectorAll('[data-choice]').forEach(button => {
      const selected = button.dataset.choice === id;
      button.classList.toggle('sa-option-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const reply = root.querySelector('.sa-reply');
    reply.classList.add('sa-reply-visible');
    reply.innerHTML = `<span class="sa-reply-mark">${leafIcon}</span><div><span class="sa-reply-label">故事接着这样发生</span><p>${html(option.reply)}</p></div>`;
    root.querySelector('.sa-story-visual').dataset.reacted = 'true';
    root.querySelector('[data-action="next-scene"]').disabled = false;
  }

  function demoTrial() {
    if (game.id === 'harbor') return demoIndex % 2 === 0 ?
      { kind: 'conflict', target: 'left', flank: 'right' } :
      { kind: 'congruent', target: 'right', flank: 'right' };
    return demoIndex % 2 === 0 ? { kind: 'go', target: 'tap' } : { kind: 'stop', target: null };
  }

  function ruleText() {
    return game.id === 'harbor' ? '只看正中间的箭头，按它的方向。两侧的箭头可能会捣乱。' :
      '看到星星，点一下；看到云朵，不用点，等它经过。';
  }

  function renderDemo() {
    stopClock();
    phase = 'demo';
    shell(`<section class="sa-demo">
      <div class="sa-section-heading"><div><span class="sa-eyebrow">MEET YOUR LITTLE CHALLENGE</span><h3 class="sa-screen-title" tabindex="-1" data-focus>${html(game.name)}</h3></div><span class="sa-badge">演示 · 不计时</span></div>
      <p class="sa-rule">${ruleText()}</p>
      <div class="sa-board sa-demo-board">${scenery(game.id)}<div class="sa-stimulus">${stimulusMarkup(game.id, demoTrial())}</div><span class="sa-board-label">先摸索一下，准备好再出发</span></div>
      <p class="sa-feedback" role="status" aria-live="polite">${game.id === 'harbor' ? '试着按一次方向，看看小船怎么走。' : '试着点亮星星，再换到云朵看看。'}</p>
      ${responseButtons(game.id)}
      <div class="sa-demo-tools"><span>${game.id === 'harbor' ? '支持键盘 ← →，也可以点按钮' : '支持空格键，也可以点按钮'}</span><button type="button" class="sa-text-button" data-action="demo-next">换个示例 ↻</button></div>
      <div class="sa-practice-note"><span class="sa-note-number">4</span><p>先做 4 次练习，熟悉节奏。<br><span>每次有 1.8 秒；练习不计入正式结果。</span></p></div>
      <footer class="sa-bottom-actions"><button type="button" class="sa-text-button" data-action="cancel">先退出</button><button type="button" class="sa-button sa-primary" data-action="start-practice">开始 4 次练习${nextIcon}</button></footer>
      <p class="sa-footnote sa-centered">${followUp ? '沿用上次的任务和时限；熟悉程度也可能影响表现。' : '记录情境选择与操作表现，不把游戏成绩当作压力值。'}</p>
    </section>`, 1);
    focusHeading();
  }

  function respondDemo(response) {
    const feedback = trialFeedback(game.id, demoTrial(), response);
    root.querySelector('.sa-feedback').textContent = feedback.text;
    root.querySelector('.sa-board').dataset.feedback = feedback.state;
  }

  function updateDemo() {
    demoIndex += 1;
    root.querySelector('.sa-stimulus').innerHTML = stimulusMarkup(game.id, demoTrial());
    root.querySelector('.sa-board').removeAttribute('data-feedback');
    root.querySelector('.sa-feedback').textContent = game.id === 'lantern' && demoTrial().kind === 'stop' ?
      '这是一朵云。正式挑战中，不点它、等它离开就好。' : '试一试下方按钮。这里没有倒计时。';
  }

  function startRound(type) {
    if (disposed || doc.visibilityState === 'hidden') return;
    stopClock();
    roundType = type;
    roundTrials = makeTrials(game.id, { practice: type === 'practice', random: Math.random }).map(trial => ({ ...trial }));
    records = [];
    phase = 'running';
    renderTask();
    prepareTrial();
  }

  function renderTask() {
    const practice = roundType === 'practice';
    shell(`<section class="sa-task">
      <div class="sa-section-heading"><div><span class="sa-eyebrow">${practice ? 'A LITTLE REHEARSAL' : 'ONE MOMENT AT A TIME'}</span><h3 class="sa-screen-title" tabindex="-1" data-focus>${html(game.name)}</h3></div><span class="sa-badge">${practice ? '练习 · 不计入结果' : '正式挑战'}</span></div>
      <div class="sa-task-progress"><span class="sa-trial-count"></span><progress max="${roundTrials.length}" value="${records.length}" aria-label="${practice ? '练习' : '正式挑战'}完成进度"></progress><span class="sa-completed-count">${records.length} / ${roundTrials.length}</span></div>
      <div class="sa-board sa-task-board">${scenery(game.id)}<div class="sa-stimulus"></div><span class="sa-board-label">${game.id === 'harbor' ? '让小船跟随中间的方向' : '留一点灯火，让云朵经过'}</span><div class="sa-deadline-track" aria-hidden="true"><i></i></div></div>
      <p class="sa-feedback" role="status" aria-live="polite" aria-atomic="true"></p>
      ${responseButtons(game.id, true)}
      <p class="sa-input-hint">${game.id === 'harbor' ? '看中间 · 左右方向键或点按钮' : '星星点一下 · 云朵不点 · 可用空格键'}<span>每次 1.8 秒</span></p>
      <footer class="sa-task-footer"><span>${practice ? '先熟悉节奏，练完再正式开始。' : '一次一次来，随时可以暂停。'}</span><button type="button" class="sa-button sa-secondary sa-pause-button" data-action="pause"><span aria-hidden="true">Ⅱ</span> 暂停</button></footer>
    </section>`, practice ? 1 : 2);
    root.dataset.round = roundType;
    focusHeading();
  }

  function setResponseEnabled(enabled) {
    root.querySelectorAll('[data-response]').forEach(button => { button.disabled = !enabled; });
  }

  function prepareTrial() {
    if (disposed || phase !== 'running') return;
    if (records.length === roundTrials.length) {
      finishRound();
      return;
    }
    stopClock();
    trialToken += 1;
    root.dataset.trialState = 'fixation';
    const board = root.querySelector('.sa-board');
    board.removeAttribute('data-feedback');
    board.classList.remove('sa-is-timing');
    const stimulus = root.querySelector('.sa-stimulus');
    stimulus.removeAttribute('data-kind');
    stimulus.removeAttribute('data-target');
    stimulus.innerHTML = '<span class="sa-fixation" aria-hidden="true">+</span><span class="sa-stimulus-caption">准备，看这里</span>';
    root.querySelector('.sa-trial-count').textContent = `${roundType === 'practice' ? '练习' : '挑战'} ${records.length + 1} / ${roundTrials.length}`;
    root.querySelector('.sa-feedback').textContent = '等符号出现，再操作。';
    setResponseEnabled(false);
    later(() => {
      const trial = roundTrials[records.length];
      stimulus.innerHTML = stimulusMarkup(game.id, trial);
      stimulus.dataset.kind = trial.kind;
      stimulus.dataset.target = trial.target ?? 'none';
      // Wait for a painted stimulus before accepting input or starting its deadline.
      nextFrame(() => nextFrame(() => {
        if (doc.visibilityState === 'hidden') {
          pause('页面暂时离开了视线');
          return;
        }
        startedAt = now();
        accepting = true;
        root.dataset.trialState = 'stimulus';
        board.classList.add('sa-is-timing');
        setResponseEnabled(true);
        root.querySelector('.sa-feedback').textContent = game.id === 'harbor' ? '只看中间，选它的方向。' : '星星点一下，云朵不点。';
        later(() => settleTrial(null, null), DEADLINE_MS);
      }));
    }, FIXATION_MS);
  }

  function respond(response, event) {
    if (disposed) return;
    if (phase === 'demo') {
      respondDemo(response);
      return;
    }
    if (phase !== 'running' || !accepting || startedAt === null) return;
    const elapsed = now() - startedAt;
    if (elapsed >= DEADLINE_MS) {
      settleTrial(null, null);
      return;
    }
    // A queued event from before onset is not a response to the new stimulus.
    if (event?.timeStamp > 0 && event.timeStamp < startedAt && startedAt - event.timeStamp < 60_000) return;
    settleTrial(response, Math.max(1, Math.round(elapsed)));
  }

  function settleTrial(response, rtMs) {
    if (disposed || phase !== 'running' || !accepting) return;
    const trial = roundTrials[records.length];
    stopClock();
    records.push({ ...trial, response, rtMs });
    root.dataset.trialState = 'feedback';
    setResponseEnabled(false);
    const feedback = trialFeedback(game.id, trial, response);
    const board = root.querySelector('.sa-board');
    board.classList.remove('sa-is-timing');
    board.dataset.feedback = feedback.state;
    root.querySelector('.sa-feedback').textContent = feedback.text;
    root.querySelector('progress').value = records.length;
    root.querySelector('.sa-completed-count').textContent = `${records.length} / ${roundTrials.length}`;
    later(prepareTrial, FEEDBACK_MS);
  }

  function finishRound() {
    stopClock();
    const hasInput = records.some(trial => trial.response !== null);
    if (roundType === 'practice') {
      phase = 'practice-done';
      renderRoundEnd(hasInput);
    } else if (!hasInput) {
      phase = 'invalid';
      renderRoundEnd(false);
    } else if (!completed && !disposed) {
      completed = true;
      const result = { gameId: game.id, choices: [...choices], trials: records.map(trial => ({ ...trial })) };
      cleanup();
      onComplete(result);
    }
  }

  function renderRoundEnd(hasInput) {
    const practice = roundType === 'practice';
    shell(`<section class="sa-interlude">
      <div class="sa-interlude-art" data-reacted="${hasInput}">${scenery(game.id)}</div>
      <span class="sa-eyebrow">${hasInput ? 'READY WHEN YOU ARE' : 'LET’S TRY THAT AGAIN'}</span>
      <h3 class="sa-screen-title" tabindex="-1" data-focus>${hasInput ? '练习结束，准备出发。' : '这一轮，还没收到你的操作。'}</h3>
      <p class="sa-interlude-copy">${hasInput ?
        '接下来是 18 次正式挑战，规则和刚才相同。准备好了，再按开始。' :
        `刚才没有记录到任何按键或点按，${practice ? '先再练习一次吧' : '这一轮不会生成结果'}。${game.id === 'harbor' ? '箭头出现后，用方向键或下方按钮回应。' : '星星出现时，按空格或点「点亮星星」；云朵不用点。'}`}</p>
      <div class="sa-interlude-detail">${hasInput ? '<span>18 次操作</span><i></i><span>每次 1.8 秒</span><i></i><span>随时可暂停</span>' : '<span>请保持页面可见，并使用同一种操作方式。</span>'}</div>
      <div class="sa-interlude-actions">
        ${hasInput ? `<button type="button" class="sa-button sa-primary" data-action="start-scored">开始正式挑战 · 18 次${nextIcon}</button><button type="button" class="sa-button sa-secondary" data-action="start-practice">再练 4 次</button>` :
          `<button type="button" class="sa-button sa-primary" data-action="${practice ? 'start-practice' : 'start-scored'}">${practice ? '重新练习 4 次' : '重试正式挑战'}${nextIcon}</button><button type="button" class="sa-button sa-secondary" data-action="${practice ? 'instructions' : 'start-practice'}">${practice ? '再看一次规则' : '回到练习'}</button>`}
      </div>
      <button type="button" class="sa-text-button" data-action="cancel">先退出，稍后再来</button>
      <p class="sa-footnote sa-centered">${practice ? '练习记录不会带入正式结果。' : '没有操作的回合，不会被当作一次有效测量。'}</p>
    </section>`, practice ? 1 : 2);
    focusHeading();
  }

  function pause(reason) {
    if (disposed || phase !== 'running') return;
    stopClock();
    keysDown.clear();
    pauseReason = reason;
    phase = 'paused';
    shell(`<section class="sa-interlude sa-pause-screen">
      <div class="sa-pause-symbol" aria-hidden="true">Ⅱ</div>
      <span class="sa-eyebrow">TAKE YOUR TIME</span>
      <h3 class="sa-screen-title" tabindex="-1" data-focus>小旅程，停在这里等你。</h3>
      <p class="sa-interlude-copy">${html(pauseReason)}。已完成的 ${records.length} 次会保留；尚未完成的那一次，会在继续后重新出现。</p>
      <div class="sa-interlude-detail"><span>${roundType === 'practice' ? '练习' : '正式挑战'}</span><i></i><span>已完成 ${records.length} / ${roundTrials.length}</span></div>
      <div class="sa-interlude-actions"><button type="button" class="sa-button sa-primary" data-action="resume">继续${nextIcon}</button><button type="button" class="sa-button sa-secondary" data-action="restart-round">重新开始这一轮</button></div>
      <p class="sa-footnote">重新开始会清空本轮操作，保留前面的情境选择。</p>
      <button type="button" class="sa-text-button" data-action="cancel">结束这次体验</button>
    </section>`, roundType === 'practice' ? 1 : 2);
    focusHeading();
  }

  function handleBlur() { pause('你暂时切换了窗口'); }
  function handleClose() {
    // A queued close event from an earlier opening must not dispose a new mount.
    if (!container.open) cleanup();
  }
  function handleVisibility() {
    if (doc.visibilityState === 'hidden') pause('你暂时切换了页面');
  }

  function handlePointerDown(event) {
    const button = event.target.closest?.('[data-response]');
    if (button && root.contains(button)) {
      pointerStart = { token: accepting ? trialToken : null, response: button.dataset.response };
    }
  }

  function handleClick(event) {
    const button = event.target.closest?.('button');
    if (!button || !root.contains(button) || button.disabled || disposed) return;
    if (button.dataset.choice && phase === 'story') {
      selectChoice(button.dataset.choice);
      return;
    }
    if (button.dataset.response) {
      // Long presses begun between trials cannot answer a later trial on release.
      if (phase === 'running' && event.detail > 0 &&
          (pointerStart?.token !== trialToken || pointerStart?.response !== button.dataset.response)) return;
      pointerStart = null;
      respond(button.dataset.response, event);
      return;
    }
    switch (button.dataset.action) {
      case 'cancel': cancel(); break;
      case 'previous-scene':
        if (phase === 'story' && sceneIndex > 0) { sceneIndex -= 1; renderStory(true); }
        break;
      case 'next-scene':
        if (phase !== 'story' || !choices[sceneIndex]) break;
        if (sceneIndex < scenes.length - 1) { sceneIndex += 1; renderStory(true); }
        else renderDemo();
        break;
      case 'demo-next': if (phase === 'demo') updateDemo(); break;
      case 'instructions': renderDemo(); break;
      case 'start-practice': startRound('practice'); break;
      case 'start-scored': startRound('scored'); break;
      case 'pause': pause('你按下了暂停'); break;
      case 'resume':
        if (phase === 'paused' && doc.visibilityState !== 'hidden') {
          phase = 'running';
          renderTask();
          prepareTrial();
        }
        break;
      case 'restart-round': startRound(roundType); break;
      default: break;
    }
  }

  function handleKeyDown(event) {
    if (disposed || !['running', 'demo'].includes(phase) || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const focusedButton = event.target.closest?.('button');
    let response;
    if (game.id === 'harbor' && event.key === 'ArrowLeft') response = 'left';
    if (game.id === 'harbor' && event.key === 'ArrowRight') response = 'right';
    if (game.id === 'lantern' && (event.code === 'Space' || event.key === ' ') && !focusedButton?.dataset.action) response = 'tap';
    if ((event.key === 'Enter' || event.key === ' ') && focusedButton?.dataset.response) response = focusedButton.dataset.response;
    if (!response) return;
    event.preventDefault();
    if (event.repeat || keysDown.has(event.code || event.key)) return;
    keysDown.add(event.code || event.key);
    respond(response, event);
  }

  function handleKeyUp(event) { keysDown.delete(event.code || event.key); }

  mounts.set(container, cleanup);
  root.addEventListener('click', handleClick);
  root.addEventListener('pointerdown', handlePointerDown, true);
  win.addEventListener('keydown', handleKeyDown, true);
  win.addEventListener('keyup', handleKeyUp, true);
  win.addEventListener('blur', handleBlur);
  doc.addEventListener('visibilitychange', handleVisibility);
  container.addEventListener('close', handleClose);
  renderStory();
  return cleanup;
}
