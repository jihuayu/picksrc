import { createApp } from 'vue';
import Demo from './Demo.vue';
import { createOverlay, createPicker } from './index.js';
const overlay=createOverlay(); const output=document.querySelector('#selected')!;
const picker=createPicker({scope:{projectId:'picksrc-demo',appScopeId:'demo-root',buildId:'demo-dev-v1',scopeGeneration:0,moduleGeneration:0},excluded:element=>!!element.closest('[data-picksrc-overlay]')},element=>{overlay.render(element);output.textContent=element?.tagName.toLowerCase()??'';});
picker.start(); (window as any).picksrc=picker;
document.querySelector('#confirm')!.addEventListener('click',async()=>{
  const result=picker.confirm(); if(!result) return; const id=result.component?.callsiteSourceNodeId??picker.getSelected()?.getAttribute('data-picksrc-node');
  (document.querySelector('#result') as HTMLElement).textContent=JSON.stringify(result,null,2);
  if(id){const source=await fetch(`/__picksrc/source?node=${encodeURIComponent(id)}`,{method:'POST',credentials:'same-origin'});(document.querySelector('#source') as HTMLElement).textContent=source.ok?JSON.stringify(await source.json(),null,2):`Source unavailable (${source.status})`;}
});
document.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.target as Element|null)?.closest('[data-picksrc-overlay]')){document.querySelector<HTMLButtonElement>('#confirm')?.click();}});
createApp(Demo).mount('#app');
