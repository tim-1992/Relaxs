import {
  normalizeArcadeDifficulty, TARGET_MARKS, createTargetChallenge, recordTargetShot,
  TENNIS_COURT, TENNIS_ZONES, tennisWallZone, createTennisChallenge, recordTennisWallHit,
  missTennisBall, tennisReturnVelocity, releaseTennisBall, advanceTennisFlight, projectTennisX,
} from './arcade-challenges.js';

/**
 * Local arcade with an optional, lazily loaded Three.js tennis presentation.
 * The host loads arcade.css and owns navigation; each mount owns its DOM/RAF.
 */
const W = 640;
const H = 440;
const TAU = Math.PI * 2;
const C = {
  ink: '#40534a', muted: '#778578', green: '#78947a', pale: '#e0e9d8',
  cream: '#fff9ed', clay: '#ce9476', sand: '#e5d3ad', blue: '#a9c6c7',
  pink: '#d9b1a7', line: '#d7dfce', white: '#fffef8',
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const mix = (a, b, t) => a + (b - a) * t;
const random = (a, b) => a + Math.random() * (b - a);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let instance = 0;

const MODES = {
  basketball: {
    title: '把这一球，轻轻投出去。',
    tag: '林间投篮',
    instructions: '先开始，用滑杆调整方向；指针经过绿色区时，按「投篮」或空格。球会沿弧线飞向篮筐。每轮 8 球。',
    canvas: '投篮场地，右侧有篮筐。使用下方方向滑杆和投篮按钮操作。',
    create: basketball,
  },
  football: {
    title: '挑一个角落，试着踢进去。',
    tag: '草地点球',
    instructions: '先开始，点球门选择落点，或用六个选点按钮。观察移动的守门员，再按「射门」或空格。每轮 6 球。',
    canvas: '足球点球场。点按选择射门位置，方向键微调，射门按钮踢球。',
    create: football,
  },
  tennis: {
    title: '一来一回，跟着小球走。',
    tag: '回弹网球',
    instructions: '开始后对着练习墙回球。移动鼠标、在画布上拖动，或按住左右键移动球拍；手机也可按住下方左右按钮。落地后手动继续。',
    canvas: '网球练习墙。左右移动下方球拍，接住回弹的小球。',
    create: tennis,
  },
  target: {
    title: '点中一圈，散开一点颜色。',
    tag: '漂浮点射',
    instructions: '先开始，点按移动圆环来打靶。也可用「换个目标」或左右键选择，再按点射或空格。点亮 12 次就完成一轮，不限时。',
    canvas: '四个缓慢移动的抽象圆环。点按圆环点射，或通过下方按钮选择目标。',
    create: target,
  },
  dodge: {
    title: '左右挪一挪，让形状经过。',
    tag: '轻巧躲避',
    instructions: '移动鼠标、在画布上拖动，或按住左右键，避开落下的软软形状；手机也可按住下方左右按钮。每轮 24 个，碰到也可以继续。',
    canvas: '躲避场地。左右移动底部小角色，避开从上方落下的圆形和方块。',
    create: dodge,
  },
  prank: {
    title: '给纸偶安排一点小意外。',
    tag: '纸偶恶作剧',
    instructions: '给纸偶起个昵称，再丢一只奶油派、换顶滑稽帽，或让弹簧送它起飞。点纸偶也能丢派。动画随时可暂停。',
    canvas: '虚构的卡通纸偶。可点按丢奶油派，也可用下方按钮换帽子和弹簧起飞。',
    create: prank,
  },
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function writeText(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function challengeInstructions(id, difficulty, fallback) {
  if (difficulty === 'easy') return fallback;
  if (id === 'tennis') return `按显示的${difficulty === 'hard' ? '三段' : '一段'}分区路线回球。接住后小球会停住，移动球拍选择触球位置，再按「回球」或空格。拍面左侧向左、右侧向右，也能借侧墙反弹。错区或漏接会重来当前段；5 个球用完前完成路线。没有倒计时。`;
  if (id === 'target') return `按画布上方的图形、号码序列点射。${difficulty === 'hard' ? '9 步、10 发弹药' : '6 步、8 发弹药'}；错序和打空都耗一发，进度不增加。可以点目标，或手动选目标后按空格；空格只打当前选择。弹药用完前完成序列，不限时。`;
  return fallback;
}

function circle(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

function line(ctx, points, color = C.line, width = 2) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function box(ctx, x, y, w, h, r, color) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function ellipse(ctx, x, y, rx, ry, color) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

function text(ctx, value, x, y, size = 17, color = C.ink) {
  ctx.font = `500 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function ball(ctx, x, y, r, kind = 'basketball', rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  circle(ctx, 0, 0, r, kind === 'basketball' ? C.clay : C.white);
  if (kind === 'basketball') {
    line(ctx, [[-r, 0], [r, 0]], '#94654f', 1.6);
    line(ctx, [[0, -r], [0, r]], '#94654f', 1.6);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * .48, r, 0, 0, TAU);
    ctx.strokeStyle = '#94654f';
    ctx.stroke();
  } else {
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5;
      circle(ctx, Math.cos(a) * r * .7, Math.sin(a) * r * .7, r * .17, C.green);
    }
    circle(ctx, 0, 0, r * .28, C.ink);
  }
  ctx.restore();
}

function backdrop(ctx, ground = '#e7ebda') {
  ctx.fillStyle = '#f6f4e8';
  ctx.fillRect(0, 0, W, H);
  circle(ctx, 528, 70, 36, '#eee0b7');
  ellipse(ctx, 120, 236, 200, 128, '#e9eddc');
  ellipse(ctx, 517, 259, 238, 127, '#e1e8d7');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 300, W, 140);
  line(ctx, [[0, 300], [W, 300]], '#d8dfcd');
}

/**
 * @param {string} id basketball | football | tennis | target | dodge | prank
 * @param {HTMLElement} container Host .play-surface (only our child is removed).
 * @param {{markPlayed?: (id: string) => void, toast?: (text: string) => void,
 *   embedded?: boolean, difficulty?: 'easy'|'standard'|'hard'}} hooks
 * @returns {() => void} Idempotent disposer.
 */
export function mountArcade(id, container, hooks = {}) {
  if (!container?.appendChild) throw new TypeError('mountArcade 需要一个 DOM 容器。');
  const spec = MODES[id];
  const difficulty = normalizeArcadeDifficulty(hooks.difficulty);
  const root = element('section', 'arcade-module');
  root.dataset.arcade = id;
  root.dataset.difficulty = difficulty;
  container.appendChild(root);
  if (!spec) {
    root.appendChild(element('p', 'arcade-status', '这个小游戏还没有开放。'));
    return () => root.remove();
  }

  const uid = `arcade-${++instance}`;
  const heading = element('header', 'arcade-heading');
  const title = element('h2', 'arcade-title', spec.title);
  title.id = `${uid}-title`;
  const instructions = element('p', 'arcade-instructions', challengeInstructions(id, difficulty, spec.instructions));
  instructions.id = `${uid}-instructions`;
  heading.append(element('span', 'arcade-eyebrow', spec.tag), title, instructions);
  if (id === 'tennis' || id === 'target') {
    const levels = id === 'tennis'
      ? '轻松：辅助挥拍回球 · 挑战：一段路线与落点提示 · 进阶：三段路线，自行判断落点'
      : '轻松：任意命中12次 · 挑战：6步8发 · 进阶：9步10发';
    heading.append(element('p', 'arcade-difficulty-note', `当前：${{easy: '轻松', standard: '挑战', hard: '进阶'}[difficulty]}。${levels}`));
  }
  root.setAttribute('aria-labelledby', title.id);
  const stats = element('dl', 'arcade-stats');
  stats.setAttribute('aria-label', '本轮游戏记录');
  const tools = element('div', 'arcade-tools');
  const stage = element('div', 'arcade-stage');
  const canvas = element('canvas', 'arcade-canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', difficulty !== 'easy' && id === 'tennis'
    ? '分区网球场。墙上从左到右是左区、中区、右区。路线、球拍位置和回球按钮在画布外提供。'
    : difficulty !== 'easy' && id === 'target'
      ? '四个有图形和号码的移动靶。按上方序列点射，也可手动选择目标后用点射按钮。' : spec.canvas);
  canvas.setAttribute('aria-describedby', `${uid}-instructions ${uid}-keyboard`);
  canvas.textContent = '此小游戏需要支持 Canvas2D 的浏览器。操作说明与游戏状态在画布外提供。';
  const curtain = element('div', 'arcade-curtain');
  curtain.setAttribute('aria-hidden', 'true');
  stage.append(canvas, curtain);
  const controls = element('div', 'arcade-controls');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', '游戏操作');
  const actions = element('div', 'arcade-actions');
  const transport = element('div', 'arcade-transport');
  controls.append(actions, transport);
  const status = element('p', 'arcade-status', '准备好了，再开始。');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  const keyboard = element('p', 'arcade-footnote', '只记录这轮游戏 · 随时可停下 · 画布聚焦后按 P 暂停');
  keyboard.id = `${uid}-keyboard`;
  root.append(heading, stats, tools, stage, controls, status, keyboard);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    status.textContent = '当前浏览器无法使用 Canvas2D，请换一个支持画布的浏览器再试。';
    stage.hidden = true;
    controls.hidden = true;
    return () => root.remove();
  }

  const listeners = [];
  const enabled = [];
  const counters = new Map();
  const keys = new Set();
  const held = new Map();
  const captures = new Map();
  const particles = [];
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let phase = 'ready';
  let outcome = null;
  let disposed = false;
  let marked = false;
  let raf = 0;
  let lastTime = null;
  let elapsed = 0;
  let idle = 0;
  let validSize = false;
  let displayWidth = W;
  let pointerId = null;
  let game;

  function listen(node, event, fn, options) {
    node.addEventListener(event, fn, options);
    listeners.push(() => node.removeEventListener(event, fn, options));
  }
  function say(message) {
    if (!disposed && status.textContent !== message) status.textContent = message;
  }
  function mark() {
    idle = 0;
    if (!marked && !disposed) {
      marked = true;
      hooks.markPlayed?.(id);
    }
  }
  function invalidate() {
    if (!disposed && !raf) raf = requestAnimationFrame(frame);
  }
  function releasePointer(pointer) {
    const node = captures.get(pointer);
    captures.delete(pointer);
    if (node?.hasPointerCapture?.(pointer)) node.releasePointerCapture(pointer);
  }
  function clearInput() {
    keys.clear();
    held.clear();
    pointerId = null;
    [...captures.keys()].forEach(releasePointer);
  }
  function capture(node, event) {
    try {
      node.setPointerCapture(event.pointerId);
      captures.set(event.pointerId, node);
    } catch { /* Synthetic events and older browsers may not allow capture. */ }
  }
  function pause(message = '已经暂停。想继续时，再按继续。') {
    if (phase !== 'running') return;
    phase = 'paused';
    clearInput();
    lastTime = null;
    say(message);
    sync();
    invalidate();
  }
  function finish(message, result = null) {
    phase = 'done';
    outcome = result;
    clearInput();
    say(message);
    sync();
    toggleButton.focus({preventScroll: true});
    invalidate();
  }
  function reset() {
    phase = 'ready';
    outcome = null;
    elapsed = 0;
    idle = 0;
    lastTime = null;
    particles.length = 0;
    clearInput();
    game.reset();
    say('这一轮已重置。准备好再开始。');
    sync();
    invalidate();
  }
  function start() {
    if (document.hidden || !validSize || disposed) {
      say('等画布显示出来，再开始就好。');
      return false;
    }
    if (phase === 'done') reset();
    const previous = phase;
    phase = 'running';
    idle = 0;
    lastTime = null;
    say(previous === 'paused' ? '继续这一轮，按自己的节奏来。' : '开始了。随时可以暂停或重置。');
    game.start?.(previous);
    sync();
    invalidate();
    return true;
  }
  function toggle() {
    if (phase === 'running') pause();
    else start();
  }
  function button(parent, label, fn, primary = false, available) {
    const node = element('button', `arcade-button${primary ? ' arcade-button-primary' : ''}`, label);
    node.type = 'button';
    parent.appendChild(node);
    listen(node, 'click', event => {
      if (disposed || node.disabled) return;
      idle = 0;
      fn(event);
      sync();
      invalidate();
    });
    if (available) enabled.push([node, available]);
    return node;
  }
  const toggleButton = button(transport, '开始这一轮', toggle, true);
  toggleButton.setAttribute('aria-controls', `${uid}-canvas`);
  canvas.id = `${uid}-canvas`;
  button(transport, '重置', reset);

  const api = {
    canvas, tools, actions, listen, button, say, mark, pause, finish, invalidate, difficulty,
    get elapsed() { return elapsed; },
    get running() { return phase === 'running'; },
    get touchRadius() { return Math.max(24, 23 * W / displayWidth); },
    axis() {
      return clamp((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)
        + [...held.values()].reduce((sum, direction) => sum + direction, 0), -1, 1);
    },
    stat(key, label, value) {
      if (!counters.has(key)) {
        const group = element('div', 'arcade-stat');
        const amount = element('dd', 'arcade-stat-value');
        group.append(element('dt', 'arcade-stat-label', label), amount);
        stats.appendChild(group);
        counters.set(key, amount);
      }
      const node = counters.get(key);
      if (node.textContent !== String(value)) node.textContent = String(value);
    },
    action(label, fn, available = () => true, autoStart = false) {
      return button(actions, label, () => {
        if (autoStart && (phase === 'ready' || phase === 'done') && !start()) return;
        if (phase === 'running') fn();
      }, true, () => available() && (phase === 'running' || (autoStart && phase !== 'paused')));
    },
    steer(nudge) {
      const group = element('div', 'arcade-steering');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', '触屏方向控制，可长按');
      actions.appendChild(group);
      [-1, 1].forEach(direction => {
        const node = button(group, direction < 0 ? '← 向左' : '向右 →', event => {
          // Keyboard/assistive activation has no pointerdown.
          if (event.detail === 0 && phase === 'running') { nudge(direction * 28); mark(); }
        }, false, () => phase === 'running');
        listen(node, 'pointerdown', event => {
          if (phase !== 'running' || event.button !== 0) return;
          event.preventDefault();
          capture(node, event);
          held.set(event.pointerId, direction);
          nudge(direction * 10);
          mark();
          invalidate();
        });
        listen(node, 'pointerup', event => {
          held.delete(event.pointerId);
          releasePointer(event.pointerId);
        });
        listen(node, 'lostpointercapture', event => held.delete(event.pointerId));
        listen(node, 'pointercancel', () => pause('触控已中断，游戏已暂停。按继续即可接着玩。'));
      });
    },
    burst(x, y, color = C.green, count = 12) {
      for (let i = 0; i < (reduced ? Math.min(4, count) : count); i++) {
        const a = random(0, TAU);
        const speed = random(25, 95);
        particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 15,
          life: random(.4, .8), color, radius: random(2, 5) });
      }
      if (particles.length > 100) particles.splice(0, particles.length - 100);
    },
    notify(message) { say(message); hooks.toast?.(message); },
  };

  game = spec.create(api);
  game.reset();

  function sync() {
    toggleButton.textContent = {
      ready: '开始这一轮', running: '暂停一下', paused: '继续', done: '再玩一轮',
    }[phase];
    root.dataset.phase = phase;
    root.dataset.outcome = outcome || '';
    curtain.hidden = phase === 'running' || (id === 'prank' && phase === 'ready');
    curtain.textContent = phase === 'ready' ? '准备好了，再开始' : phase === 'done'
      ? outcome === 'won' ? '挑战完成 · 可以再玩一轮' : outcome === 'lost' ? '这轮先到这里 · 可以重新挑战' : '这一小轮，先到这里'
      : '暂停中 · 随时继续';
    for (const [node, available] of enabled) node.disabled = !available();
    game?.sync?.();
  }
  function frame(time) {
    raf = 0;
    if (disposed) return;
    const dt = lastTime === null ? 0 : Math.min(Math.max((time - lastTime) / 1000, 0), .04);
    lastTime = time;
    if (phase === 'running' && validSize) {
      elapsed += dt;
      idle += dt;
      game.step(dt);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 60 * dt;
        if (p.life <= 0) particles.splice(i, 1);
      }
      if (idle > 60 && !(difficulty !== 'easy' && (id === 'tennis' || id === 'target'))) {
        pause('已经玩了一小会儿，先自动暂停。想玩时再继续。');
      }
    }
    if (validSize) {
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      game.draw(ctx);
      ctx.restore();
      for (const p of particles) {
        ctx.globalAlpha = Math.min(1, p.life * 2);
        circle(ctx, p.x, p.y, p.radius, p.color);
      }
      ctx.globalAlpha = 1;
    }
    sync();
    if (phase === 'running' && validSize && (game.animating?.() !== false || particles.length)) invalidate();
    else lastTime = null;
  }
  function resize() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    validSize = rect.width > 1 && rect.height > 1;
    if (!validSize) {
      pause('画布暂时不可见，已暂停。显示后可手动继续。');
      return;
    }
    displayWidth = rect.width;
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    invalidate();
  }
  function point(event) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return null;
    return { x: clamp((event.clientX - rect.left) / rect.width * W, 0, W),
      y: clamp((event.clientY - rect.top) / rect.height * H, 0, H) };
  }
  listen(canvas, 'pointerdown', event => {
    if (event.isPrimary === false || event.button !== 0 || pointerId !== null) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    if (id === 'prank' && phase === 'ready') start();
    if (phase !== 'running') { say('按下开始或继续，再来操作画布。'); return; }
    pointerId = event.pointerId;
    capture(canvas, event);
    const p = point(event);
    if (p) game.pointer?.('down', p);
    idle = 0;
    invalidate();
  }, { passive: false });
  listen(canvas, 'pointermove', event => {
    if (phase !== 'running') return;
    if (event.pointerId !== pointerId && (event.pointerType !== 'mouse' || pointerId !== null)) return;
    const p = point(event);
    if (p) game.pointer?.('move', p);
    invalidate();
  });
  listen(canvas, 'pointerup', event => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    releasePointer(event.pointerId);
  });
  listen(canvas, 'pointercancel', () => pause('触控已中断，游戏已暂停。按继续即可接着玩。'));
  listen(canvas, 'lostpointercapture', event => {
    if (pointerId === event.pointerId) pause('操作已中断，游戏已暂停。');
  });
  listen(root, 'keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return;
    if (event.key === 'Escape' && hooks.embedded) return;
    if (event.key === 'Escape' || event.key.toLowerCase() === 'p') {
      event.preventDefault();
      if (!event.repeat) event.key === 'Escape' ? pause() : toggle();
      return;
    }
    if (event.code === 'Space' && event.target.tagName !== 'BUTTON') {
      event.preventDefault();
      if (event.repeat) return;
      if (phase !== 'running') start();
      else if (game.action) game.action();
      else pause();
      idle = 0;
      invalidate();
      return;
    }
    if (phase === 'running' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      keys.add(event.key);
      game.key?.(event.key, event.repeat);
      idle = 0;
      invalidate();
    }
  });
  listen(root, 'keyup', event => keys.delete(event.key));
  listen(root, 'focusout', event => {
    if (!root.contains(event.relatedTarget)) {
      clearInput();
      // Disabling a just-used shot button can blur it to no new target.
      // Window blur, visibility, and assessment events handle actual exits.
      if (event.relatedTarget) pause('焦点已离开小游戏，先帮你暂停。');
    }
  });
  listen(window, 'blur', () => pause('窗口已切换，游戏已暂停。回来后按继续。'));
  listen(document, 'visibilitychange', () => {
    if (document.hidden) pause('页面已离开，游戏已暂停。回来后按继续。');
  });
  listen(container, 'songjian:pause', () => pause('正在记录此刻的感受，小游戏已暂停。回来后可手动继续。'));
  listen(window, 'resize', resize);
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(stage);
  resize();
  sync();

  return () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    raf = 0;
    listeners.forEach(remove => remove());
    observer?.disconnect();
    game?.dispose?.();
    clearInput();
    particles.length = 0;
    root.remove();
  };
}

function basketball(api) {
  const rim = { x: 455, y: 168 };
  const origin = { x: 125, y: 367 };
  let time, aim, power, shot, attempts, baskets;
  const field = element('label', 'arcade-field');
  const caption = element('span', 'arcade-field-label', '投篮方向');
  const slider = element('input', 'arcade-range');
  slider.type = 'range';
  slider.min = '-100';
  slider.max = '100';
  slider.step = '1';
  slider.value = '0';
  slider.setAttribute('aria-label', '投篮方向，零为正对篮筐');
  const output = element('span', 'arcade-field-value', '正对篮筐');
  field.append(caption, slider, output);
  const timing = element('div', 'arcade-timing');
  timing.append(element('span', 'arcade-field-label', '指针到绿色区时出手'));
  const meter = element('div', 'arcade-meter');
  meter.setAttribute('aria-hidden', 'true');
  const needle = element('i', 'arcade-meter-needle');
  meter.append(element('span', 'arcade-meter-zone'), needle);
  timing.appendChild(meter);
  api.tools.append(field, timing);
  function setAim(value) {
    aim = Number(value);
    slider.value = String(aim);
    output.textContent = Math.abs(aim) < 5 ? '正对篮筐' : `${aim < 0 ? '偏左' : '偏右'} ${Math.abs(aim)}`;
    slider.setAttribute('aria-valuetext', output.textContent);
  }
  api.listen(slider, 'input', () => { setAim(slider.value); api.invalidate(); });
  function shoot() {
    if (!api.running || shot) return;
    attempts++;
    shot = { t: 0, endX: rim.x + aim * .95 + (power - .5) * 190,
      arc: 90 + power * 100, checked: false, made: false, trail: [] };
    api.mark();
    api.stat('attempts', '已投出', `${attempts} / 8`);
    api.say('球出手了……');
  }
  api.action('投篮', shoot, () => !shot);
  return {
    reset() {
      time = 0; power = 0; shot = null; attempts = 0; baskets = 0; setAim(0);
      needle.style.left = '0%';
      api.stat('baskets', '入篮', 0);
      api.stat('attempts', '已投出', '0 / 8');
    },
    action: shoot,
    key(key) {
      if (!shot && (key === 'ArrowLeft' || key === 'ArrowRight')) {
        setAim(clamp(aim + (key === 'ArrowLeft' ? -4 : 4), -100, 100));
      }
    },
    step(dt) {
      if (!shot) {
        time += dt;
        power = (1 - Math.cos(time * 2.6)) / 2;
        needle.style.left = `${power * 100}%`;
        return;
      }
      shot.t += dt / 1.1;
      const t = shot.t;
      const p = { x: mix(origin.x, shot.endX, t),
        y: mix(origin.y, rim.y, t) - 4 * shot.arc * t * (1 - t) };
      shot.trail.push(p);
      if (shot.trail.length > 9) shot.trail.shift();
      if (t >= 1 && !shot.checked) {
        shot.checked = true;
        shot.made = Math.abs(shot.endX - rim.x) < 25;
        if (shot.made) {
          baskets++;
          api.burst(rim.x, rim.y + 16, C.green);
          api.stat('baskets', '入篮', baskets);
          api.say(`进了！本轮 ${baskets} 球入篮。`);
        } else {
          api.say(shot.endX < rim.x ? '稍稍偏短或偏左。可以调整方向或出手时机。' : '稍稍偏远或偏右。可以调整方向或出手时机。');
        }
      }
      if (t > 1.42) {
        shot = null;
        if (attempts >= 8) api.finish(`这轮投完了：投出 ${attempts} 球，${baskets} 球入篮。想玩再开一轮。`);
      }
    },
    draw(ctx) {
      backdrop(ctx, '#ebe2cd');
      ellipse(ctx, 309, 372, 246, 41, '#f0e9d9');
      line(ctx, [[42, 405], [598, 405]], '#d1c6ae', 2);
      line(ctx, [[521, 105], [521, 340]], '#a3ad99', 9);
      box(ctx, 487, 90, 63, 91, 7, C.white);
      line(ctx, [[498, 122], [530, 122], [530, 156], [498, 156], [498, 122]], C.line, 2);
      for (let i = 0; i < 5; i++) {
        const x = rim.x - 34 + i * 17;
        line(ctx, [[x, rim.y], [mix(x, rim.x, .28), rim.y + 43]], '#c3c3ad', 1.5);
      }
      line(ctx, [[424, 186], [486, 186]], '#c3c3ad', 1.5);
      line(ctx, [[431, 208], [479, 208]], '#c3c3ad', 1.5);
      ellipse(ctx, rim.x, rim.y, 38, 7, '#b88262');
      ellipse(ctx, rim.x, rim.y - 1, 32, 3, '#f6f2e5');
      // The guide shows direction; the moving timing meter determines distance.
      ctx.setLineDash([3, 8]);
      line(ctx, [[rim.x + aim * .95, rim.y + 65], [rim.x + aim * .95, rim.y + 93]], C.green);
      ctx.setLineDash([]);
      if (shot) {
        shot.trail.forEach((p, i) => {
          ctx.globalAlpha = i / shot.trail.length * .2;
          circle(ctx, p.x, p.y, 10, C.clay);
        });
        ctx.globalAlpha = 1;
        const p = shot.trail.at(-1) || origin;
        ellipse(ctx, clamp(p.x, 20, 620), 386, 17, 5, '#d3c6ac');
        ball(ctx, p.x, p.y, 14, 'basketball', shot.t * 5);
        if (shot.made && shot.t < 1.12) line(ctx, [[419, 170], [490, 170]], C.clay, 4);
      } else {
        ellipse(ctx, origin.x, 394, 30, 7, '#d3c6ac');
        ball(ctx, origin.x, origin.y, 24);
      }
    },
  };
}

function football(api) {
  let time, aim, shot, attempts, goals, saves;
  const origin = { x: 320, y: 374 };
  const keeper = () => ({ x: 320 + Math.sin(time * 1.65) * 153, y: 177 + Math.sin(time * 2.1) * 15 });
  const picker = element('div', 'arcade-goal-picker');
  picker.setAttribute('role', 'group');
  picker.setAttribute('aria-label', '选择球门内的射门位置');
  const choices = [];
  [116, 211].forEach((y, row) => [177, 320, 463].forEach((x, col) => {
    const node = api.button(picker, `${['左', '中', '右'][col]}${row ? '下' : '上'}`, () => {
      aim = { x, y }; select();
    }, false, () => !shot);
    choices.push({ node, x, y });
  }));
  api.tools.appendChild(picker);
  function select() {
    choices.forEach(({ node, x, y }) => node.setAttribute('aria-pressed', String(aim.x === x && aim.y === y)));
  }
  function shoot() {
    if (!api.running || shot) return;
    attempts++;
    shot = { t: 0, target: { ...aim }, checked: false, result: '' };
    api.mark();
    api.stat('attempts', '已射门', `${attempts} / 6`);
    api.say('球踢出去了，看看门将往哪边走。');
  }
  api.action('射门', shoot, () => !shot);
  return {
    reset() {
      time = 0; aim = { x: 177, y: 116 }; shot = null; attempts = 0; goals = 0; saves = 0;
      select();
      api.stat('goals', '进球', 0);
      api.stat('attempts', '已射门', '0 / 6');
      api.stat('saves', '被扑住', 0);
    },
    action: shoot,
    pointer(type, p) {
      if (type === 'down' && !shot) {
        aim = { x: clamp(p.x, 65, 575), y: clamp(p.y, 65, 274) };
        select();
        api.say('落点选好了，按射门。球门外的落点也可能踢偏。');
      }
    },
    key(key) {
      if (shot) return;
      aim.x = clamp(aim.x + (key === 'ArrowLeft' ? -14 : key === 'ArrowRight' ? 14 : 0), 65, 575);
      aim.y = clamp(aim.y + (key === 'ArrowUp' ? -14 : key === 'ArrowDown' ? 14 : 0), 65, 274);
      select();
    },
    step(dt) {
      time += dt;
      if (!shot) return;
      shot.t += dt / .88;
      if (shot.t >= 1 && !shot.checked) {
        shot.checked = true;
        const k = keeper();
        const inside = shot.target.x > 121 && shot.target.x < 519 && shot.target.y > 85 && shot.target.y < 248;
        const blocked = inside && Math.abs(shot.target.x - k.x) < 56 && Math.abs(shot.target.y - k.y) < 73;
        shot.result = !inside ? 'wide' : blocked ? 'save' : 'goal';
        if (shot.result === 'goal') {
          goals++; api.stat('goals', '进球', goals);
          api.burst(shot.target.x, shot.target.y, C.green);
          api.say(`进球了！本轮已经踢进 ${goals} 球。`);
        } else if (shot.result === 'save') {
          saves++; api.stat('saves', '被扑住', saves);
          api.burst(shot.target.x, shot.target.y, C.sand, 7);
          api.say('被门将接住了。下一球可以换个落点或出脚时机。');
        } else api.say('这球飞到球门外了。试试六个球门选点。');
      }
      if (shot.t > 1.65) {
        shot = null;
        if (attempts >= 6) api.finish(`这轮结束：射门 ${attempts} 次，踢进 ${goals} 球。`);
      }
    },
    draw(ctx) {
      backdrop(ctx, '#dbe6cd');
      ctx.fillStyle = '#dfe7d7';
      ctx.fillRect(113, 79, 414, 176);
      for (let x = 115; x < 529; x += 23) line(ctx, [[x, 80], [x, 254]], '#c4d3bf', 1);
      for (let y = 82; y < 255; y += 22) line(ctx, [[115, y], [525, y]], '#c4d3bf', 1);
      line(ctx, [[114, 256], [114, 79], [526, 79], [526, 256]], C.white, 9);
      line(ctx, [[83, 281], [557, 281], [606, 425], [34, 425], [83, 281]], '#f3f6e7', 3);
      ellipse(ctx, 320, 377, 70, 18, '#cbdcbf');
      const k = keeper();
      ellipse(ctx, k.x, 258, 39, 8, '#b8c9b0');
      line(ctx, [[k.x - 17, k.y + 32], [k.x - 23, k.y + 68]], C.ink, 13);
      line(ctx, [[k.x + 17, k.y + 32], [k.x + 23, k.y + 68]], C.ink, 13);
      line(ctx, [[k.x - 43, k.y - 14], [k.x, k.y + 4], [k.x + 43, k.y - 14]], C.green, 13);
      box(ctx, k.x - 24, k.y - 20, 48, 61, 15, C.green);
      circle(ctx, k.x, k.y - 42, 21, C.sand);
      circle(ctx, k.x - 46, k.y - 17, 11, C.cream);
      circle(ctx, k.x + 46, k.y - 17, 11, C.cream);
      circle(ctx, k.x - 6, k.y - 44, 2, C.ink);
      circle(ctx, k.x + 6, k.y - 44, 2, C.ink);
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(aim.x, aim.y, 22, 0, TAU);
      ctx.strokeStyle = '#6e8b73'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
      line(ctx, [[aim.x - 9, aim.y], [aim.x + 9, aim.y]], C.ink);
      line(ctx, [[aim.x, aim.y - 9], [aim.x, aim.y + 9]], C.ink);
      if (shot) {
        const t = Math.min(1, shot.t);
        let x = mix(origin.x, shot.target.x, t);
        let y = mix(origin.y, shot.target.y, t) - Math.sin(t * Math.PI) * 58;
        if (shot.t > 1) {
          const after = shot.t - 1;
          y += after * (shot.result === 'save' ? 190 : 30);
          x += after * (shot.result === 'save' ? 75 : 0);
        }
        ball(ctx, x, y, mix(22, 10, t), 'football', shot.t * 3);
      } else ball(ctx, origin.x, origin.y, 23, 'football');
    },
  };
}

function tennis(api) {
  const visual = createTennisPresentation(api);
  api.tennisView = visual;
  const game = api.difficulty === 'easy' ? tennisEasy(api) : tennisChallenge(api);
  return {
    ...game,
    step(dt) { visual.advance(dt); game.step(dt); },
    animating() { return visual.animating() || (game.animating?.() ?? true); },
    dispose() { visual.dispose(); },
  };
}

function createTennisPresentation(api) {
  const chooser = element('div', 'arcade-athlete-picker');
  chooser.setAttribute('role', 'group');
  chooser.setAttribute('aria-label', '选择网球角色');
  const caption = element('p', 'arcade-athlete-note', '正在准备本地3D球手，练习场已可操作。');
  const renderCanvas = element('canvas', 'arcade-tennis-3d');
  renderCanvas.setAttribute('aria-hidden', 'true');
  const stage = api.canvas.parentElement;
  stage.insertBefore(renderCanvas, api.canvas.nextSibling);
  let scene = null, disposed = false, character = 'moss';
  const buttons = [];
  function unavailable() {
    if (disposed) return;
    scene?.dispose(); scene = null;
    renderCanvas.hidden = true;
    stage.classList.remove('has-tennis-3d');
    caption.textContent = '此设备使用2D练习场，路线、挥拍和选择目标仍可正常操作。';
    buttons.forEach(button => { button.disabled = true; });
    api.invalidate();
  }
  renderCanvas.hidden = true;
  // Legacy previews without an import map must still load all Canvas games.
  import('./tennis-scene.js').then(({createTennisScene, SPORT_CHARACTERS}) => {
    if (disposed) return;
    renderCanvas.hidden = false;
    scene = createTennisScene(renderCanvas, {onResize: api.invalidate});
    stage.classList.add('has-tennis-3d');
    caption.textContent = '本地3D球手 · 跟随你的移动，在真正回球时挥拍。墙面：Ⅰ左区 · Ⅱ中区 · Ⅲ右区。';
    for (const definition of SPORT_CHARACTERS) {
      const button = api.button(chooser, '', () => {
        character = definition.id;
        scene?.select(character);
        buttons.forEach(item => item.setAttribute('aria-pressed', String(item.dataset.character === character)));
        api.say(`已换成${definition.name}。角色只改变外观，回球路线和手感保持相同。`);
      }, false, () => Boolean(scene));
      button.dataset.character = definition.id;
      button.setAttribute('aria-pressed', String(character === definition.id));
      const swatch = element('span', `arcade-athlete-swatch arcade-athlete-${definition.id}`);
      swatch.style.backgroundColor = definition.color;
      swatch.setAttribute('aria-hidden', 'true');
      button.append(swatch, element('span', '', definition.name), element('small', '', definition.detail));
      buttons.push(button);
    }
    api.invalidate();
  }).catch(unavailable);
  api.tools.append(chooser, caption);
  api.listen(renderCanvas, 'webglcontextlost', event => { event.preventDefault(); unavailable(); });
  return {
    advance(dt) { scene?.advance(dt); },
    animating() { return scene?.animating() || false; },
    pointerX(point) { return scene ? scene.pointerX(point) : point.x; },
    swing() { scene?.swing(); },
    wallHit(x) { scene?.wallHit(x); },
    reset() { scene?.reset(); },
    draw(state) {
      if (!scene) return false;
      try { scene.draw(state); return true; }
      catch { unavailable(); return false; }
    },
    dispose() {
      if (disposed) return;
      disposed = true; scene?.dispose(); scene = null;
      renderCanvas.remove(); stage.classList.remove('has-tennis-3d');
    },
  };
}

function tennisChallenge(api) {
  let state, b, x = 320, targetX = 320, trail = [];
  const zoneLabel = id => TENNIS_ZONES.find(zone => zone.id === id)?.label || '完成';
  const panel = element('section', 'arcade-challenge');
  panel.setAttribute('aria-label', '网球路线与规划');
  const summary = element('p', 'arcade-challenge-heading', '按顺序，把回球送到墙上的分区');
  const routes = element('div', 'arcade-routes');
  const next = element('p', 'arcade-challenge-next');
  const note = element('p', 'arcade-tool-note', '错区或漏接只重来当前段，已完成的段会保留。两档球速与拍面大小相同。');
  panel.append(summary, routes, next, note);
  api.tools.append(panel);

  const aim = element('label', 'arcade-field arcade-tennis-aim');
  const slider = element('input', 'arcade-range');
  slider.id = `${api.canvas.id}-paddle`;
  slider.type = 'range'; slider.min = String(TENNIS_COURT.left); slider.max = String(TENNIS_COURT.right);
  slider.step = '1'; slider.value = '320';
  slider.setAttribute('aria-label', '球拍左右位置，改变与球接触的位置');
  aim.htmlFor = slider.id;
  const aimValue = element('output', 'arcade-field-value');
  aimValue.htmlFor = slider.id;
  aim.append(element('span', 'arcade-field-label', '球拍位置'), slider, aimValue);
  const aimNote = element('p', 'arcade-tool-note arcade-aim-note');
  api.tools.append(aim, aimNote);

  function newBall() {
    x = targetX = 320;
    b = { x: 320, y: TENNIS_COURT.contactY, vx: 0, vy: 0, held: true, out: false, playerReturn: false };
    trail = [];
  }
  function setPaddle(value) {
    targetX = clamp(value, TENNIS_COURT.left, TENNIS_COURT.right);
    if (b?.held) x = targetX;
    api.mark();
    api.invalidate();
  }
  api.steer(amount => setPaddle(targetX + amount));
  api.listen(slider, 'input', () => {
    if (!api.running) return;
    setPaddle(Number(slider.value));
  });
  api.listen(slider, 'keydown', event => {
    if ((event.key === 'Escape' || event.key.toLowerCase() === 'p') &&
        !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing) {
      event.preventDefault();
      api.pause();
      api.canvas.focus({preventScroll: true});
      return;
    }
    if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    strike();
  });
  function strike() {
    if (!api.running || !b?.held) return;
    if (!releaseTennisBall(b, x)) {
      api.say('球在拍面外。把球拍移回球下，再选择左侧、中心或右侧触球。');
      return;
    }
    api.tennisView.swing();
    trail = [];
    api.mark();
    api.say(`球已送出，目标是${zoneLabel(state.routes[state.routeIndex][state.step])}。看下方落点圈，准备接回来的球。`);
    // The strike control becomes disabled in flight; retain gameplay focus.
    api.canvas.focus({preventScroll: true});
    api.invalidate();
  }
  api.action('挥拍回球 ↗', strike, () => Boolean(b?.held));

  function refresh() {
    api.stat('route', '已完成路线', `${state.routeIndex} / ${state.routes.length}`);
    api.stat('balls', '剩余球', state.ballsLeft);
    routes.replaceChildren(...state.routes.map((route, index) => {
      const row = element('div', 'arcade-route-row');
      row.append(element('span', 'arcade-route-number', `第 ${index + 1} 段`));
      const list = element('ol', 'arcade-sequence');
      list.setAttribute('aria-label', `第 ${index + 1} 段路线`);
      route.forEach((zone, step) => {
        const done = index < state.routeIndex || index === state.routeIndex && step < state.step;
        const current = state.status === 'playing' && index === state.routeIndex && step === state.step;
        const token = element('li', done ? 'is-complete' : current ? 'is-current' : '', `${done ? '✓ ' : ''}${zoneLabel(zone)}`);
        if (current) token.setAttribute('aria-current', 'step');
        list.append(token);
      });
      row.append(list);
      return row;
    }));
    writeText(next, state.status === 'won' ? '所有路线已完成。'
      : state.status === 'lost' ? '这一轮的 5 个球已用完，重新开始就能再试。'
        : `当前：第 ${state.routeIndex + 1} 段，第 ${state.step + 1} 步 → ${zoneLabel(state.routes[state.routeIndex][state.step])}`);
  }

  function syncAim() {
    slider.disabled = !api.running;
    slider.value = String(Math.round(x));
    slider.setAttribute('aria-valuetext', `球拍位置 ${Math.round(x)}，场地从左到右为${TENNIS_COURT.left}至${TENNIS_COURT.right}`);
    writeText(aimValue, `${Math.round(x)}`);
    if (state.status !== 'playing') {
      writeText(aimNote, state.status === 'won' ? '路线完成。再玩一轮，或换一个小世界。' : '5个球用完了，可以重新开始。');
      return;
    }
    if (!b || b.out) { writeText(aimNote, '按继续取得下一球，再慢慢规划。'); return; }
    if (!b.held) { writeText(aimNote, '球在路上。落点圈标出回来的位置，提前把球拍移过去。'); return; }
    const velocity = tennisReturnVelocity(b.x, x);
    if (!velocity) { writeText(aimNote, '球在拍面外，请把球拍移回球下。'); return; }
    const contact = Math.abs(b.x - x) < 6 ? '拍面中心' : b.x < x ? '拍面左侧' : '拍面右侧';
    const landing = api.difficulty === 'standard'
      ? `预计墙面落点：${zoneLabel(tennisWallZone(projectTennisX({...b, ...velocity}, TENNIS_COURT.wallY)))}。`
      : '进阶档不标出墙面落点，可以观察角度和侧墙来判断。';
    writeText(aimNote, `触球位置：${contact}。${landing}准备好后按回球；停球时没有时间限制。`);
  }

  return {
    reset() {
      api.tennisView.reset();
      state = createTennisChallenge(api.difficulty);
      newBall();
      refresh();
      syncAim();
    },
    start() {
      if (b.out) newBall();
      if (b.held) api.say('先移动球拍选择触球位置，准备好后按回球或空格。球拍左侧向左、右侧向右。');
    },
    action: strike,
    pointer(type, point) { setPaddle(api.tennisView.pointerX(point)); },
    key(key) { if (key === 'ArrowLeft' || key === 'ArrowRight') api.mark(); },
    sync: syncAim,
    animating() { return !b.held && !b.out || Boolean(api.axis()) || Math.abs(x - targetX) > .1; },
    step(dt) {
      const axis = api.axis();
      if (axis) setPaddle(targetX + axis * 300 * dt);
      x = b.held ? targetX : mix(x, targetX, Math.min(1, dt * 17));
      for (const event of advanceTennisFlight(b, dt, x)) {
        if (event.type === 'wall') {
          api.tennisView.wallHit(event.x);
          const result = recordTennisWallHit(state, event.x, event.playerReturn);
          api.burst(event.x, TENNIS_COURT.wallY, result.correct ? C.green : C.clay, 5);
          refresh();
          if (state.status === 'won') {
            b.held = true; b.vx = b.vy = 0;
            api.finish(`路线完成！你把球送到了每一个约定的分区。还剩 ${state.ballsLeft} 个球，可以重新挑战。`, 'won');
          } else if (result.accepted) {
            api.say(result.correct
              ? `命中${zoneLabel(result.zone)}。接住后继续，下一步是${zoneLabel(state.routes[state.routeIndex][state.step])}。`
              : `这次到了${zoneLabel(result.zone)}，需要的是${zoneLabel(result.expected)}。当前段从第一步重来，已完成的段保留。`);
          }
        } else if (event.type === 'catch') {
          trail = [];
          api.say('接住了，球已停住。慢慢调整球拍的触球位置，再按回球。');
        } else if (event.type === 'out') {
          missTennisBall(state);
          trail = [];
          refresh();
          if (state.status === 'lost') api.finish('5 个球用完了。这一轮先到这里；可以重新开始，试试另一条回球角度。', 'lost');
          else api.pause(`球落地了，还剩 ${state.ballsLeft} 个球。当前段重新开始；按继续取得下一球。`);
        }
      }
      if (!b.held && !b.out) {
        trail.push({x: b.x, y: b.y});
        if (trail.length > 7) trail.shift();
      }
    },
    draw(ctx) {
      const velocity = b.held ? tennisReturnVelocity(b.x, x) : null;
      const predicted = velocity && api.difficulty === 'standard' && state.status === 'playing'
        ? projectTennisX({...b, ...velocity}, TENNIS_COURT.wallY) : null;
      const catchX = !b.held && !b.out && state.status === 'playing' && (b.vy < 0 || b.y <= TENNIS_COURT.contactY)
        ? projectTennisX(b, b.vy > 0 ? TENNIS_COURT.contactY : 2 * TENNIS_COURT.wallY - TENNIS_COURT.contactY) : null;
      if (api.tennisView.draw({paddleX: x, ball: b, trail, zones: true,
        expected: state.status === 'playing' ? state.routes[state.routeIndex][state.step] : null, predicted, catchX})) return;
      ctx.fillStyle = '#e1e9d8'; ctx.fillRect(0, 0, W, H);
      box(ctx, 23, 25, W - 46, H - 50, 23, '#a8bda0');
      line(ctx, [[45, 403], [45, 83], [595, 83], [595, 403], [45, 403]], '#e9f0df', 3);
      line(ctx, [[46, 244], [594, 244]], '#d5e2cd', 2);
      TENNIS_ZONES.forEach((zone, index) => {
        box(ctx, zone.left + 2, 35, zone.right - zone.left - 4, 44, 5, ['#d9d7b7', '#d5dfcd', '#d5dbce'][index]);
        text(ctx, `${zone.symbol} ${zone.label}`, (zone.left + zone.right) / 2, 57, 19, C.ink);
      });
      if (velocity && api.difficulty === 'standard' && state.status === 'playing') {
        const landing = projectTennisX({...b, ...velocity}, TENNIS_COURT.wallY);
        circle(ctx, landing, TENNIS_COURT.wallY + 7, 7, C.ink);
        text(ctx, '预计落点', landing, 106, 13, C.ink);
      }
      if (!b.held && !b.out && state.status === 'playing' && (b.vy < 0 || b.y <= TENNIS_COURT.contactY)) {
        // Show a catch location, not an automatic paddle: the player still moves it.
        // Before the wall hit, unfold the vertical round trip as one upward ray.
        const catchX = projectTennisX(b, b.vy > 0 ? TENNIS_COURT.contactY : 2 * TENNIS_COURT.wallY - TENNIS_COURT.contactY);
        ctx.beginPath(); ctx.ellipse(catchX, TENNIS_COURT.paddleY + 4, 25, 7, 0, 0, TAU);
        ctx.strokeStyle = '#526b50'; ctx.lineWidth = 2; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
      }
      trail.forEach((point, index) => {
        ctx.globalAlpha = index / trail.length * .22;
        circle(ctx, point.x, point.y, 9, C.cream);
      });
      ctx.globalAlpha = 1;
      ellipse(ctx, x, TENNIS_COURT.paddleY + 14, 66, 8, '#8fa687');
      box(ctx, x - 65, TENNIS_COURT.paddleY - 8, 130, 16, 8, C.cream);
      box(ctx, x - 36, TENNIS_COURT.paddleY - 7, 72, 14, 6, C.clay);
      text(ctx, '↖', x - 49, TENNIS_COURT.paddleY, 13, C.ink);
      text(ctx, '↗', x + 49, TENNIS_COURT.paddleY, 13, C.ink);
      if (!b.out) {
        circle(ctx, b.x, b.y, 11, '#f2eabb');
        line(ctx, [[b.x - 5, b.y - 7], [b.x - 2, b.y], [b.x - 5, b.y + 7]], C.white, 1.5);
      }
    },
  };
}

function tennisEasy(api) {
  let x, targetX, b, hits, served, misses, waiting, trail;
  const paddleY = 373;
  function move(amount) { targetX = clamp(targetX + amount, 78, W - 78); }
  api.steer(move);
  api.tools.appendChild(element('p', 'arcade-tool-note', '练习墙会自动回球 · 每轮 5 个球 · 不限时'));
  function serve() {
    if (!waiting) return;
    served++;
    waiting = false;
    b = { x, y: paddleY - 28, vx: (served % 2 ? 1 : -1) * 100, vy: -226 };
    api.stat('served', '已发球', `${served} / 5`);
    api.mark();
    api.say(`第 ${served} 个球发出。移动球拍，等它弹回来。`);
  }
  return {
    reset() {
      api.tennisView.reset();
      x = 320; targetX = 320; b = null; hits = 0; served = 0; misses = 0; waiting = true; trail = [];
      api.stat('hits', '回球', 0);
      api.stat('served', '已发球', '0 / 5');
      api.stat('time', '活动时间', '0 秒');
    },
    start: serve,
    pointer(type, p) {
      const pointerX = api.tennisView.pointerX(p);
      if (Math.abs(targetX - pointerX) > 2) api.mark();
      targetX = clamp(pointerX, 78, W - 78);
    },
    key(key) {
      if (key === 'ArrowLeft' || key === 'ArrowRight') api.mark();
    },
    step(dt) {
      const axis = api.axis();
      if (axis) move(axis * 340 * dt);
      x = mix(x, targetX, Math.min(1, dt * 17));
      api.stat('time', '活动时间', `${Math.floor(api.elapsed)} 秒`);
      if (!b) return;
      const previousY = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 34 || b.x > W - 34) {
        b.x = clamp(b.x, 34, W - 34); b.vx *= -1;
      }
      if (b.y < 80 && b.vy < 0) { b.y = 80; b.vy *= -1; api.burst(b.x, 68, C.sand, 4); api.tennisView.wallHit(b.x); }
      if (b.vy > 0 && previousY <= paddleY - 20 && b.y >= paddleY - 20 && Math.abs(b.x - x) < 77) {
        const offset = clamp((b.x - x) / 65, -1, 1);
        b.y = paddleY - 20;
        const speed = Math.min(345, 248 + hits * 7);
        b.vx = offset * speed * .74;
        b.vy = -Math.sqrt(speed * speed - b.vx * b.vx);
        api.tennisView.swing();
        hits++;
        api.stat('hits', '回球', hits);
        api.burst(b.x, b.y, C.green, 5);
        api.say(`接住了，本轮回球 ${hits} 次。`);
      }
      trail.push({ x: b.x, y: b.y });
      if (trail.length > 7) trail.shift();
      if (b.y > H + 14) {
        misses++; b = null; trail = []; waiting = true;
        if (misses >= 5) api.finish(`5 个球玩完了，共回球 ${hits} 次。随时可以再玩一轮。`);
        else api.pause(`小球落地了。本轮回球 ${hits} 次；按继续发出第 ${served + 1} 个球。`);
      }
    },
    draw(ctx) {
      if (api.tennisView.draw({paddleX:x,ball:b || {x,y:paddleY-28},trail,zones:false})) return;
      ctx.fillStyle = '#e1e9d8'; ctx.fillRect(0, 0, W, H);
      box(ctx, 23, 25, W - 46, H - 50, 23, '#a8bda0');
      line(ctx, [[45, 403], [45, 83], [595, 83], [595, 403], [45, 403]], '#e9f0df', 3);
      line(ctx, [[46, 244], [594, 244]], '#d5e2cd', 2);
      line(ctx, [[320, 244], [320, 403]], '#d5e2cd', 2);
      box(ctx, 31, 39, 578, 30, 8, '#e1d3b6');
      for (let i = 0; i < 9; i++) line(ctx, [[55 + i * 66, 40], [55 + i * 66, 67]], '#c5b998', 2);
      trail.forEach((p, i) => { ctx.globalAlpha = i / trail.length * .25; circle(ctx, p.x, p.y, 9, C.cream); });
      ctx.globalAlpha = 1;
      ellipse(ctx, x, paddleY + 14, 66, 8, '#8fa687');
      box(ctx, x - 65, paddleY - 8, 130, 16, 8, C.cream);
      box(ctx, x - 36, paddleY - 7, 72, 14, 6, C.clay);
      const p = b || { x, y: paddleY - 28 };
      circle(ctx, p.x, p.y, 11, '#f2eabb');
      line(ctx, [[p.x - 5, p.y - 7], [p.x - 2, p.y], [p.x - 5, p.y + 7]], C.white, 1.5);
    },
  };
}

function target(api) {
  let targets, state, selected;
  const challenge = api.difficulty !== 'easy';
  const colors = [C.green, C.clay, '#83a7ad', '#b5a273'];
  let sequence, next, selection;
  const pickers = [];
  if (challenge) {
    const panel = element('section', 'arcade-challenge');
    panel.setAttribute('aria-label', '打靶顺序和当前选择');
    sequence = element('ol', 'arcade-sequence arcade-target-sequence');
    sequence.setAttribute('aria-label', '依次命中这些图形和号码');
    next = element('p', 'arcade-challenge-next');
    selection = element('p', 'arcade-tool-note');
    const picker = element('div', 'arcade-target-picker');
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', '手动选择目标，不消耗弹药');
    TARGET_MARKS.forEach(mark => {
      const button = api.button(picker, `${mark.symbol} ${mark.label}`, () => chooseId(mark.id), false, () => api.running);
      pickers.push(button);
    });
    panel.append(element('p', 'arcade-challenge-heading', '先看顺序，再决定这一发'), sequence, next, selection, picker,
      element('p', 'arcade-tool-note', '选择不耗弹；错序或打空耗一发。虚线圈是你的选择，不会自动跟随正确答案。'));
    api.tools.append(panel);
  }
  function make(index, initial = false) {
    return { x: initial ? [137, 460, 226, 494][index] : random(70, 570),
      y: initial ? [112, 112, 296, 294][index] : random(68, 362),
      vx: random(23, 43) * (index % 2 ? -1 : 1), vy: random(-25, 25), r: 31 + index % 2 * 4 };
  }
  function refresh() {
    api.stat('hits', challenge ? '顺序进度' : '命中', `${state.progress} / ${state.goal}`);
    api.stat('shots', '点射', state.shots);
    if (!challenge) return;
    api.stat('ammo', '剩余弹药', state.ammo);
    sequence.replaceChildren(...state.sequence.map((id, index) => {
      const mark = TARGET_MARKS[id];
      const done = index < state.progress;
      const current = index === state.progress && state.status === 'playing';
      const token = element('li', done ? 'is-complete' : current ? 'is-current' : '');
      token.append(element('span', 'arcade-sequence-symbol', `${done ? '✓ ' : ''}${mark.symbol}`),
        element('span', '', `${mark.id + 1}号${mark.name}`));
      if (current) token.setAttribute('aria-current', 'step');
      return token;
    }));
    writeText(next, state.status === 'won' ? '顺序完成，每一发都有了去处。'
      : state.status === 'lost' ? `弹药用完了，完成 ${state.progress} / ${state.goal} 步。可以重新开始。`
        : `第 ${state.progress + 1} 步，需要：${TARGET_MARKS[state.sequence[state.progress]].label}`);
    writeText(selection, `你选中的是：${TARGET_MARKS[selected].label}。按点射或空格，只会打这个目标。`);
    pickers.forEach((button, index) => button.setAttribute('aria-pressed', String(index === selected)));
  }
  function chooseId(id) {
    selected = id;
    if (challenge) refresh();
    api.say(`已选择${challenge ? TARGET_MARKS[selected].label : ` ${selected + 1} 号圆环`}。按点射按钮或空格。`);
    api.canvas.focus({preventScroll: true});
  }
  function choose(direction = 1) {
    chooseId((selected + direction + 4) % 4);
  }
  function applyShot(hitId, point) {
    if (!api.running) return;
    const result = recordTargetShot(state, hitId);
    if (!result.accepted) return;
    api.mark();
    if (hitId !== null) selected = hitId;
    if (result.outcome === 'correct') {
      api.burst(point.x, point.y, colors[hitId], 16);
      targets[hitId] = make(hitId);
      api.say(challenge ? `顺序正确，已完成 ${state.progress} 步，还剩 ${state.ammo} 发。`
        : `点中了 ${hitId + 1} 号圆环！本轮命中 ${state.progress} 次。`);
    } else if (result.outcome === 'wrong') {
      api.burst(point.x, point.y, C.sand, 4);
      api.say(`这是${TARGET_MARKS[hitId].label}，这一发需要${TARGET_MARKS[result.expected].label}。顺序未推进，还剩 ${state.ammo} 发。`);
    } else {
      api.burst(point.x, point.y, C.sand, 5);
      api.say(challenge ? `这一发没有命中，顺序未推进，还剩 ${state.ammo} 发。` : '这一点落在圆环旁边了，再试一下。');
    }
    refresh();
    if (state.status === 'won') api.finish(challenge
      ? `顺序完成！${state.goal} 步都按约定点亮了，还剩 ${state.ammo} 发。可以重新挑战。`
      : `这一轮的 12 次命中收好了，共点射 ${state.shots} 次。`, challenge ? 'won' : null);
    if (state.status === 'lost') {
      const reason = result.outcome === 'wrong'
        ? `最后一发打中${TARGET_MARKS[hitId].label}，需要的是${TARGET_MARKS[result.expected].label}，所以不计分。`
        : result.outcome === 'miss' ? '最后一发没有命中，所以不计分。' : '最后一发顺序正确，但序列尚未完成。';
      api.finish(`${reason}弹药用完了，本轮完成 ${state.progress} / ${state.goal} 步。可以重新开始。`, 'lost');
    }
  }
  function shoot(point) {
    // Pointer shots resolve the actual nearby target, never the sequence's answer.
    const found = targets.map((target, id) => ({ target, id, distance: distance(target, point) }))
      .filter(item => item.distance < Math.max(item.target.r + 7, api.touchRadius))
      .sort((a, b) => a.distance - b.distance)[0];
    applyShot(found?.id ?? null, point);
  }
  function shootSelected() {
    // Keyboard assistance aims at the explicit selection; selection never advances.
    applyShot(selected, targets[selected]);
  }
  api.button(api.actions, '换个目标', () => choose(), false, () => api.running);
  api.action('点射选中目标', shootSelected);
  return {
    reset() {
      state = createTargetChallenge(api.difficulty);
      selected = 0;
      targets = Array.from({ length: 4 }, (_, i) => make(i, true));
      refresh();
      if (!challenge) api.stat('time', '活动时间', '0 秒');
    },
    action: shootSelected,
    pointer(type, p) { if (type === 'down') shoot(p); },
    key(key, repeat) {
      if (!repeat && (key === 'ArrowLeft' || key === 'ArrowRight')) choose(key === 'ArrowLeft' ? -1 : 1);
    },
    step(dt) {
      for (const t of targets) {
        t.x += t.vx * dt; t.y += t.vy * dt;
        if (t.x < 56 || t.x > W - 56) { t.x = clamp(t.x, 56, W - 56); t.vx *= -1; }
        if (t.y < 57 || t.y > H - 57) { t.y = clamp(t.y, 57, H - 57); t.vy *= -1; }
      }
      if (!challenge) api.stat('time', '活动时间', `${Math.floor(api.elapsed)} 秒`);
    },
    draw(ctx) {
      ctx.fillStyle = '#f3f1e5'; ctx.fillRect(0, 0, W, H);
      ellipse(ctx, 60, 340, 210, 145, '#e9eddf');
      ellipse(ctx, 591, 27, 200, 160, '#ede4d0');
      for (let x = 24; x < W; x += 40) for (let y = 24; y < H; y += 40) circle(ctx, x, y, 1.1, '#d8ddce');
      targets.forEach((t, i) => {
        ellipse(ctx, t.x + 3, t.y + t.r + 12, t.r * .7, 5, '#dedecd');
        circle(ctx, t.x, t.y, t.r + 7, C.white);
        circle(ctx, t.x, t.y, t.r, colors[i]);
        circle(ctx, t.x, t.y, t.r - 8, '#f7f5e9');
        if (challenge) {
          circle(ctx, t.x, t.y, 22, colors[i]);
          ctx.beginPath();
          if (i === 0) {
            ctx.moveTo(t.x, t.y - 19); ctx.lineTo(t.x + 10, t.y - 2); ctx.lineTo(t.x - 10, t.y - 2); ctx.closePath();
          } else if (i === 1) {
            ctx.rect(t.x - 8, t.y - 18, 16, 16);
          } else if (i === 2) {
            ctx.arc(t.x, t.y - 10, 8, 0, TAU);
          } else {
            ctx.moveTo(t.x, t.y - 20); ctx.lineTo(t.x + 9, t.y - 10);
            ctx.lineTo(t.x, t.y); ctx.lineTo(t.x - 9, t.y - 10); ctx.closePath();
          }
          ctx.strokeStyle = C.white; ctx.lineWidth = 2.2; ctx.stroke();
          text(ctx, String(i + 1), t.x, t.y + 12, 16, C.white);
        } else {
          circle(ctx, t.x, t.y, 16, colors[i]);
          text(ctx, String(i + 1), t.x, t.y + 1, 23, C.white);
        }
        if (selected === i) {
          ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 15, 0, TAU);
          ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8; ctx.stroke(); ctx.setLineDash([]);
        }
      });
    },
  };
}

function dodge(api) {
  let x, targetX, shapes, spawned, cleared, avoided, bumped, spawnClock, blink;
  const playerY = 373;
  function move(amount) { targetX = clamp(targetX + amount, 35, W - 35); }
  function spawn() {
    shapes.push({ x: random(32, W - 32), y: -28, r: random(15, 23), speed: random(75, 116),
      angle: random(0, TAU), type: spawned % 3, color: [C.clay, C.blue, C.sand][spawned % 3] });
    spawned++;
  }
  api.steer(move);
  return {
    reset() {
      x = 320; targetX = 320; shapes = []; spawned = 0; cleared = 0;
      avoided = 0; bumped = 0; spawnClock = 0; blink = 0;
      api.stat('avoided', '躲开', 0);
      api.stat('bumps', '轻轻碰到', 0);
      api.stat('cleared', '已经过', '0 / 24');
    },
    start() { if (!spawned) spawn(); api.mark(); },
    pointer(type, p) {
      if (Math.abs(p.x - targetX) > 2) api.mark();
      targetX = clamp(p.x, 35, W - 35);
    },
    key(key) { if (key === 'ArrowLeft' || key === 'ArrowRight') api.mark(); },
    step(dt) {
      if (api.axis()) move(api.axis() * 320 * dt);
      x = mix(x, targetX, Math.min(1, dt * 18));
      blink = Math.max(0, blink - dt);
      spawnClock += dt;
      if (spawnClock > .9 && spawned < 24) { spawnClock = 0; spawn(); }
      for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i];
        s.y += s.speed * dt; s.angle += dt * .55;
        const collision = Math.abs(s.x - x) < s.r + 19 && Math.abs(s.y - playerY) < s.r + 22;
        if (collision || s.y > H + s.r) {
          shapes.splice(i, 1); cleared++;
          if (collision) {
            bumped++; blink = .45;
            api.burst(x, playerY - 5, s.color, 7);
            api.say(`轻轻碰到了第 ${bumped} 次，继续挪一挪就好。`);
          } else avoided++;
          api.stat('avoided', '躲开', avoided);
          api.stat('bumps', '轻轻碰到', bumped);
          api.stat('cleared', '已经过', `${cleared} / 24`);
        }
      }
      if (cleared >= 24) api.finish(`24 个形状都经过了，躲开 ${avoided} 个，轻轻碰到 ${bumped} 个。`);
    },
    draw(ctx) {
      ctx.fillStyle = '#f2f1e5'; ctx.fillRect(0, 0, W, H);
      for (let i = 1; i < 5; i++) line(ctx, [[i * 128, 0], [i * 128, H]], '#e7e9dc', 1);
      box(ctx, 13, 345, 614, 76, 27, '#e0e8d5');
      shapes.forEach(s => {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.angle);
        if (s.type === 0) circle(ctx, 0, 0, s.r, s.color);
        else if (s.type === 1) box(ctx, -s.r, -s.r, s.r * 2, s.r * 2, 7, s.color);
        else ellipse(ctx, 0, 0, s.r, s.r * .7, s.color);
        ctx.restore();
      });
      ellipse(ctx, x, 409, 27, 6, '#bccbb0');
      box(ctx, x - 24, playerY - 29, 48, 57, 22, blink ? '#ebd1b3' : C.cream);
      circle(ctx, x - 25, playerY + 6, 9, C.sand);
      circle(ctx, x + 25, playerY + 6, 9, C.sand);
      circle(ctx, x - 8, playerY - 7, 2.6, C.ink);
      circle(ctx, x + 8, playerY - 7, 2.6, C.ink);
      line(ctx, [[x - 4, playerY + 4], [x, playerY + 7], [x + 4, playerY + 4]], C.ink, 1.8);
      box(ctx, x - 24, playerY + 13, 48, 8, 4, C.green);
      box(ctx, x + 10, playerY + 15, 10, 19, 3, C.green);
    },
  };
}

function prank(api) {
  let nickname = '', pies, hats, launches, hat, cream, effect;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const field = element('label', 'arcade-field arcade-nickname');
  const input = element('input', 'arcade-input');
  input.type = 'text';
  input.maxLength = 24;
  input.placeholder = '比如：那个让人无语的家伙';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', '纸偶的本地昵称，最多24个字');
  field.append(element('span', 'arcade-field-label', '纸偶昵称'), input);
  api.tools.append(field, element('p', 'arcade-tool-note', '昵称仅在当前页面内存里。角色始终是虚构纸偶，不使用真人图片。'));
  api.listen(input, 'input', () => {
    nickname = input.value;
    api.invalidate();
  });
  const name = () => nickname.trim() || '无名小纸偶';
  function act(kind) {
    if (!api.running || effect) return;
    api.mark();
    effect = { kind, t: 0, splatted: false };
    if (kind === 'pie') {
      pies++; api.stat('pies', '奶油派', pies);
      api.say(`给「${name()}」送上一只奶油派……`);
    } else if (kind === 'hat') {
      hat = (hat + 1) % 3; hats++;
      api.stat('hats', '换帽子', hats);
      api.say(`「${name()}」换上了${['小花帽', '条纹派对帽', '长耳朵帽'][hat]}。`);
    } else {
      launches++; api.stat('launches', '弹簧起飞', launches);
      api.say(`弹簧准备好了，让「${name()}」轻轻飞一圈。`);
    }
  }
  api.action('丢奶油派', () => act('pie'), () => !effect, true);
  api.action('换顶滑稽帽', () => act('hat'), () => !effect, true);
  api.action('弹簧起飞', () => act('spring'), () => !effect, true);
  return {
    reset() {
      pies = 0; hats = 0; launches = 0; hat = -1; cream = false; effect = null;
      api.stat('pies', '奶油派', 0);
      api.stat('hats', '换帽子', 0);
      api.stat('launches', '弹簧起飞', 0);
    },
    animating: () => Boolean(effect),
    action() { act('pie'); },
    pointer(type) { if (type === 'down') act('pie'); },
    step(dt) {
      if (!effect) return;
      effect.t += dt;
      if (effect.kind === 'pie' && effect.t > .52 && !effect.splatted) {
        effect.splatted = true;
        cream = true;
        api.burst(320, 197, C.white, 22);
        api.say('噗叽。奶油糊了一脸，纸偶还在眨眼睛。');
      }
      const duration = effect.kind === 'spring' ? 1.8 : effect.kind === 'pie' ? 1.25 : .65;
      if (effect.t >= duration) {
        if (effect.kind === 'spring') api.say('啪嗒，纸偶稳稳落回来了。下一场小意外由你决定。');
        effect = null;
      }
    },
    draw(ctx) {
      backdrop(ctx, '#eae1ce');
      ellipse(ctx, 320, 386, 119, 16, '#d7ccb4');
      box(ctx, 224, 378, 192, 13, 6, '#bdc4ae');
      const spring = effect?.kind === 'spring';
      const t = effect?.t || 0;
      const flight = spring ? Math.sin(clamp((t - .18) / 1.5, 0, 1) * Math.PI) : 0;
      const lift = flight * (reduced ? 55 : 110);
      const squash = spring && t < .18 ? 1 - t * .55 : 1;
      const zigzag = [];
      for (let i = 0; i < 9; i++) zigzag.push([320 + (i % 2 ? 22 : -22), 365 - i * (4 + lift * .07)]);
      line(ctx, zigzag, '#919d87', 4);
      ctx.save();
      ctx.translate(320, 330 - lift);
      ctx.rotate(spring && !reduced ? flight * .22 : 0);
      ctx.scale(1 / squash, squash);
      line(ctx, [[-26, -4], [-38, 35]], '#9fae8a', 15);
      line(ctx, [[26, -4], [38, 35]], '#9fae8a', 15);
      line(ctx, [[-42, -95], [-68, -51]], C.sand, 15);
      line(ctx, [[42, -95], [68, -51]], C.sand, 15);
      box(ctx, -45, -111, 90, 112, 29, '#b7c99f');
      line(ctx, [[0, -96], [0, -24]], '#8fa87a', 2);
      for (let i = 0; i < 3; i++) circle(ctx, 7, -81 + i * 20, 3, C.cream);
      circle(ctx, 0, -143, 48, '#e8d2ac');
      circle(ctx, -46, -143, 8, '#e8d2ac');
      circle(ctx, 46, -143, 8, '#e8d2ac');
      const eyeY = -149;
      ellipse(ctx, -16, eyeY, 3, 5, C.ink);
      ellipse(ctx, 16, eyeY, 3, 5, C.ink);
      line(ctx, [[-24, -163], [-10, -161]], C.ink, 2);
      line(ctx, [[10, -166], [24, -163]], C.ink, 2);
      line(ctx, [[-10, -125], [0, -120], [10, -125]], C.ink, 2.5);
      circle(ctx, -30, -133, 7, C.pink); circle(ctx, 30, -133, 7, C.pink);
      if (cream) {
        for (let i = 0; i < 8; i++) {
          const a = i * TAU / 8;
          circle(ctx, Math.cos(a) * 26, -142 + Math.sin(a) * 26, 16, C.white);
        }
        circle(ctx, 0, -142, 30, C.white);
        circle(ctx, -15, -149, 4, C.ink); circle(ctx, 15, -149, 4, C.ink);
        circle(ctx, 5, -171, 7, C.clay);
      }
      const bounce = effect?.kind === 'hat' ? -Math.sin(Math.min(1, t / .65) * Math.PI) * 12 : 0;
      ctx.save(); ctx.translate(0, bounce);
      if (hat === 0) {
        ellipse(ctx, 0, -182, 62, 11, C.sand);
        box(ctx, -34, -218, 68, 36, 10, '#dcc394');
        for (let i = 0; i < 5; i++) circle(ctx, 20 + Math.cos(i * TAU / 5) * 9, -203 + Math.sin(i * TAU / 5) * 9, 6, C.white);
        circle(ctx, 20, -203, 5, C.clay);
      } else if (hat === 1) {
        ctx.beginPath(); ctx.moveTo(-44, -180); ctx.lineTo(0, -258); ctx.lineTo(44, -180);
        ctx.closePath(); ctx.fillStyle = C.blue; ctx.fill();
        line(ctx, [[-28, -199], [28, -199]], C.white, 6);
        line(ctx, [[-15, -223], [15, -223]], C.white, 5);
        circle(ctx, 0, -258, 10, C.sand);
      } else if (hat === 2) {
        ellipse(ctx, -26, -224, 12, 41, C.pink);
        ellipse(ctx, 26, -224, 12, 41, C.pink);
        box(ctx, -47, -194, 94, 28, 13, C.pink);
      }
      ctx.restore();
      ctx.restore();
      if (effect?.kind === 'pie' && t < .52) {
        const p = t / .52;
        const px = mix(75, 320, p), py = mix(349, 186, p) - Math.sin(p * Math.PI) * 58;
        ellipse(ctx, px, py + 7, 32, 9, C.clay);
        ellipse(ctx, px, py, 32, 14, C.white);
        circle(ctx, px, py - 11, 6, C.pink);
      }
      let label = name();
      ctx.font = '500 23px system-ui, sans-serif';
      while (ctx.measureText(label).width > 300 && label.length > 1) label = label.slice(0, -1);
      if (label !== name()) label += '…';
      const labelWidth = Math.min(348, ctx.measureText(label).width + 30);
      box(ctx, 320 - labelWidth / 2, 398, labelWidth, 33, 12, C.white);
      text(ctx, label, 320, 415, 23);
    },
  };
}
