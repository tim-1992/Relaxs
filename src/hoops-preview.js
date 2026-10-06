import {mountHoops} from './hoops.js';
const container=document.querySelector('#hoops-preview');
let cleanup=()=>{};
function boot() {
  cleanup();container.replaceChildren();
  cleanup=mountHoops(container,{onExit:()=>{location.href='/';}});
}
boot();
window.addEventListener('pagehide',()=>cleanup());
window.addEventListener('pageshow',event=>{if(event.persisted)boot();});
