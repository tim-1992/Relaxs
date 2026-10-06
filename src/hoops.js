import {createHoopsScene} from './hoops-scene.js';
import {HOOP,BALL_START,velocityFromAim,createShot,stepShot,predictTrajectory,scoreBasket,
  createThrowMotion,stepThrowMotion,HOOPS_RELEASE_DELAY,
  createCourtPlayer,stepCourtPlayer,courtFrame,velocityFromCourtAim} from './hoops-physics.js';
import {createHoopsMusic} from './hoops-music.js';
import {SPORT_CHARACTERS} from './sport-avatar.js';
import {HOOPS_DIFFICULTIES,normalizeHoopsDifficulty,getHoopsChallenge,
  createHoopsPuzzle,recordHoopsAttempt,nextHoopsPuzzle,hoopsMissHint,getHoopsTarget} from './hoops-challenges.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const svg=(body)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const icons={
  back:svg('<path d="m14 5-7 7 7 7"/>'),
  pause:svg('<path d="M8 5v14M16 5v14"/>'),
  sound:svg('<path d="m11 4-5 5H3v6h3l5 5V4ZM15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>'),
  muted:svg('<path d="m11 4-5 5H3v6h3l5 5V4Zm5 5 6 6m0-6-6 6"/>'),
  arrow:svg('<path d="M5 12h14m-5-5 5 5-5 5"/>'),
  reset:svg('<path d="M3 9a9 9 0 1 1 0 7m0-13v6h6"/>'),
  music:svg('<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>'),
  settings:svg('<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.5" fill="currentColor"/><circle cx="15" cy="17" r="2.5" fill="currentColor"/>'),
};

function createSound() {
  let context=null,output=null,muted=true,closed=false,paused=true,started=false,chosen=false;
  const sources=new Map();
  function stopVoices() {
    if(output&&context?.state!=='closed')output.gain.setValueAtTime(0,context.currentTime);
    for(const [source,nodes] of sources) {
      source.onended=null;
      try { source.stop(); } catch {}
      nodes.forEach(node=>node.disconnect());
    }
    sources.clear();
    if(context&&context.state!=='closed')void context.suspend().catch(()=>{});
  }
  function track(source,nodes) {
    sources.set(source,nodes);
    source.onended=()=>{source.onended=null;sources.delete(source);nodes.forEach(node=>node.disconnect());};
  }
  function unlock() {
    if(closed || muted || paused || !started)return;
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return;
    try {
      if(!context) {
        context=new Audio();output=context.createGain();output.gain.value=0;output.connect(context.destination);
      }
      const current=context;
      output.gain.setValueAtTime(.7,current.currentTime);
      current.resume().then(()=>{
        if(closed||muted||paused) {
          if(current.state!=='closed')void current.suspend().catch(()=>{});
        }
      }).catch(()=>{});
    } catch {}
  }
  function tone(frequency,duration,volume,type='sine',delay=0) {
    if(!context || muted || paused || context.state!=='running' || closed || sources.size>=24)return;
    const at=context.currentTime+delay,osc=context.createOscillator(),gain=context.createGain();
    osc.type=type;osc.frequency.setValueAtTime(frequency,at);
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.008);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(gain);gain.connect(output);track(osc,[osc,gain]);osc.start(at);osc.stop(at+duration+.02);
  }
  function noise(duration,volume) {
    if(!context || muted || paused || context.state!=='running' || closed || sources.size>=24)return;
    const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate);
    const data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
    const source=context.createBufferSource(),gain=context.createGain(),filter=context.createBiquadFilter();
    filter.type='bandpass';filter.frequency.value=1700;source.buffer=buffer;gain.gain.value=volume;
    source.connect(filter);filter.connect(gain);gain.connect(output);track(source,[source,filter,gain]);source.start();
  }
  return {
    unlock,
    get muted(){return muted;},
    get automatic(){return !started&&!chosen;},
    start(){if(closed)return;started=true;paused=false;if(!chosen)muted=false;unlock();},
    toggle(){chosen=true;muted=!muted;if(!muted)unlock();else stopVoices();return muted;},
    pause(){paused=true;stopVoices();},
    resume(){if(!started||closed)return;paused=false;unlock();},
    play(kind,combo=0) {
      if(kind==='throw'){noise(.14,.045);tone(240,.1,.025);}
      if(kind==='floor'){tone(100,.15,.12);noise(.065,.04);}
      if(kind==='rim'){tone(560,.18,.065,'triangle');tone(850,.12,.03,'triangle');}
      if(kind==='board'){tone(155,.13,.1,'triangle');noise(.06,.06);}
      if(kind==='score'){
        noise(.22,.11);
        const pitch=1+Math.min(combo,5)*.06;
        [523,659,784].forEach((f,i)=>tone(f*pitch,.22,.055,'triangle',i*.075));
      }
    },
    dispose(){if(closed)return;closed=true;stopVoices();output?.disconnect();if(context)void context.close().catch(()=>{});context=output=null;},
  };
}

export function mountHoops(container,{markPlayed=()=>{},onExit=null,embedded=false,difficulty='easy',character='moss',view='court',tripoCharacter=null,tripoTree=null}={}) {
  const level=normalizeHoopsDifficulty(difficulty),rules=HOOPS_DIFFICULTIES[level];
  let selectedCharacter=SPORT_CHARACTERS.find(item=>item.id===character)?.id||SPORT_CHARACTERS[0].id;
  let selectedView='court';
  const root=document.createElement('section');
  root.className='hoops-game';root.tabIndex=0;root.setAttribute('aria-label','落日投篮，三维篮球小游戏');
  root.dataset.difficulty=level;
  root.dataset.view=selectedView;
  root.innerHTML=`
    <div class="hoops-surface">
      <canvas class="hoops-canvas" aria-label="立体篮球场。拖动下方篮球向上投出；也可用方向键调整，空格投篮。"></canvas>
      <div class="hoops-vignette"></div>
      <header class="hoops-top">
        <button class="hoops-icon" data-h="exit" aria-label="返回"${embedded?' hidden':''}>${icons.back}</button>
        <span class="hoops-wordmark"${embedded?' hidden':''}>Relaxs<span>SUNSET COURT</span></span>
        <div class="hoops-camera-toggle" role="group" aria-label="投篮视角"><button type="button" data-h-view="court" aria-pressed="true">3D 球员视角</button></div>
        <div class="hoops-top-actions">
          <details class="hoops-settings">
            <summary class="hoops-icon" aria-label="声音、球手与操作设置" title="球场设置">${icons.settings}</summary>
            <div class="hoops-settings-panel">
              <span class="hoops-settings-title">球场设置</span>
              <button type="button" data-h="sound" aria-label="开启音效" aria-pressed="false">${icons.muted}<span>投篮音效</span><small>开场开启</small></button>
              <button type="button" data-h="music" aria-label="开启背景音乐：热血球场" title="原创配乐 · 热血球场" aria-pressed="false">${icons.music}<span>原创配乐</span><small>关闭</small></button>
              <label class="hoops-character"><span>球手</span><select data-h-character aria-label="选择三维篮球角色">${SPORT_CHARACTERS.map(item=>`<option value="${item.id}"${item.id===selectedCharacter?' selected':''}>${item.name}</option>`).join('')}</select></label>
              <button type="button" class="hoops-settings-help" data-h="help">操作说明 <span aria-hidden="true">↗</span></button>
            </div>
          </details>
          <button class="hoops-icon" data-h="pause" aria-label="暂停投篮">${icons.pause}</button>
        </div>
      </header>
      <div class="hoops-hud"><div class="hoops-score"><span>本轮得分</span><strong data-h-score>0</strong></div><div class="hoops-round"><span data-h-mode>十球挑战</span><strong data-h-round>01 <small>/ 10</small></strong></div></div>
      <div class="hoops-combo" aria-live="polite"><b data-h-combo>0</b><span>连续命中</span><i></i></div>
      <div class="hoops-shots" aria-label="本轮投篮记录"></div>
      <div class="hoops-conditions" role="group" aria-label="当前投篮条件" hidden>
        <div><b data-h-condition-position></b><span data-h-condition-attempts></span></div>
        <p><span class="hoops-wind-arrow" data-h-wind-arrow aria-hidden="true"></span><span data-h-condition-wind></span><span class="hoops-condition-preview" data-h-condition-preview></span></p>
      </div>
      <div class="hoops-feedback" role="status" aria-live="polite"><b></b><span></span></div>
      <div class="hoops-aim-label" aria-live="off"></div>
      <button class="hoops-ball-handle" data-h="ball" aria-label="篮球：向上拖动投篮，或按空格出手"><i></i><span>从这里向上拖</span></button>
      <div class="hoops-guide" aria-hidden="true"><span>↑</span><i></i></div>
      <div class="hoops-court-controls" hidden>
        <div class="hoops-move-pad" role="group" aria-label="持球走位，方向朝向篮筐">
          <button type="button" data-h-move="forward" aria-label="向篮筐前进">↑</button>
          <button type="button" data-h-move="left" aria-label="向左走位">←</button><span aria-hidden="true">走位</span><button type="button" data-h-move="right" aria-label="向右走位">→</button>
          <button type="button" data-h-move="back" aria-label="背向篮筐后退">↓</button>
        </div>
        <button type="button" class="hoops-reset-position" data-h="reset-position">站回起点</button>
      </div>
      <footer class="hoops-bottom"><p class="hoops-hint">按住篮球 · 向上拖动 · 左右调方向</p>
        <div class="hoops-direction-controls" role="group" aria-label="左右调整出手方向">
          <span>出手方向</span><button type="button" data-h="left" aria-label="向左调整瞄准">←</button><output data-h-direction aria-label="当前出手方向">正中</output><button type="button" data-h="right" aria-label="向右调整瞄准">→</button><button type="button" data-h="center" aria-label="出手方向回正">回正</button><button type="button" data-h="assist" aria-expanded="false">力度 / 投出</button>
        </div>
        <p class="hoops-character-status" role="status" hidden></p>
        <div class="hoops-assist" hidden><p class="hoops-analysis" data-h-analysis hidden></p><div><span>力度</span><button data-h="weaker" aria-label="减小投篮力度">−</button><output data-h-power>60%</output><button data-h="stronger" aria-label="增加投篮力度">＋</button></div><button class="hoops-assist-shoot" data-h="shoot">投出篮球 ↑</button></div>
      </footer>
      <div class="hoops-overlay"></div>
    </div>`;
  container.appendChild(root);
  const canvas=root.querySelector('canvas'),surface=root.querySelector('.hoops-surface'),settings=root.querySelector('.hoops-settings');
  const overlay=root.querySelector('.hoops-overlay'),feedback=root.querySelector('.hoops-feedback');
  const handle=root.querySelector('.hoops-ball-handle'),hint=root.querySelector('.hoops-hint');
  const controller=new AbortController(),sound=createSound(),music=createHoopsMusic();
  music.pause();
  let scene,disposed=false,phase='intro',resumePhase='ready',mode='challenge',raf=0,lastTime=null,time=0;
  let targetTime=0,shotTargetStart=0,movingPractice=false,musicOn=false,musicPending=false;
  let width=0,height=0,shot=null,throwMotion=null,hoop={...HOOP},aim={x:0,power:.6},drag=null,trajectory=[];
  let points=0,makes=0,combo=0,bestCombo=0,cleanMakes=0,attempts=0,results=[],feedbackUntil=0,assist=false,aimPreview=false;
  let puzzle=createHoopsPuzzle(level),challenge=getHoopsChallenge(level);
  let player=createCourtPlayer(),launchSnapshot=null,moveAmount=0;
  let tripoReady=false,pendingCharacter=null,characterChanged=false;
  const movementKeys=new Set(),movePointers=new Map();
  const movementDirections={forward:{forward:1},back:{forward:-1},left:{right:-1},right:{right:1}};
  hoop=challenge.hoop;
  let activeBall=BALL_START;
  const isPuzzle=()=>level!=='easy'&&mode==='challenge';
  const powerLabel=()=>`${Number((aim.power*100).toFixed(1))}%`;
  const listen=(el,event,fn,options={})=>el.addEventListener(event,fn,{...options,signal:controller.signal});
  try { scene=createHoopsScene(canvas,{character:selectedCharacter,view:selectedView,tripoTree}); }
  catch(error) {
    console.warn('Basketball scene initialization failed:',error);
    root.innerHTML='<div class="hoops-load-error"><h2>球场暂时没能打开</h2><p>请刷新重试，或返回后重新进入球场。</p><button type="button">返回</button></div>';
    root.querySelector('button').onclick=()=>onExit?.();
    return ()=>{disposed=true;root.remove();sound.dispose();music.dispose();};
  }
  function wake() { if(!disposed && !raf && !document.hidden && !['paused','unavailable'].includes(phase))raf=requestAnimationFrame(frame); }
  function updateSoundControls() {
    const button=root.querySelector('[data-h="sound"]');
    button.innerHTML=`${sound.muted?icons.muted:icons.sound}<span>投篮音效</span><small>${sound.automatic?'开场开启':sound.muted?'关闭':'开启'}</small>`;
    button.setAttribute('aria-pressed',String(!sound.muted));
    button.setAttribute('aria-label',sound.automatic?'投篮音效：开场后自动开启':sound.muted?'开启投篮音效':'关闭投篮音效');
    const musicButton=root.querySelector('[data-h="music"]');
    musicButton.innerHTML=`${icons.music}<span>原创配乐</span><small>${musicOn?'开启':'关闭'}</small>`;
    musicButton.setAttribute('aria-pressed',String(musicOn));
    musicButton.setAttribute('aria-label',`${musicOn?'关闭':'开启'}背景音乐：热血球场`);
    musicButton.disabled=musicPending;
  }
  function cancelDrag() {
    const id=drag?.id;drag=null;
    if(id!==undefined && surface.hasPointerCapture?.(id))surface.releasePointerCapture(id);
    root.classList.remove('is-aiming','is-drag-ready');
  }
  function releaseMovePointer(id) {
    const input=movePointers.get(id);movePointers.delete(id);
    if(!input)return;
    try {if(input.button.hasPointerCapture(id))input.button.releasePointerCapture(id);} catch {}
    input.button.classList.remove('is-held');
  }
  function clearMovement() {
    movementKeys.clear();
    for(const id of [...movePointers.keys()])releaseMovePointer(id);
    moveAmount=0;
  }
  function currentOrigin() {
    return mode==='court'?(launchSnapshot?.origin||courtFrame(player,HOOP).origin):BALL_START;
  }
  function currentVelocity() {
    return launchSnapshot?.velocity||(mode==='court'?velocityFromCourtAim(aim,player,HOOP):velocityFromAim(aim));
  }
  function movePlayer(input,dt) {
    if(mode!=='court'||phase!=='ready'||drag)return;
    const before={...player};
    stepCourtPlayer(player,input,dt,HOOP);
    moveAmount=dt>0?clamp(Math.hypot(player.x-before.x,player.z-before.z)/(dt*2.5),0,1):0;
    if(player.x!==before.x||player.z!==before.z) {
      aimPreview=true;updateTrajectory();updateConditions();
    }
  }
  function stepMovement(dt) {
    moveAmount=0;
    if(mode!=='court'||phase!=='ready'||drag)return;
    let forward=Number(movementKeys.has('w'))-Number(movementKeys.has('s'));
    let right=Number(movementKeys.has('d'))-Number(movementKeys.has('a'));
    for(const {direction} of movePointers.values()) {
      forward+=movementDirections[direction].forward||0;right+=movementDirections[direction].right||0;
    }
    movePlayer({forward:clamp(forward,-1,1),right:clamp(right,-1,1)},dt);
  }
  function applyPendingCharacter() {
    if(!pendingCharacter||!['intro','ready'].includes(phase))return;
    selectedCharacter=pendingCharacter;pendingCharacter=null;
    scene.setCharacter(selectedCharacter);
    root.querySelector('[data-h-character]').value=selectedCharacter;
  }
  function updateAim() {
    updateTrajectory();
    root.querySelector('[data-h-direction]').textContent=Math.abs(aim.x)<.03?'正中':`${aim.x<0?'左':'右'} ${Math.round(Math.abs(aim.x)*100)}`;
    root.querySelector('[data-h-power]').textContent=powerLabel();
    root.querySelector('.hoops-aim-label').textContent=`力度 ${powerLabel()}`;
    root.style.setProperty('--hoops-power',aim.power);
  }
  function updateTrajectory() {
    const target=challenge.motion?age=>getHoopsTarget(challenge,targetTime+HOOPS_RELEASE_DELAY+age):hoop;
    trajectory=predictTrajectory(currentVelocity(),target,{wind:challenge.wind,maxTime:challenge.previewSeconds,origin:currentOrigin()});
  }
  function updateConditions() {
    const panel=root.querySelector('.hoops-conditions');
    panel.hidden=mode!=='court'&&!isPuzzle()&&!challenge.motion;
    if(panel.hidden)return;
    if(mode==='court') {
      root.querySelector('[data-h-condition-position]').textContent=`距篮筐 ${Math.hypot(player.x-HOOP.x,player.z-HOOP.z).toFixed(1)} m · 自由走位`;
      root.querySelector('[data-h-condition-attempts]').textContent='不限次数';
      root.querySelector('[data-h-wind-arrow]').textContent='○';
      root.querySelector('[data-h-condition-wind]').textContent='WASD / 方向盘走位 · 方向键瞄准';
      root.querySelector('[data-h-condition-preview]').textContent='固定篮筐 · 无风';
      return;
    }
    const side=hoop.x===0?'正中':`${hoop.x<0?'左移':'右移'} ${Math.abs(hoop.x).toFixed(2)} m`;
    root.querySelector('[data-h-condition-position]').textContent=challenge.motion
      ?`移动篮筐 · 左右幅度 ${challenge.motion.amplitude.toFixed(2)} m`
      :`篮筐 ${side} · 距离 ${challenge.distance.toFixed(1)} m`;
    root.querySelector('[data-h-condition-attempts]').textContent=movingPractice?'自由试投':`本题已试 ${puzzle.stageAttempts} 次`;
    root.querySelector('[data-h-wind-arrow]').textContent=challenge.wind.x>0?'→':challenge.wind.x<0?'←':'○';
    root.querySelector('[data-h-condition-wind]').textContent=challenge.wind.x
      ?`恒定${challenge.wind.x>0?'右吹':'左吹'} · 风力 ${challenge.windLevel}/4`:'无风 · 先看远近，再调方向';
    root.querySelector('[data-h-condition-preview]').textContent=challenge.motion
      ?`${getHoopsTarget(challenge,targetTime+.03).x>=hoop.x?'→ 向右移动':'← 向左移动'}`
      :level==='hard'?'仅显示起飞段':'完整轨迹参考';
  }
  function loadChallenge(index,{keepAim=false}={}) {
    const number=movingPractice?7+Math.min(2,Math.floor(attempts/3)):index;
    if(!keepAim||challenge.index!==number)targetTime=0;
    challenge=getHoopsChallenge(movingPractice&&level==='easy'?'standard':level,number,{practice:mode==='court'||mode==='practice'&&!movingPractice});
    hoop=getHoopsTarget(challenge,targetTime);
    if(!keepAim) {
      aim={x:0,power:.6};
      aimPreview=false;
      root.querySelector('[data-h-analysis]').textContent='';
      root.querySelector('[data-h-analysis]').hidden=true;
    }
    updateAim();
    hint.textContent=mode==='court'?'WASD / 左侧方向盘走位 · 方向键瞄准 · 空格出手':challenge.motion?'看篮筐往哪边走，提前一点出手；投出后它也会继续移动。':isPuzzle()
      ?level==='hard'?'留意恒定横风，向反风方向预留；投失可继续调整。':'先观察篮筐远近与偏移，再调方向、力度；投失可重试。'
      :hoop.x===0?'按住篮球 · 向上拖动 · 松手投出':'篮筐换了位置，左右调整出手方向。';
  }
  function updateHud() {
    applyPendingCharacter();
    root.dataset.phase=phase;root.dataset.mode=mode;root.dataset.puzzle=String(isPuzzle()||Boolean(challenge.motion));
    root.querySelector('[data-h-score]').textContent=points;
    root.querySelector('[data-h-mode]').textContent=mode==='court'?'自由球场':movingPractice?'移动篮筐练习':mode==='practice'?'自由练习':isPuzzle()?`${rules.label} · 十球解题`:'十球挑战';
    const inFlight=['windup','flight'].includes(phase)||phase==='paused'&&['windup','flight'].includes(resumePhase);
    root.querySelector('[data-h-round]').innerHTML=mode!=='challenge'?`${attempts}<small> 次出手</small>`
      :`${String(isPuzzle()?puzzle.index+1:Math.min(inFlight?attempts:attempts+1,10)).padStart(2,'0')} <small>/ 10${isPuzzle()?' 题':''}</small>`;
    root.querySelector('[data-h-combo]').textContent=combo;
    root.querySelector('.hoops-combo').classList.toggle('is-hot',combo>=2);
    const history=isPuzzle()?Array.from({length:10},(_,i)=>i<puzzle.solved?true:undefined)
      :mode!=='challenge'?results.slice(-10):Array.from({length:10},(_,i)=>results[i]);
    root.querySelector('.hoops-shots').innerHTML=history.map((r,i)=>`<span class="${r===undefined?'':r?'made':'missed'}" aria-label="${i+1}：${r===undefined?(isPuzzle()?'待解':'还未投'):r?'命中':'未进'}">${r===undefined?'':r?'✓':'·'}</span>`).join('');
    root.querySelector('.hoops-shots').setAttribute('aria-label',isPuzzle()?'十题解题进度':'本轮投篮记录');
    handle.hidden=phase!=='ready';
    const playing=['ready','windup','flight'].includes(phase);
    root.querySelector('[data-h="pause"]').hidden=!playing;
    root.querySelector('.hoops-bottom').inert=!playing;
    root.querySelector('.hoops-assist').hidden=!assist||phase!=='ready';
    root.querySelector('.hoops-direction-controls').hidden=phase!=='ready';
    root.classList.toggle('is-assist',assist&&phase==='ready');
    root.querySelector('[data-h="shoot"]').disabled=phase!=='ready';
    root.querySelector('[data-h="help"]').disabled=!playing;
    root.querySelector('[data-h="assist"]').setAttribute('aria-expanded',String(assist));
    root.querySelector('[data-h="assist"]').textContent=assist?'收起力度':'力度 / 投出';
    root.querySelector('[data-h-character]').disabled=phase!=='ready';
    root.querySelector('.hoops-court-controls').hidden=mode!=='court'||!playing;
    for(const button of root.querySelectorAll('[data-h-move]'))button.disabled=phase!=='ready';
    root.querySelector('[data-h="reset-position"]').disabled=phase!=='ready';
    updateConditions();updateSoundControls();
  }
  function showFeedback(title,subtitle,kind='score') {
    feedback.querySelector('b').textContent=title;feedback.querySelector('span').textContent=subtitle;
    feedback.dataset.kind=kind;feedback.classList.remove('is-visible');
    void feedback.offsetWidth;feedback.classList.add('is-visible');feedbackUntil=time+1.4;
  }
  function intro() {
    sound.pause();music.pause();settings.open=false;phase='intro';updateHud();
    overlay.hidden=false;overlay.className='hoops-overlay hoops-intro-overlay';
    overlay.innerHTML=`<div class="hoops-intro"><span class="hoops-kicker">落日投篮 · ${rules.label}</span><h1>${level==='hard'?'把风也算进去。':'观察，再出手。'}</h1><p>${level==='easy'?'拖动篮球调方向与力度，松手投出。':level==='hard'?'观察距离、横风和移动方向，再调整出手。':'先看篮筐远近与偏移，后 3 题挑战移动篮筐。'}</p><button class="hoops-primary" data-h="start">${level==='easy'?'开始投篮':'开始十球挑战'}${icons.arrow}</button><button class="hoops-court-link" data-h="court">自由球场 · 走到哪投到哪 <span aria-hidden="true">↗</span></button><details class="hoops-more-modes"><summary>练习玩法</summary><div class="hoops-intro-links"><button class="hoops-practice-link" data-h="practice">固定篮筐练习</button><button class="hoops-practice-link" data-h="moving-practice">移动篮筐练习 ↗</button></div></details></div>`;
  }
  function start(nextMode=mode,{moving=false}={}) {
    if(disposed||document.hidden)return;
    sound.start();void music.resume();settings.open=false;cancelDrag();clearMovement();mode=nextMode;movingPractice=mode==='practice'&&moving;points=0;makes=0;combo=0;bestCombo=0;cleanMakes=0;attempts=0;results=[];
    puzzle=createHoopsPuzzle(level);
    shot=null;throwMotion=null;launchSnapshot=null;player=createCourtPlayer();phase='ready';time=0;feedbackUntil=0;lastTime=null;
    overlay.hidden=true;feedback.classList.remove('is-visible');hint.textContent='按住篮球 · 向上拖动 · 松手投出';
    root.classList.remove('has-shot');loadChallenge(0);updateHud();renderCourt(0);root.focus({preventScroll:true});wake();
  }
  function pause(reason='休息一下，球场会等你。',help=false) {
    sound.pause();music.pause();clearMovement();settings.open=false;
    if(!['ready','windup','flight'].includes(phase))return;
    resumePhase=phase;phase='paused';cancelDrag();cancelAnimationFrame(raf);raf=0;lastTime=null;updateHud();
    overlay.hidden=false;overlay.className='hoops-overlay hoops-modal-overlay';
    overlay.innerHTML=`<div class="hoops-dialog" role="dialog" aria-label="${help?'投篮操作说明':'投篮已暂停'}"><span class="hoops-kicker">${help?'HOW TO PLAY':'TAKE A BREAK'}</span><h2>${help?(mode==='court'?'先走位，再出手':'让手指带着球走'):'暂停一下。'}</h2>${help?`<div class="hoops-help-steps"><p><b>01</b>${mode==='court'?'持球时用 WASD 或左侧方向盘走位。':isPuzzle()?'先看篮筐距离、左右位置和风力。':'按住画面下方的篮球。'}</p><p><b>02</b>向上拖动调整力度，左右偏移调整方向。</p><p><b>03</b>${isPuzzle()?'投失可重试；命中后手动进入下一题。':'看着虚线轨迹，松手投出。'}</p></div><p class="hoops-key-help">键盘：← → 调出手方向，↑ ↓ 调力度，空格投出。底部也有左右按钮和「回正」，展开「力度 / 投出」可点按投篮。${mode==='court'?'W / S 朝篮筐前进、后退；A / D 向两侧走位。出手后等球落定再移动；「站回起点」只恢复站位。':'本玩法站位固定；想自由走动，可在「选择玩法」进入自由球场。'}画面始终展示三维球手；在右上设置中选择球手和声音。${isPuzzle()&&level==='hard'?'横风在出手后持续作用，飞得越久，偏移越多。轨迹只显示起飞段。':''}</p>`:`<p>${reason}</p>`}<button class="hoops-primary" data-h="resume">继续投篮${icons.arrow}</button><button class="hoops-secondary" data-h="restart">重新开始这一轮</button><button class="hoops-secondary" data-h="modes">选择玩法</button></div>`;
    overlay.querySelector('[data-h="resume"]').focus({preventScroll:true});
  }
  function resume() {
    if(phase!=='paused'||document.hidden)return;
    clearMovement();settings.open=false;
    phase=resumePhase;overlay.hidden=true;updateHud();sound.resume();void music.resume();root.focus({preventScroll:true});wake();
  }
  function launch() {
    if(phase!=='ready')return;
    launchSnapshot={origin:{...currentOrigin()},velocity:{...currentVelocity()},wind:{...challenge.wind}};
    throwMotion=createThrowMotion(drag||assist?aim.power:0);
    sound.unlock();cancelDrag();clearMovement();phase='windup';attempts++;
    root.classList.add('has-shot');markPlayed('basketball');hint.textContent='抬手，出发。';updateHud();root.focus({preventScroll:true});wake();
  }
  function finishShot() {
    const made=shot.scored;
    results.push(made);
    if(isPuzzle())recordHoopsAttempt(puzzle,made);
    if(!made) {
      combo=0;
      const tip=mode==='court'?'从这个站位再试试：微调方向、力度，或持球走近一点。':hoopsMissHint(shot,challenge);
      showFeedback('再来一球',tip,'miss');
      if(isPuzzle()) {
        root.querySelector('[data-h-analysis]').textContent=tip;
        root.querySelector('[data-h-analysis]').hidden=false;
      }
    }
    shot=null;throwMotion=null;launchSnapshot=null;
    if(isPuzzle()) {
      if(puzzle.status==='complete'){showSummary();return;}
      if(puzzle.status==='cleared'){showPuzzleClear();return;}
      phase='ready';loadChallenge(puzzle.index,{keepAim:true});updateHud();
      hint.textContent=root.querySelector('[data-h-analysis]').textContent+' 条件不变，可以重试。';
      return;
    }
    if(mode==='challenge' && attempts>=10) { showSummary(); return; }
    phase='ready';
    loadChallenge(Math.min(attempts,9),{keepAim:true});updateHud();
  }
  function showPuzzleClear() {
    sound.pause();music.pause();settings.open=false;phase='cleared';updateHud();overlay.hidden=false;overlay.className='hoops-overlay hoops-modal-overlay';
    feedback.classList.remove('is-visible');
    const direction=Math.abs(aim.x)<.005?'正中':`${aim.x<0?'左':'右'} ${Math.round(Math.abs(aim.x)*100)}`;
    overlay.innerHTML=`<div class="hoops-dialog hoops-puzzle-clear" role="dialog" aria-label="当前投篮题已解开"><span class="hoops-kicker">ONE ANGLE, UNDERSTOOD</span><h2>这个角度，<br>解开了。</h2><p>第 ${puzzle.index+1} 题，试投 ${puzzle.stageAttempts} 次。<br>方向 ${direction} · 力度 ${powerLabel()}<br>下一题的距离和条件会改变。</p><button class="hoops-primary" data-h="next">下一题 · ${puzzle.index+2}/10${icons.arrow}</button><button class="hoops-secondary" data-h="practice">去自由练习</button></div>`;
    overlay.querySelector('[data-h="next"]').focus({preventScroll:true});
  }
  function nextPuzzle() {
    if(phase!=='cleared'||!nextHoopsPuzzle(puzzle))return;
    sound.resume();void music.resume();phase='ready';shot=null;throwMotion=null;overlay.hidden=true;feedback.classList.remove('is-visible');
    loadChallenge(puzzle.index);updateHud();root.focus({preventScroll:true});wake();
  }
  function showSummary() {
    sound.pause();music.pause();settings.open=false;phase='summary';updateHud();overlay.hidden=false;overlay.className='hoops-overlay hoops-modal-overlay';
    const label=isPuzzle()?'十个角度，都解开了。':makes>=8?'今天的手感，很热。':makes>=5?'越来越有感觉了。':'再来一轮，找找手感？';
    overlay.innerHTML=`<div class="hoops-dialog hoops-summary" role="dialog" aria-label="十球挑战结果"><span class="hoops-medal">${makes>=8?'✦':makes>=5?'✧':'○'}</span><span class="hoops-kicker">10 SHOTS / YOUR MOMENT</span><h2>${label}</h2><strong class="hoops-final-score">${points}<small>本轮得分</small></strong><div class="hoops-final-stats"><div><b>${makes}/10</b><span>${isPuzzle()?'解开':'命中'}</span></div><div><b>${isPuzzle()?attempts:bestCombo}</b><span>${isPuzzle()?'总试投':'最高连进'}</span></div><div><b>${cleanMakes}</b><span>空心入网</span></div></div><button class="hoops-primary" data-h="restart">${isPuzzle()?'再解一轮':'再来十球'}${icons.reset}</button><button class="hoops-secondary" data-h="practice">换成自由练习</button></div>`;
    overlay.querySelector('[data-h="restart"]').focus({preventScroll:true});
  }
  function handleEvents(events) {
    for(const event of events) {
      scene.burst(event.position,{kind:event.type,power:event.power||1});
      if(event.type==='score') {
        const earned=scoreBasket({made:true,clean:event.clean,combo});
        combo=earned.combo;points+=earned.points;makes++;bestCombo=Math.max(bestCombo,combo);if(event.clean)cleanMakes++;
        sound.play('score',combo);
        showFeedback(event.clean?'空心！':'好球！',`${combo>=2?`${combo} 连进 · `:''}+${earned.points} 分`);
        updateHud();
      }else sound.play(event.type);
    }
  }
  function frame(now) {
    raf=0;if(disposed)return;
    const dt=lastTime===null?0:Math.min((now-lastTime)/1000,.05);lastTime=now;
    if(phase!=='paused')time+=dt;
    if(['ready','windup','flight'].includes(phase))targetTime+=dt;
    stepMovement(dt);
    let flightTime=dt;
    if(['windup','flight'].includes(phase)&&throwMotion) {
      const motionStep=stepThrowMotion(throwMotion,dt);
      flightTime=motionStep.flightTime;
      if(motionStep.release) {
        shotTargetStart=targetTime-motionStep.flightTime;
        shot=createShot(launchSnapshot.velocity,{wind:launchSnapshot.wind,origin:launchSnapshot.origin});phase='flight';
        sound.play('throw');hint.textContent='球已出手，看看这条弧线。';updateHud();
      }
    }
    if(phase==='flight' && shot) {
      const target=challenge.motion?age=>getHoopsTarget(challenge,shotTargetStart+age):challenge.hoop;
      handleEvents(stepShot(shot,flightTime,target));if(shot.done)finishShot();
    }
    renderCourt(dt);
    if(time>feedbackUntil)feedback.classList.remove('is-visible');
    if(phase!=='paused' && !document.hidden)wake();
  }
  function renderCourt(dt=0) {
    hoop=getHoopsTarget(challenge,targetTime);
    if(challenge.motion) {
      if(phase==='ready')updateTrajectory();
      updateConditions();
    }
    const aiming=Boolean(drag||assist||aimPreview);
    const posePhase=phase==='paused'?resumePhase:phase;
    const origin=currentOrigin();
    activeBall=scene.render({ball:shot?.position||origin,holding:!shot,
      action:throwMotion?.action??(posePhase==='ready'&&(drag||assist)?aim.power*.22:0),aim,
      hoop,trajectory:phase==='ready'&&aiming?trajectory:[],aiming:phase==='ready'&&aiming,combo,time,
      freeCourt:mode==='court',player:mode==='court'?{...player}:null,
      move:phase==='ready'?moveAmount:0,origin,velocity:currentVelocity()},dt);
    if(phase==='ready') {
      const point=scene.project(activeBall);
      handle.style.left=`${point.x}px`;handle.style.top=`${point.y}px`;
      root.querySelector('.hoops-guide').style.left=`${point.x}px`;root.querySelector('.hoops-guide').style.top=`${point.y-40}px`;
      root.querySelector('.hoops-aim-label').style.left=`${clamp(point.x,70,width-70)}px`;
      root.querySelector('.hoops-aim-label').style.top=`${point.y-82}px`;
    }
  }
  function resize() {
    const rect=surface.getBoundingClientRect();width=rect.width;height=rect.height;
    if(width>1&&height>1){scene.resize(width,height);renderCourt(0);wake();}
  }
  function point(event) {
    const rect=surface.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};
  }
  function aimAtPointer(p) {
    aim.x=clamp((p.x-drag.start.x)/(width*.36),-1,1);
    aim.power=clamp((drag.start.y-p.y)/(height*.34),.05,1);
    updateAim();
    const valid=drag.start.y-p.y>24;
    root.classList.toggle('is-drag-ready',valid);
    return valid;
  }
  listen(surface,'pointerdown',e=>{
    if(settings.open&&!settings.contains(e.target))settings.open=false;
    const moveButton=e.target.closest('[data-h-move]');
    if(moveButton) {
      if(mode!=='court'||phase!=='ready'||drag||e.button!==0||movePointers.has(e.pointerId))return;
      e.preventDefault();root.focus({preventScroll:true});
      movePointers.set(e.pointerId,{button:moveButton,direction:moveButton.dataset.hMove});
      moveButton.classList.add('is-held');
      try {moveButton.setPointerCapture(e.pointerId);} catch {releaseMovePointer(e.pointerId);}
      wake();return;
    }
    if(phase!=='ready'||e.isPrimary===false||e.button!==0||drag)return;
    if(e.target.closest('button,select,label,input,summary,.hoops-settings') && !e.target.closest('[data-h="ball"]'))return;
    const p=point(e),ball=scene.project(activeBall);
    if(Math.hypot(p.x-ball.x,p.y-ball.y)>70)return;
    e.preventDefault();sound.unlock();clearMovement();root.focus({preventScroll:true});
    drag={id:e.pointerId,start:p};surface.setPointerCapture(e.pointerId);
    aim={x:0,power:.1};updateAim();root.classList.add('is-aiming');hint.textContent='向上拖动蓄力，左右调整方向。';
  },{passive:false});
  listen(surface,'pointermove',e=>{
    if(!drag||e.pointerId!==drag.id)return;
    e.preventDefault();aimAtPointer(point(e));
  },{passive:false});
  listen(surface,'pointerup',e=>{
    if(movePointers.has(e.pointerId)){releaseMovePointer(e.pointerId);return;}
    if(!drag||e.pointerId!==drag.id)return;
    const valid=aimAtPointer(point(e));
    if(valid)launch();else {cancelDrag();hint.textContent='按住篮球向上拖一段，再松手。';updateAim();}
  });
  listen(surface,'pointercancel',e=>{
    if(movePointers.has(e.pointerId)){releaseMovePointer(e.pointerId);return;}
    if(drag?.id!==e.pointerId)return;
    cancelDrag();if(phase==='ready')hint.textContent='刚才的拖动已取消，可以重新出手。';
  });
  listen(surface,'lostpointercapture',e=>{
    if(movePointers.has(e.pointerId))releaseMovePointer(e.pointerId);
    if(drag?.id===e.pointerId)cancelDrag();
  });
  function adjust(key) {
    if(phase!=='ready')return;
    aimPreview=true;
    if(key==='weaker'||key==='stronger') {
      assist=true;root.querySelector('[data-h="assist"]').setAttribute('aria-expanded','true');
    }
    updateHud();
    if(key==='left')aim.x=clamp(aim.x-.06,-1,1);
    if(key==='right')aim.x=clamp(aim.x+.06,-1,1);
    if(key==='center')aim.x=0;
    if(key==='weaker')aim.power=clamp(aim.power-.025,.05,1);
    if(key==='stronger')aim.power=clamp(aim.power+.025,.05,1);
    updateAim();
  }
  listen(root,'click',async e=>{
    if(disposed)return;
    if(settings.open&&!settings.contains(e.target))settings.open=false;
    const moveButton=e.target.closest('[data-h-move]');
    if(moveButton) {
      if(e.detail===0&&!moveButton.disabled&&mode==='court'&&phase==='ready') {
        clearMovement();movePlayer(movementDirections[moveButton.dataset.hMove],.1);renderCourt(0);wake();
      }
      return;
    }
    const cameraButton=e.target.closest('[data-h-view]');
    if(cameraButton) {
      const next=cameraButton.dataset.hView;
      if(next!=='court'||phase==='unavailable')return;
      settings.open=false;cancelDrag();clearMovement();selectedView=next;root.dataset.view=next;scene.setView(next);
      for(const button of root.querySelectorAll('[data-h-view]'))button.setAttribute('aria-pressed',String(button.dataset.hView===next));
      renderCourt(0);wake();
      return;
    }
    const action=e.target.closest('[data-h]')?.dataset.h;if(!action)return;
    if(action==='start')start('challenge');
    if(action==='court')start('court');
    if(action==='practice')start('practice');
    if(action==='moving-practice')start('practice',{moving:true});
    if(action==='restart')start(mode,{moving:movingPractice});
    if(action==='resume')resume();
    if(action==='next')nextPuzzle();
    if(action==='pause')pause();
    if(action==='help')pause('',true);
    if(action==='exit'){pause();cancelDrag();clearMovement();if(onExit)onExit();}
    if(action==='reset-position'&&mode==='court'&&phase==='ready') {
      cancelDrag();clearMovement();player=createCourtPlayer();launchSnapshot=null;
      updateAim();updateConditions();renderCourt(0);wake();
    }
    if(action==='modes'&&phase==='paused') {
      cancelDrag();clearMovement();player=createCourtPlayer();launchSnapshot=null;shot=null;throwMotion=null;
      mode='challenge';movingPractice=false;loadChallenge(0);intro();renderCourt(0);wake();
    }
    if(action==='shoot')launch();
    if(action==='ball'&&e.detail===0)launch();
    if(['left','right','center','weaker','stronger'].includes(action))adjust(action);
    if(action==='sound'){
      sound.toggle();updateSoundControls();
    }
    if(action==='music'&&!musicPending) {
      const button=root.querySelector('[data-h="music"]');
      if(musicOn){music.disable();musicOn=false;}
      else {
        musicPending=true;button.disabled=true;
        if(['ready','windup','flight'].includes(phase)&&!document.hidden)await music.resume();
        else music.pause();
        const enabled=await music.enable();
        if(disposed)return;
        musicPending=false;button.disabled=false;musicOn=enabled;
        if(!['ready','windup','flight'].includes(phase)||document.hidden)music.pause();
      }
      updateSoundControls();
      button.title=musicOn?'原创配乐 · 热血球场（播放中）':'原创配乐 · 热血球场';
    }
    if(action==='assist'&&phase==='ready'){assist=!assist;e.target.closest('button').setAttribute('aria-expanded',String(assist));updateAim();updateHud();}
  });
  listen(settings,'toggle',()=>{
    if(disposed||!settings.open)return;
    cancelDrag();clearMovement();renderCourt(0);
  });
  listen(root.querySelector('[data-h-character]'),'change',e=>{
    if(phase!=='ready')return;
    const id=e.target.value;
    if(id!=='tripo'&&!SPORT_CHARACTERS.some(item=>item.id===id)||id==='tripo'&&!tripoReady)return;
    clearMovement();cancelDrag();characterChanged=true;pendingCharacter=null;
    selectedCharacter=id;scene.setCharacter(selectedCharacter);
    renderCourt(0);wake();
  });
  listen(root,'keydown',e=>{
    if(e.defaultPrevented||e.isComposing||e.shiftKey||e.altKey||e.ctrlKey||e.metaKey||e.target.isContentEditable||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
    if(settings.open) {
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation?.();settings.open=false;settings.querySelector('summary').focus({preventScroll:true});}
      return;
    }
    if(e.target.closest('summary,.hoops-settings'))return;
    if(e.key==='Escape'&&embedded)return;
    if(e.key==='Escape'||e.key.toLowerCase()==='p'){e.preventDefault();if(!e.repeat)phase==='paused'?resume():pause();return;}
    const moveKey=e.key.toLowerCase();
    if(['w','a','s','d'].includes(moveKey)) {
      if(mode==='court') {
        e.preventDefault();
        if(phase==='ready'&&!drag&&(!e.repeat||movementKeys.has(moveKey)))movementKeys.add(moveKey);
      }
      return;
    }
    if(drag)return;
    const map={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'stronger',ArrowDown:'weaker'};
    if(map[e.key]){e.preventDefault();adjust(map[e.key]);}
    if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();if(!e.repeat)launch();}
  });
  listen(window,'keyup',e=>{movementKeys.delete(e.key?.toLowerCase());});
  listen(root,'keyup',e=>{movementKeys.delete(e.key?.toLowerCase());});
  listen(root,'focusout',e=>{
    if(!root.contains(e.relatedTarget)||/INPUT|TEXTAREA|SELECT/.test(e.relatedTarget?.tagName||''))clearMovement();
  });
  listen(window,'blur',()=>pause('你切换了窗口，回来后可以接着投。'));
  listen(document,'visibilitychange',()=>{if(document.hidden){pause('页面暂时离开了视线。');cancelAnimationFrame(raf);raf=0;lastTime=null;}else if(phase!=='paused')wake();});
  listen(container,'songjian:pause',()=>pause('正在记录这次体验，篮球先停在这里。'));
  listen(window,'resize',resize);
  listen(canvas,'webglcontextlost',e=>{
    sound.pause();music.pause();clearMovement();
    e.preventDefault();cancelDrag();phase='unavailable';cancelAnimationFrame(raf);raf=0;lastTime=null;updateHud();
    overlay.hidden=false;overlay.className='hoops-overlay hoops-modal-overlay';
    overlay.innerHTML='<div class="hoops-dialog" role="dialog" aria-label="球场暂时中断"><h2>球场暂时中断了。</h2><p>返回后重新进入，就可以再开一轮。</p><button class="hoops-primary" data-h="exit">返回</button></div>';
    overlay.querySelector('button').focus({preventScroll:true});
  });
  const observer=new ResizeObserver(resize);observer.observe(surface);
  intro();updateAim();resize();
  // Defer parsing until mount finishes, so a synchronous route unmount never
  // starts an asset job. The scene owns cancellation/disposal of parsed assets.
  if(tripoCharacter?.buffer&&typeof scene.setTripoCharacter==='function') {
    const message=root.querySelector('.hoops-character-status');
    message.textContent='Tripo 球手准备中…';message.hidden=false;
    Promise.resolve().then(async()=>{
      if(disposed)return;
      try {
        const loaded=await scene.setTripoCharacter(tripoCharacter.buffer,{name:tripoCharacter.name});
        if(disposed)return;
        if(loaded!==true)throw new Error('Tripo character was not loaded');
        const option=document.createElement('option');
        option.setAttribute('value','tripo');option.textContent=tripoCharacter.name||'Tripo 球手';
        root.querySelector('[data-h-character]').appendChild(option);
        tripoReady=true;
        if(!characterChanged)pendingCharacter='tripo';
        message.hidden=true;updateHud();renderCourt(0);wake();
      }catch(error) {
        if(disposed)return;
        console.warn('Tripo basketball character could not be loaded:',error);
        message.textContent='Tripo 球手暂未载入，仍可选择原有球手。';message.hidden=false;
      }
    });
  }
  return ()=>{
    if(disposed)return;disposed=true;cancelDrag();clearMovement();controller.abort();observer.disconnect();cancelAnimationFrame(raf);raf=0;
    sound.dispose();music.dispose();scene.dispose();root.remove();
  };
}
