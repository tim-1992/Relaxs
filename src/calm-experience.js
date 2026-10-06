import { CALM_PATTERNS, createCalmClock } from './calm-clock.js';
import { createCalmAudio } from './calm-audio.js';

let mountSequence = 0;
let soundPreference = true;

function timeLabel(milliseconds, roundUp = false) {
  const seconds = Math.max(0, (roundUp ? Math.ceil : Math.floor)(milliseconds / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

export function mountCalm(container, { onExit = () => {}, onAnnounce = () => {} } = {}) {
  const document = container.ownerDocument;
  const view = document.defaultView;
  const id = `calm-${++mountSequence}`;
  const root = document.createElement('section');
  root.className = 'experience-shell calm-experience';
  root.setAttribute('aria-labelledby', `${id}-title`);
  root.innerHTML = `
    <div class="experience-heading calm-heading">
      <p class="eyebrow">BREATHE / 静一会</p>
      <h1 id="${id}-title" tabindex="-1">这里，不用急。</h1>
      <p>跟着微光，轻轻吸气，慢慢呼出。按自己舒服的节奏就好。</p>
    </div>
    <div class="calm-space">
      <div class="calm-stage" aria-hidden="true">
        <div class="calm-halo"></div>
        <div class="calm-orbit calm-orbit-outer"></div>
        <div class="calm-orbit calm-orbit-inner"></div>
        <div class="calm-orb"><span class="calm-orb-sheen"></span></div>
        <span class="calm-star calm-star-one"></span>
        <span class="calm-star calm-star-two"></span>
        <span class="calm-star calm-star-three"></span>
      </div>
      <div class="calm-cue">
        <p class="calm-phase" data-calm="phase" role="status" aria-live="polite" aria-atomic="true">留一点空白</p>
        <p class="calm-phase-time" data-calm="phase-time" aria-hidden="true">不用准备得很好，现在这样就可以。</p>
      </div>
      <div class="calm-time">
        <p class="experience-status calm-timer" data-calm="timer" role="timer" aria-live="off"></p>
        <progress class="calm-progress" data-calm="progress" max="1" value="0" aria-label="本次静一会的进度"></progress>
      </div>
      <div class="experience-toolbar calm-actions">
        <button class="experience-button is-primary calm-primary" type="button" data-calm-action="primary">开始呼吸</button>
        <button class="experience-button" type="button" data-calm-action="finish" hidden>就到这里</button>
        <button class="experience-button" type="button" data-calm-action="exit" hidden>回到星球</button>
      </div>
      <p class="experience-status calm-session-note" data-calm="session-note"></p>
    </div>
    <details class="experience-panel calm-audio calm-preferences" data-calm="preferences">
      <summary>呼吸节奏与时长 <span class="calm-audio-badge">按自己的节奏</span></summary>
      <div class="calm-settings">
      <fieldset class="calm-fieldset" data-calm="patterns" aria-describedby="${id}-settings-note">
        <legend>呼吸的节奏</legend>
        <div class="calm-patterns">
          ${CALM_PATTERNS.map(pattern => `
            <label class="calm-choice">
              <input type="radio" name="${id}-pattern" value="${pattern.id}" ${pattern.id === 'steady' ? 'checked' : ''}>
              <span class="calm-choice-body">
                <span>${pattern.label}</span>
                <small>吸 ${pattern.inhaleMs / 1_000} 秒 · 呼 ${pattern.exhaleMs / 1_000} 秒</small>
              </span>
            </label>
          `).join('')}
        </div>
      </fieldset>
      <fieldset class="calm-fieldset" data-calm="durations" aria-describedby="${id}-settings-note">
        <legend>留多久，都可以</legend>
        <div class="calm-durations">
          ${[
            { value: 60_000, label: '1 分钟' },
            { value: 180_000, label: '3 分钟' },
            { value: 300_000, label: '5 分钟' },
            { value: 0, label: '自由停留' },
          ].map(duration => `
            <label class="calm-choice">
              <input type="radio" name="${id}-duration" value="${duration.value}" ${duration.value === 60_000 ? 'checked' : ''}>
              <span class="calm-choice-body">${duration.label}</span>
            </label>
          `).join('')}
        </div>
      </fieldset>
      <p class="experience-status calm-settings-note" id="${id}-settings-note" data-calm="settings-note">吸气和呼气自然相接，不用屏息。</p>
      </div>
    </details>
    <details class="experience-panel calm-audio">
      <summary>一点背景声 <span class="calm-audio-badge" data-calm="audio-badge">已关闭</span></summary>
      <div class="calm-audio-controls">
        <label class="calm-sound-label" for="${id}-sound">听见什么
          <select class="calm-select" id="${id}-sound" data-calm="sound">
            <option value="sea">远处的海</option>
            <option value="rain">窗外小雨</option>
            <option value="space" selected>星间微光 · 原创和弦</option>
          </select>
        </label>
        <button class="experience-button calm-sound-toggle" type="button" data-calm-action="sound" aria-pressed="false">开启环境声</button>
        <label class="calm-volume-label" for="${id}-volume">
          <span>音量 <output for="${id}-volume" data-calm="volume-value">30%</output></span>
          <input id="${id}-volume" data-calm="volume" type="range" min="0" max="100" step="1" value="30">
        </label>
      </div>
      <p class="experience-status calm-audio-note" data-calm="audio-note">声音会随呼吸开始和暂停。</p>
    </details>
    <p class="calm-motion-note" data-calm="motion-note" hidden>已减少动态效果，可以跟随文字提示呼吸。</p>
  `;
  container.append(root);

  const elements = Object.fromEntries(
    [...root.querySelectorAll('[data-calm]')].map(element => [element.dataset.calm, element]),
  );
  const buttons = Object.fromEntries(
    [...root.querySelectorAll('[data-calm-action]')].map(element => [element.dataset.calmAction, element]),
  );
  const clock = createCalmClock();
  const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
  const removers = [];
  let disposed = false;
  let frameId = null;
  let state = clock.read(view.performance.now());
  let previousStatus = null;
  let pauseReason = '';
  let soundEnabled = soundPreference;
  let soundPlaying = false;
  let audioRequest = 0;
  let sound = 'space';
  let volume = 30;
  const audio = createCalmAudio({
    onUnavailable() {
      if (disposed) return;
      soundEnabled = false;
      soundPlaying = false;
      renderAudio();
      onAnnounce('此设备未能开启环境声，可以安静地继续。');
    },
  });

  function listen(target, type, listener) {
    target.addEventListener(type, listener);
    removers.push(() => target.removeEventListener(type, listener));
  }

  function renderAudio() {
    const available = audio.available;
    buttons.sound.disabled = !available;
    elements.sound.disabled = !available;
    elements.volume.disabled = !available;
    buttons.sound.setAttribute('aria-pressed', String(soundEnabled && available));
    setText(buttons.sound, soundEnabled ? '关闭环境声' : '开启环境声');
    setText(elements['volume-value'], `${volume}%`);
    elements.volume.setAttribute('aria-valuetext', `${volume}%`);
    let badge = '已关闭';
    let note = '声音会随呼吸开始和暂停。';
    if (!available) {
      badge = '不可用';
      note = '此设备不支持环境声，可以安静地继续。';
    } else if (soundEnabled) {
      if (state.status === 'paused') {
        badge = '已暂停';
        note = '环境声也歇一歇，继续呼吸时会轻轻响起。';
      } else if (state.status === 'finished') {
        badge = '已停下';
        note = '声音已停下。再静一会时，会沿用你的选择。';
      } else if (volume === 0) {
        badge = '静音';
        note = '音量为零。想听见时，可以调高一点。';
      } else if (state.status === 'running') {
        badge = soundPlaying ? '已开启' : '正在开启';
        note = soundPlaying ? '轻一点就好。随时可以关闭声音。' : '环境声正在轻轻响起。';
      } else {
        badge = '随呼吸开启';
        note = '开始呼吸时，环境声会轻轻响起。';
      }
    }
    setText(elements['audio-badge'], badge);
    setText(elements['audio-note'], note);
  }

  function pauseAudio() {
    audioRequest++;
    soundPlaying = false;
    audio.pause();
  }

  // This function is called only from start/resume and sound-control gestures.
  function playAudio() {
    if (!soundEnabled || !audio.available || state.status !== 'running') return;
    const request = ++audioRequest;
    void audio.play(sound, volume).then(playing => {
      if (disposed || request !== audioRequest) return;
      soundPlaying = playing;
      renderAudio();
    });
  }

  function render(next) {
    state = next;
    const { status } = state;
    const running = status === 'running';
    const paused = status === 'paused';
    const finished = status === 'finished';
    const locked = running || paused;
    if (previousStatus !== status) {
      const finishHadFocus = document.activeElement === buttons.finish;
      root.dataset.state = status;
      if (running) elements.preferences.open = false;
      elements.patterns.disabled = locked;
      elements.durations.disabled = locked;
      buttons.finish.hidden = !locked;
      buttons.exit.hidden = !finished;
      setText(buttons.primary, {
        ready: '开始呼吸', running: '暂停一下', paused: '继续呼吸', finished: '再静一会',
      }[status]);
      setText(elements['settings-note'], locked
        ? '正在使用这个节奏。结束后，可以重新选择。'
        : '吸气和呼气自然相接，不用屏息。');
      if (paused || finished) pauseAudio();
      if (finished) {
        onAnnounce(state.completedBy === 'duration'
          ? '这段静一会的时间结束了。可以再静一会，或回到星球。'
          : '已结束。可以再静一会，或回到星球。');
        // The early-finish control is now hidden; keep keyboard focus usable.
        if (finishHadFocus) buttons.primary.focus({ preventScroll: true });
      }
      previousStatus = status;
      renderAudio();
    }

    const phase = state.phase === 'inhale' ? '轻轻吸气' : '慢慢呼气';
    setText(elements.phase, running ? phase : paused ? '歇一歇' : finished ? '慢慢回到此刻' : '留一点空白');
    setText(elements['phase-time'], running
      ? `还有 ${Math.max(1, Math.ceil(state.phaseRemainingMs / 1_000))} 秒`
      : paused ? `${phase}的节奏，停在这里。`
        : finished ? '这一小段时间，属于你。' : '不用准备得很好，现在这样就可以。');
    setText(elements['session-note'], paused
      ? pauseReason === 'away' ? '已为你暂停。回来后，点「继续呼吸」。' : '想继续时，再跟上自己的节奏。'
      : finished ? '再待一会，或轻轻回去，都可以。'
        : running ? '不必追赶微光，舒服的呼吸最重要。' : '选个舒服的节奏，给自己一点时间。');

    elements.progress.hidden = state.durationMs === 0;
    const timer = state.durationMs === 0
      ? `${finished ? '这次停留' : '已停留'} ${timeLabel(state.elapsedMs)}`
      : finished ? `这次停留 ${timeLabel(state.elapsedMs)}`
        : `${paused ? '暂停中 · ' : ''}还剩 ${timeLabel(state.remainingMs, true)}`;
    setText(elements.timer, timer);
    if (state.progress !== null) {
      elements.progress.value = state.progress;
      if (elements.progress.getAttribute('aria-valuetext') !== timer) {
        elements.progress.setAttribute('aria-valuetext', timer);
      }
    }
    const expansion = status === 'ready' || finished ? .45 : state.expansion;
    const scale = motion.matches ? 1 : .84 + expansion * .34;
    root.style.setProperty('--calm-orb-scale', scale.toFixed(4));
  }

  function frame(now) {
    frameId = null;
    if (disposed) return;
    render(clock.read(now));
    if (state.status === 'running') frameId = view.requestAnimationFrame(frame);
  }

  function update(next) {
    if (frameId !== null) view.cancelAnimationFrame(frameId);
    frameId = null;
    render(next);
    if (state.status === 'running') frameId = view.requestAnimationFrame(frame);
  }

  function pauseForAbsence() {
    if (disposed || state.status !== 'running') return;
    pauseReason = 'away';
    update(clock.pause(view.performance.now()));
    if (state.status === 'paused') onAnnounce('已自动暂停。回来后，点继续呼吸。');
  }

  listen(root, 'click', event => {
    const button = event.target.closest('[data-calm-action]');
    if (!button || !root.contains(button) || button.disabled) return;
    const now = view.performance.now();
    switch (button.dataset.calmAction) {
      case 'primary': {
        // Settle a deadline before interpreting a click on an old frame.
        const current = clock.read(now);
        if (current.status === 'running') {
          pauseReason = 'manual';
          update(clock.pause(now));
          onAnnounce('已暂停。想继续时，点继续呼吸。');
        } else if (current.status === 'paused') {
          pauseReason = '';
          update(clock.resume(now));
          playAudio();
          onAnnounce('继续呼吸。');
        } else if (current.status === 'finished' && state.status !== 'finished') {
          update(current);
        } else {
          if (current.status === 'finished') clock.reset();
          pauseReason = '';
          update(clock.start(now));
          playAudio();
          onAnnounce('呼吸已开始。');
        }
        break;
      }
      case 'finish':
        update(clock.finish(now));
        break;
      case 'exit':
        pauseAudio();
        onExit();
        break;
      case 'sound':
        soundEnabled = !soundEnabled;
        soundPreference = soundEnabled;
        if (soundEnabled) playAudio();
        else pauseAudio();
        renderAudio();
        break;
    }
  });

  listen(root, 'change', event => {
    const input = event.target;
    if (input.name === `${id}-pattern` || input.name === `${id}-duration`) {
      if (state.status === 'running' || state.status === 'paused') return;
      const patternId = root.querySelector(`input[name="${id}-pattern"]:checked`).value;
      const durationMs = Number(root.querySelector(`input[name="${id}-duration"]:checked`).value);
      update(clock.reset({ patternId, durationMs }));
    } else if (input === elements.sound) {
      sound = input.value;
      playAudio();
      renderAudio();
    }
  });

  listen(elements.volume, 'input', () => {
    volume = Number(elements.volume.value);
    audio.setVolume(volume);
    renderAudio();
  });
  listen(view, 'blur', pauseForAbsence);
  listen(view, 'pagehide', pauseForAbsence);
  listen(document, 'visibilitychange', () => {
    if (document.hidden) pauseForAbsence();
  });

  function updateMotion() {
    root.dataset.reducedMotion = String(motion.matches);
    elements['motion-note'].hidden = !motion.matches;
    render(clock.read(view.performance.now()));
  }
  listen(motion, 'change', updateMotion);
  updateMotion();
  renderAudio();

  return function cleanup() {
    if (disposed) return;
    disposed = true;
    audioRequest++;
    if (frameId !== null) view.cancelAnimationFrame(frameId);
    frameId = null;
    for (const remove of removers) remove();
    audio.dispose();
    root.remove();
  };
}
