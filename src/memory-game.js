import {createMemoryState, flipMemoryCard, settleMemoryTurn} from './memory-state.js';
import {loadMemoryTripoArt} from './memory-tripo-art.js';

// Original, quiet mallet-like notes. Allocate WebAudio only on a user gesture.
export function createMemoryAudio({view = globalThis} = {}) {
  let context = null, master = null, enabled = false, paused = false, disposed = false, epoch = 0;
  const voices = new Set();
  function stop() {
    for (const voice of voices) {
      voice.source.onended = null;
      try {voice.source.stop();} catch { /* Already finished. */ }
      voice.source.disconnect(); voice.gain.disconnect();
    }
    voices.clear();
  }
  function suspend() {
    if (context?.state === 'running') void context.suspend().catch(() => {});
  }
  async function activate(version) {
    if (disposed || !enabled || paused) return false;
    let active;
    try {
      if (!context) {
        const AudioContext = view.AudioContext || view.webkitAudioContext;
        if (!AudioContext) {enabled = false; return false;}
        context = new AudioContext();
        master = context.createGain(); master.gain.value = .3; master.connect(context.destination);
      }
      active = context;
      if (active.state !== 'running') await active.resume();
      if (disposed || !enabled || paused || version !== epoch) {
        if (disposed) {if (active.state !== 'closed') await active.close();}
        else if (!enabled || paused) await active.suspend();
        return false;
      }
      return true;
    } catch {
      if (version === epoch && !disposed) {enabled = false; stop(); suspend();}
      return false;
    }
  }
  return {
    get enabled() {return enabled && !disposed;},
    async setEnabled(value) {
      if (disposed) return false;
      enabled = value === true; const version = ++epoch;
      if (!enabled) {stop(); suspend(); return false;}
      return paused ? true : activate(version);
    },
    pause() {paused = true; epoch++; stop(); suspend();},
    resume() {paused = false; return enabled ? activate(++epoch) : Promise.resolve(false);},
    play(kind) {
      if (disposed || paused || !enabled || context?.state !== 'running') return false;
      const notes = {flip: [620], match: [523.25, 659.25], complete: [523.25, 659.25, 783.99, 1046.5]}[kind];
      if (!notes || voices.size + notes.length > 12) return false;
      const start = context.currentTime, duration = kind === 'flip' ? .095 : .3;
      notes.forEach((frequency, index) => {
        const source = context.createOscillator(), gain = context.createGain(), at = start + index * .11;
        source.type = kind === 'flip' ? 'triangle' : 'sine';
        source.frequency.setValueAtTime(frequency, at);
        if (kind === 'flip') source.frequency.exponentialRampToValueAtTime(430, at + duration);
        gain.gain.setValueAtTime(.0001, at);
        gain.gain.exponentialRampToValueAtTime(kind === 'flip' ? .08 : .16, at + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
        source.connect(gain); gain.connect(master);
        const voice = {source, gain}; voices.add(voice);
        source.onended = () => {source.disconnect(); gain.disconnect(); voices.delete(voice);};
        source.start(at); source.stop(at + duration + .02);
      });
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true; enabled = false; epoch++; stop(); master?.disconnect();
      if (context && context.state !== 'closed') void context.close().catch(() => {});
    },
  };
}

const names = ['银杏', '小花', '新芽', '月牙', '松果', '雨滴', '蘑菇', '蝴蝶', '小山', '贝壳', '樱桃', '雪花'];
const art = [
  '<path d="M32 49V30M32 34 18 21m14 13 14-13"/><path d="M32 34C9 35 4 22 16 12l16 5 16-5c12 10 7 23-16 22Z" fill="currentColor" opacity=".6"/>',
  '<circle cx="32" cy="22" r="10"/><circle cx="42" cy="32" r="10"/><circle cx="32" cy="42" r="10"/><circle cx="22" cy="32" r="10"/><circle cx="32" cy="32" r="5" fill="currentColor"/>',
  '<path d="M32 53V29M32 39C11 42 10 27 12 18c17 1 23 9 20 21ZM32 31C31 11 45 11 53 12c-1 17-9 22-21 19Z"/>',
  '<path d="M46 46A23 23 0 0 1 19 10a23 23 0 0 0 27 36Z" fill="currentColor" opacity=".7"/><path d="m45 12 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/>',
  '<path d="M32 10C13 20 12 43 32 54c20-11 19-34 0-44ZM18 27l14 8 14-8M20 39l12 7 12-7M25 19l7 5 7-5"/>',
  '<path d="M32 8C28 19 15 28 15 39a17 17 0 0 0 34 0C49 28 36 19 32 8Z"/><path d="M23 36c-2 6 1 9 5 11"/>',
  '<path d="M10 34a22 22 0 0 1 44 0ZM26 34v16q6 7 12 0V34"/><circle cx="24" cy="24" r="3"/><circle cx="39" cy="22" r="4"/>',
  '<path d="M32 25C12 1 1 31 26 34C0 38 23 64 32 39c9 25 32-1 6-5 25-3 14-33-6-9ZM32 23v22m0-22-5-8m5 8 5-8"/>',
  '<path d="m8 49 19-34 11 19 7-12 13 27ZM20 28l7 5 5-9m-3 18 8-8M6 53h52"/>',
  '<path d="M26 50C-7 33 8 8 22 13c6-10 14-10 20 0 14-5 29 20-4 37ZM32 48V12M27 48 16 18m21 30 11-30M23 44 10 31m31 13 13-13"/>',
  '<circle cx="20" cy="43" r="11"/><circle cx="45" cy="43" r="11"/><path d="M20 32 34 10q0 14 11 22M34 10c12-6 20-1 18 7-10 1-14-1-18-7Z"/>',
  '<path d="M32 8v48M11 20l42 24M11 44l42-24M25 12l7 7 7-7M25 52l7-7 7 7M12 28l10-2-2-10M44 48l-2-10 10-2M20 48l2-10-10-2M52 28l-10-2 2-10"/>',
];
export const botanicalArt = value => `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${art[value]}</svg>`;

export function mountMemory(container, {onExit = () => {}, onAnnounce = () => {}, difficulty = 'easy', muted = false} = {}) {
  const doc = container.ownerDocument || document, view = doc.defaultView || window;
  const root = doc.createElement('section');
  root.className = 'experience-shell memory-experience';
  root.dataset.difficulty = difficulty;
  root.innerHTML = `<style>
    .memory-experience .memory-top{flex-wrap:wrap;gap:10px}
    .memory-experience .memory-top-controls{display:flex;gap:8px;align-items:center}
    .memory-experience [data-memory-art-status]{font-size:12px;opacity:.72;margin:8px 0 0;min-height:1.5em}
    .memory-experience [data-memory-tripo]{font-size:10px;letter-spacing:.04em;margin-left:8px}
    .memory-experience .memory-card{min-width:0}
    .memory-experience .memory-face{position:absolute;inset:7px;gap:4px}
    .memory-experience .memory-face img{display:block;width:100%;height:calc(100% - 20px);min-height:0;object-fit:contain;pointer-events:none}
    .memory-experience .memory-face small{font-size:10px;letter-spacing:0;line-height:1.3;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .memory-experience .memory-card.is-matched{opacity:.68}
    .memory-experience .is-open .memory-face{animation:memory-card-reveal .18s ease-out}
    @keyframes memory-card-reveal{from{opacity:.35;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
    @media(prefers-reduced-motion:reduce){.memory-experience .is-open .memory-face{animation:none}}
    </style>
    <header class="experience-heading"><p class="eyebrow">PLAY / 03 · 叶间寻踪</p><h1 tabindex="-1">记住线索，再翻下一张。</h1><p data-memory-rules></p><p data-memory-art-status>卡面准备中，可以先翻牌。</p></header>
    <div class="memory-top"><span><span data-memory-count>0 / 6 组相遇</span><small data-memory-tripo hidden></small></span><div class="memory-top-controls"><button class="experience-button" data-memory-action="sound" aria-pressed="false">音效：关</button><button class="experience-button" data-memory-action="pause">暂停一下</button></div></div>
    <div class="memory-table experience-panel"><div class="memory-grid" role="group" aria-label="十二张配对卡片"></div>
      <div class="memory-curtain" hidden><p data-memory-result>把这一刻，留在这里。</p><button class="experience-button is-primary" data-memory-action="resume">继续翻牌</button><button class="experience-button is-primary" data-memory-action="retry" hidden>重新挑战</button></div></div>
    <p class="experience-status memory-message" role="status">挑一张喜欢的位置，翻开看看。</p>
    <div class="experience-toolbar memory-actions"><button class="experience-button" data-memory-action="reset">重新洗牌</button><button class="experience-button" data-memory-action="exit">换个游戏 ↗</button></div>`;
  container.append(root);
  const $ = selector => root.querySelector(selector);
  let state, timer = null, disposed = false, started = false, gallery = null, faces = [], artSettled = false;
  let soundWanted = !muted, soundStarted = false, soundEpoch = 0;
  const events = new (view.AbortController || AbortController)();
  const audio = createMemoryAudio({view});
  const on = (target, type, handler) => target.addEventListener(type, handler, {signal: events.signal});
  const say = text => { $('.memory-message').textContent = text; };
  const escape = value => String(value).replace(/[&<>"']/g, character =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
  const cardName = value => faces[value]?.name || names[value];
  const faceHTML = value => `${faces[value]
    ? `<img src="${escape(faces[value].src)}" alt="" draggable="false" width="256" height="256">`
    : botanicalArt(value)}<small>${escape(cardName(value))}</small>`;
  function syncArt() {
    const count = faces.filter(Boolean).length, prepared = gallery?.faces.some(Boolean);
    $('[data-memory-tripo]').hidden = count === 0;
    $('[data-memory-tripo]').textContent = count ? `Tripo · ${count} / ${state.totalPairs} 组卡面` : '';
    $('[data-memory-art-status]').textContent = count ? '立体小物，记住它们的形状与位置。'
      : prepared ? '立体卡面已备好，下次重新洗牌时使用。'
      : artSettled ? '当前使用插画卡面，照常翻牌配对。' : '卡面准备中，可以先翻牌。';
  }
  function syncSound() {
    const button = $('[data-memory-action="sound"]');
    button.textContent = `音效：${soundWanted ? '开' : '关'}`;
    button.setAttribute('aria-pressed', String(soundWanted));
    button.setAttribute('aria-label', soundWanted
      ? soundStarted ? '关闭翻牌音效' : '音效将在首次翻牌时开启，点击静音' : '开启翻牌音效');
  }
  async function gestureSound(note) {
    if (disposed || !soundWanted || state.paused || doc.hidden) return;
    const round = state, version = soundEpoch;
    soundStarted = true;
    if (audio.play(note)) {syncSound(); return;}
    let active;
    if (audio.enabled) active = await audio.resume();
    else {void audio.resume(); active = await audio.setEnabled(true);}
    // Audio permission can complete after a pause, mute or a different deck.
    if (disposed || round !== state || version !== soundEpoch || !soundWanted || state.paused || doc.hidden) return;
    if (active) audio.play(note);
    else if (!audio.enabled) {
      soundWanted = false;
      say('当前设备暂不支持音效，可以继续安静地翻牌。');
    }
    syncSound();
  }
  function sync() {
    root.querySelectorAll('[data-card]').forEach((button, index) => {
      const card = state.cards[index], visible = card.matched || state.open.includes(index);
      button.classList.toggle('is-open', visible);
      button.classList.toggle('is-matched', card.matched);
      button.setAttribute('aria-label', `第 ${index + 1} 张：${visible ? cardName(card.value) + (card.matched ? '，已配对' : '') : '未翻开'}`);
      button.setAttribute('aria-pressed', String(visible));
      button.disabled = state.paused || state.complete || state.failed || card.matched || state.open.includes(index) || state.open.length === 2;
    });
    $('[data-memory-count]').textContent = `${state.pairs} / ${state.totalPairs} 组 · ${Number.isFinite(state.maxTurns) ? `剩余 ${Math.max(0, state.maxTurns - state.turns)} 回合` : `已翻 ${state.turns} 回合`}`;
    $('.memory-curtain').hidden = !state.paused && !state.failed;
    $('[data-memory-result]').textContent = state.failed ? `回合用完了，找到了 ${state.pairs} / ${state.totalPairs} 组。下次试着先记住每张的位置。` : '把这一刻，留在这里。';
    $('[data-memory-action="resume"]').hidden = state.failed;
    $('[data-memory-action="retry"]').hidden = !state.failed;
    $('[data-memory-action="pause"]').textContent = state.paused ? '继续翻牌' : '暂停一下';
    $('[data-memory-action="pause"]').disabled = state.complete || state.failed;
    $('[data-memory-action="reset"]').textContent = state.complete ? '再来一组小物' : '重新洗牌';
  }
  function settle() {
    timer = null;
    if (disposed || state.paused || state.open.length !== 2) return;
    const returnIndex = state.open[1];
    const restoreFocus = doc.activeElement === doc.body || $('.memory-grid').contains(doc.activeElement);
    const matched = settleMemoryTurn(state);
    if (matched) audio.play(state.complete ? 'complete' : 'match');
    say(state.complete ? `${state.totalPairs} 组全找到了，用了 ${state.turns} 回合。` : state.failed ? '这一轮结束了，可以重新挑战，或切换到轻松模式。' : matched ? '它们相遇了。再找找下一组。' : '先记住这两个位置，下次就多了两条线索。');
    if (state.complete) onAnnounce('图案全部配对，可以重新洗牌或换个游戏。');
    sync();
    if (restoreFocus && doc.hasFocus()) {
      const next = state.failed ? $('[data-memory-action="retry"]') : state.complete ? $('[data-memory-action="reset"]')
        : matched ? root.querySelector('.memory-card:not(:disabled)') : $(`[data-card="${returnIndex}"]`);
      next?.focus({preventScroll: true});
    }
  }
  function schedule() {
    view.clearTimeout(timer);
    if (state.open.length === 2 && !state.paused) timer = view.setTimeout(settle, 850);
  }
  function reset() {
    soundEpoch++;
    view.clearTimeout(timer); timer = null; audio.pause();
    state = createMemoryState(Math.random, difficulty); state.paused = doc.hidden;
    started = false; faces = gallery?.faces || [];
    if (!state.paused) void audio.resume().then(() => {if (!disposed) syncSound();});
    $('[data-memory-rules]').textContent = Number.isFinite(state.maxTurns)
      ? `${state.totalPairs} 组图案，${state.maxTurns} 回合。每翻两张算一回合，配对成功也计入；记住错配的位置，不限时。`
      : '六组图案，翻开两张找到相同的一对。不限时，也不限回合。';
    $('.memory-grid').setAttribute('aria-label', `${state.cards.length} 张配对卡片`);
    $('.memory-grid').innerHTML = state.cards.map((card, index) => `<button class="memory-card" data-card="${index}"><span class="memory-back" aria-hidden="true">✧</span><span class="memory-face" aria-hidden="true">${faceHTML(card.value)}</span></button>`).join('');
    say('挑一张喜欢的位置，翻开看看。'); sync(); syncArt(); syncSound();
  }
  function pause() {
    soundEpoch++;
    audio.pause();
    view.clearTimeout(timer); timer = null;
    if (state.complete || state.failed || state.paused) return;
    state.paused = true; sync();
  }
  function resume() {
    if (doc.hidden || state.failed || state.complete) return;
    state.paused = false; sync(); schedule();
    void audio.resume().then(() => {if (!disposed) syncSound();});
    root.querySelector('.memory-card:not(:disabled)')?.focus({preventScroll: true});
  }
  on(root, 'click', async event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-card')) {
      if (flipMemoryCard(state, Number(button.dataset.card))) {
        started = true; sync(); schedule();
        await gestureSound('flip');
      }
      return;
    }
    switch (button.dataset.memoryAction) {
      case 'reset': case 'retry': reset(); root.querySelector('.memory-card')?.focus({preventScroll: true}); break;
      case 'pause': state.paused ? resume() : pause(); break;
      case 'resume': resume(); break;
      case 'sound': {
        const enabling = !soundWanted, version = ++soundEpoch;
        soundWanted = enabling; soundStarted = true; syncSound();
        const active = await audio.setEnabled(enabling);
        if (disposed || version !== soundEpoch) return;
        if (enabling && !active && !state.paused && !audio.enabled) {
          soundWanted = false;
          say('当前设备暂不支持音效，可以继续安静地翻牌。');
        }
        syncSound();
        break;
      }
      case 'exit': pause(); onExit(); break;
    }
  });
  on(view, 'blur', pause);
  on(doc, 'visibilitychange', () => { if (doc.hidden) pause(); });
  reset();
  void loadMemoryTripoArt({count: state.totalPairs, signal: events.signal}).then(async result => {
    if (disposed) {result.dispose(); return;}
    // Decoding succeeds before a Tripo label or card image can appear. A failed
    // PNG retains that value's illustrated fallback, including its pair.
    await Promise.all(result.faces.map(async (face, index) => {
      if (!face) return;
      const image = doc.createElement('img');
      try {
        if (face.source !== 'Tripo' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(face.src)) throw Error('Invalid thumbnail');
        image.src = face.src;
        await image.decode();
      } catch {result.faces[index] = null;}
      finally {image.removeAttribute('src');}
    }));
    if (disposed) {result.dispose(); return;}
    gallery = result; artSettled = true;
    if (!started && !state.paused) {
      faces = gallery.faces;
      root.querySelectorAll('[data-card]').forEach((button, index) => {
        button.querySelector('.memory-face').innerHTML = faceHTML(state.cards[index].value);
      });
      sync();
    }
    syncArt();
  }).catch(() => {
    if (disposed) return;
    artSettled = true; syncArt();
  });
  return () => {
    if (disposed) return;
    disposed = true; view.clearTimeout(timer); events.abort(); audio.dispose();
    gallery?.dispose(); gallery = null; faces = []; root.remove();
  };
}
