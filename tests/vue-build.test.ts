// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createVueAdapter } from '../src/vue.js';

const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});

describe('Vue production compiler output',()=>{
  it('keeps opaque AST node markers through the minified final chunk and emits no source path hint',async()=>{
    const root=realpathSync(mkdtempSync(path.join(tmpdir(),'picksrc-vue-build-')));roots.push(root);mkdirSync(path.join(root,'src'));
    writeFileSync(path.join(root,'index.html'),'<div id="app"></div><script type="module" src="/src/main.js"></script>');
    writeFileSync(path.join(root,'src/main.js'),"import {createApp} from 'vue'; import Demo from './Demo.vue'; createApp(Demo).mount('#app');");
    writeFileSync(path.join(root,'src/Demo.vue'),'<template>\n  <main><button>Save</button></main>\n</template>');
    const outDir=path.join(root,'out');const adapter=createVueAdapter({root,projectId:'p',appScopeId:'a',buildId:'prod-b'});
    const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
    const previousNodeEnv=process.env.NODE_ENV; process.env.NODE_ENV='production';
    try { await build({configFile:false,root,mode:'production',logLevel:'silent',resolve:{alias:{vue:path.join(projectRoot,'node_modules/vue/dist/vue.runtime.esm-bundler.js')}},plugins:[vue({template:{compilerOptions:adapter.compilerOptions}}),adapter.plugin],build:{outDir,minify:'esbuild',sourcemap:false}}); }
    finally { if(previousNodeEnv===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=previousNodeEnv; }
    const assets=path.join(outDir,'assets');const jsFiles=readdirSync(assets).filter(name=>name.endsWith('.js'));const output=jsFiles.map(name=>readFileSync(path.join(assets,name),'utf8')).join('\n');
    const records=adapter.getRecords();expect(records.length).toBeGreaterThan(0);
    for(const record of records) expect(output).toContain(record.sourceNodeId);
    expect(output).not.toContain(root); expect(output).not.toContain('data-picksrc-location');
  },30000);
});
