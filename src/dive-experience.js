import {
  DIVE_TARGETS, DIVE_ASSET_NAMES, createDiveState, startDive, setDivePaused, stepDive, lookDive,
  surfaceDive, restartDive, diveDepthZone, diveTargetAt, divePhotoCandidate, takeDivePhoto,
} from './dive-state.js';
import {createDiveScene} from './dive-scene.js';
import {createDiveAudio} from './dive-audio.js';
import {loadMolesCharacter} from './moles-character.js';

let sequence = 0;
const controls = {
  forward:['w',1,0,0], back:['s',-1,0,0], left:['a',0,-1,0], right:['d',0,1,0],
  up:['e',0,0,1], down:['q',0,0,-1],
};
const mappedKeys = new Set(['w','a','s','d','q','e','arrowleft','arrowright','arrowup','arrowdown']);

export function mountDive(container, {onExit = () => {}, onAnnounce = () => {}, tripoAssets = {}} = {}) {
  const doc = container.ownerDocument, win = doc.defaultView, id = `dive-${++sequence}`;
  const abort = new (win.AbortController || AbortController)();
  const state = createDiveState(), keys = new Set(), holds = new Map(), pulses = new Map(), photos = new Map();
  const assetRequests = new Set(), loaded = new Set();
  let scene = null, disposed = false, frame = 0, lastTime = null, lookPointer = null;
  let assetVersion = 0, sound = true, audioVersion = 0, lastPhotoAt = -Infinity, flashUntil = -Infinity;
  let guideId = null, lastHUD = '', previewName = '蓝海下潜', modelError = '', aspect = 1;
  const root = doc.createElement('section');
  root.className = 'experience-shell dive-experience'; root.setAttribute('aria-labelledby', `${id}-title`);
  root.innerHTML = `
    <header class="dive-heading"><h1 id="${id}-title">蓝海下潜<span>。</span></h1><p>马尔代夫灵感 · 虚构礁域</p></header>
    <div class="dive-viewport" tabindex="0" role="group" aria-label="第一人称海底探索" aria-describedby="${id}-help">
      <canvas class="dive-canvas" aria-hidden="true"></canvas>
      <div class="dive-vignette" aria-hidden="true"></div>
      <div class="dive-hud">
        <div class="dive-depth"><strong data-dive-depth>4.0</strong><span>m</span><small data-dive-zone>透光浅水</small></div>
        <div class="dive-heading-hud"><span data-dive-heading>N · 000°</span><small data-dive-bearing>向礁缘慢慢下潜</small></div>
        <div class="dive-hud-actions"><button type="button" data-dive-action="gallery" aria-label="打开摄影图鉴"><span data-dive-count>0 / 4</span> <small>图鉴</small></button>
          <button type="button" data-dive-action="pause" aria-label="暂停下潜" disabled>Ⅱ</button></div>
      </div>
      <div class="dive-intro"><p class="dive-overline">BENEATH THE BLUE</p><h2>往下，是另一种安静。</h2><p>把相遇收进镜头，不必赶路。</p></div>
      <div class="dive-pause-copy" hidden><span>慢慢来</span><h2>海洋，等你回来。</h2></div>
      <div class="dive-unavailable" hidden><h2>海底画面暂时没有打开</h2><p>请重试，或换用支持 WebGL 的浏览器。你的图鉴仍在这一页。</p></div>
      <div class="dive-reticle" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <p class="dive-framing" data-dive-framing>拖动画面环顾四周</p>
      <div class="dive-swim-controls" role="group" aria-label="按住按钮游动">
        <button type="button" data-dive-control="forward" aria-label="向前游">↑</button>
        <button type="button" data-dive-control="left" aria-label="向左游">←</button>
        <button type="button" data-dive-control="back" aria-label="向后游">↓</button>
        <button type="button" data-dive-control="right" aria-label="向右游">→</button>
      </div>
      <div class="dive-depth-controls" role="group" aria-label="按住改变深度">
        <button type="button" data-dive-control="up" aria-label="上浮">↑<small>上浮</small></button>
        <button type="button" data-dive-control="down" aria-label="下潜">↓<small>下潜</small></button>
      </div>
      <div class="dive-shutter"><button type="button" data-dive-action="primary">开始下潜 <span>↘</span></button><small data-dive-shortcut>WASD 游动 · 拖动环顾 · Q / E 升降</small></div>
      <aside class="dive-preview" hidden><button type="button" data-dive-action="preview" aria-label="查看刚拍的照片"><img data-dive-preview alt="刚刚拍摄的海底照片"><span data-dive-preview-name></span></button></aside>
      <div class="dive-flash" aria-hidden="true"></div>
    </div>
    <div class="dive-bottom-bar"><p class="dive-status" role="status" aria-live="polite">向着光，慢慢游。</p>
      <button type="button" data-dive-action="exit">返回星球 ↗</button></div>
    <details class="dive-settings"><summary>操作与设置 <span>＋</span></summary>
      <div class="dive-settings-content" id="${id}-help">
        <p><b>游动</b> WASD；<b>看四周</b> 拖动画面或方向键；<b>下潜 / 上浮</b> Q / E。F 或空格拍照，P 暂停。触屏按住方向按钮，同时拖动画面转头。</p>
        <p>跟随上方的方向和深度提示，调整距离，让目标完整入镜并位于中央。取景框亮起后拍摄，即可收集发现；太近时请往后游。四项集齐后仍能自由探索。</p>
        <div class="dive-settings-actions"><button type="button" data-dive-action="surface">回到水面</button>
          <button type="button" data-dive-action="restart" aria-label="重新探索并清空本页图鉴">重新探索</button>
          <button type="button" data-dive-action="sound" aria-pressed="true">声音：开</button></div>
        <p class="dive-local-note" data-dive-models>程序生成示例</p>
        <p class="dive-local-note" data-dive-model-note>海龟与珊瑚当前为程序生成示例。照片仅保存在当前页面，可下载到本机；离开或重新探索会清空图鉴。这里是虚构海域，不是潜水导航或训练。</p>
      </div>
    </details>
    <dialog class="dive-gallery" aria-labelledby="${id}-gallery-title">
      <div class="dive-gallery-heading"><div><p>YOUR REEF JOURNAL</p><h2 id="${id}-gallery-title">海里的四次相遇</h2></div><button type="button" data-dive-action="close-gallery" aria-label="关闭图鉴">×</button></div>
      <figure class="dive-photo-view" hidden><img data-dive-full-photo alt="海底照片预览"><figcaption><span data-dive-photo-caption></span><a data-dive-download download="蓝海下潜.jpg">下载照片 ↗</a></figcaption></figure>
      <div class="dive-gallery-grid">${DIVE_TARGETS.map((target, i) => `
        <button type="button" data-dive-target="${target.id}"><span class="dive-discovery-image"><img data-dive-image="${target.id}" alt="${target.name}的发现照片" hidden><i>${String(i + 1).padStart(2,'0')}</i></span>
          <strong>${target.name}</strong><small data-dive-found="${target.id}">${target.hint}</small></button>`).join('')}
      </div><p class="dive-gallery-note">点选尚未发现的目标可设置方向提示。关闭图鉴后，点击「继续下潜」。</p>
    </dialog>`;
  container.append(root);
  const $ = selector => root.querySelector(selector), action = name => $(`[data-dive-action="${name}"]`);
  const viewport = $('.dive-viewport'), canvas = $('.dive-canvas'), settings = $('.dive-settings'), gallery = $('.dive-gallery');
  const status = $('.dive-status'), controlButtons = [...root.querySelectorAll('[data-dive-control]')];
  const listen = (target, name, fn) => target.addEventListener(name, fn, {signal:abort.signal});
  const now = () => win.performance.now();
  const running = () => !disposed && Boolean(scene) && state.phase === 'running' && !doc.hidden && !settings.open && !gallery.open;
  const audio = createDiveAudio({view:win, onUnavailable() {
    if (disposed) return;
    sound = false; updateSound(); announce('当前设备未能开启海声，可以安静地继续探索。');
  }});

  function announce(message) {status.textContent = message; onAnnounce(message);}
  function release(element, pointerId) {
    try {if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId);} catch { /* The browser may have cancelled it already. */ }
  }
  function clearInput() {
    keys.clear(); pulses.clear();
    const pointer = lookPointer; lookPointer = null;
    if (pointer) release(viewport, pointer.id);
    const previous = [...holds]; holds.clear();
    previous.forEach(([pointerId, item]) => release(item.element, pointerId));
    state.velocity = {x:0,y:0,z:0};
  }
  function stopLoop() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0; lastTime = null;
  }
  function startLoop() {
    if (!running() || frame) return;
    lastTime = now(); frame = win.requestAnimationFrame(tick);
  }
  function pauseAudio() {audioVersion++; audio.pause();}
  function updateSound() {
    action('sound').setAttribute('aria-pressed', String(sound));
    action('sound').textContent = sound ? '声音：开' : '声音：关';
  }
  function syncAudio() {
    if (!sound || !running()) {pauseAudio(); return;}
    const version = ++audioVersion;
    void audio.play().then(ok => {
      if (disposed || version !== audioVersion) return;
      if (!ok) {sound = false; updateSound();}
    });
  }
  function input() {
    const active = new Set(keys);
    for (const value of holds.values()) active.add(controls[value.control][0]);
    for (const [control, until] of pulses) {
      if (until <= state.elapsed) pulses.delete(control);
      else active.add(controls[control][0]);
    }
    return {
      forward:Number(active.has('w')) - Number(active.has('s')),
      strafe:Number(active.has('d')) - Number(active.has('a')),
      rise:Number(active.has('e')) - Number(active.has('q')),
      lookX:Number(active.has('arrowleft')) - Number(active.has('arrowright')),
      lookY:Number(active.has('arrowup')) - Number(active.has('arrowdown')),
    };
  }
  function advance(time) {
    if (!running()) return;
    if (lastTime !== null) stepDive(state, input(), Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
  }
  function tick(time) {
    frame = 0;
    if (disposed) return;
    if (doc.hidden) {pause(false); return;}
    advance(time); render();
    if (running()) frame = win.requestAnimationFrame(tick);
  }
  function pause(focus = true) {
    if (running()) advance(now());
    setDivePaused(state, true); clearInput(); stopLoop(); pauseAudio(); render();
    if (focus && !gallery.open && !settings.open) action('primary').focus({preventScroll:true});
  }
  function resume() {
    if (disposed || !scene || doc.hidden || gallery.open) return;
    settings.open = false;
    if (!startDive(state) && !setDivePaused(state, false)) return;
    clearInput(); render(); syncAudio(); startLoop(); viewport.focus({preventScroll:true});
    announce('慢慢游。调整距离，让目标完整入镜，拍下这次相遇。');
  }
  function render() {
    if (disposed) return;
    root.dataset.phase = state.phase; root.dataset.unavailable = String(!scene);
    root.dataset.flash = String(state.elapsed < flashUntil);
    $('.dive-intro').hidden = state.phase !== 'ready' || !scene;
    $('.dive-pause-copy').hidden = state.phase !== 'paused' || !scene;
    $('.dive-unavailable').hidden = Boolean(scene);
    action('pause').disabled = state.phase !== 'running';
    action('primary').textContent = !scene ? '重试画面 ↻' : state.phase === 'ready' ? '开始下潜 ↘' : state.phase === 'paused' ? '继续下潜 ↘' : '拍摄 ◉';
    controlButtons.forEach(button => {button.disabled = !running();});
    const candidate = divePhotoCandidate(state, {aspect}), collected = candidate && photos.has(candidate.id);
    root.dataset.framed = String(Boolean(candidate) && !collected);
    const zone = diveDepthZone(state);
    const heading = ((-state.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const target = DIVE_TARGETS.find(item => item.id === guideId) ||
      DIVE_TARGETS.find(item => !state.discoveries.some(photo => photo.id === item.id));
    let bearing = state.complete ? '四次相遇，已收入图鉴。继续自在游。' : '向礁缘慢慢下潜';
    if (target) {
      const point = diveTargetAt(target.id, state.elapsed);
      const dx = point.x - state.position.x, dz = point.z - state.position.z;
      const angle = Math.atan2(Math.sin(Math.atan2(-dx,-dz) - state.yaw), Math.cos(Math.atan2(-dx,-dz) - state.yaw));
      const direction = Math.abs(angle) < .2 ? '前方' : Math.abs(angle) > 2.5 ? '身后' : angle > 0 ? '左转' : '右转';
      const difference = point.y - state.position.y;
      bearing = `${target.name} · ${direction} ${Math.round(Math.hypot(dx,difference,dz))}m${Math.abs(difference) > 1.5 ? ` · ${difference > 0 ? '上浮' : '下潜'}${Math.round(Math.abs(difference))}m` : ''}`;
    }
    const framing = !running() ? '' : candidate
      ? `${candidate.name} · ${collected ? '已收进图鉴' : '可以拍摄'}`
      : '调整距离，让目标完整入镜';
    const signature = `${(-state.position.y).toFixed(1)}/${Math.round(heading)}/${state.discoveries.length}/${zone.id}/${bearing}/${framing}`;
    if (lastHUD !== signature) {
      lastHUD = signature;
      $('[data-dive-depth]').textContent = (-state.position.y).toFixed(1);
      $('[data-dive-zone]').textContent = zone.name;
      $('[data-dive-heading]').textContent = `${['N','NE','E','SE','S','SW','W','NW'][Math.round(heading / 45) % 8]} · ${String(Math.round(heading) % 360).padStart(3,'0')}°`;
      $('[data-dive-count]').textContent = `${state.discoveries.length} / 4`;
      $('[data-dive-bearing]').textContent = bearing; $('[data-dive-framing]').textContent = framing;
    }
    scene?.render(state);
  }
  function photo() {
    if (!running()) return;
    advance(now());
    if (state.elapsed - lastPhotoAt < 1.1) return;
    lastPhotoAt = state.elapsed;
    if (sound) audio.capture();
    let image = null;
    try {image = scene.capture(state);} catch { /* Discovery still works when a browser blocks canvas export. */ }
    const result = takeDivePhoto(state, {aspect});
    const subject = DIVE_TARGETS.find(item => item.id === result.id);
    previewName = subject?.name || '蓝海漫游';
    if (image) {
      $('[data-dive-preview]').src = image;
      $('[data-dive-preview-name]').textContent = result.ok ? `发现 · ${previewName}` : previewName;
      $('.dive-preview').hidden = false;
      showPhoto(image, previewName);
    }
    if (result.ok) {
      photos.set(result.id, {image, name:previewName, depth:result.depth});
      const thumb = $(`[data-dive-image="${result.id}"]`);
      if (image) {thumb.src = image; thumb.hidden = false;}
      $(`[data-dive-found="${result.id}"]`).textContent = `已发现 · ${result.depth.toFixed(1)}m`;
      $(`[data-dive-target="${result.id}"]`).dataset.found = 'true';
      if (guideId === result.id) guideId = null;
      announce(result.complete ? '四次相遇都收进图鉴了。这里没有终点，继续慢慢游。'
        : `发现${previewName}。${state.discoveries.length} / 4${image ? '，照片已保存在本页。' : '；此设备未能保存图片，发现记录已保留。'}`);
    } else announce(result.reason === 'collected' ? '这位朋友已在图鉴里。可以看看其他相遇。'
      : image ? '留下一张海景。调整距离，让提示中的目标完整入镜，即可记录发现。' : '此设备未能保存图片。让目标完整入镜并对准中央，仍可记录发现。');
    flashUntil = state.elapsed + .18; render();
  }
  function showPhoto(image, name) {
    $('.dive-photo-view').hidden = !image;
    if (!image) return;
    $('[data-dive-full-photo]').src = image; $('[data-dive-photo-caption]').textContent = name;
    const download = $('[data-dive-download]');
    download.href = image; download.download = `蓝海下潜-${name}.jpg`;
  }
  function openGallery() {
    pause(false);
    if (!gallery.open) gallery.showModal();
    action('close-gallery').focus({preventScroll:true});
  }
  function clearPhotos() {
    photos.clear(); guideId = null;
    for (const image of root.querySelectorAll('img')) {image.removeAttribute('src'); image.hidden = image.dataset.diveImage !== undefined;}
    $('.dive-preview').hidden = true; $('.dive-photo-view').hidden = true;
    $('[data-dive-download]').removeAttribute('href');
    for (const target of DIVE_TARGETS) {
      $(`[data-dive-found="${target.id}"]`).textContent = target.hint;
      $(`[data-dive-target="${target.id}"]`).dataset.found = 'false';
    }
  }
  function resize() {
    if (disposed) return;
    const rect = viewport.getBoundingClientRect();
    aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
    scene?.resize(rect.width, rect.height); render();
  }
  function updateModels() {
    $('[data-dive-models]').textContent = loaded.size
      ? Object.keys(DIVE_ASSET_NAMES).filter(kind => loaded.has(kind)).map(kind => `Tripo ${DIVE_ASSET_NAMES[kind]}`).join(' · ')
      : '程序生成示例';
    const provenance = loaded.size ? '以上 Tripo 模型已实际载入礁域，可游近观察和拍摄。' : '基础礁域使用程序生成示例。';
    $('[data-dive-model-note]').textContent = `${provenance}${modelError ? `${modelError}，仍可探索其余礁域。` : ''}照片仅保存在本页，离开或重新探索会清空。这里是虚构海域，不用于潜水导航。`;
  }
  async function loadAsset(kind, descriptor, version) {
    const request = new (win.AbortController || AbortController)(); assetRequests.add(request);
    try {
      const name = String(descriptor.name || `${kind}.glb`);
      const asset = await loadMolesCharacter({
        name:/\.glb$/i.test(name) ? name : `${name}.glb`, size:descriptor.buffer?.byteLength ?? 0,
        arrayBuffer:async () => descriptor.buffer,
      }, {signal:request.signal});
      if (disposed || version !== assetVersion || !scene) {asset.dispose(); return;}
      if (scene.setTripoAsset(kind, asset)) {loaded.add(kind); updateModels(); render();}
    } catch (error) {
      if (disposed || version !== assetVersion || error.name === 'AbortError') return;
      modelError = `${DIVE_ASSET_NAMES[kind]}模型未能载入`; updateModels();
    } finally {assetRequests.delete(request);}
  }
  function cancelAssets() {
    assetVersion++; assetRequests.forEach(request => request.abort()); assetRequests.clear(); loaded.clear();
  }
  function initializeScene() {
    cancelAssets(); scene?.dispose(); scene = null; modelError = '';
    try {scene = createDiveScene(canvas, {reducedMotion:win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false});}
    catch {announce('3D 画面未能打开。可重试画面或返回星球。');}
    updateModels(); resize();
    if (scene) for (const kind of Object.keys(DIVE_ASSET_NAMES)) {
      if (tripoAssets?.[kind]) void loadAsset(kind, tripoAssets[kind], assetVersion);
    }
  }

  listen(root, 'click', event => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button) || disposed || button.disabled) return;
    const control = button.dataset.diveControl;
    if (control) {if (event.detail === 0 && running()) pulses.set(control, state.elapsed + .24); return;}
    if (button.dataset.diveTarget) {
      const target = button.dataset.diveTarget, saved = photos.get(target);
      if (saved) showPhoto(saved.image, saved.name);
      else {guideId = target; announce(`方向提示已设为${DIVE_TARGETS.find(item => item.id === target).name}。关闭图鉴后继续下潜。`);}
      render(); return;
    }
    switch (button.dataset.diveAction) {
      case 'primary': if (!scene) initializeScene(); else if (state.phase === 'running') photo(); else resume(); break;
      case 'pause': pause(); announce('已暂停。回来后点击继续下潜。'); break;
      case 'gallery': case 'preview': openGallery(); break;
      case 'close-gallery': gallery.close(); break;
      case 'surface':
        clearInput(); surfaceDive(state); lastTime = running() ? now() : null; render();
        announce('已回到浅水起点，图鉴保留。'); break;
      case 'restart':
        clearInput(); stopLoop(); pauseAudio(); restartDive(state); clearPhotos();
        lastPhotoAt = flashUntil = -Infinity; lastHUD = '';
        settings.open = false; render(); action('primary').focus({preventScroll:true});
        announce('新一次探索。从浅水开始，图鉴已清空。'); break;
      case 'sound': sound = !sound; updateSound(); syncAudio(); break;
      case 'exit': pause(false); onExit(); break;
    }
  });
  listen(root, 'keydown', event => {
    const key = event.key.toLowerCase(), target = event.target;
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey ||
      target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || gallery.open) return;
    if (key === 'p' || key === 'escape') {
      if (settings.open) return;
      event.preventDefault();
      if (!event.repeat) {if (state.phase === 'running') pause(); else if (state.phase === 'paused') resume();}
      return;
    }
    if (!running()) return;
    if (key === 'f' || (key === ' ' && (target === viewport || target === root))) {
      event.preventDefault(); if (!event.repeat) photo(); return;
    }
    if (mappedKeys.has(key)) {event.preventDefault(); keys.add(key);}
  });
  listen(root, 'keyup', event => {keys.delete(event.key.toLowerCase());});
  listen(viewport, 'pointerdown', event => {
    if (!running() || lookPointer || event.button > 0 || event.target.closest('button, a')) return;
    event.preventDefault(); viewport.focus({preventScroll:true});
    lookPointer = {id:event.pointerId,x:event.clientX,y:event.clientY};
    try {viewport.setPointerCapture(event.pointerId);} catch {lookPointer = null;}
  });
  listen(viewport, 'pointermove', event => {
    if (!running() || lookPointer?.id !== event.pointerId) return;
    const rect = viewport.getBoundingClientRect();
    lookDive(state, -(event.clientX - lookPointer.x) / Math.max(240,rect.width) * 2.1,
      -(event.clientY - lookPointer.y) / Math.max(240,rect.height) * 1.65);
    lookPointer.x = event.clientX; lookPointer.y = event.clientY; render();
  });
  function endLook(event) {
    if (lookPointer?.id !== event.pointerId) return;
    const pointer = lookPointer; lookPointer = null; release(viewport, pointer.id);
  }
  for (const name of ['pointerup','pointercancel','lostpointercapture']) listen(viewport, name, endLook);
  for (const button of controlButtons) {
    listen(button, 'pointerdown', event => {
      if (!running() || event.button > 0) return;
      event.preventDefault(); event.stopPropagation();
      try {
        button.setPointerCapture(event.pointerId);
        holds.set(event.pointerId, {element:button,control:button.dataset.diveControl});
      } catch { /* Keyboard activation remains available. */ }
    });
    for (const name of ['pointerup','pointercancel','lostpointercapture']) listen(button, name, event => {
      if (holds.get(event.pointerId)?.element !== button) return;
      holds.delete(event.pointerId); release(button,event.pointerId);
    });
  }
  listen(win, 'blur', () => pause(false));
  listen(root, 'focusout', event => {
    if (event.relatedTarget && !root.contains(event.relatedTarget)) pause(false);
  });
  listen(doc, 'visibilitychange', () => {if (doc.hidden) pause(false);});
  listen(settings, 'toggle', () => {if (settings.open) pause(false);});
  listen(gallery, 'close', () => {if (!disposed) action('primary').focus({preventScroll:true});});
  listen(canvas, 'webglcontextlost', event => {
    event.preventDefault(); pause(false); cancelAssets(); scene?.dispose(); scene = null;
    updateModels(); render(); announce('3D 画面暂时中断，已暂停。图鉴保留，可重试画面。');
  });
  listen(canvas, 'webglcontextrestored', () => {if (!disposed) initializeScene();});
  listen(win, 'resize', resize);
  const observer = win.ResizeObserver ? new win.ResizeObserver(resize) : null;
  observer?.observe(viewport); initializeScene();
  return () => {
    if (disposed) return;
    disposed = true; clearInput(); stopLoop(); cancelAssets(); audioVersion++;
    abort.abort(); observer?.disconnect(); if (gallery.open) gallery.close();
    scene?.dispose(); scene = null; audio.dispose(); clearPhotos(); root.remove();
  };
}
