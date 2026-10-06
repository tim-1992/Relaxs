import {mountGamePreviews} from './game-previews.js';

export const gameCatalog = [
  {id:'hoops',planet:'play',title:'落日投篮',english:'SUNSET COURT',description:'走到喜欢的位置，投出这一球。',assets:['player']},
  {id:'ride',planet:'play',title:'疾风骑行',english:'AFTERLIGHT RIDER',description:'穿过山间，把风留在身后。',assets:['motorcycle']},
  {id:'memory',planet:'play',title:'叶间寻踪',english:'A MOMENT TO REMEMBER',description:'慢慢翻开，找到记忆里的相遇。',assets:['coral','vase']},
  {id:'breath',planet:'calm',title:'微光呼吸',english:'JUST BREATHE',description:'一呼一吸，把世界调小一点。',assets:[]},
  {id:'dive',planet:'calm',title:'蓝海下潜',english:'BENEATH THE BLUE',description:'潜入珊瑚间，收集海底的片刻。',assets:['turtle','coral']},
  {id:'demolition',planet:'release',title:'拆家工坊',english:'ROOM TO LET GO',description:'拆一间房，让紧绷慢慢散开。',assets:['sofa','tv','vase']},
  {id:'moles',planet:'release',title:'敲敲小怪兽',english:'HELLO, LITTLE MONSTER',description:'看准时机，让小怪兽跳回去。',assets:['monster']},
  {id:'slice',planet:'release',title:'连锁切切乐',english:'SLICE THE MOMENT',description:'找准同色，一划连切。',assets:['orange']},
];
const worlds={
  play:{eyebrow:'01 / PLAY',title:'让好奇心，带你走一会。',note:'挑一个喜欢的，随时开始。'},
  calm:{eyebrow:'02 / BREATHE',title:'往安静的地方，再走一点。',note:'这里，没有必须完成的事。'},
  release:{eyebrow:'03 / LET GO',title:'给情绪，一点回响。',note:'动动手，把紧绷留在这里。'},
};
export function mountGameLibrary(container,planet='play') {
  const games=gameCatalog.filter(game=>game.planet===planet),world=worlds[planet]||worlds.play;
  const root=document.createElement('section');root.className=`experience-shell game-library library-${planet}`;
  root.innerHTML=`<header class="experience-heading library-heading"><p class="eyebrow">${world.eyebrow}</p><h1 tabindex="-1">${world.title}</h1><p>${world.note}</p></header>
    <div class="game-grid" data-count="${games.length}">${games.map((game,index)=>`<a class="game-card game-card-${game.id}" href="#planet/${planet}/${game.id}" aria-label="进入${game.title}">
      <div class="game-card-picture"><canvas class="game-card-preview" data-preview="${game.id}" aria-hidden="true"></canvas><span class="game-card-number">0${index+1}</span><span class="game-preview-status" data-preview-status="${game.id}">正在点亮小世界</span></div>
      <div class="game-card-copy"><p class="game-card-english">${game.english}</p><div class="game-card-title"><h2>${game.title}</h2><span aria-hidden="true">↗</span></div><p class="game-card-description">${game.description}</p></div></a>`).join('')}</div>
    <p class="library-footnote">一个片刻，一次小小的出走。<span>MADE WITH TRIPO · MADE FOR YOU</span></p>`;
  container.append(root);
  const dispose=mountGamePreviews(root,games);
  return()=>{dispose();root.remove();};
}
