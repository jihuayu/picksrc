import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {inspectReactElement} from '../../src/react-runtime';
function SaveButton(String?: unknown) { const [count,setCount]=useState(0); return <button id="target" onClick={()=>setCount(count+1)}>React save {count}</button>; }
function App() { return <main><h1>React source inspector</h1><p>Click save, then inspect. Source is requested only on confirmation.</p><SaveButton/><button id="inspect">Inspect source</button><pre id="output"/></main>; }
createRoot(document.getElementById('root')!).render(<App/>);
document.addEventListener('click',async(event)=>{if((event.target as Element).id!=='inspect')return;const element=document.getElementById('target')!; const runtime=inspectReactElement(element);const response=await fetch('/__picksrc/react/source?node='+element.getAttribute('data-picksrc-node'),{method:'POST'});document.getElementById('output')!.textContent=JSON.stringify({runtime,source:await response.json()},null,2);});
