import { describe, expect, it } from 'vitest';
import { PluginRegistry } from '../src/plugins.js';
import { SnapshotSourceProvider, safeProjectPath } from '../src/source.js';
import { registerComponent, findComponent } from '../src/components.js';

describe('plugin lifecycle', () => {
  it('validates dependencies before setup and rolls completed setup back in reverse order', async () => {
    const log: string[] = []; const registry = new PluginRegistry();
    registry.register({id:'a',version:'1',apiVersion:'0.1',kind:'picker',environment:['browser'],setup:()=>()=>{log.push('undo-a');}});
    registry.register({id:'b',version:'1',apiVersion:'0.1',kind:'renderer',requires:['a'],environment:['browser'],setup:()=>{throw new Error('broken');}});
    await expect(registry.start()).rejects.toThrow('broken'); expect(log).toEqual(['undo-a']);
  });
  it('rejects a missing dependency before running setup', async () => {
    const registry = new PluginRegistry(); registry.register({id:'x',version:'1',apiVersion:'0.1',kind:'picker',requires:['missing'],environment:['browser'],setup:()=>{throw new Error('must not run');}});
    await expect(registry.start()).rejects.toThrow('Missing plugin dependency');
  });
  it('rejects duplicate identifiers, aborts providers on dispose, and cleans up once', async () => {
    const registry=new PluginRegistry(); let signal:AbortSignal|undefined; let cleanups=0;
    const plugin={id:'duplicate',version:'1',apiVersion:'0.1',kind:'picker' as const,environment:['browser' as const],setup:(context:{signal:AbortSignal;diagnose:(message:string,error?:unknown)=>void})=>{signal=context.signal;return ()=>{cleanups++;};}};
    registry.register(plugin); expect(()=>registry.register(plugin)).toThrow('Duplicate plugin id');
    await registry.start(); await registry.dispose(); await registry.dispose(); expect(signal?.aborted).toBe(true); expect(cleanups).toBe(1);
  });
});

describe('source snapshots', () => {
  it('returns only a requested range from a matching build-bound snapshot', async () => {
    const provider = new SnapshotSourceProvider(); const reference = {projectId:'p',appScopeId:'a',buildId:'b',sourceNodeId:'n',file:'src/a.ts',contentHash:'hash',provenance:'build-snapshot' as const};
    provider.add(reference,{content:'const value = 42;',language:'typescript',sourceVersion:'commit:abc',hash:'hash'});
    await expect(provider.readSource(reference,{start:6,end:11})).resolves.toMatchObject({content:'value',contentHash:'hash',sourceVersion:'commit:abc'});
    await expect(provider.readSource(reference,{start:0,end:100})).rejects.toThrow(RangeError);
  });
  it('rejects a snapshot with the wrong content hash and unsafe project paths', async () => {
    const provider=new SnapshotSourceProvider(); const ref={projectId:'p',appScopeId:'a',buildId:'b',sourceNodeId:'n',file:'x',contentHash:'expected',provenance:'build-snapshot' as const};
    provider.add(ref,{content:'stale',language:'ts',sourceVersion:'old',hash:'different'});
    await expect(provider.readSource(ref,{start:0,end:2})).resolves.toBeNull();
    expect(safeProjectPath('../secrets')).toBe(false); expect(safeProjectPath('src/file.ts')).toBe(true);
  });
  it('honors cancellation before reading a source snapshot', async () => {
    const provider=new SnapshotSourceProvider();const controller=new AbortController();controller.abort();
    const ref={projectId:'p',appScopeId:'a',buildId:'b',sourceNodeId:'n',file:'x',contentHash:'hash',provenance:'build-snapshot' as const};
    await expect(provider.readSource(ref,{start:0,end:0},controller.signal)).rejects.toMatchObject({name:'AbortError'});
  });
});

describe('component adapter contract', () => {
  it('resolves registered instance evidence without conflating it with element source', () => {
    const host=document.createElement('section'); const child=document.createElement('button'); host.append(child);
    const record={framework:'host-demo',componentInstanceId:'instance-1',displayName:'SaveButton',definition:{file:'src/SaveButton.tsx',role:'component-definition' as const,precision:'file-only' as const},callsite:{file:'src/App.tsx',role:'component-callsite' as const,precision:'line-only' as const,start:{line:12,column:3}},owners:[],renderedTargets:['root-1'],status:'resolved' as const};
    const dispose=registerComponent(host,record); expect(findComponent(child)).toBe(record); dispose(); expect(findComponent(child)).toBeUndefined();
  });
});
