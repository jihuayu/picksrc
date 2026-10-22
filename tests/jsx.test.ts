import {describe,it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createJsxAdapter} from '../src/jsx';
import {createSourceMapResolver} from '../src/sourcemap';
for(const framework of ['react','solid'] as const) describe(framework+' original JSX evidence',()=>{
 it('records exact element and component definition, verifies original source and rejects stale source',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'picksrc-jsx-'));try{
 const file=path.join(root,'Example.tsx'),source='export function Example(String: unknown) { return <button data-test="save">Save</button>; }';writeFileSync(file,source);
 const adapter=createJsxAdapter({framework,root,projectId:'p',appScopeId:'a',buildId:'b'}),result=adapter.instrument(source,file);
 const record=adapter.getRecords().find(r=>r.tag==='button')!;expect(record.position.precision).toBe('exact-range');expect(source.slice(record.start,record.end)).toBe('<button data-test="save">Save</button>');expect(record.componentDefinition?.role).toBe('component-definition');
 const ref=adapter.toSourceReference(record.sourceNodeId)!;expect((await adapter.readSource(ref))?.content).toBe(source.slice(record.start,record.end));expect(result.code).toContain(record.sourceNodeId);expect(result.code).not.toContain("String(");
 await expect(adapter.readSource(ref,{start:0,end:record.end})).rejects.toThrow();writeFileSync(file,source+'\n');expect(await adapter.readSource(ref)).toBeNull();
 }finally{rmSync(root,{recursive:true,force:true});}
 });
});
it('maps known generated coordinates without inventing an exact node range',()=>{
 const resolver=createSourceMapResolver({version:3,names:[],sources:['App.tsx'],sourcesContent:['const App = () => <div/>;'],mappings:'AAAA'});
 expect(resolver.resolve(1,1,'element-declaration')).toEqual({position:{file:'App.tsx',start:{line:1,column:1},role:'element-declaration',precision:'line-only'},content:'const App = () => <div/>;'});expect(resolver.resolve(0,1)).toBeUndefined();
});
