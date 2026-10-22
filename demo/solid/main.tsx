import {createSignal,onCleanup} from 'solid-js';
import {render} from 'solid-js/web';
import {createSolidRuntimeAdapter} from '../../src/solid-runtime';
const names=new WeakMap<object,string>();
const adapter=createSolidRuntimeAdapter({describeOwner:owner=>{const displayName=names.get(owner);return displayName?{displayName}:undefined;}});
function SaveButton(String?: unknown) { const [count,setCount]=createSignal(0); const owner={};names.set(owner,"SaveButton");return <button ref={element=>{const unbind=adapter.bind(element,owner);onCleanup(unbind);}} id="target" onClick={()=>setCount(count()+1)}>Solid save {count()}</button>; }
function App() { return <main><h1>Solid source inspector</h1><p>Explicit owner binding, optional exact JSX evidence.</p><SaveButton/><button id="inspect">Inspect source</button><pre id="output"/></main>; }
render(App,document.getElementById('root')!);
document.addEventListener('click',async(event)=>{if((event.target as Element).id!=='inspect')return;const element=document.getElementById('target')!;const runtime=adapter.inspect(element);const response=await fetch('/__picksrc/solid/source?node='+element.getAttribute('data-picksrc-node'),{method:'POST'});document.getElementById('output')!.textContent=JSON.stringify({runtime,source:await response.json()},null,2);});
