import { describe, expect, it } from 'vitest';
import { inspectReactElement } from '../src/react-runtime.js';
import { createSolidRuntimeAdapter } from '../src/solid-runtime.js';
import type { SourcePosition } from '../src/protocol.js';

const position = (file: string, line = 1): SourcePosition => ({ file, start: { line, column: 1 }, role: 'unknown', precision: 'line-only' });
function attach(fiber: object) { const element = document.createElement('button'); Object.assign(element, { '__reactFiber$test': fiber }); return element; }
function Button() {}
function App() {}

describe('existing React runtime metadata', () => {
  it('does not invent a component from an ordinary DOM element', () => {
    expect(inspectReactElement(document.createElement('div')).component).toBeUndefined();
  });
  it('separates element declaration, component callsite and definition', () => {
    const parent = { type: App };
    const component = { type: Button, _debugOwner: parent, _debugSource: { fileName: '/App.tsx', lineNumber: 20, columnNumber: 3 } };
    const element = attach({ type: 'button', return: component, _debugSource: { fileName: '/Button.tsx', lineNumber: 4, columnNumber: 5 } });
    const result = inspectReactElement(element, { resolveDefinition: type => type === Button ? position('/Button.tsx', 2) : undefined });
    expect(result.elementDeclaration).toMatchObject({ file: '/Button.tsx', start: { line: 4 }, role: 'element-declaration' });
    expect(result.component).toMatchObject({ displayName: 'Button', callsite: { file: '/App.tsx', start: { line: 20 }, role: 'component-callsite' }, definition: { file: '/Button.tsx', start: { line: 2 }, role: 'component-definition' }, owners: [{ displayName: 'App' }] });
    expect(result.component?.callsiteVerified).toBeUndefined();
    expect(result.evidence.every(item => item.confidence === 'hint')).toBe(true);
  });
  it('keeps generated stack locations as evidence until explicitly mapped', () => {
    const stack = { stack: 'Error\n    at jsxDEV (http://localhost/node_modules/.vite/deps/react_jsx-dev-runtime.js:12:3)\n    at Button (http://localhost/assets/app.js:40:8)' };
    const component = { type: Button, _debugStack: stack };
    const element = attach({ type: 'button', return: component, _debugStack: stack });
    const raw = inspectReactElement(element);
    expect(raw.component?.callsite).toBeUndefined();
    expect(raw.elementDeclaration).toBeUndefined();
    expect(raw.evidence[0]?.details).toMatchObject({ file: 'http://localhost/assets/app.js', line: 40, column: 8 });
    const mapped = inspectReactElement(element, { mapLocation: location => { expect(location.origin).toBe('debug-stack'); return position('/src/Button.tsx', 9); } });
    expect(mapped.elementDeclaration).toMatchObject({ file: '/src/Button.tsx', role: 'element-declaration' });
    expect(mapped.component?.callsite?.role).toBe('component-callsite');
  });
  it('uses compile-time markers only for their recorded semantic role', () => {
    const component = { type: Button, memoizedProps: { 'data-picksrc-node': 'callsite' } };
    const element = attach({ type: 'button', return: component, memoizedProps: component.memoizedProps });
    const result = inspectReactElement(element, { lookup: { getRecord: () => ({ framework: 'react', position: { ...position('/App.tsx', 4), role: 'component-callsite' } }) } });
    expect(result.component?.callsite?.file).toBe('/App.tsx');
    expect(result.elementDeclaration).toBeUndefined();
  });
  it('supports an existing renderer, stable alternate IDs and cyclic owner data', () => {
    const a: Record<string, unknown> = { type: Button }; const b = { type: Button, alternate: a }; a.alternate = b; a._debugOwner = a;
    const element = document.createElement('button');
    const host = {type:'button',return:a}; const root:Record<string,unknown>={tag:3,child:a}; root.stateNode={current:root};a.return=root;a.child=host;
    const first = inspectReactElement(element, { findFiberByHostInstance: () => host });
    const second = inspectReactElement(element, { findFiberByHostInstance: () => host });
    expect(first.component?.componentInstanceId).toBe(second.component?.componentInstanceId);
    expect(first.component?.owners).toHaveLength(1);
  });
  it('contains failures from optional host integrations', () => {
    const element = attach({ type: Button, _debugSource: { fileName: '/x.tsx', lineNumber: 1 } });
    const result = inspectReactElement(element, { mapLocation() { throw new Error('map'); }, resolveDefinition() { throw new Error('definition'); } });
    expect(result.component?.displayName).toBe('Button');
    expect(result.diagnostics.join(' ')).toContain('failed');
    const cyclic: Record<string, unknown> = { type: 'div' }; cyclic.return = cyclic;
    expect(inspectReactElement(attach(cyclic)).component).toBeUndefined();
  });
});

describe('Solid explicit runtime integration', () => {
  it('requires an association and distinguishes reactive owners from components', () => {
    const element = document.createElement('div'); const adapter = createSolidRuntimeAdapter();
    expect(adapter.inspect(element).component).toBeUndefined();
    adapter.bind(element, {});
    expect(adapter.inspect(element).diagnostics.join(' ')).toContain('reactive owner');
  });
  it('walks known owners, keeps definition and callsite separate and bounds cycles', () => {
    const root = document.createElement('section'), child = document.createElement('button'); root.append(child);
    const signal = {}, component = {}, app = {};
    const adapter = createSolidRuntimeAdapter({ describeOwner: owner => owner === component ? { displayName: 'Button', definition: position('/Button.tsx', 2), callsite: position('/App.tsx', 8) } : owner === app ? { displayName: 'App' } : undefined, getParentOwner: owner => owner === signal ? component : app });
    adapter.bind(root, signal);
    const result = adapter.inspect(child);
    expect(result.component).toMatchObject({ displayName: 'Button', definition: { role: 'component-definition', file: '/Button.tsx' }, callsite: { role: 'component-callsite', file: '/App.tsx' }, owners: [{ displayName: 'App' }] });
    expect(result.diagnostics.join(' ')).toContain('ancestor');
    expect(result.evidence.every(item => item.confidence === 'hint')).toBe(true);
  });
  it('cleans up bindings, restores previous bindings and disposes', () => {
    const root = document.createElement('div'); const a = {}, b = {};
    const adapter = createSolidRuntimeAdapter({ describeOwner: owner => ({ displayName: owner === a ? 'A' : 'B' }) });
    const unbindA = adapter.bind(root, a); const first = adapter.inspect(root).component?.componentInstanceId;
    const unbindB = adapter.bind(root, b); expect(adapter.inspect(root).component?.displayName).toBe('B');
    unbindB(); unbindB(); expect(adapter.inspect(root).component?.componentInstanceId).toBe(first);
    unbindA(); expect(adapter.inspect(root).component).toBeUndefined();
    adapter.dispose(); expect(() => adapter.bind(root, a)).toThrow('disposed');
    expect(adapter.inspect(root).component).toBeUndefined();
  });
  it('does not resurrect a removed binding during out-of-order cleanup', () => {
    const root = document.createElement('div');
    const adapter = createSolidRuntimeAdapter({ describeOwner: () => ({ displayName: 'Test' }) });
    const unbindA = adapter.bind(root, {}), unbindB = adapter.bind(root, {});
    unbindA(); unbindB();
    expect(adapter.inspect(root).component).toBeUndefined();
  });
  it('reports static metadata without inventing runtime instances', () => {
    const root = document.createElement('div'); root.setAttribute('data-picksrc-node', 'known');
    const declaration = { ...position('/Button.tsx', 3), role: 'element-declaration' as const };
    const definition = { ...position('/Button.tsx', 1), role: 'component-definition' as const };
    const adapter = createSolidRuntimeAdapter({ lookup: { getRecord: id => id === 'known' ? { position: declaration, componentDefinition: definition, framework: 'solid' } : undefined } });
    expect(adapter.inspect(root)).toMatchObject({ elementDeclaration: declaration, staticDefinition: definition });
    expect(adapter.inspect(root).component).toBeUndefined();
  });
  it('uses an existing devtools owner provider without installing a hook', () => {
    const owner = {}; const adapter = createSolidRuntimeAdapter({ getOwnerForElement: () => owner, describeOwner: () => ({ displayName: 'Existing' }) });
    expect(adapter.inspect(document.createElement('div')).component?.displayName).toBe('Existing');
  });
});

it('resolves the committed real React tree after updates and rejects an unmounted DOM node', async () => {
  const {createElement}=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  function Child({marker}:{marker:string}) {return createElement('button',{'data-picksrc-node':marker},marker);}
  function Parent({marker}:{marker:string}) {return createElement(Child,{marker,'data-picksrc-node':marker+'-callsite'} as {marker:string});}
  const lookup={getRecord(id:string){return {framework:'react',position:{file:id+'.tsx',role:id.endsWith('-callsite')?'component-callsite' as const:'element-declaration' as const,precision:'exact-range' as const}};}};
  try {flushSync(()=>root.render(createElement(Parent,{marker:'first','data-picksrc-node':'first-owner-callsite'} as {marker:string})));const button=container.querySelector('button')!;
    const first=inspectReactElement(button,{lookup});expect(first.elementDeclaration?.file).toBe('first.tsx');expect(first.component?.callsite?.file).toBe('first-callsite.tsx');
    flushSync(()=>root.render(createElement(Parent,{marker:'second','data-picksrc-node':'second-owner-callsite'} as {marker:string})));expect(container.querySelector('button')).toBe(button);
    const second=inspectReactElement(button,{lookup});expect(second.elementDeclaration?.file).toBe('second.tsx');expect(second.component?.callsite?.file).toBe('second-callsite.tsx');expect(second.component?.owners[0]?.position?.file).toBe('second-owner-callsite.tsx');expect(second.component?.componentInstanceId).toBe(first.component?.componentInstanceId);
    flushSync(()=>root.render(createElement(Parent,{marker:'third'})));expect(inspectReactElement(button,{lookup}).elementDeclaration?.file).toBe('third.tsx');
    flushSync(()=>root.unmount());expect(inspectReactElement(button,{lookup}).component).toBeUndefined();
  } finally {container.remove();}
});
it('keeps distinct Solid component tokens even when reactive owners are shared', async () => {
  const {createRoot,createComponent,getOwner}=await import('solid-js');
  const tokens=new WeakMap<object,{displayName:string}>(),adapter=createSolidRuntimeAdapter({describeOwner:token=>tokens.get(token)});
  const entries:Array<{element:Element;owner:unknown}>=[];
  function Component(){const token={};tokens.set(token,{displayName:'Component'});const element=document.createElement('button');adapter.bind(element,token);entries.push({element,owner:getOwner()});return element;}
  createRoot(()=>{createComponent(Component,{});createComponent(Component,{});});
  expect(entries).toHaveLength(2);
  expect(adapter.inspect(entries[0]!.element).component?.componentInstanceId).not.toBe(adapter.inspect(entries[1]!.element).component?.componentInstanceId);
  adapter.dispose();
});
