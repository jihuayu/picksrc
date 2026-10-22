// @vitest-environment node
import {it,expect} from 'vitest';
import {build} from 'vite';
import {JSDOM} from 'jsdom';
import react from '@vitejs/plugin-react';
import solid from 'vite-plugin-solid';
import {createJsxAdapter} from '../src/jsx';
for(const framework of ['react','solid'] as const) it(`${framework} production compiler preserves exact opaque element marker`,async()=>{
 const root=process.cwd(),adapter=createJsxAdapter({framework,root,projectId:'p',appScopeId:'a',buildId:'prod',include:new RegExp(`demo/${framework}/`)});
 const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';
 let result;try { result=await build({configFile:false,root,logLevel:'silent',plugins:[adapter.plugin,framework==='react'?react():solid()],build:{write:false,minify:true,rollupOptions:{input:`demo/${framework}/index.html`}}}); } finally {if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
 const bundles=Array.isArray(result)?result:[result];const code=bundles.flatMap(b=>'output' in b?b.output:[]).filter(c=>c.type==='chunk').map(c=>c.code).join('\n');
 const target=adapter.getRecords().find(r=>r.tag==='button'&&r.role==='element-declaration')!;expect(code).toContain(target.sourceNodeId);expect(code).not.toContain(root);expect(code).not.toContain('data-picksrc-location');expect((await adapter.readSource(adapter.toSourceReference(target.sourceNodeId)!))?.content).toContain('id="target"');
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,beforeParse(window){window.fetch=(async()=>({json:async()=>({record:target,snippet:await adapter.readSource(adapter.toSourceReference(target.sourceNodeId)!)})})) as typeof window.fetch;}});
 try{dom.window.eval(code);for(let n=0;n<50&&!dom.window.document.getElementById('target');n++)await new Promise(r=>setTimeout(r,10));
 const button=dom.window.document.getElementById('target')!;expect(button.getAttribute('data-picksrc-node')).toBe(target.sourceNodeId);button.click();await new Promise(r=>setTimeout(r,20));expect(button.textContent).toContain('save 1');dom.window.document.getElementById('inspect')!.click();await new Promise(r=>setTimeout(r,20));const inspected=JSON.parse(dom.window.document.getElementById('output')!.textContent!);expect(inspected.runtime.component.framework).toBe(framework);expect(inspected.source.snippet.content).toContain('id="target"');
 }finally{dom.window.close();}

},30000);
for(const framework of ['react','solid'] as const) it(`${framework} runtime inspection works with no Picksrc build plugin`,async()=>{
 const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';let result;
 try{result=await build({configFile:false,logLevel:'silent',plugins:[framework==='react'?react():solid()],build:{write:false,minify:true,rollupOptions:{input:`demo/${framework}/index.html`}}});}finally{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
 const bundles=Array.isArray(result)?result:[result];const code=bundles.flatMap(b=>'output' in b?b.output:[]).filter(c=>c.type==='chunk').map(c=>c.code).join('\n');
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,beforeParse(window){window.fetch=(async()=>({json:async()=>({unavailable:true})})) as typeof window.fetch;}});
 try{dom.window.eval(code);for(let n=0;n<50&&!dom.window.document.getElementById('target');n++)await new Promise(r=>setTimeout(r,10));expect(dom.window.document.getElementById('target')!.hasAttribute('data-picksrc-node')).toBe(false);dom.window.document.getElementById('inspect')!.click();await new Promise(r=>setTimeout(r,20));const inspected=JSON.parse(dom.window.document.getElementById('output')!.textContent!);expect(inspected.runtime.component.framework).toBe(framework);expect(inspected.runtime.component.status).toBe('partial');expect(inspected.runtime.elementDeclaration).toBeUndefined();}finally{dom.window.close();}
},30000);
