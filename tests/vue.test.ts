import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compileTemplate, parse } from '@vue/compiler-sfc';
import { createVueAdapter } from '../src/vue.js';

const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});

describe('official Vue SFC compiler adapter',()=>{
  it('maps a compiled component callsite to an exact original SFC range and reads only that original snippet',async()=>{
    const root=mkdtempSync(path.join(tmpdir(),'picksrc-vue-'));roots.push(root);mkdirSync(path.join(root,'src'));
    const filename=path.join(root,'src','App.vue');
    const source=`<script setup>\nimport SaveButton from './SaveButton.vue'\n</script>\n<template>\n  <main><SaveButton /></main>\n</template>\n`;
    writeFileSync(filename,source); const descriptor=parse(source,{filename}).descriptor;
    const adapter=createVueAdapter({root,projectId:'p',appScopeId:'a',buildId:'b'});
    const result=compileTemplate({source:descriptor.template!.content,filename,id:'app',compilerOptions:adapter.compilerOptions});
    expect(result.errors).toEqual([]);
    expect(result.code).toContain('data-picksrc-node');
    const call=adapter.getRecords().find(record=>record.tag==='SaveButton');
    expect(call).toBeDefined(); expect(call!.role).toBe('component-callsite'); expect(call!.position.precision).toBe('exact-range');
    expect(source.slice(call!.start,call!.end)).toBe('<SaveButton />');
    expect(call!.position.start!.line).toBe(5);
    const ref=adapter.toSourceReference(call!.sourceNodeId)!;
    await expect(adapter.readSource(ref)).resolves.toMatchObject({content:'<SaveButton />',language:'vue',provenance:'build-snapshot'});
    writeFileSync(filename,source.replace('SaveButton','ChangedButton'));
    await expect(adapter.readSource(ref)).resolves.toBeNull();
  });

  it('fails closed for templates whose source file escaped the project root',()=>{
    const root=mkdtempSync(path.join(tmpdir(),'picksrc-vue-'));roots.push(root);const project=path.join(root,'project');mkdirSync(project);const outside=path.join(root,'Outside.vue');writeFileSync(outside,'<template><div/></template>');
    const adapter=createVueAdapter({root:project,projectId:'p',appScopeId:'a',buildId:'b'});
    const descriptor=parse('<template><div/></template>',{filename:outside}).descriptor;
    expect(()=>compileTemplate({source:descriptor.template!.content,filename:outside,id:'outside',compilerOptions:adapter.compilerOptions})).toThrow('outside the configured project root');
  });

  it('rejects AST locations whose source text does not match the configured original file',()=>{
    const root=mkdtempSync(path.join(tmpdir(),'picksrc-vue-'));roots.push(root);mkdirSync(path.join(root,'src'));
    const filename=path.join(root,'src','App.vue'); const original='<template><button>Original</button></template>';writeFileSync(filename,original);
    const changed='<template><button>Changed</button></template>';const descriptor=parse(changed,{filename}).descriptor;
    const adapter=createVueAdapter({root,projectId:'p',appScopeId:'a',buildId:'b'});
    expect(()=>compileTemplate({source:descriptor.template!.content,filename,id:'changed',compilerOptions:adapter.compilerOptions})).toThrow('could not be verified');
  });
});
