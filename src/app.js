import { icon, artwork, escapeHTML } from './ui.js';
import { categories, exercises, mountExercise } from './exercises.js';
import { summarizeSession, resolveSessionRoute } from './session.js';
import { assessmentGames, isAssessment, scoreAssessment, selectedStories } from './assessment-data.js';
import { mountAssessment } from './assessment.js';
import { neonArt } from './neon-art.js';

const main = document.querySelector('#main');
history.scrollRestoration = 'manual';
const assessment = document.querySelector('#assessment-dialog');
const info = document.querySelector('#info-dialog');
const state = { before: null, after: null, need: '', assessmentTheme: 'harbor', played: new Set(), notes: [], results: [], complete: false };
let cleanupExercise = () => {}, cleanupAssessment = () => {}, cleanupLobby = () => {}, currentExercise = null, filter = 'all', toastTimer, renderVersion=0;

const categoryById = id => categories.find(c => c.id === id) || categories[0];
const exerciseById = id => exercises.find(e => e.id === id);
const navItems = [{ id:'home',label:'此刻 · 首页',icon:'home' }, { id:'spaces',label:'放松空间',icon:'grid' }, { id:'arcade',label:'动作游乐',icon:'ball' }, { id:'corner',label:'我的角落',icon:'leaf' }];
const neededCategory = () => ({'释放一下':'express','安静下来':'body','换换脑子':'attention','理清问题':'action','有人陪伴':'support','陪自己一会儿':'accept','理清思绪':'reframe'})[state.need] || state.before?.recommendation.category || null;
const gameName = id => assessmentGames.find(g => g.id === id)?.name || '';
const reactionText = value => value === null ? '暂无正确反应' : `${value} ms`;
function syncLobbyPlayback() {
  main.querySelector('.lobby-render')?.dispatchEvent(new Event(assessment.open||info.open?'songjian:pause':'songjian:resume'));
}

function toast(text) {
  clearTimeout(toastTimer);
  const el = document.querySelector('#toast'); el.textContent = text; el.classList.add('visible');
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3400);
}
function refreshHeader(view) {
  document.body.classList.add('guided','neon');
  document.body.dataset.view=view;
  const step = ['checkin','home'].includes(view) ? 1 : ['checkin-result','choose','spaces','arcade'].includes(view) ? 2 : view === 'exercise' ? 3 : 4;
  document.querySelector('.topbar-greeting').innerHTML = `<a class="mini-brand" href="#home" aria-label="Relaxs游戏大厅"><i class="brand-pause" aria-hidden="true"><b></b><b></b></i>Relaxs<span>ARCADE</span></a>`;
  let progress = document.querySelector('.flow-progress');
  if (!progress) { progress = document.createElement('div'); progress.className = 'flow-progress'; document.querySelector('.topbar').insertBefore(progress, document.querySelector('.topbar-right')); }
  progress.innerHTML = ['开场挑战','选择空间','开始放松','回合记录'].map((text,i)=>`<span class="${i+1 === step ? 'current' : i+1 < step ? 'done' : ''}" ${i+1===step?'aria-current="step"':''}><i>${i+1 < step ? '✓' : `0${i+1}`}</i>${text}</span>`).join('');
  document.querySelector('#navigation').innerHTML = navItems.map(n => `<a href="#${n.id}" class="nav-item ${(view === n.id || (view === 'exercise' && n.id === 'spaces')) ? 'active' : ''}" ${view === n.id ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span>${n.id === 'spaces' ? `<span class="nav-count">${exercises.length}</span>` : ''}</a>`).join('');
  document.querySelector('#session-button').innerHTML = `${icon('sun')}<span>${state.complete ? '本次已记录' : isAssessment(state.before) ? `任务得分 ${state.before.score} / 100` : '还未完成探索'}</span>`;
  document.querySelector('#session-button').hidden = !isAssessment(state.before);
}
function checkinPage() {
  return `<section class="arcade-entry">
    <section class="neon-hero">
      <div class="lobby-copy"><span class="lobby-eyebrow"><i></i> A LITTLE SPACE. A NEW HIGH.</span><h1>给大脑，<br><em>放个假。</em><span class="hero-asterisk" aria-hidden="true">✳</span></h1><p>把外面的噪音调小。<br>在这里，找回自己的节奏。</p>
        <div class="lobby-actions"><button class="button primary" data-assessment="harbor">开启我的回合${icon('arrow')}</button><button class="button secondary" data-action="pick-challenge">选择开场挑战${icon('grid')}</button></div>
        <div class="lobby-meta"><span>${icon('clock')}约 2 分钟开场</span><i></i><span>按自己的节奏玩</span></div>
        <button class="text-button lobby-game-link" data-action="pick-game">直接选小游戏 · 篮球 / 网球 / 射击${icon('arrow')}</button>
      </div>
      <div class="lobby-visual"><span class="lobby-watermark" aria-hidden="true">PAUSE</span><canvas class="lobby-render" aria-hidden="true"></canvas><div class="lobby-fallback" aria-hidden="true">${neonArt('creature')}</div><div class="lobby-float-tag"><span>＋</span> LESS NOISE. MORE PLAY.</div><span class="lobby-orbit-stamp" aria-hidden="true">✳</span><div class="lobby-scene-label"><span><i></i> YOUR NEXT GOOD MOMENT</span><b>READY WHEN YOU ARE.</b></div></div>
      <span class="hero-corner-index" aria-hidden="true">SJ—001 / PLAY MODE</span>
    </section>
    <div class="lobby-ticker" aria-hidden="true"><span>PRESS PAUSE</span><b>✳</b><span>PLAY YOUR WAY</span><b>✳</b><span>FEEL A LITTLE LIGHTER</span><b>✳</b><span>PRESS PAUSE</span></div>
    <section class="entry-challenges" id="entry-challenges" tabindex="-1"><div class="entry-section-heading"><div><span class="eyebrow">LEVEL 01 / CHECK IN</span><h2>先来一场，开场挑战。</h2></div><span class="section-counter">PICK YOUR FIRST LEVEL <b>↙</b></span></div>
      <div class="neon-challenge-grid">${assessmentGames.map((g,i)=>`<button class="neon-challenge-card challenge-${g.id}" data-assessment="${g.id}"><div class="neon-challenge-cover">${neonArt(g.id)}<span class="challenge-number">0${i+1}</span></div><div class="neon-challenge-copy"><span class="challenge-mode">${g.id==='harbor'?'FOCUS / 抗干扰':'SIGNAL / 停走判断'}</span><h3>${g.name}</h3><p>${g.id==='harbor'?'听见杂音，也认得自己的方向。':'点亮该留住的，放过该路过的。'}</p><span class="challenge-meta">3 幕剧情 <i>＋</i> 操作小挑战${icon('arrow')}</span></div></button>`).join('')}</div>
    </section>
    <section class="entry-quick-games" id="quick-games" tabindex="-1" aria-labelledby="quick-games-title">
      <div class="entry-section-heading"><div><span class="eyebrow">QUICK PLAY / 直接试玩</span><h2 id="quick-games-title">选你的主场，直接开玩。</h2><p>六款小游戏，点开就能玩。完整体验可从上面的开场挑战开始。</p></div><span class="section-counter">06 GAMES <b>↙</b></span></div>
      <div class="activity-grid library-grid">${exercises.filter(ex=>ex.arcade).map(ex=>`<a class="activity-card" href="${ex.id==='basketball'?'/hoops.html':`/arcade.html?game=${ex.id}`}">
        <div class="card-art neon-cover cover-${ex.id}">${neonArt(ex.id)}<span class="card-tag">${ex.label}</span><span class="card-play-dot" aria-hidden="true">${icon('play')}</span></div>
        <div class="card-description"><div class="card-heading"><h3>${ex.name}</h3>${icon('arrow')}</div><p>${ex.subtitle}</p><div class="card-meta"><span>直接试玩</span><span>开始游戏${icon('arrow')}</span></div></div>
      </a>`).join('')}</div>
    </section>
    <div class="entry-bottom-note"><p>${icon('info')}开场得分记录操作表现，情境选择帮助推荐放松方向。</p><button class="text-button" data-action="about">关于这个体验${icon('arrow')}</button></div>
  </section>`;
}
function taskStats(result) {
  return `<div class="task-stat-grid"><div><strong>${result.correct}<small> / ${result.total}</small></strong><span>正确判断</span></div><div><strong>${reactionText(result.medianRt)}</strong><span>正确反应中位时间</span></div><div><strong>${result.missed}</strong><span>漏接信号</span></div>${result.gameId==='lantern'?`<div><strong>${result.falseAlarms}</strong><span>误点云朵</span></div>`:''}</div>`;
}
function storyFeedback(result) {
  return `<div class="story-feedback">${selectedStories(result.choices).map(s=>`<div><span>${escapeHTML(s.title)}</span><p>${escapeHTML(s.selected.label)}</p></div>`).join('')}</div>`;
}
function scoreExplanation(result) {
  return `<details class="score-explanation"><summary>分数怎么算？</summary><p>${result.gameId==='harbor'?'18 次判断中，正确比例 × 100，四舍五入。':'点亮星灯的正确率与放过云朵的正确率，各占得分的一半。'}练习不计分，反应快慢不加分。情境选择不参与任务评分，也不代表心理诊断。</p></details>`;
}
function checkinResultPage() {
  const result = state.before, rec = result.recommendation;
  return `<section class="checkin-result assessment-report"><span class="eyebrow">YOUR FIRST LITTLE DISCOVERY</span><h1>你的第一站，已抵达。</h1><p>${gameName(result.gameId)} · 已完成 3 个情境与 18 次判断</p><div class="task-report-score"><div><span>本轮任务得分</span><strong>${result.score}<small> / 100</small></strong></div>${taskStats(result)}</div>${scoreExplanation(result)}<h2 class="report-section-title">故事里，你留下了这些线索</h2>${storyFeedback(result)}<div class="recommendation-card"><span>${icon('leaf')}根据你的情境选择</span><h2>${escapeHTML(rec.title)}</h2><p>${escapeHTML(rec.reason)}</p><button class="button primary" data-choose="${rec.category}">从这个方向开始${icon('arrow')}</button></div><div class="checkin-result-actions"><button class="text-button" data-go="choose">我想自己选一种方式${icon('arrow')}</button><button class="text-button" data-go="rest">暂时不需要，就停在这里</button></div></section>`;
}
function choosePage() {
  const titles = { express:['想释放一下','把憋着的东西，找个地方表达。'],body:['想安静下来','跟着呼吸，让身体慢一点。'],attention:['想换换脑子','把注意力交给一个小小的游戏。'],accept:['想陪自己一会儿','静心、慈心，允许念头来来去去。'],reframe:['想理清思绪','换个角度，看看事实和猜测。'],action:['想解决一件事','把大问题，拆成下一小步。'],support:['想找一点支持','把感受和需要，好好说出来。']};
  const zoneArt={express:'release',body:'breath',attention:'target',accept:'zen',reframe:'reframe',action:'action',support:'support'};
  return `<section class="choose-page"><span class="eyebrow">LEVEL 02 / CHOOSE YOUR SPACE</span><h1>这一局，想怎么放松？</h1><p>选一个有感觉的空间。想换频道，随时都可以。</p><div class="choose-grid">${categories.filter(c=>c.id!=='all').map((c,i)=>`<button class="choose-card choose-${i}" data-choose="${c.id}"><div class="zone-cover">${neonArt(zoneArt[c.id])}<span>ZONE / 0${i+1}</span></div><div class="zone-copy"><span class="zone-category">${icon(c.icon)}${c.name}</span><h2>${titles[c.id][0]}</h2><p>${titles[c.id][1]}</p></div><span class="zone-enter">${icon('arrow')}</span></button>`).join('')}<button class="choose-card choose-arcade" data-go="arcade"><div class="zone-cover">${neonArt('basketball')}<span>BONUS / 08</span></div><div class="zone-copy"><span class="zone-category">${icon('ball')}动作游乐</span><h2>想直接玩一局</h2><p>球场、射击、躲避，找到你的手感。</p></div><span class="zone-enter">${icon('arrow')}</span></button></div><div class="choose-bottom"><button class="text-button" data-go="checkin-result">${icon('back')}回看刚才的记录</button><button class="text-button" data-go="rest">今天先到这里</button></div></section>`;
}
function restPage() {
  return `<section class="rest-page"><span class="eyebrow">ENOUGH FOR THIS MOMENT</span>${artwork('hero')}<h1>那就，先停在这里。</h1><p>你完成了「${gameName(state.before.gameId)}」，任务得分 ${state.before.score} / 100。<br>照顾自己，也可以只是留了一点时间。</p><div class="button-row"><button class="button primary" data-go="choose">我想再找一种方式${icon('arrow')}</button><button class="button secondary" data-action="new">重新认识一个此刻${icon('sun')}</button></div></section>`;
}
function navigate(route) {
  if (location.hash === `#${route}`) render(); else location.hash = route;
}
function activityCard(exercise, small = false) {
  const rec = neededCategory() === exercise.category;
  return `<button class="activity-card ${small ? 'compact' : ''}" data-exercise="${exercise.id}">
    <div class="card-art neon-cover cover-${exercise.id}">${neonArt(exercise.id)}<span class="card-tag">${rec ? 'FOR YOU / 适合此刻' : exercise.label}</span>${exercise.id === 'creature' ? '<span class="demo-dot">本地演示</span>' : ''}<span class="card-play-dot" aria-hidden="true">${icon('play')}</span></div>
    <div class="card-description"><div class="card-heading"><h3>${exercise.name}</h3>${icon('arrow')}</div><p>${exercise.subtitle}</p><div class="card-meta"><span>${icon(categoryById(exercise.category).icon)}${categoryById(exercise.category).name}</span><span>${icon('clock')}${exercise.time}</span></div></div></button>`;
}
function filters() {
  return `<div class="category-filters" role="group" aria-label="按放松类别筛选">${categories.map(c => `<button data-filter="${c.id}" class="filter-chip ${filter === c.id ? 'selected' : ''}" aria-pressed="${filter === c.id}">${icon(c.icon)}${c.name}</button>`).join('')}</div>`;
}
function spacesPage() {
  let list = filter === 'all' ? exercises : exercises.filter(e=>e.category === filter);
  const cat = categoryById(filter);
  return `<button class="text-button guided-back" data-go="choose">${icon('back')}换一种放松方式</button><div class="page-heading"><span class="eyebrow">YOUR SPACE TO UNWIND</span><div class="page-title-row"><div><h1>${filter === 'all' ? '找到此刻，舒服的方式。' : `${cat.name}，从一个小体验开始。`}</h1><p>七种方向，${exercises.length} 个小体验。可以换着玩，也可以随时结束。</p></div><button class="button secondary" data-action="finish">${icon('sun')}看看此刻的变化</button></div></div>${isAssessment(state.before) && !state.complete ? `<div class="session-ribbon">${icon('sun')}<span>开始时的任务得分 <strong>${state.before.score} / 100</strong>${state.need ? ` · 你想${escapeHTML(state.need)}` : ''}</span><span>已体验 ${state.played.size} 个空间</span></div>` : ''}
    ${filters()}${filter !== 'all' ? `<div class="category-intro">${icon(cat.icon)}<span>${cat.feeling}</span><small>${list.length} 个体验</small></div>` : ''}
    <div class="activity-grid library-grid">${list.map(e=>activityCard(e)).join('')}</div>
    <div class="library-note">${icon('info')}这些小游戏是自助方法的交互尝试，具体体验因人而异。选一个你愿意试的，就可以。</div>`;
}
function arcadePage() {
  return `<button class="text-button guided-back" data-go="choose">${icon('back')}换一种放松方式</button><div class="page-heading"><span class="eyebrow">A LITTLE PLAYGROUND</span><div class="page-title-row"><div><h1>动一动，换个频道。</h1><p>球场、靶场、躲避和恶搞。来一局，或者只玩一下。</p></div><button class="button secondary" data-action="finish">${icon('sun')}看看此刻的变化</button></div></div><div class="arcade-intro">${icon('ball')}<span>结束后再做同一种入口挑战，看看操作表现和情境选择的变化。</span><small>6 个小游戏</small></div><div class="activity-grid library-grid">${exercises.filter(e=>e.arcade).map(e=>activityCard(e)).join('')}</div><p class="library-note">${icon('info')}这些是屏幕里的动作娱乐体验，没有必须完成的目标，可以随时暂停或离开。</p>`;
}
function cornerPage() {
  return `<div class="page-heading"><span class="eyebrow">A SMALL COLLECTION OF YOU</span><h1>我的角落</h1><p>收好这一次的感受，和你愿意带走的小小发现。</p><div class="button-row"><button class="button secondary" data-go="${state.complete?'result':'checkin-result'}">回看本次记录${icon('back')}</button><button class="button primary" data-action="new">开启新的体验${icon('arrow')}</button></div></div>
    <div class="corner-grid"><section class="corner-panel"><div class="section-heading"><h2>此刻的记录</h2><span class="pill">仅本次页面</span></div>${state.results.length ? state.results.map((r,i)=>`<article class="result-mini"><span class="eyebrow">体验记录 ${i+1}</span><h3>${escapeHTML(r.title)}</h3><div class="mini-scores"><span>${r.before.score}</span>${icon('arrow')}<span>${r.after.score}</span><small>/ 100 · 任务得分</small></div><p>${escapeHTML(r.detail)}</p><small>体验了 ${r.played.length} 个空间</small></article>`).join('') : `<div class="empty-state">${artwork('cloud')}<h3>还没有留下前后记录。</h3><p>玩一会儿后，可以回来看看此刻有什么变化。</p><button class="button secondary" data-go="spaces">去放松空间${icon('arrow')}</button></div>`}</section>
    <section class="corner-panel"><div class="section-heading"><h2>带走的小发现</h2><span class="pill">${state.notes.length} 张卡片</span></div>${state.notes.length ? state.notes.map(n=>`<article class="saved-note"><span>${icon('leaf')}</span><h3>${escapeHTML(n.title)}</h3><p>${escapeHTML(n.text)}</p></article>`).join('') : `<div class="empty-state">${artwork('action')}<h3>给下一小步，留个位置。</h3><p>在行动石阶或换一扇窗里，留下你自己的想法。</p><button class="button secondary" data-exercise="action">找到我的下一步${icon('arrow')}</button></div>`}</section></div><p class="library-note">${icon('info')}记录保留在当前页面内存里，不会上传；刷新或关闭页面后会清空。</p>`;
}
function exercisePage(id) {
  const ex = exerciseById(id);
  if(!ex){navigate('spaces');return;}
  currentExercise = id;
  main.innerHTML = `<div class="exercise-header"><button class="text-button" data-go="spaces">${icon('back')}回到放松空间</button><span class="exercise-category">${icon(categoryById(ex.category).icon)}${categoryById(ex.category).name}<span> / </span>${ex.name}</span><button class="button secondary small" data-action="finish">结束，看看此刻${icon('arrow')}</button></div>
    <section class="play-surface" id="play-surface"></section>
    <div class="exercise-footer"><div>${icon('leaf')}<span>${ex.hint}</span></div><span>${ex.mechanism}</span></div>
    <section class="next-experience"><div><h3>还想换一种方式？</h3><p>继续体验，或者就停在这里。</p></div><div>${exercises.filter(e=>e.id!==id).slice(id==='breath'?2:0,id==='breath'?5:3).map(e=>`<button class="next-chip" data-exercise="${e.id}">${icon(categoryById(e.category).icon)}${e.name}${icon('arrow')}</button>`).join('')}</div></section>`;
  cleanupExercise = mountExercise(id, document.querySelector('#play-surface'), {
    toast, markPlayed(exId) {
      if(state.complete) newSession(false);
      state.played.add(exId);
    },
    saveNote(title,text) { state.notes.push({title,text}); },
  });
}
function resultPage() {
  const result = state.results.at(-1);
  if(!result)return `<div class="empty-state">${artwork('hero')}<h1>先看看此刻的自己。</h1><button class="button primary" data-action="start">开始探索${icon('arrow')}</button></div>`;
  const beforeStories = selectedStories(result.before.choices), afterStories = selectedStories(result.after.choices);
  return `<section class="result-page assessment-report"><span class="eyebrow">A LITTLE TIME, TWO SMALL DISCOVERIES</span><h1>${escapeHTML(result.title)}</h1><p class="result-lead">${gameName(result.before.gameId)} · 两轮相同规则，新的一组信号</p><div class="score-comparison"><div><span>开始时 · 任务得分</span><strong>${result.before.score}<small>/ 100</small></strong></div><span class="score-arrow">${icon('arrow')}</span><div><span>此刻 · 任务得分</span><strong>${result.after.score}<small>/ 100</small></strong></div></div><p class="result-detail">${escapeHTML(result.detail)}</p>
    <div class="comparison-table-wrap"><table class="comparison-table"><thead><tr><th>操作记录</th><th>开始时</th><th>此刻</th></tr></thead><tbody><tr><th>正确判断</th><td>${result.before.correct} / 18</td><td>${result.after.correct} / 18</td></tr><tr><th>正确反应中位时间</th><td>${reactionText(result.before.medianRt)}</td><td>${reactionText(result.after.medianRt)}</td></tr><tr><th>漏接信号</th><td>${result.before.missed}</td><td>${result.after.missed}</td></tr>${result.before.gameId==='lantern'?`<tr><th>误点云朵</th><td>${result.before.falseAlarms}</td><td>${result.after.falseAlarms}</td></tr>`:''}</tbody></table></div>
    ${scoreExplanation(result.after)}<p class="micro-copy">熟悉玩法、疲劳和输入设备都可能影响表现。这是一次体验记录，不能据此验证减压效果。</p>
    <h2 class="report-section-title">故事中的选择，有没有变化？</h2><div class="story-comparison">${afterStories.map((s,i)=>`<article><span>${s.title}</span><p><small>开始时</small>${escapeHTML(beforeStories[i].selected.label)}</p><p><small>此刻</small>${escapeHTML(s.selected.label)}</p><strong>${s.selected.id===beforeStories[i].selected.id?'这次选择相同':'这次选择不同'}</strong></article>`).join('')}</div>
    <div class="played-summary"><span>你给自己留过的空间</span><div>${result.played.length ? result.played.map(id=>`<span>${icon(categoryById(exerciseById(id).category).icon)}${exerciseById(id).name}</span>`).join('') : '<span>一次安静的自我觉察</span>'}</div></div>
    <div class="result-actions"><button class="button primary" data-go="corner">收好这次记录${icon('leaf')}</button><button class="button secondary" data-action="new">开启新的体验${icon('arrow')}</button></div><div class="result-bottom-art">${artwork('hero')}</div></section>`;
}
function newSession(announce = true) {
  state.before = null; state.after = null; state.need = ''; state.played.clear(); state.complete = false;
  if(announce)toast('新的一次体验开始了，之前的记录仍在「我的角落」。');
  refreshHeader(location.hash.includes('play/') ? 'exercise' : location.hash.slice(1));
}
function render() {
  const version=++renderVersion;
  closeAssessment(); cleanupExercise(); cleanupExercise=()=>{}; cleanupLobby();cleanupLobby=()=>{};currentExercise=null;
  const route = resolveSessionRoute(location.hash.slice(1), state);
  if (location.hash !== `#${route}`) history.replaceState(null, '', `#${route}`);
  const view=route.startsWith('play/') ? 'exercise' : route;
  refreshHeader(view);
  if(view==='exercise')exercisePage(route.slice(5));
  else main.innerHTML = view==='spaces' ? spacesPage() : view==='arcade' ? arcadePage() : view==='corner' ? cornerPage() : view==='result' ? resultPage() : view==='checkin-result' ? checkinResultPage() : view==='choose' ? choosePage() : view==='rest' ? restPage() : checkinPage();
  const lobbyCanvas=main.querySelector('.lobby-render');
  if(lobbyCanvas)import('./neon-lobby-scene.js').then(({mountNeonLobby})=>{
    if(version!==renderVersion||!lobbyCanvas.isConnected)return;
    cleanupLobby=mountNeonLobby(lobbyCanvas);
    lobbyCanvas.parentElement.classList.add(lobbyCanvas.dataset.unavailable?'is-unavailable':'is-ready');
    syncLobbyPlayback();
  }).catch(()=>{if(lobbyCanvas.isConnected)lobbyCanvas.parentElement.classList.add('is-unavailable');});
  window.scrollTo({top:0,behavior:'instant'});
}
function closeAssessment() {
  cleanupAssessment(); cleanupAssessment = () => {};
  if(assessment.open) assessment.close();
}
function openAssessment(mode='before') {
  if(mode==='before' && isAssessment(state.before) && !state.complete) { navigate('checkin-result'); return; }
  if(mode==='after' && state.complete) { navigate('result'); return; }
  if(mode==='after' && !isAssessment(state.before)) { navigate('checkin'); return; }
  if(mode==='after') document.querySelector('#play-surface')?.dispatchEvent(new Event('songjian:pause'));
  closeAssessment();
  assessment.className = 'story-assessment';
  cleanupAssessment = mountAssessment(assessment, {
    mode, gameId:mode==='after' ? state.before.gameId : state.assessmentTheme,
    onCancel:closeAssessment,
    onComplete(payload) {
      const result = scoreAssessment(payload);
      if(!result || (mode==='after' && result.gameId!==state.before?.gameId)) { toast('这一轮记录不完整或任务不一致，请重新开始挑战。'); closeAssessment(); return; }
      if(mode==='before') {
        if(state.complete)newSession(false);
        state.before=result; state.need=''; filter='all';
        closeAssessment(); navigate('checkin-result');
      } else {
        state.after=result;
        state.results.push({...summarizeSession(state.before,result),before:state.before,after:result,played:[...state.played]});
        state.complete=true;
        closeAssessment(); navigate('result');
      }
    },
  });
  assessment.showModal();
  syncLobbyPlayback();
}
assessment.addEventListener('cancel', e => { e.preventDefault(); closeAssessment(); });
assessment.addEventListener('close',syncLobbyPlayback);
info.addEventListener('close',syncLobbyPlayback);
function about() {
  info.innerHTML=`<button class="dialog-close icon-button" aria-label="关闭说明">${icon('close')}</button><span class="eyebrow">ABOUT THIS LITTLE SPACE</span><h2 id="info-title">一份可以亲手玩的想法。</h2><p>先走过三个生活情境，再完成一场操作挑战。情境选择帮助推荐放松方向；真实的判断记录用于计算任务得分。结束后，再用同一种任务作一次对照。</p><div class="about-features"><p>${icon('grid')}七个方向，${exercises.length} 个小游戏，包含六个动作游乐体验。</p><p>${icon('box')}造物工坊目前用本地 Three.js 模型演示，尚未接入 Tripo API；不会把演示结果说成 AI 生成。</p><p>${icon('sun')}任务得分表示这轮游戏的判断表现，不是压力值。情境也是自我表达，不是隐藏的心理诊断。重复练习、疲劳和操作设备都可能影响前后表现。</p><p>${icon('leaf')}静心与慈心是可选练习，不要求信仰，不承诺疗效。</p><p>${icon('heart')}没有登录或后端。输入和记录仅留在当前页面，刷新后清空。</p></div><p class="micro-copy">本原型用于体验与讨论；小游戏效果尚未经过产品验证。</p><button class="button primary" id="about-close">知道了，慢慢来${icon('leaf')}</button>`;
  info.showModal();syncLobbyPlayback();info.querySelector('.dialog-close').onclick=()=>info.close();info.querySelector('#about-close').onclick=()=>info.close();
}
main.addEventListener('click',e=>{
  const btn=e.target.closest('[data-go],[data-action],[data-exercise],[data-filter],[data-assessment],[data-choose]');
  if(!btn)return;
  if(btn.dataset.go)navigate(btn.dataset.go);
  if(btn.dataset.assessment){state.assessmentTheme=btn.dataset.assessment;openAssessment('before');}
  if(btn.dataset.choose){filter=btn.dataset.choose;state.need=({express:'释放一下',body:'安静下来',attention:'换换脑子',accept:'陪自己一会儿',reframe:'理清思绪',action:'理清问题',support:'有人陪伴'})[filter] || '';navigate('spaces');}
  if(btn.dataset.exercise)navigate(`play/${btn.dataset.exercise}`);
  if(btn.dataset.filter){filter=btn.dataset.filter;if(location.hash==='#spaces')render();else navigate('spaces');}
  switch(btn.dataset.action){
    case 'start': if(state.complete)newSession(false);navigate('checkin');break;
    case 'continue':navigate('spaces');break;
    case 'finish':openAssessment('after');break;
    case 'new':newSession();navigate('checkin');break;
    case 'about':about();break;
    case 'pick-game':
    case 'pick-challenge': {
      const choices=document.querySelector(btn.dataset.action==='pick-game'?'#quick-games':'#entry-challenges');
      choices?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
      choices?.focus({preventScroll:true});break;
    }
  }
});
document.querySelector('#about-button').innerHTML=`${icon('info')}<span>关于这个原型</span>`;
document.querySelector('#about-button').onclick=about;
document.querySelector('#top-about').onclick=about;
document.querySelector('.skip-link').onclick = e => {
  e.preventDefault();
  main.focus({ preventScroll: true });
  main.scrollIntoView({ block: 'start' });
};
document.querySelector('#session-button').onclick=()=>{
  if(state.complete)navigate('result');
  else if(isAssessment(state.before)){navigate('checkin-result');}
  else openAssessment('before');
};
window.addEventListener('hashchange',render);
window.addEventListener('pagehide',()=>{renderVersion++;cleanupExercise();cleanupAssessment();cleanupLobby();});
window.addEventListener('pageshow',event=>{if(event.persisted)render();});
render();
