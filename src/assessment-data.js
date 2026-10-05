export const assessmentGames = [
  {id:'harbor', name:'晚风归航', description:'沿着三个生活片段走到河边，帮小船认清自己的方向。', tag:'情境剧情 × 抗干扰挑战', art:'cloud', tint:'blue'},
  {id:'lantern', name:'星灯守望', description:'穿过一天的小插曲，分清夜空里该点亮和该放过的信号。', tag:'情境剧情 × 停走挑战', art:'zen', tint:'sand'},
];

// These are narrative preferences, not adapted diagnostic items.
// Categories describe a user's chosen response, never a severity level.
export const storyScenes = [
  {id:'unfinished',title:'未完成的小事',scene:'傍晚，你走出门。口袋里还有一张没做完的清单，手机又亮了一下。',prompt:'如果此刻站在这里，哪个反应最像你？',options:[
    {id:'unfinished-action',label:'事情在脑子里排着队，想先挑一件安排好。',reply:'你折起清单，只把下一件小事留在外面。路还长，不必一次走完。',category:'action'},
    {id:'unfinished-reframe',label:'总在想，如果最后做不好会怎样。',reply:'你发现，眼前的清单和脑中的结局，是两件不同的事。',category:'reframe'},
    {id:'unfinished-attention',label:'暂时放进口袋，想让脑子换个频道。',reply:'清单还在口袋里。你先抬起头，看看路边刚亮起来的灯。',category:'attention'},
  ]},
  {id:'noise',title:'路口的杂音',scene:'等红灯时，身边的聊天声、提示音和车流挤在一起。你停在路边。',prompt:'这会儿，你更想怎么回应？',options:[
    {id:'noise-body',label:'肩膀有些绷着，想找个安静的地方缓一缓。',reply:'你离车流远了一步，给自己留出一点安静的位置。',category:'body'},
    {id:'noise-express',label:'有点烦，想把憋着的话痛快说出来。',reply:'你把那句话写进一张纸条，先让它有一个出口。',category:'express'},
    {id:'noise-action',label:'很多事情都在催，想先分出轻重缓急。',reply:'你关掉了不急的提醒，眼前终于只剩下一条路。',category:'action'},
  ]},
  {id:'message',title:'一条问候',scene:'走到水边，一位朋友发来消息：“今天过得怎么样？”你看了看屏幕。',prompt:'此刻，你想给自己留哪一种空间？',options:[
    {id:'message-support',label:'想找个人说说，也希望对方听懂我的需要。',reply:'你决定不必把所有感受组织完美，可以先从一句真话开始。',category:'support'},
    {id:'message-accept',label:'暂时不想解释，想自己静静地待一会儿。',reply:'你把手机放下。这一小段安静，不需要任何解释。',category:'accept'},
    {id:'message-body',label:'先让身体松下来，等缓过来再回复。',reply:'你找了一张长椅坐下。回复可以等，先照顾此刻的自己。',category:'body'},
  ]},
];

const categoryTitles = {action:'把一件事拆小',reframe:'给想法换个角度',attention:'换个频道，玩一会儿',body:'先让身体慢下来',express:'给情绪一个出口',support:'把需要好好说出来',accept:'留一点安静给自己'};
export function makeTrials(gameId, {practice = false, random = Math.random} = {}) {
  if (!assessmentGames.some(g => g.id === gameId)) return [];
  const count = practice ? 4 : 18;
  const trials = Array.from({length:count}, (_, i) => {
    if(gameId === 'lantern') return {kind:i < (practice ? 2 : 12) ? 'go' : 'stop',target:i < (practice ? 2 : 12) ? 'tap' : null};
    const target = i % 2 ? 'right' : 'left';
    const kind = i < count / 2 ? 'congruent' : 'conflict';
    return {kind,target,flank:kind === 'congruent' ? target : target === 'left' ? 'right' : 'left'};
  });
  for(let i = trials.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [trials[i], trials[j]] = [trials[j], trials[i]];
  }
  return trials;
}

export function selectedStories(choices) {
  return storyScenes.map((scene,i)=>({...scene, selected:scene.options.find(o=>o.id === choices?.[i])}));
}

function recommend(choices) {
  const selected = selectedStories(choices);
  const counts = new Map();
  for (const {selected:option} of selected) counts.set(option.category, (counts.get(option.category) || 0) + 1);
  const category = [...counts].sort((a,b)=>b[1]-a[1])[0][0];
  const reasons = selected.filter(s=>s.selected.category === category);
  return {category,title:categoryTitles[category],reason:reasons.map(s=>`你在「${s.title}」里选择了“${s.selected.label}”`).join('；')};
}

function validInput(input) {
  if(!input || !assessmentGames.some(g=>g.id===input.gameId) || !Array.isArray(input.choices) || input.choices.length !== 3 || selectedStories(input.choices).some(s=>!s.selected)) return false;
  if(!Array.isArray(input.trials) || input.trials.length !== 18) return false;
  const harbor = input.gameId === 'harbor';
  const valid = Array.from(input.trials).every(t => t && (harbor
    ? ['left','right'].includes(t.target) && ['congruent','conflict'].includes(t.kind) && t.flank === (t.kind==='congruent'?t.target:t.target==='left'?'right':'left') && [null,'left','right'].includes(t.response)
    : ((t.kind==='go' && t.target==='tap') || (t.kind==='stop' && t.target===null)) && [null,'tap'].includes(t.response))
    && (t.response===null ? t.rtMs===null : Number.isFinite(t.rtMs) && t.rtMs>0 && t.rtMs<=1800));
  if(!valid || !input.trials.some(t=>t.response!==null)) return false;
  return harbor
    ? input.trials.filter(t=>t.kind==='conflict').length===9 && input.trials.filter(t=>t.target==='left').length===9
    : input.trials.filter(t=>t.kind==='stop').length===6;
}

export function scoreAssessment(input) {
  if(!validInput(input)) return null;
  const {gameId,choices,trials} = input;
  const correct = trials.filter(t=>t.response===t.target).length;
  const missed = trials.filter(t=>t.target!==null && t.response===null).length;
  const falseAlarms = trials.filter(t=>t.target===null && t.response!==null).length;
  const goHits = trials.filter(t=>t.kind==='go' && t.response==='tap').length;
  const stops = trials.filter(t=>t.kind==='stop' && t.response===null).length;
  const times = trials.filter(t=>t.response!==null && t.response===t.target).map(t=>t.rtMs).sort((a,b)=>a-b);
  const middle = Math.floor(times.length/2);
  const medianRt = times.length ? Math.round(times.length%2 ? times[middle] : (times[middle-1]+times[middle])/2) : null;
  return {
    version:1,gameId,choices:[...choices],trials:trials.map(t=>({...t})),
    score:Math.round(gameId==='harbor' ? correct/18*100 : (goHits/12+stops/6)/2*100),
    accuracy:Math.round(correct/18*100),correct,total:18,missed,falseAlarms,medianRt,
    recommendation:recommend(choices),
  };
}

export function isAssessment(value) {
  if(!validInput(value)) return false;
  const scored = scoreAssessment(value);
  return value.version===1 && ['score','correct','total','missed','falseAlarms','medianRt','accuracy'].every(k=>value[k]===scored[k])
    && value.recommendation?.category===scored.recommendation.category;
}
