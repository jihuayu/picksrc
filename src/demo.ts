import { createPicker } from './picker.js';
const output=document.querySelector('#selected')!;
const picker=createPicker({scope:{projectId:'demo',appScopeId:'root',buildId:'dev',scopeGeneration:0,moduleGeneration:0}},element=>{output.textContent=element?.tagName.toLowerCase()??'';});
picker.start(); (window as any).picksrc=picker;
