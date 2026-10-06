import {icon,escapeHTML as esc} from './ui.js';
import {methods,sources,methodById} from './care-data.js';
import {makeCareRecord,feedbackFor,personalRecords} from './care-state.js';
import {mountPractice} from './care-practices.js';

const main=document.querySelector('#main'),helpDialog=document.querySelector('#care-help-dialog'),leaveDialog=document.querySelector('#care-leave-dialog');
const state={records:[],last:null};
let cleanup=()=>{},activePractice=false,pendingRoute=null,currentRoute='',toastTimer;
const sourceLinks=ids=>ids.map(id=>`<a href="${sources[id].url}" target="_blank" rel="noopener noreferrer">${esc(sources[id].name)} ↗</a>`).join('');
const actionButton=(text,route,secondary=false)=>`<a class="care-button ${secondary?'secondary':''}" href="#${route}">${text}${icon('arrow')}</a>`;
const motif=kind=>`<div class="care-motif ${kind==='body'?'rings':kind==='mind'?'curves':'steps'}" aria-hidden="true"><i></i><i></i><i></i><b></b></div>`;
const saved=()=>personalRecords(state.records);
const practiceEvidence=method=>`<summary>这个练习的依据与边界</summary><p>${method.evidence}</p><p>${method.limit}</p><div class="care-source-links">${sourceLinks(method.sources)}</div>`;
function updatePracticeContext(id){
  const method=methodById(id);if(!method)return;
  currentRoute='practice/'+id;
  history.replaceState(null,'','#'+currentRoute);
  document.querySelector('.care-practice-header > span').textContent=`${method.label} / ${method.short}`;
  document.querySelector('#care-practice-mount').setAttribute('aria-label',method.short);
  document.querySelector('.care-practice-evidence').innerHTML=practiceEvidence(method);
  document.title=`${method.short} · Relaxs`;
}
function home(){
  return `<section class="care-welcome" aria-labelledby="welcome-title">
    <div class="care-still-life" aria-hidden="true"><span class="care-water-ring"></span><span class="care-water-ring second"></span><span class="care-pebble"></span><span class="care-pebble-shadow"></span></div>
    <div class="care-welcome-copy"><span class="care-eyebrow">A LITTLE PAUSE</span><h1 id="welcome-title">给自己，留点空白。</h1><p>不急着解决什么。先按自己的方式，歇一会儿。</p></div>
    <div class="care-entry-pair">
      <a class="care-entry care-entry-calm" href="#practice/settle"><span class="care-entry-icon">${icon('wind')}</span><span><strong>慢下来</strong><small>留意呼吸，停一小会儿</small></span>${icon('arrow')}</a>
      <a class="care-entry care-entry-play" href="./hoops.html"><span class="care-entry-icon">${icon('ball')}</span><span><strong>玩一会</strong><small>去落日球场，随手投几球</small></span>${icon('arrow')}</a>
    </div>
    <a class="care-organize-link" href="#organize">有件事放不下？<span>理一理 ${icon('arrow')}</span></a>
  </section>`;
}
function collection(kind){
  const calm=kind==='calm';
  const list=methods.filter(method=>calm?method.group==='body':method.group!=='body');
  return `<section class="care-collection"><a class="care-text-button care-back-link" href="#home">${icon('back')}首页</a>
    <div class="care-collection-intro"><span class="care-eyebrow">${calm?'A QUIETER MOMENT':'ONE THING AT A TIME'}</span><h1>${calm?'选一种舒服的方式。':'只理眼前这一件。'}</h1><p>${calm?'留意呼吸，或看看身边。按你的节奏来。':'从最贴近你的那一项开始，慢慢理清。'}</p></div>
    <div class="care-choice-list">${list.map(method=>`<a class="care-choice" href="#practice/${method.id}"><span class="care-choice-icon">${icon(method.icon)}</span><span class="care-choice-copy"><strong>${method.title}</strong><small>${method.intro}</small></span><span class="care-choice-time">${method.time}</span>${icon('arrow')}</a>`).join('')}</div>
    <p class="care-collection-note">${calm?'想换种心情？<a href="./hoops.html">去投几球 ↗</a>':'也可以暂时放下，<a href="#calm">先歇一会儿 ↗</a>'}</p>
  </section>`;
}
const calm=()=>collection('calm'),organize=()=>collection('organize');
function evidence(){
  return `<section class="care-page-intro"><span class="care-eyebrow">METHODS, WITH CONTEXT</span><h1>每个方法，都说清依据。</h1><p>方法本身有研究，不代表我们的几分钟交互已被验证有效。<br>这些是参考专业资料设计的日常自助练习，你可以选择、停止或寻求帮助。</p></section><div class="care-evidence-principles"><article><b>01</b><h2>技能，不是一次疗程</h2><p>NICE 推荐的 CBT 自助有结构和持续练习要求。短练习不等同于完整 CBT，也不保证人人有效。</p>${sourceLinks(['nice'])}</article><article><b>02</b><h2>当下感受，不是诊断</h2><p>这里不从游戏、反应速度或点击行为推断焦虑程度。不填写量表，也可以使用全部练习。</p></article><article><b>03</b><h2>也要改变压力来源</h2><p>工作量、可控性与支持同样重要。我们提供问题解决与协商工具，不能代替组织改善工作条件。</p>${sourceLinks(['work'])}</article></div>
  <div class="care-evidence-list">${methods.map(method=>`<article><div class="care-evidence-heading"><span class="care-tile-icon">${icon(method.icon)}</span><div><span class="care-eyebrow">${method.label}</span><h2>${method.short}</h2></div>${actionButton('体验','practice/'+method.id,true)}</div><p>${method.evidence}</p><dl><div><dt>什么时候可以试</dt><dd>${method.fit}</dd></div><div><dt>需要留意</dt><dd>${method.limit}</dd></div></dl><div class="care-source-links">${sourceLinks(method.sources)}</div></article>`).join('')}</div>
  <section class="care-recovery"><span class="care-eyebrow">OUTSIDE THE SCREEN</span><h2>也给屏幕之外的恢复留位置。</h2><div><article>${icon('sun')}<h3>选一种合适的真实活动</h3><p>散步、骑车或其他你能接受的活动。先从自己的身体条件和可用时间出发；屏幕里的运动游戏不等同于身体活动。</p>${sourceLinks(['move'])}</article><article>${icon('moon')}<h3>给下班与睡眠留边界</h3><p>可以试着安排一个停止处理工作的时间。持续失眠时寻求评估；一张睡眠提示卡不等同于完整失眠治疗。</p>${sourceLinks(['sleep'])}</article></div></section>`;
}
function summaryMarkup(record){
  return `<dl class="care-record-summary">${record.summary.map(item=>`<div><dt>${esc(item.label)}</dt><dd>${esc(item.value)}</dd></div>`).join('')}</dl><div class="care-next-action"><span>${icon('steps')}我愿意带走的下一步</span><p>${esc(record.nextAction)}</p></div>`;
}
const feedbackLabels={better:'更能继续了',same:'没有明显变化',worse:'更难受了',unsure:'暂时说不上'};
function result(){
  const record=state.last;if(!record)return notes();
  const feedback=feedbackFor(record.feedback);
  return `<section class="care-result care-quiet-result"><span class="care-eyebrow">${record.isExample?'EXAMPLE / 示例体验':'A MOMENT FOR YOURSELF'}</span><h1>${record.isExample?'这个例子，走到这里。':'这一刻，先到这里。'}</h1><p>${record.isExample?'演示内容不会计入你的本次记录。':'可以离开，也可以再待一会儿。'}</p>
  <div class="care-result-actions">${actionButton(record.isExample?'用自己的情况试试':'回到首页',record.isExample?'practice/'+record.id:'home')}</div>
  <details class="care-result-detail"><summary>${record.isExample?'回看这个例子':'看看这次留下的内容'}</summary><article class="care-record"><h2>${esc(record.title)}</h2>${summaryMarkup(record)}</article>${record.isExample?'':'<button class="care-text-button" data-download>下载这张行动卡 ↓</button>'}<p class="care-small-note">内容只留在当前页面，刷新或关闭后清空。</p></details>
  ${record.isExample?'':`<details class="care-result-detail" ${record.feedback?'open':''}><summary>此刻感觉怎么样？<span>选填</span></summary><section class="care-feedback"><div role="group" aria-label="此刻的体验反馈">${Object.entries(feedbackLabels).map(([id,label])=>`<button data-feedback="${id}" aria-pressed="${record.feedback===id}">${label}</button>`).join('')}</div>${feedback?`<div class="care-feedback-response ${feedback.offerSupport?'support':''}" role="status"><h3>${feedback.title}</h3><p>${feedback.text}</p>${feedback.offerSupport?'<button class="care-button secondary" data-help>查看支持方式 ↗</button>':''}</div>`:''}</section></details>`}</section>`;
}
function notes(){
  const records=saved();
  return `<section class="care-page-intro"><span class="care-eyebrow">TAKE SOMETHING WITH YOU</span><h1>留下的，是可以走的下一步。</h1><p>这里保留本次页面里的行动卡。没有打卡压力，也不按数量判断你是否变好了。</p></section>${records.length?`<div class="care-notes">${records.slice().reverse().map(record=>`<article class="care-record"><span class="care-eyebrow">本次练习</span><h2>${esc(record.title)}</h2>${summaryMarkup(record)}${record.feedback?`<p class="care-saved-feedback">此刻反馈：${feedbackLabels[record.feedback]}</p>`:''}<button class="care-text-button" data-download-record="${state.records.indexOf(record)}">下载到自己的设备 ${icon('download')}</button></article>`).join('')}</div>`:`<section class="care-empty">${motif('work')}<h2>还没有留下行动卡。</h2><p>如果愿意，从一件具体的小事开始。</p>${actionButton('选择一个练习','home')}</section>`}<p class="care-small-note">本工具不向后台保存练习输入。刷新或关闭页面会清空；示例体验不会混入个人记录。</p>`;
}
function openHelp(){
  if(helpDialog.open)return;
  helpDialog.innerHTML=`<button class="care-dialog-close" data-close-help aria-label="关闭支持信息">${icon('close')}</button><span class="care-eyebrow">SUPPORT IS PART OF THE PLAN</span><h1 id="care-help-title">不必自己扛完。</h1><p>如果持续影响睡眠、工作或关系，或自助仍难以应对，可以联系有资质的心理专业人员，或医院心理科、精神科、全科医生。无需等到某个分数才求助。</p><div class="care-help-options"><article><h2>先联系一个可信的人</h2><p>可以这样开始：“我最近有点撑不住，想请你听我说一会儿／陪我找一下支持。”</p></article><article><h2>工作中的支持</h2><p>可以考虑可信的同事、合适的管理者或员工援助计划。先确认是否安全、是否保密，再决定分享什么。</p></article><article><h2>中国大陆心理援助热线</h2><strong class="care-hotline">12356</strong><p>其他地区请联系当地心理支持服务；各地接听安排可能不同。</p><a href="https://www.nhc.gov.cn/yzygj/c100068/202412/49a1a65386cd4be582d4702fd0926ee8.shtml" target="_blank" rel="noopener noreferrer">查看热线来源 ↗</a></article></div><div class="care-urgent"><h2>如果眼下存在紧急危险</h2><p>如有即刻伤害自己的风险，或新发严重胸痛、呼吸困难等，请联系当地急救或前往急诊，并尽量让可信的人陪伴。中国大陆可拨 120；人身安全紧急情况可拨 110。不要等待网页练习或热线来替代急救。</p></div><p class="care-small-note">此页面不提供诊断、处方或紧急救援。</p>`;
  document.querySelector('#care-practice-mount')?.dispatchEvent(new Event('songjian:pause'));
  helpDialog.showModal();
}
function showToast(text){
  const el=document.querySelector('#care-toast');clearTimeout(toastTimer);
  el.textContent=text;el.classList.add('visible');toastTimer=setTimeout(()=>el.classList.remove('visible'),3000);
}
function download(record){
  if(!record||record.isExample)return;
  const text=`Relaxs · ${record.title}\n\n${record.summary.map(item=>`${item.label}\n${item.value}`).join('\n\n')}\n\n我愿意带走的下一步\n${record.nextAction}\n\n这是一张个人行动卡，不是心理诊断或疗效报告。\n`;
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='Relaxs-我的下一步.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function navigate(route){
  if(activePractice&&route===currentRoute)return;
  if(activePractice&&route!==currentRoute){
    pendingRoute=route;document.querySelector('#care-practice-mount')?.dispatchEvent(new Event('songjian:pause'));
    leaveDialog.innerHTML='<h2 id="care-leave-title">先离开这个练习吗？</h2><p>这次练习还没结束。离开后，其中的输入不会保留。</p><div class="care-result-actions"><button class="care-button" data-stay>继续练习</button><button class="care-button secondary" data-leave>结束并离开</button></div>';
    if(!leaveDialog.open)leaveDialog.showModal();return;
  }
  if(location.hash==='#'+route)render(route);else location.hash=route;
}
function render(requested=location.hash.slice(1)){
  let route=requested||'home';
  if(!['home','calm','organize','evidence','notes','result'].includes(route)&&!route.startsWith('practice/'))route='home';
  cleanup();cleanup=()=>{};activePractice=false;currentRoute=route;
  if(document.body)document.body.dataset.screen=route.startsWith('practice/')?'practice':route;
  document.querySelectorAll('.care-menu').forEach(menu=>menu.open=false);
  document.querySelectorAll('.care-header nav a').forEach(link=>link.hash==='#'+route?link.setAttribute('aria-current','page'):link.removeAttribute('aria-current'));
  if(route.startsWith('practice/')){
    const method=methodById(route.split('/')[1]);if(!method){navigate('home');return;}
    main.innerHTML=`<div class="care-practice-header"><button class="care-text-button" data-back>${icon('back')}换一种</button><span>${method.short}</span><button class="care-text-button" data-help>需要支持 ↗</button></div><section id="care-practice-mount" aria-label="${method.short}"></section><details class="care-practice-evidence">${practiceEvidence(method)}</details>`;
    activePractice=true;
    try{cleanup=mountPractice(method.id,document.querySelector('#care-practice-mount'),{
      onComplete(payload){const record=makeCareRecord(payload);if(!record){showToast('还需要一个具体的下一步，再试一次。');return;}state.last=record;if(!record.isExample)state.records.push(record);activePractice=false;navigate('result');},
      onExit:()=>navigate('home'),onHelp:openHelp,onPracticeChange:updatePracticeContext,
    });}catch(error){activePractice=false;main.innerHTML='<section class="care-empty"><h1>这个练习暂时没能打开。</h1><p>可以回到首页再试，或联系支持。</p><a class="care-button" href="#home">回到此刻</a></section>';console.error(error);}
  }else main.innerHTML=({home,calm,organize,evidence,notes,result})[route]();
  document.title=`${route==='evidence'?'方法与依据':route==='notes'?'本次记录':route==='organize'?'理一件事':route==='calm'?'慢下来':route.startsWith('practice/')?methodById(route.split('/')[1])?.short:'给自己留点空白'} · Relaxs`;
  window.scrollTo(0,0);
}
document.addEventListener('click',event=>{
  const link=event.target.closest('a[href^="#"]');
  if(link){
    event.preventDefault();
    if(link.classList.contains('care-skip')){main.focus({preventScroll:true});main.scrollIntoView();return;}
    navigate(link.hash.slice(1));return;
  }
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-help')){document.querySelectorAll('.care-menu').forEach(menu=>menu.open=false);openHelp();}
  if(button.hasAttribute('data-close-help'))helpDialog.close();
  if(button.hasAttribute('data-back'))navigate(methodById(currentRoute.split('/')[1])?.group==='body'?'calm':'organize');
  if(button.hasAttribute('data-stay')){pendingRoute=null;leaveDialog.close();}
  if(button.hasAttribute('data-leave')){const route=pendingRoute;pendingRoute=null;activePractice=false;leaveDialog.close();navigate(route||'home');}
  if(button.dataset.feedback&&state.last&&!state.last.isExample&&feedbackFor(button.dataset.feedback)){const y=window.scrollY;state.last.feedback=button.dataset.feedback;render('result');window.scrollTo(0,y);main.querySelector(`[data-feedback="${state.last.feedback}"]`)?.focus({preventScroll:true});}
  if(button.hasAttribute('data-download'))download(state.last);
  if(button.hasAttribute('data-download-record'))download(state.records[Number(button.dataset.downloadRecord)]);
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape')document.querySelectorAll('.care-menu[open]').forEach(menu=>{
    menu.open=false;menu.querySelector('summary')?.focus();
  });
});
window.addEventListener('hashchange',()=>{
  const requested=location.hash.slice(1);
  if(activePractice){
    if(requested===currentRoute)return;
    history.replaceState(null,'','#'+currentRoute);
    navigate(requested);
    return;
  }
  render();
});
leaveDialog.addEventListener('cancel',()=>{pendingRoute=null;});
window.addEventListener('pagehide',()=>{cleanup();activePractice=false;clearTimeout(toastTimer);});
window.addEventListener('pageshow',event=>{if(event.persisted)render();});
render();
