let nextNoteId = 0;

/**
 * Optional, private writing. The textarea is the only place that holds its text.
 * onOpen pauses the host; onClose must leave it paused for an explicit continue.
 * The host loads release.css and the shared experience-button styles.
 */
export function mountWorryNote(container, {onOpen = () => {}, onClose = () => {}, onAnnounce = () => {}} = {}) {
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const uid = `worry-note-${++nextNoteId}`;
  const root = doc.createElement('div');
  root.className = 'worry-note release-experience';
  root.innerHTML = `
    <footer class="release-footer">
      <span>可选 · 只在此刻，不会保存</span>
      <button type="button" class="release-exit" data-worry-action="open" aria-haspopup="dialog">有件事，想丢掉？ <span aria-hidden="true">↗</span></button>
    </footer>
    <dialog class="release-dialog" aria-labelledby="${uid}-title" aria-describedby="${uid}-privacy">
      <button type="button" class="release-dialog-close" data-worry-action="close" aria-label="关闭并清空这次输入">×</button>
      <p class="release-eyebrow">LEAVE A LITTLE HERE</p>
      <h2 id="${uid}-title">此刻，有什么想先放一边？</h2>
      <p class="release-privacy" id="${uid}-privacy">只在此刻，不会保存。揉成纸团、取消或离开，文字就会清空。</p>
      <div class="release-worry-paused" hidden>
        <p>刚才暂停了。准备好了，再继续。</p>
        <button type="button" class="experience-button is-primary" data-worry-action="continue">继续这一刻</button>
      </div>
      <div class="release-worry-writing">
        <label for="${uid}-text">写一句，或者什么也不写。</label>
        <textarea id="${uid}-text" maxlength="240" rows="4" autocomplete="off" spellcheck="false" placeholder="先放在这里……" aria-describedby="${uid}-privacy ${uid}-limit"></textarea>
        <p class="release-worry-limit" id="${uid}-limit"><span>最多 240 字</span><span class="release-worry-count">0 / 240</span></p>
        <div class="release-dialog-actions">
          <button type="button" class="experience-button" data-worry-action="close">先不丢了</button>
          <button type="button" class="experience-button is-primary" data-worry-action="crumple">揉成纸团 <span aria-hidden="true">↗</span></button>
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
          <button type="button" class="experience-button" data-worry-action="close">先返回</button>
          <button type="button" class="experience-button is-primary" data-worry-action="toss">丢进去 <span aria-hidden="true">↗</span></button>
          <button type="button" class="experience-button is-primary" data-worry-action="done" hidden>完成，返回</button>
        </div>
      </div>
    </dialog>`;
  container.append(root);

  const query = selector => root.querySelector(selector);
  const button = action => query(`[data-worry-action="${action}"]`);
  const dialog = query('dialog'), textarea = query('textarea'), trigger = button('open');
  const writing = query('.release-worry-writing'), ballStep = query('.release-worry-ball-step');
  const stage = query('.release-bin-stage'), message = query('.release-worry-message');
  const removers = [];
  let phase = 'closed', paused = false, disposed = false;
  let timer = null, remaining = 0, started = 0;
  function listen(target, type, handler) {
    target.addEventListener(type, handler);
    removers.push(() => target.removeEventListener(type, handler));
  }
  function clearText() {
    textarea.value = '';
    textarea.defaultValue = '';
    textarea.textContent = '';
    query('.release-worry-count').textContent = '0 / 240';
  }
  function stopClock() {
    if (timer === null) return;
    win.clearTimeout(timer);
    remaining = Math.max(0, remaining - (win.performance.now() - started));
    timer = null;
  }
  function updateControls() {
    dialog.classList.toggle('release-is-paused', paused);
    query('.release-worry-paused').hidden = !paused;
    textarea.disabled = paused || phase !== 'writing';
    button('crumple').disabled = paused || phase !== 'writing';
    button('toss').disabled = paused || phase !== 'ready';
    button('toss').hidden = phase === 'done';
    button('done').hidden = phase !== 'done';
  }
  function resetView() {
    clearText();
    writing.hidden = false; ballStep.hidden = true;
    stage.classList.remove('release-is-crumpled', 'release-is-tossing', 'release-is-done');
    stage.setAttribute('aria-label', '一个纸团和一只小纸篓');
    query('h2').textContent = '此刻，有什么想先放一边？';
    message.textContent = '已经揉好了。不用瞄准。';
    updateControls();
  }
  function closeNote(restoreFocus = true) {
    const wasOpen = phase !== 'closed';
    stopClock();
    phase = 'closed'; paused = false; remaining = 0;
    resetView();
    if (dialog.open) dialog.close();
    if (!wasOpen) return;
    if (restoreFocus && !disposed && trigger.isConnected) trigger.focus({preventScroll: true});
    onClose();
  }
  function openNote() {
    if (disposed || phase !== 'closed') return;
    phase = 'writing'; paused = false;
    resetView();
    onOpen();
    if (disposed || phase === 'closed') return;
    try {
      dialog.showModal();
    } catch {
      closeNote();
      onAnnounce('这个窗口暂时打不开。这次输入已清空，可以稍后再试。');
      return;
    }
    if (doc.hidden) pauseNote();
    else textarea.focus({preventScroll: true});
  }
  function completeToss() {
    if (disposed || paused || phase !== 'tossing') return;
    stopClock(); remaining = 0; phase = 'done';
    stage.classList.remove('release-is-tossing');
    stage.classList.add('release-is-done');
    stage.setAttribute('aria-label', '纸团已经落进小纸篓');
    message.textContent = '先把它放在这里。准备好后，再继续游戏。';
    updateControls();
    button('done').focus({preventScroll: true});
    onAnnounce('纸团已经放进纸篓。');
  }
  function runClock() {
    if (disposed || paused || doc.hidden || phase !== 'tossing' || timer !== null) return;
    if (remaining <= 0) {completeToss(); return;}
    started = win.performance.now();
    timer = win.setTimeout(() => {
      timer = null; remaining = 0;
      if (doc.hidden) pauseNote();
      else completeToss();
    }, remaining);
  }
  function pauseNote() {
    if (disposed || phase === 'closed' || paused) return;
    paused = true;
    stopClock();
    updateControls();
  }
  function continueNote() {
    if (disposed || doc.hidden || !paused || phase === 'closed') return;
    paused = false;
    updateControls();
    runClock();
    const focus = phase === 'writing' ? textarea : phase === 'ready' ? button('toss')
      : phase === 'done' ? button('done') : button('close');
    focus.focus({preventScroll: true});
  }
  function crumple() {
    if (disposed || paused || phase !== 'writing') return;
    clearText(); // Destroy the input before displaying any paper or notification.
    phase = 'ready';
    writing.hidden = true; ballStep.hidden = false;
    query('h2').textContent = '揉一揉，先放下。';
    stage.classList.add('release-is-crumpled');
    updateControls();
    button('toss').focus({preventScroll: true});
    onAnnounce('已揉成纸团，文字已清空。');
  }
  function toss() {
    if (disposed || paused || phase !== 'ready') return;
    phase = 'tossing';
    stage.classList.remove('release-is-crumpled');
    const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    remaining = reduced ? 0 : 900;
    stage.style.setProperty('--release-toss-duration', `${Math.max(1, remaining)}ms`);
    stage.setAttribute('aria-label', '纸团正沿着弧线落进小纸篓');
    message.textContent = '轻轻一丢……';
    updateControls();
    if (!reduced) stage.classList.add('release-is-tossing');
    runClock();
  }
  function readInput(event) {
    event.stopPropagation();
    if (disposed || phase !== 'writing') {clearText(); return;}
    if (event.isComposing) return;
    textarea.value = textarea.value.slice(0, 240);
    query('.release-worry-count').textContent = `${textarea.value.length} / 240`;
  }
  const actions = {open: openNote, close: () => closeNote(), done: () => closeNote(),
    crumple, toss, continue: continueNote};
  listen(root, 'click', event => {
    const target = event.target.closest('[data-worry-action]');
    if (!target) return;
    event.stopPropagation();
    if (!disposed && !target.disabled) actions[target.dataset.worryAction]?.();
  });
  listen(textarea, 'input', readInput);
  listen(textarea, 'compositionend', readInput);
  // Keep modal typing and Escape away from the host's game hotkeys. Do not
  // prevent the key's native default: Escape must still generate dialog.cancel.
  listen(dialog, 'keydown', event => event.stopPropagation());
  listen(dialog, 'keyup', event => event.stopPropagation());
  listen(trigger, 'keydown', event => {
    if (event.key === 'Enter' || event.code === 'Space') event.stopPropagation();
  });
  listen(dialog, 'cancel', event => {
    event.preventDefault(); event.stopPropagation(); closeNote();
  });
  listen(dialog, 'close', () => {
    // close() dispatches asynchronously; an old event must not close a reopening.
    if (!dialog.open) closeNote();
  });
  listen(win, 'blur', pauseNote);
  listen(doc, 'visibilitychange', () => {if (doc.hidden) pauseNote();});
  listen(win, 'pagehide', () => closeNote(false));
  resetView();

  return function cleanup() {
    if (disposed) return;
    disposed = true;
    removers.splice(0).forEach(remove => remove());
    try {closeNote(false);} finally {root.remove();}
  };
}
