import { icon, artwork } from './ui.js';

export const categories = [
  { id: 'all', name: '全部空间', icon: 'grid' },
  { id: 'express', name: '表达释放', icon: 'wind', feeling: '有些情绪，想放出来' },
  { id: 'body', name: '身体舒缓', icon: 'cloud', feeling: '想让绷紧的身体松一松' },
  { id: 'attention', name: '注意转换', icon: 'spark', feeling: '想给脑袋换个频道' },
  { id: 'accept', name: '接纳觉察', icon: 'leaf', feeling: '想安静地陪自己一会儿' },
  { id: 'reframe', name: '认知调整', icon: 'eye', feeling: '想换个角度看一看' },
  { id: 'action', name: '行动解题', icon: 'steps', feeling: '想让一件事向前一点' },
  { id: 'support', name: '连接支持', icon: 'heart', feeling: '想把需要，好好说出来' },
];

export const exercises = [
  { id: 'release', category: 'express', name: '烦恼回收站', subtitle: '写下来，揉一揉，先放在这里。', time: '随心玩', art: 'release', tint: 'peach', label: '表达一下', mechanism: '书写与象征性处理', hint: '给没说出口的话，找一个暂时安放的地方。' },
  { id: 'breath', category: 'body', name: '潮汐呼吸', subtitle: '随着一次起伏，找回自己的节奏。', time: '约 1–3 分钟', art: 'breath', tint: 'blue', label: '慢下来', mechanism: '温和的呼吸觉察', hint: '呼吸保持舒服，不必深吸，也不需要屏息。' },
  { id: 'cloud', category: 'accept', name: '念头云朵', subtitle: '念头来了，也可以让它待一会儿。', time: '随心玩', art: 'cloud', tint: 'sage', label: '静心', mechanism: '觉察与认知解离', hint: '观察一个念头，并不需要立刻相信它或赶走它。' },
  { id: 'action', category: 'action', name: '行动石阶', subtitle: '很大的事情，从很小的一步开始。', time: '约 3 分钟', art: 'action', tint: 'sand', label: '往前一点', mechanism: '问题拆解与行动计划', hint: '选一件能影响的事，为它找到一个足够小的开始。' },
  { id: 'creature', category: 'express', name: '情绪造物工坊', subtitle: '把感受变成物件，随心改造它。', time: '自由创作', art: 'creature', tint: 'lime', label: '3D 造物', mechanism: '创作与情绪表达', hint: '美化、丑化、变奇怪，都由你决定它的意义。' },
  { id: 'match', category: 'attention', name: '叶间寻踪', subtitle: '翻开一片叶子，专注眼前的小发现。', time: '不计时', art: 'match', tint: 'sage', label: '换换脑子', mechanism: '注意转换', hint: '找到相同的图案，没有倒计时，也不需要争第一。' },
  { id: 'zen', category: 'accept', name: '慈心花园', subtitle: '留一句温柔的话，给自己或在意的人。', time: '约 1–2 分钟', art: 'zen', tint: 'peach', label: '静心 · 慈心', mechanism: '慈心练习的互动尝试', hint: '祝愿可以很小，也可以用你自己的话。' },
  { id: 'reframe', category: 'reframe', name: '换一扇窗', subtitle: '把事实和猜测，轻轻分开放。', time: '约 3 分钟', art: 'reframe', tint: 'sand', label: '理清思绪', mechanism: '认知重评', hint: '找一个更贴近事实的理解，不必强迫自己乐观。' },
  { id: 'support', category: 'support', name: '一封可以寄出的信', subtitle: '把你的感受和需要，整理成一句话。', time: '约 2 分钟', art: 'support', tint: 'peach', label: '找点支持', mechanism: '求助表达与沟通练习', hint: '先把话说清楚，是否发出由你决定。' },
  { id: 'basketball', category: 'attention', name: '落日投篮场', subtitle: '向上拖动，松手投出，接住一声入网。', time: '十球挑战 / 自由练习', art: 'basketball', tint: 'peach', label: '3D 互动 · 篮球', mechanism: '球类互动与注意转换', hint: '拖动篮球决定方向和力度，碰框也会回弹。', arcade: true },
  { id: 'football', category: 'attention', name: '绿茵点球', subtitle: '找个角度，把球送进球门。', time: '随心玩', art: 'football', tint: 'sage', label: '动作游乐 · 足球', mechanism: '球类互动与注意转换', hint: '进球和扑救都是游戏的一部分，可以随时停下。', arcade: true },
  { id: 'tennis', category: 'attention', name: '午后网球', subtitle: '接住来球，找到一来一回的节奏。', time: '随心玩', art: 'tennis', tint: 'lime', label: '动作游乐 · 网球', mechanism: '球类互动与注意转换', hint: '跟着小球移动，按自己的节奏玩一会儿。', arcade: true },
  { id: 'target', category: 'attention', name: '泡泡靶场', subtitle: '瞄准移动的泡泡，轻轻击中它。', time: '随心玩', art: 'target', tint: 'blue', label: '动作游乐 · 射击', mechanism: '瞄准互动与注意转换', hint: '这是抽象靶场，命中数不用于推断你的心理状态。', arcade: true },
  { id: 'dodge', category: 'attention', name: '轻巧躲一躲', subtitle: '左右挪一挪，给自己让出一点空间。', time: '随心玩', art: 'dodge', tint: 'sand', label: '动作游乐 · 躲避', mechanism: '反应互动与注意转换', hint: '碰到障碍也没关系，暂停和重新开始都由你决定。', arcade: true },
  { id: 'prank', category: 'express', name: '烦人角色恶搞屋', subtitle: '给卡通靶偶起个名字，来点滑稽的。', time: '随心玩', art: 'prank', tint: 'peach', label: '动作游乐 · 恶搞', mechanism: '卡通角色的表达性娱乐', hint: '名字和角色只留在当前小游戏里，外观和得分不代表减压效果。', arcade: true },
];

const button = (id, text, cls = 'primary', image = 'arrow') => `<button id="${id}" class="button ${cls}">${text}${icon(image)}</button>`;
const field = (id, label, placeholder, rows = 3) => `<label class="field-label" for="${id}">${label}</label><textarea id="${id}" rows="${rows}" maxlength="500" placeholder="${placeholder}"></textarea>`;

export function mountExercise(id, container, hooks) {
  const controller = new AbortController();
  const cleanups = [];
  const timeouts = new Set();
  let disposed = false;
  const listen = (selector, event, fn) => container.querySelector(selector)?.addEventListener(event, fn, { signal: controller.signal });
  const later = (fn, ms) => { const timer = setTimeout(() => { timeouts.delete(timer); if (!disposed) fn(); }, ms); timeouts.add(timer); return timer; };
  const mark = () => hooks.markPlayed(id);
  const note = (title, text) => { hooks.saveNote(title, text); hooks.toast('已放进「我的角落」，仅保留在本次页面中'); };

  if (id==='basketball') {
    container.innerHTML='<p class="muted">正在点亮落日球场……</p>';
    import('./hoops.js').then(({mountHoops})=>{
      if(disposed)return;
      container.replaceChildren();
      cleanups.push(mountHoops(container,{markPlayed:mark,onExit:()=>{location.hash='arcade';}}));
    }).catch(()=>{if(!disposed)container.innerHTML='<p class="muted">球场暂时没能打开，请返回后重试。</p>';});
  } else if (exercises.find(e => e.id === id)?.arcade) {
    container.innerHTML = '<p class="muted">正在准备这片小小的游乐场……</p>';
    import('./arcade.js').then(({ mountArcade }) => {
      if (!disposed) {
        container.replaceChildren();
        cleanups.push(mountArcade(id, container, { markPlayed: mark, toast: hooks.toast }));
      }
    }).catch(() => {
      if (!disposed) container.innerHTML = '<p class="muted">这个小游戏暂时没能打开，可以返回放松空间选择其他体验。</p>';
    });
  }

  if (id === 'release') {
    container.innerHTML = `<div class="exercise-split">
      <section class="exercise-form"><span class="eyebrow">LET IT OUT</span><h2>这句话，先交给纸张。</h2><p class="muted">不需要措辞漂亮，也不用解释清楚。</p>
      ${field('worry-text', '此刻，你想放下些什么？', '比如：今天被临时改了三次需求，真的有点烦……', 5)}
      <div class="button-row">${button('crumple', '揉成纸团', 'secondary', 'box')}${button('release-paper', '放进回收站')}</div>
      <p class="micro-copy">文字不会上传。离开这个小游戏后，这张纸就不再保留。</p></section>
      <div class="release-stage"><div class="release-paper" id="paper-preview"><span>有些话<br>可以先写在这里。</span><i></i><i></i><i></i></div><div class="recycle-bin"><div class="bin-mouth"></div><div class="bin-body">${icon('leaf')}<span>暂时安放处</span></div></div><p class="stage-caption" id="release-caption">把这一件事，暂时放在这里。</p></div></div>`;
    let crumpled = false;
    const paper = container.querySelector('#paper-preview');
    listen('#worry-text', 'input', e => {
      paper.querySelector('span').textContent = e.target.value.slice(0, 70) || '有些话，可以先写在这里。';
    });
    listen('#crumple', 'click', () => {
      if (!container.querySelector('#worry-text').value.trim()) return hooks.toast('先写下一句你想表达的话。');
      crumpled = !crumpled; paper.classList.toggle('crumpled', crumpled); mark();
    });
    listen('#release-paper', 'click', () => {
      const input = container.querySelector('#worry-text');
      if (!input.value.trim()) return hooks.toast('先写下一句你想表达的话。');
      const btn = container.querySelector('#release-paper'); btn.disabled = true;
      paper.classList.add('releasing'); mark();
      later(() => {
        input.value = ''; paper.className = 'release-paper'; crumpled = false;
        paper.querySelector('span').textContent = '还有想说的话，也可以继续写。';
        container.querySelector('#release-caption').textContent = '这张纸已经放下了。此刻，感觉如何？';
        btn.disabled = false;
      }, 1100);
    });
  }

  if (id === 'breath') {
    container.innerHTML = `<div class="breathing-exercise"><div class="breath-copy"><span class="eyebrow">ONE BREATH AT A TIME</span><h2>跟着潮汐，慢慢来。</h2><p class="muted">以舒服的呼吸为准，可以睁着眼睛，随时停下。</p></div>
      <div class="breath-orbit"><div class="orbit-ring ring-one"></div><div class="orbit-ring ring-two"></div><div class="breath-sphere">${icon('wind')}<strong id="breath-phase">准备好了再开始</strong><span id="breath-sub">一个呼吸，也是一点空间</span></div></div>
      <div class="breath-controls">${button('breath-toggle', '开始呼吸', 'primary', 'play')}<label class="select-label">节奏 <select id="breath-pace" aria-label="呼吸节奏"><option value="4">舒缓 · 每段 4 秒</option><option value="3">轻一点 · 每段 3 秒</option><option value="5">慢一点 · 每段 5 秒</option></select></label></div>
      <p class="micro-copy">只是温和的节奏提示，不需要用力深吸或跟满节拍。</p></div>`;
    let running = false, start = 0, raf = 0, lastPhase = '';
    const sphere = container.querySelector('.breath-sphere');
    function frame(time) {
      if (!running || disposed) return;
      const seconds = Number(container.querySelector('#breath-pace').value);
      const phase = ((time - start) / 1000) % (seconds * 2);
      const inhale = phase < seconds;
      const progress = inhale ? phase / seconds : 1 - (phase - seconds) / seconds;
      sphere.style.transform = `scale(${0.88 + Math.sin(progress * Math.PI / 2) * .19})`;
      const text = inhale ? '轻轻吸气' : '慢慢呼气';
      if (lastPhase !== text) { container.querySelector('#breath-phase').textContent = text; lastPhase = text; }
      raf = requestAnimationFrame(frame);
    }
    listen('#breath-toggle', 'click', () => {
      running = !running;
      container.querySelector('#breath-toggle').innerHTML = running ? `暂停一下${icon('pause')}` : `继续呼吸${icon('play')}`;
      if (running) {
        start = performance.now(); lastPhase = ''; mark(); raf = requestAnimationFrame(frame);
        container.querySelector('#breath-sub').textContent = '以你舒服的节奏为准';
      } else {
        cancelAnimationFrame(raf);
        container.querySelector('#breath-phase').textContent = '可以停在这里';
      }
    });
    listen('#breath-pace', 'change', () => { start = performance.now(); });
    container.addEventListener('songjian:pause', () => {
      running = false; cancelAnimationFrame(raf);
      container.querySelector('#breath-toggle').innerHTML = `继续呼吸${icon('play')}`;
      container.querySelector('#breath-phase').textContent = '可以停在这里';
    }, { signal: controller.signal });
    cleanups.push(() => { running = false; cancelAnimationFrame(raf); });
  }

  if (id === 'match') {
    container.innerHTML = `<div class="matching-exercise"><div class="exercise-title"><div><span class="eyebrow">A SMALL DISCOVERY</span><h2>找到叶子背后的小伙伴。</h2><p class="muted">慢一点也没关系，这里没有倒计时。</p></div><button class="button secondary" id="shuffle-cards">${icon('reset')}重新铺开</button></div><div class="memory-grid"></div><p class="matching-status" role="status">随便翻开一张，看看藏着什么。</p></div>`;
    let open = [], matched = 0, locked = false, round = 0;
    function deal() {
      round++; open = []; matched = 0; locked = false;
      const values = ['leaf', 'sun', 'moon', 'flower', 'heart', 'cloud'].flatMap(v => [v, v]);
      for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; }
      container.querySelector('.memory-grid').innerHTML = values.map((v, i) => `<button class="memory-card" data-symbol="${v}" aria-label="翻开第 ${i + 1} 张卡片"><span class="card-back">${icon('leaf')}</span><span class="card-face">${icon(v)}</span></button>`).join('');
      container.querySelector('.matching-status').textContent = '随便翻开一张，看看藏着什么。';
    }
    deal();
    listen('#shuffle-cards', 'click', deal);
    listen('.memory-grid', 'click', e => {
      const card = e.target.closest('.memory-card');
      if (!card || locked || card.classList.contains('flipped') || card.classList.contains('matched')) return;
      mark(); card.classList.add('flipped'); card.setAttribute('aria-label', `图案：${({leaf:'叶子',sun:'太阳',moon:'月亮',flower:'花朵',heart:'爱心',cloud:'云朵'})[card.dataset.symbol]}`); open.push(card);
      if (open.length === 2) {
        if (open[0].dataset.symbol === open[1].dataset.symbol) {
          open.forEach(c => { c.classList.add('matched'); c.disabled = true; }); matched++; open = [];
          container.querySelector('.matching-status').textContent = matched === 6 ? '都找到彼此了。刚才的你，感觉怎么样？' : `发现了 ${matched} / 6 对小伙伴，按自己的节奏继续。`;
        } else {
          locked = true; const currentRound = round;
          later(() => { if (currentRound !== round) return; open.forEach(c => { c.classList.remove('flipped'); c.setAttribute('aria-label', '翻开这张卡片'); }); open = []; locked = false; }, 1100);
        }
      }
    });
  }

  if (id === 'cloud') {
    container.innerHTML = `<div class="cloud-exercise"><div class="exercise-title"><div><span class="eyebrow">THOUGHTS COME AND GO</span><h2>让念头，有一朵自己的云。</h2><p class="muted">可以看着它飘，也可以轻点送它离开。不必清空天空。</p></div></div><form id="cloud-form" class="inline-form"><input id="cloud-text" maxlength="45" aria-label="此刻的一个念头" placeholder="我注意到，我正在想……">${button('add-cloud','放到云朵上')}</form><div class="cloud-sky" aria-label="念头的天空"><div class="sky-sun"></div><div class="sky-hill hill-back"></div><div class="sky-hill"></div><span class="sky-caption">念头只是经过，你可以站在这里看一看。</span></div></div>`;
    let count = 0;
    listen('#cloud-form', 'submit', e => {
      e.preventDefault();
      const input = container.querySelector('#cloud-text');
      if (!input.value.trim()) return hooks.toast('给这朵云写上一个念头吧。');
      if (container.querySelectorAll('.thought-cloud').length >= 5) return hooks.toast('天空里已有五朵云，可以先看看它们，或轻点送走一朵。');
      const cloud = document.createElement('button'); cloud.className = 'thought-cloud';
      cloud.style.left = `${7 + (count % 3) * 24}%`; cloud.style.top = `${16 + (count % 2) * 30}%`;
      cloud.style.animationDelay = `${-(count % 4)}s`; cloud.textContent = input.value.trim();
      cloud.setAttribute('aria-label', `送走念头：${input.value.trim()}`);
      cloud.addEventListener('click', () => { cloud.classList.add('departing'); later(() => cloud.remove(), 850); }, { signal: controller.signal });
      container.querySelector('.cloud-sky').append(cloud); count++; input.value = ''; mark();
    });
  }

  if (id === 'zen') {
    container.innerHTML = `<div class="exercise-split zen-exercise"><section class="exercise-form"><span class="eyebrow">A LITTLE KINDNESS</span><h2>留一句温柔，给此刻。</h2><p class="muted">借鉴慈心练习的互动花园，按自己的意愿体验。</p><div class="kindness-choices">
      ${['愿我少一点苛责自己。', '愿我有一点休息的空间。', '愿我在意的人，今天安稳。'].map((t, i) => `<button class="choice-card ${i === 0 ? 'selected' : ''}" data-wish="${t}">${icon('flower')}<span>${t}</span></button>`).join('')}</div>
      <label class="field-label" for="own-wish">也可以，用你自己的话</label><input id="own-wish" maxlength="80" placeholder="愿……"><div class="button-row">${button('water-flower','浇一点水','primary','flower')}</div><p class="micro-copy">不用勉强自己产生某种感受，可以随时停下。</p></section><div class="kindness-stage"><div class="flower-art">${artwork('zen')}</div><div class="water-drops"></div><p id="wish-caption">愿我少一点苛责自己。</p><span id="growth-caption">先给自己，一点点温柔。</span></div></div>`;
    let growth = 0, wish = '愿我少一点苛责自己。';
    listen('.kindness-choices', 'click', e => {
      const btn = e.target.closest('[data-wish]'); if (!btn) return;
      container.querySelectorAll('[data-wish]').forEach(b => b.classList.toggle('selected', b === btn));
      wish = btn.dataset.wish; container.querySelector('#own-wish').value = ''; container.querySelector('#wish-caption').textContent = wish;
    });
    listen('#own-wish', 'input', e => { if (e.target.value.trim()) { wish = e.target.value.trim(); container.querySelector('#wish-caption').textContent = wish; } });
    listen('#water-flower', 'click', () => {
      growth = Math.min(4, growth + 1); mark();
      const stage = container.querySelector('.kindness-stage');
      stage.classList.remove('watering'); void stage.offsetWidth; stage.classList.add('watering');
      container.querySelector('.flower-art').style.transform = `scale(${.65 + growth * .085})`;
      container.querySelector('#growth-caption').textContent = growth >= 4 ? '把这份祝愿留在心里，也可以就到这里。' : '让这一点温柔，慢慢长出来。';
    });
  }

  if (id === 'reframe') {
    container.innerHTML = `<div class="reflection-exercise"><span class="eyebrow">ANOTHER WAY TO SEE</span><h2>同一件事，可以有不止一扇窗。</h2><p class="muted">写下你的理解。这里不会替你判断对错。</p><div class="reflection-grid">
      <section class="reflection-card"><span class="step-number">01</span>${field('fact','发生了什么事实？','只写可以观察到的事，例如：我的消息还没有收到回复。',5)}</section>
      <section class="reflection-card"><span class="step-number">02</span>${field('thought','我脑中的解释是？','例如：我在想，是不是对方不愿意理我。',5)}</section>
      <section class="reflection-card"><span class="step-number">03</span>${field('alternative','还有其他可能吗？','例如：对方也可能正忙，我还不知道原因。',5)}</section></div>
      <div class="button-row">${button('save-reframe','留下这个新视角','primary','leaf')}</div><p class="micro-copy">目标是更贴近事实，不需要把每件事都想得积极。</p></div>`;
    listen('#save-reframe', 'click', () => {
      const values = ['fact','thought','alternative'].map(key => container.querySelector(`#${key}`).value.trim());
      if (values.some(v => !v)) return hooks.toast('三扇窗里，各写下一点内容吧。');
      mark(); note('一个新的视角', `事实：${values[0]}\n我的解释：${values[1]}\n其他可能：${values[2]}`);
    });
  }

  if (id === 'action') {
    container.innerHTML = `<div class="exercise-split"><section class="exercise-form"><span class="eyebrow">ONE SMALL STEP</span><h2>不用走完，只找下一阶。</h2>
      ${field('problem','现在卡住的一件事','例如：明天要汇报，但材料还没有整理好。',2)}
      <label class="field-label">这件事，有我能影响的部分吗？</label><div class="segmented"><button class="selected" data-control="yes">有一点可以做</button><button data-control="no">暂时无法控制</button></div>
      <div id="action-fields">${field('next-step','十分钟内，可以开始的一小步','例如：先把三项关键进展写到纸上。',2)}<label class="field-label" for="when-step">准备什么时候开始？</label><input id="when-step" maxlength="80" placeholder="例如：休息十分钟之后"></div>
      <div id="accept-fields" hidden><p class="gentle-note">暂时没有办法，也可以先安放它。写下一个之后回看的时间，或者此刻能照顾自己的小事。</p><input id="later-step" maxlength="180" aria-label="暂时安放的方式" placeholder="例如：明天下午再看一眼，现在先去吃饭。"></div>
      <div class="button-row">${button('save-action','留下我的下一步','primary','steps')}</div></section><div class="action-preview">${artwork('action')}<blockquote>很小的一步，<br>也算向前。</blockquote><p>不把所有烦恼，都变成新的待办。</p></div></div>`;
    let controllable = true;
    listen('.segmented','click',e => { const btn = e.target.closest('[data-control]'); if (!btn) return; controllable = btn.dataset.control === 'yes'; container.querySelectorAll('[data-control]').forEach(b=>b.classList.toggle('selected',b===btn)); container.querySelector('#action-fields').hidden = !controllable; container.querySelector('#accept-fields').hidden = controllable; });
    listen('#save-action','click',() => {
      const problem = container.querySelector('#problem').value.trim();
      const next = container.querySelector(controllable ? '#next-step' : '#later-step').value.trim();
      const when = controllable ? container.querySelector('#when-step').value.trim() : '';
      if (!problem || !next || (controllable && !when)) return hooks.toast(controllable ? '写下问题、下一步和开始时间，就可以留下这张卡片。' : '写下这件事，以及想怎么暂时安放它。');
      mark(); note(controllable ? '我的下一小步' : '暂时安放一件事', `这件事：${problem}\n${controllable ? '下一步' : '先这样安放'}：${next}${when ? `\n开始时间：${when}` : ''}`);
    });
  }

  if (id === 'support') {
    container.innerHTML = `<div class="exercise-split"><section class="exercise-form"><span class="eyebrow">YOU CAN ASK</span><h2>把需要，清楚地说出来。</h2><p class="muted">先在这里排练，是否发送由你决定。</p><label class="field-label" for="to-person">想对谁说？</label><input id="to-person" maxlength="40" placeholder="例如：朋友、同事、小林">
      ${field('my-feeling','发生了什么，我有什么感受？','例如：这周任务比较多，我有些疲惫。',3)}
      ${field('my-need','我希望得到什么具体帮助？','例如：你今晚能陪我聊十分钟吗？',3)}
      <div class="button-row">${button('make-letter','整理成一封短信','primary','message')}</div></section><section class="letter-preview"><div class="letter-stamp">${icon('leaf')}</div><span class="eyebrow">A NOTE FROM YOU</span><p id="letter-content" class="letter-content">有些需要，<br>值得被好好表达。</p><button class="button secondary" id="copy-letter" disabled>${icon('copy')}复制这段话</button><p class="micro-copy">这里只生成草稿，不会替你发送。</p></section></div>`;
    let text = '';
    listen('#make-letter','click',() => {
      const to = container.querySelector('#to-person').value.trim(), feeling = container.querySelector('#my-feeling').value.trim(), need = container.querySelector('#my-need').value.trim();
      if (!to || !feeling || !need) return hooks.toast('写下想对谁说、你的感受和具体需要。');
      text = `${to}，想和你说件事。\n\n${feeling}\n\n${need}\n\n如果现在不方便，也可以告诉我合适的时间。`;
      container.querySelector('#letter-content').textContent = text;
      container.querySelector('#copy-letter').disabled = false; mark();
    });
    listen('#copy-letter','click',async () => {
      try { await navigator.clipboard.writeText(text); if (!disposed) hooks.toast('已复制，由你决定要不要发送。'); }
      catch { if (!disposed) hooks.toast('浏览器未允许复制，可以选中信里的文字手动复制。'); }
    });
  }

  if (id === 'creature') {
    container.innerHTML = `<div class="workshop-layout"><div class="workshop-controls"><span class="eyebrow">MAKE FEELINGS TANGIBLE</span><h2>给感受，一个形状。</h2><p class="muted">挑几个词，或者写下一句自己的描述。</p><label class="field-label" for="creature-words">此刻的造型灵感</label><textarea id="creature-words" rows="2" maxlength="160" placeholder="例如：有点混乱的、毛线团一样的小怪兽">一只圆滚滚、毛茸茸的小怪兽</textarea><div class="word-chips">${['圆滚滚','毛线','刺刺的','云朵'].map(w=>`<button data-word="${w}">${w}</button>`).join('')}</div>${button('generate-creature','生成我的情绪物件','primary','spark')}<p class="micro-copy demo-label">本地 3D 演示 · Tripo 尚未连接</p>
      <div class="control-section"><span class="control-title">01 · 给它换个模样</span><div class="tool-grid"><button data-style="pretty">${icon('flower')}美化</button><button data-style="ugly">${icon('cloud')}丑化</button><button data-style="silly">${icon('spark')}恶搞</button></div><div class="swatches" aria-label="模型颜色">${['#a7bf8e','#d9af97','#b0bdcf','#d5be78','#aa9eba'].map((c,i)=>`<button style="--swatch:${c}" data-color="${c}" aria-label="颜色 ${['苔绿','桃粉','雾蓝','麦黄','浅紫'][i]}"></button>`).join('')}</div></div>
      <div class="control-section"><span class="control-title">02 · 随手玩一玩</span><div class="tool-grid"><button data-deform="squash">${icon('box')}压扁</button><button data-deform="stretch">${icon('wind')}拉长</button><button data-accessory="flower">${icon('flower')}戴朵花</button><button data-accessory="hat">${icon('spark')}戴帽子</button></div></div></div>
      <div class="workshop-stage"><div class="scene-label"><span class="status-dot"></span> 你的情绪物件 <span id="model-number">No. 001</span></div><div id="creature-canvas" role="group" aria-label="可旋转的情绪物件"></div><div class="scene-bottom"><span>拖动旋转 · 外观由你定义</span><div><button class="icon-button" id="reset-creature" aria-label="恢复模型原样">${icon('reset')}</button><button class="icon-button" id="save-creature" aria-label="保存模型图片">${icon('download')}</button></div></div><div class="scene-message">漂亮、奇怪、丑萌，都可以是你喜欢的样子。</div></div></div>`;
    let scene = null, version = 1;
    const ready = () => { if (!scene) { hooks.toast('3D 场景还在准备，请稍等。'); return false; } return true; };
    import('./scene.js').then(({createCreatureScene}) => {
      if (disposed) return;
      scene = createCreatureScene(container.querySelector('#creature-canvas'));
      scene.generate(container.querySelector('#creature-words').value);
    }).catch(() => {
      if (!disposed) container.querySelector('#creature-canvas').innerHTML = `<div class="scene-fallback">${artwork('creature')}<p>这个浏览器暂时无法打开 3D 场景。<br>可以返回体验其他放松小游戏。</p></div>`;
    });
    listen('.word-chips','click',e => { const btn=e.target.closest('[data-word]'); if(btn) container.querySelector('#creature-words').value = `一只${btn.dataset.word.replace(/的$/,'')}的情绪小怪兽`; });
    listen('#generate-creature','click',() => { if (!ready()) return; const words=container.querySelector('#creature-words').value.trim(); if(!words)return hooks.toast('先选几个词，或写一句造型描述。'); scene.generate(words); version++; container.querySelector('#model-number').textContent=`No. ${String(version).padStart(3,'0')}`; mark(); hooks.toast('你的本地演示物件生成了，试着改造一下。'); });
    listen('.workshop-controls','click',e => {
      const btn=e.target.closest('[data-style],[data-color],[data-deform],[data-accessory]'); if(!btn || !ready())return;
      if(btn.dataset.style)scene.style(btn.dataset.style);
      if(btn.dataset.color)scene.setColor(btn.dataset.color);
      if(btn.dataset.deform)scene.deform(btn.dataset.deform);
      if(btn.dataset.accessory)scene.accessory(btn.dataset.accessory);
      mark();
    });
    listen('#reset-creature','click',() => { if(ready()){scene.reset();hooks.toast('回到这个物件最初的样子。');} });
    listen('#save-creature','click',() => {
      if(!ready())return;
      try { const link=document.createElement('a');link.href=scene.snapshot();link.download='Relaxs-我的情绪物件.png';link.click();hooks.toast('已保存这张情绪物件图片。'); }
      catch {hooks.toast('这次图片保存没有完成，可以稍后再试。');}
    });
    cleanups.push(()=>scene?.dispose());
  }

  return () => { disposed = true; controller.abort(); timeouts.forEach(clearTimeout); cleanups.forEach(fn => fn()); };
}
