import {mountDemolition} from './demolition-experience.js';
import {mountBlast} from './blast-experience.js';
import {mountCrusher} from './crusher-experience.js';

const scenes = [
  {id:'room',name:'拆房间',detail:'家具、电视与小摆件',mount:mountDemolition},
  {id:'building',name:'爆破楼房',detail:'选落点，看连锁坍塌',mount:mountBlast},
  {id:'crusher',name:'粉碎机',detail:'送进去，慢慢压碎',mount:mountCrusher},
];

export function mountDestruction(container,options={}) {
  const sceneOptions = scene => scene.id === 'room' && options.tripoAssets
    ? {...options,tripoAssets:Object.fromEntries(Object.entries(options.tripoAssets).filter(([kind])=>['sofa','screen','tv','vase'].includes(kind)))}
    : options;
  const root=container.ownerDocument.createElement('section');
  root.className='destruction-hub';
  root.innerHTML=`<nav class="destruction-nav" aria-label="拆家工坊小场景">
    ${scenes.map((scene,index)=>`<button type="button" data-destruction-scene="${scene.id}" aria-pressed="${index===0}"><i>0${index+1}</i><span><b>${scene.name}</b><small>${scene.detail}</small></span><em aria-hidden="true">↗</em></button>`).join('')}
    </nav><p class="destruction-switch-note">三个场景分别游玩 · 切换后重新开始</p><div class="destruction-mount"></div>`;
  container.append(root);
  const host=root.querySelector('.destruction-mount');
  const controller=new AbortController();
  let current=scenes[0],cleanup=current.mount(host,sceneOptions(current));
  root.querySelector('.destruction-nav').addEventListener('click',event=>{
    const id=event.target.closest('[data-destruction-scene]')?.dataset.destructionScene;
    const next=scenes.find(scene=>scene.id===id);
    if(!next||next===current)return;
    cleanup?.();host.replaceChildren();current=next;
    for(const button of root.querySelectorAll('[data-destruction-scene]'))
      button.setAttribute('aria-pressed',String(button.dataset.destructionScene===id));
    cleanup=current.mount(host,sceneOptions(current));
    host.querySelector('h1,h2')?.focus({preventScroll:true});
    options.onAnnounce?.(`已进入${current.name}。`);
  },{signal:controller.signal});
  return()=>{controller.abort();cleanup?.();root.remove();};
}
